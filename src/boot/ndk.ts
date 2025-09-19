import { boot } from "quasar/wrappers";
import { useBootErrorStore } from "stores/bootError";
import NDK, { NDKSigner } from "@nostr-dev-kit/ndk";
import { useNostrStore } from "stores/nostr";
import { NDKEvent, type NDKFilter } from "@nostr-dev-kit/ndk";
import { useSettingsStore } from "src/stores/settings";
import { DEFAULT_RELAYS, FREE_RELAYS } from "src/config/relays";
import { filterHealthyRelays } from "src/utils/relayHealth";
import { RelayWatchdog } from "src/js/nostr-runtime";
import { mustConnectRequiredRelays } from "../nostr/relays";

export type NdkBootErrorReason =
  | "no-signer"
  | "connect-failed"
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

export function mergeDefaultRelays(ndk: NDK) {
  for (const url of DEFAULT_RELAYS) {
    if (!ndk.pool.relays.has(url)) {
      ndk.addExplicitRelay(url);
    }
  }
}

const disconnectCounts = new Map<string, number>();
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleDisconnectLog() {
  if (disconnectTimer) return;
  disconnectTimer = setTimeout(() => {
    const entries = Array.from(disconnectCounts.entries());
    disconnectCounts.clear();
    disconnectTimer = null;
    if (!entries.length) return;
    const summary = entries
      .map(([u, c]) => (c > 1 ? `${u} (x${c})` : u))
      .join(", ");
    console.debug(`[NDK] relay disconnected: ${summary}`);
  }, 1000);
}

function attachRelayErrorHandlers(ndk: NDK) {
  ndk.pool.on("relay:disconnect", (relay: any) => {
    disconnectCounts.set(relay.url, (disconnectCounts.get(relay.url) ?? 0) + 1);
    scheduleDisconnectLog();
  });
  ndk.pool.on("notice", (relay: any, notice: string) => {
    console.debug(`[NDK] notice from ${relay.url}: ${notice}`);
  });
  (ndk.pool as any).on?.("relay:stalled", (relay: any) => {
    console.warn(`[NDK] heartbeat stalled on ${relay.url}`);
  });
  (ndk.pool as any).on?.("relay:heartbeat", (relay: any) => {
    console.debug(`[NDK] heartbeat recovered on ${relay.url}`);
  });
}

let ndkInstance: NDK | undefined;
let ndkPromise: Promise<NDK> | undefined;
let relayWatchdog: RelayWatchdog | undefined;

function startRelayWatchdog(ndk: NDK) {
  if (relayWatchdog) {
    relayWatchdog.updateNdk(ndk);
  } else {
    relayWatchdog = new RelayWatchdog(ndk);
  }
  relayWatchdog.start(2, FREE_RELAYS);
}

export async function safeConnect(
  ndk: NDK,
  retries = 3,
): Promise<Error | null> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await ndk.connect(10_000);
      return null;
    } catch (e: any) {
      lastError = e as Error;
      if (attempt < retries) {
        const delay = 1000 * 2 ** (attempt - 1);
        console.debug(
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

async function createReadOnlyNdk(): Promise<NDK> {
  const settings = useSettingsStore();
  if (!Array.isArray(settings.defaultNostrRelays)) {
    settings.defaultNostrRelays = DEFAULT_RELAYS;
  }
  const userRelays = Array.isArray(settings.defaultNostrRelays)
    ? settings.defaultNostrRelays
    : [];
  const relays = userRelays.length ? userRelays : DEFAULT_RELAYS;
  const healthyPromise = filterHealthyRelays(relays).catch(() => []);
  const ndk = new NDK({ explicitRelayUrls: relays });
  attachRelayErrorHandlers(ndk);
  mergeDefaultRelays(ndk);
  mustConnectRequiredRelays(ndk);
  await safeConnect(ndk);
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
  await new Promise((r) => setTimeout(r, 3000));
  if (![...ndk.pool.relays.values()].some((r: any) => r.connected)) {
    for (const url of FREE_RELAYS) {
      if (!ndk.pool.relays.has(url)) {
        ndk.addExplicitRelay(url);
      }
    }
    await safeConnect(ndk);
  }
  startRelayWatchdog(ndk);
  return ndk;
}

export async function createSignedNdk(signer: NDKSigner): Promise<NDK> {
  const settings = useSettingsStore();
  const relays = settings.defaultNostrRelays.length
    ? settings.defaultNostrRelays
    : DEFAULT_RELAYS;
  const healthyPromise = filterHealthyRelays(relays).catch(() => []);
    const ndk = new NDK({ explicitRelayUrls: relays });
    attachRelayErrorHandlers(ndk);
    mergeDefaultRelays(ndk);
    mustConnectRequiredRelays(ndk);
    ndk.signer = signer;
  await safeConnect(ndk);
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
  await new Promise((r) => setTimeout(r, 3000));
  if (![...ndk.pool.relays.values()].some((r: any) => r.connected)) {
    for (const url of FREE_RELAYS) {
      if (!ndk.pool.relays.has(url)) {
        ndk.addExplicitRelay(url);
      }
    }
    await safeConnect(ndk);
  }
  startRelayWatchdog(ndk);
  return ndk;
}

export async function createNdk(): Promise<NDK> {
  const nostrStore = useNostrStore();
  await nostrStore.initSignerIfNotSet();
  const signer = nostrStore.signer;

  if (!signer) {
    console.info("Creating read-only NDK (no signer)");
    return createReadOnlyNdk();
  }

  const settings = useSettingsStore();
  if (!Array.isArray(settings.defaultNostrRelays)) {
    settings.defaultNostrRelays = DEFAULT_RELAYS;
  }
  const userRelays = Array.isArray(settings.defaultNostrRelays)
    ? settings.defaultNostrRelays
    : [];
  const relays = userRelays.length ? userRelays : DEFAULT_RELAYS;
  const healthyPromise = filterHealthyRelays(relays).catch(() => []);
  const ndk = new NDK({ signer: signer as any, explicitRelayUrls: relays });
  attachRelayErrorHandlers(ndk);
  mergeDefaultRelays(ndk);
  await safeConnect(ndk);
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
  await new Promise((r) => setTimeout(r, 3000));
  if (![...ndk.pool.relays.values()].some((r: any) => r.connected)) {
    for (const url of FREE_RELAYS) {
  if (!ndk.pool.relays.has(url)) {
        ndk.addExplicitRelay(url);
      }
    }
    await safeConnect(ndk);
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
  await safeConnect(ndk);
  return ndk;
}

export async function getNdk(): Promise<NDK> {
  if (ndkInstance) return ndkInstance;
  if (!ndkPromise) {
    ndkPromise = createNdk().then((ndk) => {
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
  await nostrStore.loadKeysFromStorage();
  ndkPromise = getNdk();
  app.provide("$ndkPromise", ndkPromise);
  ndkPromise.catch((e) => useBootErrorStore().set(e as NdkBootError));
});
