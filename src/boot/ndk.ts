import { boot } from "quasar/wrappers";
import { useBootErrorStore } from "stores/bootError";
import NDK, { NDKSigner } from "@nostr-dev-kit/ndk";
import { useNostrStore } from "stores/nostr";
import { useSettingsStore } from "src/stores/settings";
import { DEFAULT_RELAYS, FREE_RELAYS } from "src/config/relays";
import { filterHealthyRelays } from "src/utils/relayHealth";
import { notifyWarning } from "src/js/notify";

let dexieAdapter: any;
async function getDexieAdapter() {
  if (dexieAdapter !== undefined) return dexieAdapter;
  try {
    const loader = new Function(
      "m",
      "return import(m)",
    ) as (m: string) => Promise<any>;
    const mod = await loader("@nostr-dev-kit/ndk-cache-dexie");
    dexieAdapter = new mod.NDKCacheAdapterDexie({ dbName: "fundstrCache" });
  } catch (e) {
    console.warn("[NDK] Dexie cache unavailable", e);
    dexieAdapter = undefined;
  }
  return dexieAdapter;
}

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

function attachRelayErrorHandlers(ndk: NDK) {
  const reported = new Set<string>();
  ndk.pool.on("relay:disconnect", (relay: any) => {
    if (reported.has(relay.url)) return;
    reported.add(relay.url);
    console.debug(`[NDK] relay disconnected: ${relay.url}`);
  });
  ndk.pool.on("notice", (relay: any, notice: string) => {
    console.debug(`[NDK] notice from ${relay.url}: ${notice}`);
  });
}

let ndkInstance: NDK | undefined;
let ndkPromise: Promise<NDK> | undefined;

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
    "[NDK] connect failed after",
    retries,
    "attempts:",
    lastError?.message,
  );
  return lastError;
}

async function resolveRelayUrls(
  relays: string[],
  doHealthCheck: boolean,
): Promise<{ urls: string[]; usedFallback: boolean }> {
  let usedFallback = false;
  let relayUrls = relays;
  if (doHealthCheck) {
    try {
      relayUrls = await filterHealthyRelays(relays, {
        onFallback: () => {
          usedFallback = true;
        },
      });
    } catch (e) {
      console.warn("[NDK] relay health check failed", e);
      relayUrls = FREE_RELAYS;
      usedFallback = true;
    }
  }
  return { urls: relayUrls, usedFallback };
}

async function waitForFirstRelayConnection(
  ndk: NDK,
  timeoutMs = 7000,
): Promise<boolean> {
  if ([...ndk.pool.relays.values()].some((r: any) => r.connected)) {
    return true;
  }

  return new Promise((resolve) => {
    const onConnect = () => {
      cleanup();
      resolve(true);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      const emitter: any = ndk.pool as any;
      if (typeof emitter.off === "function") {
        emitter.off("relay:connect", onConnect);
      } else if (typeof emitter.removeListener === "function") {
        emitter.removeListener("relay:connect", onConnect);
      }
    };

    ndk.pool.on("relay:connect", onConnect);
  });
}

async function connectWithFallback(ndk: NDK): Promise<void> {
  await safeConnect(ndk);
  const connected = await waitForFirstRelayConnection(ndk);
  if (!connected) {
    mergeDefaultRelays(ndk);
    await safeConnect(ndk);
  }
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

  const { urls: relayUrls, usedFallback } = await resolveRelayUrls(
    relays,
    settings.relayHealthChecks,
  );
  if (usedFallback) {
    notifyWarning(
      "Unable to reach preferred Nostr relays",
      "Connected using backup relays. Check your internet connection or configure custom relays in Settings.",
    );
  }

  const cache = await getDexieAdapter();
  const ndk = new NDK({
    explicitRelayUrls: relayUrls,
    enableOutboxModel: true,
    autoConnectUserRelays: true,
    cacheAdapter: cache,
    initialValidationRatio: 0.5,
    lowestValidationRatio: 0.1,
  });
  attachRelayErrorHandlers(ndk);
  mergeDefaultRelays(ndk);
  await connectWithFallback(ndk);
  return ndk;
}

export async function createSignedNdk(signer: NDKSigner): Promise<NDK> {
  const settings = useSettingsStore();
  const baseRelays = settings.defaultNostrRelays.length
    ? settings.defaultNostrRelays
    : DEFAULT_RELAYS;

  const { urls: relayUrls, usedFallback } = await resolveRelayUrls(
    baseRelays,
    settings.relayHealthChecks,
  );
  if (usedFallback) {
    notifyWarning(
      "Unable to reach preferred Nostr relays",
      "Connected using backup relays. Check your internet connection or configure custom relays in Settings.",
    );
  }

  const cache = await getDexieAdapter();
  const ndk = new NDK({
    explicitRelayUrls: relayUrls,
    enableOutboxModel: true,
    autoConnectUserRelays: true,
    cacheAdapter: cache,
    initialValidationRatio: 0.5,
    lowestValidationRatio: 0.1,
  });
  attachRelayErrorHandlers(ndk);
  mergeDefaultRelays(ndk);
  ndk.signer = signer;
  await connectWithFallback(ndk);
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

  return createSignedNdk(signer as any);
}

export async function rebuildNdk(
  relays: string[],
  signer?: NDKSigner,
): Promise<NDK> {
  const cache = await getDexieAdapter();
  const ndk = new NDK({
    explicitRelayUrls: relays,
    enableOutboxModel: true,
    autoConnectUserRelays: true,
    cacheAdapter: cache,
    initialValidationRatio: 0.5,
    lowestValidationRatio: 0.1,
  });
  attachRelayErrorHandlers(ndk);
  mergeDefaultRelays(ndk);
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
  const { success } = await nostr.sendNip04DirectMessage(
    toNpub,
    plaintext,
    undefined,
    undefined,
    list,
  );
  return success;
}

export default boot(async ({ app }) => {
  ndkPromise = getNdk();
  app.provide("$ndkPromise", ndkPromise);
  ndkPromise.catch((e) => useBootErrorStore().set(e as NdkBootError));
});

