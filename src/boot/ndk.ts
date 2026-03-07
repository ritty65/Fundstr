import { boot } from "quasar/wrappers";
import { useBootErrorStore } from "stores/bootError";
import NDK, { NDKSigner } from "@nostr-dev-kit/ndk";
import { useNostrStore, WALLET_LOCKED_MESSAGE, WalletLockedError } from "stores/nostr";
import { NDKEvent, type NDKFilter } from "@nostr-dev-kit/ndk";
import {
  useSettingsStore,
  DEFAULT_RELAY_DEBUG_LOGS_ENABLED,
} from "src/stores/settings";
import {
  DEFAULT_RELAYS,
  FREE_RELAYS,
  FUNDSTR_PRIMARY_RELAY,
  RELAY_CONNECT_RETRY,
  computeRelayBackoffMs,
} from "src/config/relays";
import { clearRelayFailureCache } from "src/nostr/relayClient";
import { filterHealthyRelays } from "src/utils/relayHealth";
import { RelayWatchdog } from "src/js/nostr-runtime";
import { debug } from "src/js/logger";
import {
  getFreeRelayFallbackStatus,
  hasFallbackAttempt,
  isFallbackUnreachable,
  markFallbackUnreachable,
  onFreeRelayFallbackStatusChange,
  recordFallbackAttempt,
  resetFallbackState as resetFreeRelayFallbackState,
  type FreeRelayFallbackContext,
  type FreeRelayFallbackStatus,
} from "src/nostr/freeRelayFallback";

export { getFreeRelayFallbackStatus, onFreeRelayFallbackStatusChange };
export type { FreeRelayFallbackStatus };
import { mustConnectRequiredRelays } from "../nostr/relays";

export type NdkBootErrorReason =
  | "no-signer"
  | "connect-failed"
  | "wallet-locked"
  | "nip07-locked"
  | "unknown";

export class NdkBootError extends Error {
  reason: NdkBootErrorReason;
  constructor(reason: NdkBootErrorReason, message?: string) {
    super(message ?? reason);
    this.name = "NdkBootError";
    this.reason = reason;
  }
}

// Default relay URLs are configured in src/config/relays.ts

function envFundstrOnlyRelaysEnabled(): boolean {
  const value = (import.meta as any)?.env?.VITE_FUNDSTR_ONLY_RELAYS;
  return value === "true" || value === true;
}

let fundstrOnlyRuntimeOverride = false;

export function setFundstrOnlyRuntimeOverride(enabled: boolean) {
  fundstrOnlyRuntimeOverride = enabled;
}

function isFundstrOnlyRelayModeActive(settings = useSettingsStore()): boolean {
  if (fundstrOnlyRuntimeOverride) {
    return true;
  }
  if (settings?.relayBootstrapMode === "fundstr-only") {
    return true;
  }
  return envFundstrOnlyRelaysEnabled();
}

function shouldAutoConnectRelays(
  settings = useSettingsStore(),
  override?: boolean,
): boolean {
  if (override === true) {
    return true;
  }
  if (override === false) {
    return false;
  }
  return isFundstrOnlyRelayModeActive(settings);
}

export function mergeDefaultRelays(ndk: NDK) {
  if (!shouldAutoConnectRelays()) {
    return;
  }
  for (const url of DEFAULT_RELAYS) {
    if (!ndk.pool.relays.has(url)) {
      ndk.addExplicitRelay(url);
    }
  }
}

const disconnectCounts = new Map<string, number>();
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

function isRelayDebugLoggingEnabled(settings = useSettingsStore()): boolean {
  const preference = settings?.relayDebugLogsEnabled as
    | boolean
    | { value?: boolean }
    | undefined;
  if (typeof preference === "boolean") {
    return preference;
  }
  const refValue = (preference as { value?: boolean } | undefined)?.value;
  if (typeof refValue === "boolean") {
    return refValue;
  }
  return DEFAULT_RELAY_DEBUG_LOGS_ENABLED;
}

function scheduleDisconnectLog() {
  if (disconnectTimer) return;
  disconnectTimer = setTimeout(() => {
    const entries = Array.from(disconnectCounts.entries());
    disconnectCounts.clear();
    disconnectTimer = null;
    if (!entries.length) return;
    if (!isRelayDebugLoggingEnabled()) {
      return;
    }
    const summary = entries
      .map(([u, c]) => (c > 1 ? `${u} (x${c})` : u))
      .join(", ");
    debug(`[NDK] relay disconnected: ${summary}`);
  }, 1000);
}

function attachRelayErrorHandlers(ndk: NDK) {
  ndk.pool.on("relay:disconnect", (relay: any) => {
    if (!isRelayDebugLoggingEnabled()) {
      disconnectCounts.clear();
      return;
    }
    disconnectCounts.set(relay.url, (disconnectCounts.get(relay.url) ?? 0) + 1);
    scheduleDisconnectLog();
  });
  ndk.pool.on("relay:connect", (relay: any) => {
    resetFreeRelayFallbackState(ndk);
    if (relay?.url) {
      clearRelayFailureCache(relay.url);
    }
  });
  ndk.pool.on("notice", (relay: any, notice: string) => {
    debug(`[NDK] notice from ${relay.url}: ${notice}`);
  });
  (ndk.pool as any).on?.("relay:stalled", (relay: any) => {
    if (!isRelayDebugLoggingEnabled()) {
      return;
    }
    console.warn(`[NDK] heartbeat stalled on ${relay.url}`);
  });
  (ndk.pool as any).on?.("relay:heartbeat", (relay: any) => {
    if (!isRelayDebugLoggingEnabled()) {
      return;
    }
    debug(`[NDK] heartbeat recovered on ${relay.url}`);
  });
}

function countConnectedRelays(ndk: NDK) {
  let connected = 0;
  for (const relay of ndk.pool.relays.values()) {
    if ((relay as any)?.connected) {
      connected += 1;
    }
  }
  return connected;
}

async function ensureFreeRelayFallback(
  ndk: NDK,
  context: FreeRelayFallbackContext,
): Promise<boolean> {
  if (isFundstrOnlyRelayModeActive()) {
    return false;
  }
  if (countConnectedRelays(ndk) > 0) {
    resetFreeRelayFallbackState(ndk);
    return false;
  }

  if (isFallbackUnreachable(ndk)) {
    return false;
  }

  if (hasFallbackAttempt(ndk)) {
    markFallbackUnreachable(ndk, context);
    return false;
  }

  recordFallbackAttempt(ndk);

  for (const url of FREE_RELAYS) {
    if (!ndk.pool.relays.has(url)) {
      ndk.addExplicitRelay(url);
    }
  }

  const error = await safeConnect(ndk);

  if (countConnectedRelays(ndk) === 0) {
    markFallbackUnreachable(ndk, context, error ?? undefined);
  } else {
    resetFreeRelayFallbackState(ndk);
  }

  return true;
}

function scheduleBootstrapFallback(ndk: NDK) {
  if (!shouldAutoConnectRelays()) {
    return;
  }
  const context: FreeRelayFallbackContext = "bootstrap";
  const runFallback = () => {
    ensureFreeRelayFallback(ndk, context).catch((err) => {
      debug("[NDK] bootstrap fallback failed", err);
    });
  };

  if (countConnectedRelays(ndk) > 0) {
    void Promise.resolve().then(runFallback);
    return;
  }

  let resolved = false;
  const timeout = setTimeout(() => {
    if (resolved) return;
    resolved = true;
    cleanup();
    runFallback();
  }, 3000);

  const onConnect = () => {
    if (resolved) return;
    resolved = true;
    cleanup();
    runFallback();
  };

  const cleanup = () => {
    clearTimeout(timeout);
    (ndk.pool as any).off?.("relay:connect", onConnect);
  };

  ndk.pool.on("relay:connect", onConnect);
}

let ndkInstance: NDK | undefined;
let ndkPromise: Promise<NDK> | undefined;
let relayWatchdog: RelayWatchdog | undefined;

function startRelayWatchdog(ndk: NDK) {
  if (!shouldAutoConnectRelays()) {
    if (relayWatchdog) {
      relayWatchdog.stop();
      relayWatchdog = undefined;
    }
    return;
  }
  if (relayWatchdog) {
    relayWatchdog.updateNdk(ndk);
  } else {
    relayWatchdog = new RelayWatchdog(ndk);
  }
  const fallbackTargets = [FUNDSTR_PRIMARY_RELAY];
  const minConnected = 1;
  relayWatchdog.start(minConnected, fallbackTargets);
}

export async function safeConnect(
  ndk: NDK,
  retries = RELAY_CONNECT_RETRY.maxAttempts,
): Promise<Error | null> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await ndk.connect(RELAY_CONNECT_RETRY.timeoutMs);
      return null;
    } catch (e: any) {
      lastError = e as Error;
      if (attempt < retries) {
        const delay = computeRelayBackoffMs(attempt);
        debug(
          `[NDK] connect attempt ${attempt} failed, retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  console.warn(
    "[NDK] connect failed after", retries, "attempts:", lastError?.message,
  );
  return lastError;
}

export type CreateReadOnlyOptions = {
  fundstrOnly?: boolean;
};

async function createReadOnlyNdk(opts: CreateReadOnlyOptions = {}): Promise<NDK> {
  const settings = useSettingsStore();
  if (!Array.isArray(settings.defaultNostrRelays)) {
    settings.defaultNostrRelays = DEFAULT_RELAYS;
  }
  const userRelays = Array.isArray(settings.defaultNostrRelays)
    ? settings.defaultNostrRelays
    : [];
  const relays = userRelays.length ? userRelays : DEFAULT_RELAYS;
  const fundstrOnly =
    opts.fundstrOnly === true ||
    (opts.fundstrOnly !== false && isFundstrOnlyRelayModeActive(settings));
  const autoBootstrap = shouldAutoConnectRelays(settings, opts.fundstrOnly);
  const bootstrapRelays = fundstrOnly
    ? [FUNDSTR_PRIMARY_RELAY]
    : relays;
  const healthyPromise =
    fundstrOnly || !autoBootstrap
      ? Promise.resolve<string[]>([])
      : filterHealthyRelays(relays).catch(() => []);
  const ndk = new NDK({ explicitRelayUrls: bootstrapRelays });
  attachRelayErrorHandlers(ndk);
  if (!opts.fundstrOnly && autoBootstrap && !fundstrOnly) {
    mergeDefaultRelays(ndk);
  }
  mustConnectRequiredRelays(ndk);
  if (autoBootstrap) {
    await safeConnect(ndk);
  }
  if (!fundstrOnly && autoBootstrap) {
    healthyPromise.then(async (healthy) => {
      const healthySet = new Set(healthy);
      let changed = false;
      for (const [url, relay] of ndk.pool.relays.entries()) {
        if (!healthySet.has(url) && !relay.connected) {
          ndk.pool.relays.delete(url);
          changed = true;
        }
      }
      for (const url of healthy) {
        if (!ndk.pool.relays.has(url)) {
          ndk.addExplicitRelay(url);
          changed = true;
        }
      }
      if (changed) {
        await safeConnect(ndk);
      }
    });
  }
  if (!fundstrOnly && autoBootstrap) {
    scheduleBootstrapFallback(ndk);
  }
  startRelayWatchdog(ndk);
  return ndk;
}

export async function createSignedNdk(signer: NDKSigner): Promise<NDK> {
  const settings = useSettingsStore();
  const relays = settings.defaultNostrRelays.length
    ? settings.defaultNostrRelays
    : DEFAULT_RELAYS;
  const fundstrOnly = isFundstrOnlyRelayModeActive(settings);
  const autoBootstrap = shouldAutoConnectRelays(settings);
  const bootstrapRelays = fundstrOnly
    ? [FUNDSTR_PRIMARY_RELAY]
    : relays;
  const healthyPromise =
    fundstrOnly || !autoBootstrap
      ? Promise.resolve<string[]>([])
      : filterHealthyRelays(relays).catch(() => []);
  const ndk = new NDK({ explicitRelayUrls: bootstrapRelays });
  attachRelayErrorHandlers(ndk);
  if (autoBootstrap && !fundstrOnly) {
    mergeDefaultRelays(ndk);
  }
  mustConnectRequiredRelays(ndk);
  ndk.signer = signer;
  if (autoBootstrap) {
    await safeConnect(ndk);
  }
  if (!fundstrOnly && autoBootstrap) {
    healthyPromise.then(async (healthy) => {
      const healthySet = new Set(healthy);
      let changed = false;
      for (const [url, relay] of ndk.pool.relays.entries()) {
        if (!healthySet.has(url) && !relay.connected) {
          ndk.pool.relays.delete(url);
          changed = true;
        }
      }
      for (const url of healthy) {
        if (!ndk.pool.relays.has(url)) {
          ndk.addExplicitRelay(url);
          changed = true;
        }
      }
      if (changed) {
        await safeConnect(ndk);
      }
    });
  }
  if (!fundstrOnly && autoBootstrap) {
    await new Promise((r) => setTimeout(r, 3000));
    await ensureFreeRelayFallback(ndk, "bootstrap");
  }
  startRelayWatchdog(ndk);
  return ndk;
}

export async function createNdk(
  options: CreateReadOnlyOptions = {},
): Promise<NDK> {
  const nostrStore = useNostrStore();
  try {
    await nostrStore.initSignerIfNotSet();
  } catch (e) {
    if (e instanceof WalletLockedError) {
      throw new NdkBootError("wallet-locked", WALLET_LOCKED_MESSAGE);
    }
    throw e;
  }
  const signer = nostrStore.signer;

  if (!signer || options.fundstrOnly) {
    debug("Creating read-only NDK (no signer)");
    return createReadOnlyNdk(options);
  }

  const settings = useSettingsStore();
  if (!Array.isArray(settings.defaultNostrRelays)) {
    settings.defaultNostrRelays = DEFAULT_RELAYS;
  }
  const userRelays = Array.isArray(settings.defaultNostrRelays)
    ? settings.defaultNostrRelays
    : [];
  const relays = userRelays.length ? userRelays : DEFAULT_RELAYS;
  const fundstrOnly = isFundstrOnlyRelayModeActive(settings);
  const autoBootstrap = shouldAutoConnectRelays(settings);
  const bootstrapRelays = fundstrOnly
    ? [FUNDSTR_PRIMARY_RELAY]
    : relays;
  const healthyPromise =
    fundstrOnly || !autoBootstrap
      ? Promise.resolve<string[]>([])
      : filterHealthyRelays(relays).catch(() => []);
  const ndk = new NDK({ signer: signer as any, explicitRelayUrls: bootstrapRelays });
  attachRelayErrorHandlers(ndk);
  if (autoBootstrap && !fundstrOnly) {
    mergeDefaultRelays(ndk);
  }
  if (autoBootstrap) {
    await safeConnect(ndk);
  }
  if (!fundstrOnly && autoBootstrap) {
    healthyPromise.then(async (healthy) => {
      const healthySet = new Set(healthy);
      let changed = false;
      for (const [url, relay] of ndk.pool.relays.entries()) {
        if (!healthySet.has(url) && !relay.connected) {
          ndk.pool.relays.delete(url);
          changed = true;
        }
      }
      for (const url of healthy) {
        if (!ndk.pool.relays.has(url)) {
          ndk.addExplicitRelay(url);
          changed = true;
        }
      }
      if (changed) {
        await safeConnect(ndk);
      }
    });
  }
  if (autoBootstrap) {
    await new Promise((r) => setTimeout(r, 3000));
    await ensureFreeRelayFallback(ndk, "bootstrap");
  }
  startRelayWatchdog(ndk);
  return ndk;
}

export async function rebuildNdk(
  relays: string[],
  signer?: NDKSigner,
  explicitOnly = false,
): Promise<NDK> {
  const ndk = new NDK({ explicitRelayUrls: relays });
  attachRelayErrorHandlers(ndk);
  if (!explicitOnly) mergeDefaultRelays(ndk);
  if (signer) ndk.signer = signer;
  if (explicitOnly || shouldAutoConnectRelays()) {
    await safeConnect(ndk);
  }
  return ndk;
}

export async function syncNdkRelaysWithMode(ndk?: NDK) {
  const instance = ndk ?? ndkInstance ?? (await getNdk().catch(() => undefined));
  if (!instance) return;
  const settings = useSettingsStore();
  const fundstrOnly = isFundstrOnlyRelayModeActive();
  const autoBootstrap = shouldAutoConnectRelays(settings);
  const pool = instance.pool;
  if (fundstrOnly) {
    for (const [url, relay] of pool.relays.entries()) {
      if (url !== FUNDSTR_PRIMARY_RELAY) {
        try {
          relay.disconnect?.();
        } catch (err) {
          debug("[NDK] failed to disconnect relay", url, err);
        }
        pool.relays.delete(url);
      }
    }
    if (!pool.relays.has(FUNDSTR_PRIMARY_RELAY)) {
      instance.addExplicitRelay(FUNDSTR_PRIMARY_RELAY);
    }
  } else {
    const userRelays = Array.isArray(settings.defaultNostrRelays)
      ? settings.defaultNostrRelays
      : DEFAULT_RELAYS;
    for (const url of userRelays) {
      if (!pool.relays.has(url)) {
        instance.addExplicitRelay(url);
      }
    }
  }
  resetFreeRelayFallbackState(instance);
  if (autoBootstrap) {
    await safeConnect(instance);
  }
  startRelayWatchdog(instance);
}

export async function getNdk(): Promise<NDK> {
  if (ndkInstance) return ndkInstance;
  if (!ndkPromise) {
    const settings = useSettingsStore();
    const shouldBootstrapFundstrOnly =
      fundstrOnlyRuntimeOverride ||
      settings?.relayBootstrapMode === "fundstr-only" ||
      envFundstrOnlyRelaysEnabled();
    const options: CreateReadOnlyOptions = shouldBootstrapFundstrOnly
      ? { fundstrOnly: true }
      : {};
    ndkPromise = createNdk(options).then((ndk) => {
      ndkInstance = ndk;
      return ndk;
    });
  }
  const ndk = await ndkPromise;
  if (!ndk) {
    throw new NdkBootError("unknown", "NDK failed to initialize");
  }
  return ndk;
}

export async function ndkSend(
  toNpub: string,
  plaintext: string,
  relays: string[] = [],
): Promise<boolean> {
  const nostr = useNostrStore();
  await nostr.initSignerIfNotSet();
  const ndk = await getNdk();
  if (!ndk.signer) {
    throw new NdkBootError(
      "no-signer",
      "Nostr identity required to send a direct message",
    );
  }
  const list = relays.length ? relays : ["wss://relay.damus.io"];
  const { success } = await nostr.sendDirectMessageUnified(
    toNpub,
    plaintext,
    undefined,
    undefined,
    list,
  );
  return success;
}

export default boot(async ({ app }) => {
  const nostrStore = useNostrStore();
  try {
    await nostrStore.loadKeysFromStorage();
  } catch (e) {
    if (e instanceof WalletLockedError) {
      useBootErrorStore().set(
        new NdkBootError("wallet-locked", e.message || WALLET_LOCKED_MESSAGE),
      );
      return;
    }
    throw e;
  }
  ndkPromise = getNdk();
  app.provide("$ndkPromise", ndkPromise);
  ndkPromise.catch((e) => useBootErrorStore().set(e as NdkBootError));
});

export const __testing = {
  ensureFreeRelayFallback,
  countConnectedRelays,
};
