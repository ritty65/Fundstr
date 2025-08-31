import { useBucketsStore } from "./buckets";
import { debug } from "src/js/logger";
import { defineStore } from "pinia";
import NDK, {
  NDKEvent,
  NDKSigner,
  NDKNip07Signer,
  NDKNip46Signer,
  NDKFilter,
  NDKPrivateKeySigner,
  NDKKind,
  NDKRelaySet,
  NDKRelay,
  NDKTag,
  ProfilePointer,
  NDKSubscription,
} from "@nostr-dev-kit/ndk";
import {
  nip19,
  nip44,
  nip04,
  SimplePool,
  getEventHash as ntGetEventHash,
  finalizeEvent,
  verifyEvent,
} from "nostr-tools";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils"; // already an installed dependency
import { ensureCompressed } from "src/utils/ecash";
import { useWalletStore } from "./wallet";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { useLocalStorage } from "@vueuse/core";
import { useSettingsStore } from "./settings";
import { filterHealthyRelays } from "src/utils/relayHealth";
import { DEFAULT_RELAYS, FREE_RELAYS } from "src/config/relays";
import {
  notifyApiError,
  notifyError,
  notifySuccess,
  notifyWarning,
  notify,
} from "../js/notify";
import { useNdk } from "src/composables/useNdk";
import { rebuildNdk } from "boot/ndk";
import { useRouter } from "vue-router";
import { useP2PKStore } from "./p2pk";
import { watch } from "vue";
import { useCreatorHubStore } from "./creatorHub";

const STORAGE_SECRET = "cashu_ndk_storage_key";
let cachedKey: CryptoKey | null = null;
const RECONNECT_BACKOFF_MS = 15000; // 15s cooldown after failed attempts

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const enc = new TextEncoder();
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(STORAGE_SECRET),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  cachedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("cashu_ndk_salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

async function encryptString(value: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(value),
  );
  const buff = new Uint8Array(iv.length + ciphertext.byteLength);
  buff.set(iv, 0);
  buff.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...buff));
}

async function decryptString(value: string): Promise<string> {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const key = await getKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(decrypted);
}

async function secureSetItem(key: string, value: string) {
  const enc = await encryptString(value);
  localStorage.setItem(key, enc);
}

async function secureGetItem(key: string): Promise<string | null> {
  const val = localStorage.getItem(key);
  if (!val) return null;
  try {
    return await decryptString(val);
  } catch (e) {
    console.error("Failed to decrypt", e);
    return null;
  }
}

export function npubToHex(s: string): string | null {
  const input = s.trim();
  console.debug("[npubToHex] input", input);
  try {
    const decoded = nip19.decode(input);
    console.debug("[npubToHex] decoded", decoded);
    const { type, data } = decoded;
    if (type !== "npub") return null;
    if (typeof data === "string") {
      if (/^[0-9a-fA-F]{64}$/.test(data)) return data.toLowerCase();
    } else if ((data as any) instanceof Uint8Array) {
      return bytesToHex(data);
    }
  } catch (err) {
    console.error("[npubToHex] decode failed", err);
  }
  return null;
}

// --- Nutzap helpers (NIP-61) ----------------------------------------------

import type { NostrEvent } from "@nostr-dev-kit/ndk";

interface NutzapProfile {
  hexPub: string;
  p2pkPubkey: string;
  trustedMints: string[];
  relays: string[];
}

export class RelayConnectionError extends Error {
  constructor(message?: string) {
    super(message ?? "Unable to connect to Nostr relays");
    this.name = "RelayConnectionError";
  }
}

export async function urlsToRelaySet(
  urls?: string[],
): Promise<NDKRelaySet | undefined> {
  if (!urls?.length) return undefined;

  const ndk = await useNdk({ requireSigner: false });
  const set = new NDKRelaySet(new Set(), ndk);
  urls.forEach((u) =>
    set.addRelay(
      ndk.pool.getRelay(u) ?? new NDKRelay(u, undefined as any, ndk as any),
    ),
  );
  return set;
}

/** Wraps relay.connect() in a timeout (ms) so it never hangs forever */
function connectWithTimeout(relay: any, ms = 6000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`[nostr] timeout ${relay?.url ?? ""}`)),
      ms,
    );
    relay
      .connect()
      .then(() => {
        clearTimeout(t);
        resolve();
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

export class PublishTimeoutError extends Error {
  constructor(message = "Publish timed out") {
    super(message);
    this.name = "PublishTimeoutError";
  }
}

export async function publishWithTimeout(
  ev: NDKEvent,
  relays?: NDKRelaySet,
  timeoutMs = 30000,
): Promise<void> {
  await Promise.race([
    ev.publish(relays),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new PublishTimeoutError()), timeoutMs),
    ),
  ]);
}

const relayFailureCounts = new Map<string, number>();
let relayRotationIndex = 0;
const MAX_FAILURES = 3;

export function resetRelaySelection() {
  relayFailureCounts.clear();
  relayRotationIndex = 0;
}

export async function selectPreferredRelays(
  relays: string[],
): Promise<string[]> {
  const relayUrls = relays
    .filter((r) => r.startsWith("wss://"))
    .map((r) => r.replace(/\/+$/, ""));

  const candidates = relayUrls.filter(
    (r) => (relayFailureCounts.get(r) ?? 0) < MAX_FAILURES,
  );

  let healthy: string[] = [];
  try {
    healthy = await filterHealthyRelays(candidates);
  } catch {
    healthy = [];
  }

  const healthySet = new Set(healthy);
  for (const url of candidates) {
    if (healthySet.has(url)) {
      relayFailureCounts.delete(url);
    } else {
      const count = (relayFailureCounts.get(url) ?? 0) + 1;
      relayFailureCounts.set(url, count);
    }
  }

  if (healthy.length === 0) return [];

  const start = relayRotationIndex % healthy.length;
  relayRotationIndex = (relayRotationIndex + 1) % healthy.length;
  return healthy.slice(start).concat(healthy.slice(0, start));
}

/** Resolves once any relay in `ndk.pool` has `connected === true`. */
export function ensureRelayConnectivity(ndk: NDK): Promise<void> {
  const isConnected = () =>
    Array.from(ndk.pool.relays.values()).some((r: any) => r.connected === true);

  if (isConnected()) return Promise.resolve();

  const timeoutMs = 4000;

  return new Promise((resolve, reject) => {
    const expiry = Date.now() + timeoutMs;
    const interval = setInterval(() => {
      if (isConnected()) {
        clearInterval(interval);
        resolve();
      } else if (Date.now() > expiry) {
        clearInterval(interval);
        reject(new Error("No relay connected"));
      }
    }, 100);
  });
}

/**
 * Fetches the receiver’s ‘kind:10019’ Nutzap profile.
 */
export async function fetchNutzapProfile(
  npubOrHex: string,
): Promise<NutzapProfile | null> {
  const nostr = useNostrStore();
  await nostr.initNdkReadOnly();
  const ndk = await useNdk();
  if (!ndk) {
    throw new Error(
      "NDK not initialised \u2013 call initSignerIfNotSet() first",
    );
  }
  try {
    await ensureRelayConnectivity(ndk);
  } catch (e: any) {
    throw new RelayConnectionError(e?.message);
  }
  const hex = npubOrHex.startsWith("npub") ? npubToHex(npubOrHex) : npubOrHex;
  if (!hex) throw new Error("Invalid npub");
  const sub = ndk.subscribe({
    kinds: [10019],
    authors: [hex],
    limit: 1,
  });

  return new Promise((resolve) => {
    sub.on("event", (ev: NostrEvent) => {
      let p2pkPubkey = ev.tags.find((t) => t[0] === "pubkey")?.[1];
      const mints = ev.tags.filter((t) => t[0] === "mint").map((t) => t[1]);
      if (p2pkPubkey) {
        if (p2pkPubkey.startsWith("npub")) {
          const hx = npubToHex(p2pkPubkey);
          if (hx) p2pkPubkey = hx;
        }
        try {
          p2pkPubkey = ensureCompressed(p2pkPubkey);
        } catch (e) {
          console.error("Invalid P2PK pubkey", e);
          p2pkPubkey = "";
        }
        resolve({
          hexPub: hex,
          p2pkPubkey,
          trustedMints: mints,
          relays: ev.tags.filter((t) => t[0] === "relay").map((t) => t[1]),
        });
      } else resolve(null);
      sub.stop();
    });

    // timeout after 10 s
    setTimeout(() => (sub.stop(), resolve(null)), 10_000);
  });
}

/** Publishes a ‘kind:10019’ Nutzap profile event. */
export async function publishNutzapProfile(opts: {
  p2pkPub: string;
  mints: string[];
  relays?: string[];
}) {
  const nostr = useNostrStore();
  if (!nostr.signer) {
    throw new Error("Signer required to publish Nutzap profile");
  }
  await nostr.ensureNdkConnected(opts.relays);
  const tags: NDKTag[] = [["pubkey", opts.p2pkPub]];
  for (const url of opts.mints) tags.push(["mint", url]);
  if (opts.relays) for (const r of opts.relays) tags.push(["relay", r]);

  const ndk = await useNdk();
  if (!ndk) {
    throw new Error(
      "NDK not initialised \u2013 call initSignerIfNotSet() first",
    );
  }
  const ev = new NDKEvent(ndk);
  ev.kind = 10019;
  ev.content = "";
  ev.tags = tags;
  ev.created_at = Math.floor(Date.now() / 1000);
  await ev.sign();
  const relaySet = await urlsToRelaySet(opts.relays);
  try {
    await ensureRelayConnectivity(ndk);
  } catch (e: any) {
    notifyWarning("Relay connection failed", e?.message ?? String(e));
  }
  try {
    await publishWithTimeout(ev, relaySet);
  } catch (e: any) {
    notifyError(e?.message ?? String(e));
    throw e;
  }
  return ev.id!;
}

/**
 * Publishes a complete, discoverable user profile to Nostr.
 * This includes kind 0 (metadata), kind 10002 (relay list), and kind 10019 (payment profile).
 * This single action ensures a user's identity is consistent and findable.
 */
export async function publishDiscoveryProfile(opts: {
  profile: { display_name?: string; picture?: string; about?: string };
  p2pkPub: string;
  mints: string[];
  relays: string[];
}) {
  const nostr = useNostrStore();
  if (!nostr.signer) {
    throw new Error("Signer required to publish a discoverable profile.");
  }
  // Ensure we are connected to the relays we want to publish to.
  await nostr.ensureNdkConnected(opts.relays);
  const ndk = await useNdk();
  if (!ndk) {
    throw new Error("NDK not initialized. Cannot publish profile.");
  }

  // --- 1. Prepare Kind 0 (Profile Metadata) ---
  const kind0Event = new NDKEvent(ndk);
  kind0Event.kind = 0;
  kind0Event.content = JSON.stringify(opts.profile);

  // --- 2. Prepare Kind 10002 (Relay List) ---
  const kind10002Event = new NDKEvent(ndk);
  kind10002Event.kind = 10002;
  kind10002Event.tags = opts.relays.map((r) => ["r", r]); // 'r' tag for each relay URL

  // --- 3. Prepare Kind 10019 (Nutzap/Payment Profile) ---
  const kind10019Event = new NDKEvent(ndk);
  kind10019Event.kind = 10019;
  kind10019Event.tags = [
    ["pubkey", opts.p2pkPub],
    ...opts.mints.map((m) => ["mint", m]),
    ...opts.relays.map((r) => ["relay", r]),
  ];

  const eventsToPublish = [kind0Event, kind10002Event, kind10019Event];

  // Sign all events
  await Promise.all(eventsToPublish.map((ev) => ev.sign()));

  // Publish all events
  const relaySet = await urlsToRelaySet(opts.relays);
  try {
    await ensureRelayConnectivity(ndk);
  } catch (e: any) {
    notifyWarning("Relay connection failed", e?.message ?? String(e));
  }
  try {
    await Promise.all(
      eventsToPublish.map((ev) => publishWithTimeout(ev, relaySet)),
    );
    notifySuccess("Profile published successfully to your relays!");
  } catch (e: any) {
    notifyError(e?.message ?? String(e));
    throw e;
  }
  return eventsToPublish.map((ev) => ev.id);
}

/** Publishes a ‘kind:9321’ Nutzap event. */
export async function publishNutzap(opts: {
  content: string;
  receiverHex: string;
  relayHints?: string[];
}) {
  const nostr = useNostrStore();
  await nostr.initSignerIfNotSet();
  await nostr.ensureNdkConnected(opts.relayHints);
  const ndk = await useNdk();
  if (!ndk) {
    throw new Error(
      "NDK not initialised \u2013 call initSignerIfNotSet() first",
    );
  }
  const ev = new NDKEvent(ndk);
  ev.kind = 9321;
  ev.content = opts.content;
  ev.tags = [["p", opts.receiverHex]];
  ev.created_at = Math.floor(Date.now() / 1000);
  await ev.sign();
  const relaySet = await urlsToRelaySet(opts.relayHints);
  try {
    await ensureRelayConnectivity(ndk);
  } catch (e: any) {
    notifyWarning("Relay connection failed", e?.message ?? String(e));
  }
  try {
    await ev.publish(relaySet);
  } catch (e: any) {
    notifyError(e?.message ?? String(e));
    throw e;
  }
  return ev.id!;
}

/** Listens for incoming Nutzaps that reference my pubkey via ‘p’ tag. */
export async function subscribeToNutzaps(
  myHex: string,
  onZap: (ev: NostrEvent) => void,
): Promise<NDKSubscription> {
  const nostr = useNostrStore();
  await nostr.initNdkReadOnly();
  const ndk = await useNdk();
  if (!ndk) {
    throw new Error(
      "NDK not initialised \u2013 call initSignerIfNotSet() first",
    );
  }
  const sub = ndk.subscribe({
    kinds: [9321],
    "#p": [myHex],
  });
  sub.on("event", onZap);
  return sub;
}

type MintRecommendation = {
  url: string;
  count: number;
};

type CachedProfile = {
  profile: any;
  fetchedAt: number;
};

export enum SignerType {
  NIP07 = "NIP07",
  NIP46 = "NIP46",
  PRIVATEKEY = "PRIVATEKEY",
  SEED = "SEED",
}

export const useNostrStore = defineStore("nostr", {
  state: () => {
    return {
      connected: false,
      pubkey: "",
      relays: useSettingsStore().defaultNostrRelays ?? ([] as string[]),
      signerType: SignerType.SEED,
      nip07signer: {} as NDKNip07Signer,
      nip46Token: "",
      nip46signer: {} as NDKNip46Signer,
      privateKeySignerPrivateKey: "",
      seedSignerPrivateKey: "",
      seedSignerPublicKey: "",
      seedSigner: {} as NDKPrivateKeySigner,
      seedSignerPrivateKeyNsec: "",
      privateKeySigner: {} as NDKPrivateKeySigner,
      signer: undefined as unknown as NDKSigner | undefined,
      nip07SignerAvailable: true,
      nip07Checked: false,
      nip07Warned: false,
      mintRecommendations: useLocalStorage<MintRecommendation[]>(
        "cashu.ndk.mintRecommendations",
        [],
      ),
      initialized: false,
      secureStorageLoaded: false,
      lastError: "" as string | null,
      connectionFailed: false,
      reconnectBackoffUntil: 0,
      profiles: useLocalStorage<
        Record<string, { profile: any; fetchedAt: number }>
      >("cashu.ndk.profiles", {}),
    };
  },
  getters: {
    seedSignerPrivateKeyNsecComputed: (state) => {
      const sk = hexToBytes(state.seedSignerPrivateKey);
      return nip19.nsecEncode(sk);
    },
    nprofile: (state) => {
      const profile: ProfilePointer = {
        pubkey: state.pubkey,
        relays: state.relays,
      };
      return nip19.nprofileEncode(profile);
    },
    seedSignerNprofile: (state) => {
      const profile: ProfilePointer = {
        pubkey: state.seedSignerPublicKey,
        relays: state.relays,
      };
      return nip19.nprofileEncode(profile);
    },
    npub: (state) => {
      try {
        return nip19.npubEncode(state.pubkey);
      } catch (e) {
        return state.pubkey;
      }
    },
    activePrivateKeyNsec: (state) => {
      const keyHex =
        state.signerType === SignerType.PRIVATEKEY
          ? state.privateKeySignerPrivateKey
          : state.seedSignerPrivateKey;
      if (!keyHex) return "";
      try {
        return nip19.nsecEncode(hexToBytes(keyHex));
      } catch (e) {
        return "";
      }
    },
    privKeyHex: (state) => {
      switch (state.signerType) {
        case SignerType.PRIVATEKEY:
          return state.privateKeySignerPrivateKey;
        case SignerType.SEED:
          return state.seedSignerPrivateKey;
        default:
          return "";
      }
    },
    hasIdentity: (state) => Boolean(state.pubkey && state.signerType),
  },
  actions: {
    loadKeysFromStorage: async function () {
      if (this.secureStorageLoaded) return;
      const pk = await secureGetItem("cashu.ndk.pubkey");
      if (pk) this.pubkey = pk;
      const st = await secureGetItem("cashu.ndk.signerType");
      if (st) this.signerType = st as SignerType;
      const nip46 = await secureGetItem("cashu.ndk.nip46Token");
      if (nip46) this.nip46Token = nip46;
      const pks = await secureGetItem("cashu.ndk.privateKeySignerPrivateKey");
      if (pks) this.privateKeySignerPrivateKey = pks;
      const seedSk = await secureGetItem("cashu.ndk.seedSignerPrivateKey");
      if (seedSk) this.seedSignerPrivateKey = seedSk;
      const seedPk = await secureGetItem("cashu.ndk.seedSignerPublicKey");
      if (seedPk) this.seedSignerPublicKey = seedPk;
      watch(
        () => this.pubkey,
        (v) => {
          secureSetItem("cashu.ndk.pubkey", v);
        },
      );
      watch(
        () => this.signerType,
        (v) => {
          secureSetItem("cashu.ndk.signerType", v.toString());
        },
      );
      watch(
        () => this.nip46Token,
        (v) => {
          secureSetItem("cashu.ndk.nip46Token", v);
        },
      );
      watch(
        () => this.privateKeySignerPrivateKey,
        (v) => {
          secureSetItem("cashu.ndk.privateKeySignerPrivateKey", v);
        },
      );
      watch(
        () => this.seedSignerPrivateKey,
        (v) => {
          secureSetItem("cashu.ndk.seedSignerPrivateKey", v);
        },
      );
      watch(
        () => this.seedSignerPublicKey,
        (v) => {
          secureSetItem("cashu.ndk.seedSignerPublicKey", v);
        },
      );
      this.secureStorageLoaded = true;
    },
    initNdkReadOnly: async function () {
      await this.loadKeysFromStorage();
      const ndk = await useNdk({ requireSigner: false });
      if (this.connected) return;
      try {
        await ndk.connect();
        this.connected = true;
        this.lastError = null;
        this.connectionFailed = false;
      } catch (e: any) {
        console.warn("[nostr] read-only connect failed", e);
        notifyWarning(`Failed to connect to relays`, e?.message ?? String(e));
        this.connected = false;
        this.lastError = e?.message ?? String(e);
        this.connectionFailed = true;
        window.dispatchEvent(new Event("nostr-connect-failed"));
      }
    },
    disconnect: async function () {
      const ndk = await useNdk();
      for (const relay of ndk.pool.relays.values()) relay.disconnect();
      this.signer = undefined;
      this.connected = false;
    },
    async connectBrowserSigner() {
      const nip07 = new NDKNip07Signer();
      try {
        await (window as any).nostr?.enable?.();
        const user = await nip07.user();
        this.signer = nip07;
        this.signerType = SignerType.NIP07;
        this.setPubkey(user.pubkey);
        useNdk({ requireSigner: true }).catch(() => {});
      } catch (e) {
        throw new Error("The signer request was rejected or blocked.");
      }
    },
    connect: async function (relays?: string[]) {
      // respect cooldown if previous attempt failed
      if (
        this.reconnectBackoffUntil &&
        Date.now() < this.reconnectBackoffUntil
      ) {
        return;
      }

      this.connectionFailed = false;

      // 1. remember desired relay set
      if (relays) this.relays = relays as any;

      // 2. build a *new* NDK whose pool contains only those relays
      const ndk = await rebuildNdk(this.relays, this.signer);

      // 3. connect every relay with a 6-second guard, but do not await ndk.connect() again
      const relaysArr = Array.from(ndk.pool.relays.values());
      const connectPromises = relaysArr.map((r) => connectWithTimeout(r, 6000));

      // flip Online as soon as one opens
      try {
        await Promise.any(connectPromises);
        this.connected = true;
        this.lastError = null;
        this.reconnectBackoffUntil = 0;
        this.connectionFailed = false;
      } catch (e: any) {
        this.connected = false;
        this.lastError = e?.message ?? String(e);
        this.reconnectBackoffUntil = Date.now() + RECONNECT_BACKOFF_MS;
        this.connectionFailed = true;
        window.dispatchEvent(new Event("nostr-connect-failed"));
        notifyError(this.lastError);
      }

      // 4. keep icons in RelayManager.vue fresh
      ndk.pool.on("relay:connect", () => {
        this.relays = [...this.relays];
      });
      ndk.pool.on("relay:disconnect", () => {
        this.relays = [...this.relays];
      });

      // 5. background logging – never throw
      Promise.allSettled(connectPromises).then((res) =>
        res.forEach((r, i) => {
          if (r.status === "rejected") {
            console.warn("[nostr] relay", relaysArr[i].url, "failed", r.reason);
            notifyWarning(
              `Relay ${relaysArr[i].url} failed`,
              (r.reason as any)?.message ?? String(r.reason),
            );
          }
        }),
      );
    },
    ensureNdkConnected: async function (relays?: string[]) {
      const ndk = await useNdk();
      if (!this.connected) {
        try {
          await ndk.connect();
          this.connected = true;
          this.connectionFailed = false;
        } catch (e: any) {
          notifyWarning("Failed to connect to relays", e?.message ?? String(e));
          this.connectionFailed = true;
          window.dispatchEvent(new Event("nostr-connect-failed"));
        }
      }
      if (relays?.length) {
        const added = await urlsToRelaySet(relays);
        if (added) {
          try {
            await ndk.connect();
            this.connectionFailed = false;
          } catch (e: any) {
            notifyWarning(
              "Failed to connect to additional relays",
              e?.message ?? String(e),
            );
            this.connectionFailed = true;
            window.dispatchEvent(new Event("nostr-connect-failed"));
          }
        }
      }
    },
    initSignerIfNotSet: async function () {
      await this.loadKeysFromStorage();
      if (!this.signer) {
        if (
          this.signerType === SignerType.NIP07 &&
          this.nip07Checked &&
          !this.nip07SignerAvailable
        ) {
          if (!this.initialized) {
            await this.initNdkReadOnly();
            this.initialized = true;
          }
          return;
        }
        this.initialized = false; // force re-initialisation
      }
      if (!this.initialized) {
        await this.initSigner();
        await this.ensureNdkConnected();
      }
    },
    initSigner: async function () {
      if (this.signerType === SignerType.NIP07) {
        await this.initNip07Signer();
      } else if (this.signerType === SignerType.PRIVATEKEY) {
        await this.initPrivateKeySigner();
      } else {
        await this.initWalletSeedPrivateKeySigner();
      }
      this.initialized = true;
    },
    setSigner: async function (signer: NDKSigner) {
      this.signer = signer;
      await this.connect();
    },
    signDummyEvent: async function (): Promise<NDKEvent> {
      const ndkEvent = new NDKEvent();
      ndkEvent.kind = 1;
      ndkEvent.content = "Hello, world!";
      const sig = await ndkEvent.sign(this.signer);
      debug(`nostr signature: ${sig})`);
      const eventString = JSON.stringify(ndkEvent.rawEvent());
      debug(`nostr event: ${eventString}`);
      return ndkEvent;
    },
    setPubkey: function (pubkey: string) {
      debug("Setting pubkey to", pubkey);
      const prev = this.pubkey;
      this.pubkey = pubkey;
      try {
        const privKey = this.privKeyHex;
        if (privKey && privKey.length) {
          const p2pkStore = useP2PKStore();
          // ensureCompressed() so P2PK keys are always in SEC form
          const pk66 = ensureCompressed(
            "02" + getPublicKey(hexToBytes(privKey)),
          );
          if (!p2pkStore.haveThisKey(pk66) && p2pkStore.p2pkKeys.length === 0) {
            const keyPair = {
              publicKey: pk66,
              privateKey: privKey,
              used: false,
              usedCount: 0,
            };
            p2pkStore.p2pkKeys = p2pkStore.p2pkKeys.concat(keyPair);
          }
        }
      } catch (e) {
        console.error(e);
      }
      if (prev !== pubkey) {
        this.onIdentityChange(prev);
      }
    },
    async onIdentityChange(previous?: string) {
      if (previous) {
        delete (this.profiles as any)[previous];
      }
      if (this.pubkey) {
        await this.getProfile(this.pubkey);
      }
      try {
        useCreatorHubStore().loadTiersFromNostr();
      } catch (e) {
        console.error(e);
      }
      try {
        useWalletStore().$reset();
      } catch (e) {
        console.error(e);
      }
    },
    resolvePubkey: function (pk: string): string | undefined {
      if (typeof pk !== "string") return undefined;
      const trimmed = pk.trim();
      const keyRegex = /[0-9a-fA-F]{64}|npub1|nprofile1/;
      if (!keyRegex.test(trimmed)) return undefined;
      if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return trimmed.toLowerCase();
      }
      if (trimmed.length < 2) return undefined;
      try {
        const decoded = nip19.decode(trimmed);
        if (decoded.type === "npub") {
          return typeof decoded.data === "string"
            ? (decoded.data as string)
            : bytesToHex(decoded.data as Uint8Array);
        }
        if (decoded.type === "nprofile") {
          return (decoded.data as ProfilePointer).pubkey;
        }
      } catch (e) {
        console.error("Failed to decode pubkey", pk, e);
      }
      return undefined;
    },
    getProfile: async function (pubkey: string): Promise<any> {
      const resolved = this.resolvePubkey(pubkey);
      if (!resolved) return undefined;
      pubkey = resolved;
      const now = Math.floor(Date.now() / 1000);
      let cached = this.profiles[pubkey] as CachedProfile | undefined;

      if (!cached) {
        const dbEntry = await cashuDb.profiles.get(pubkey);
        if (dbEntry) {
          this.profiles[pubkey] = {
            profile: dbEntry.profile,
            fetchedAt: dbEntry.fetchedAt,
          };
          cached = this.profiles[pubkey] as CachedProfile;
        }
      }

      if (cached && now - cached.fetchedAt < 24 * 60 * 60) {
        return cached.profile;
      }

      await this.initNdkReadOnly();
      try {
        const ndk = await useNdk();
        const user = ndk.getUser({ pubkey });
        await user.fetchProfile();
        const entry: CachedProfile = { profile: user.profile, fetchedAt: now };
        this.profiles[pubkey] = entry;
        await cashuDb.profiles.put({ pubkey, ...entry });
        return user.profile;
      } catch (e) {
        console.error(e);
        return cached ? cached.profile : null;
      }
    },
    checkNip07Signer: async function (force = false): Promise<boolean> {
      if (this.nip07Checked && this.nip07SignerAvailable && !force) return true;
      const flag = localStorage.getItem("nip07.enabled");
      try {
        if (!flag || force) {
          await (window as any).nostr?.enable?.();
        }
        const signer = new NDKNip07Signer();
        await signer.user();
        this.nip07SignerAvailable = true;
        this.nip07Checked = true;
        localStorage.setItem("nip07.enabled", "1");
      } catch (e) {
        this.nip07SignerAvailable = false;
        this.nip07Checked = false;
        localStorage.removeItem("nip07.enabled");
      }
      return this.nip07SignerAvailable;
    },
    initNip07Signer: async function () {
      const available = await this.checkNip07Signer();
      if (!available) {
        if (!this.nip07Warned) {
          notifyWarning(
            "Nostr extension locked or unavailable",
            "Unlock your NIP-07 extension to enable signing",
          );
          this.nip07Warned = true;
        }
        this.initialized = true;
        return;
      }
      try {
        const signer = new NDKNip07Signer();
        await signer.blockUntilReady();
        const user = await signer.user();
        if (user?.npub) {
          this.signerType = SignerType.NIP07;
          this.setPubkey(user.pubkey);
          await this.setSigner(signer);
        }
      } catch (e) {
        console.error("Failed to init NIP07 signer:", e);
      }
    },
    initNip46Signer: async function (nip46Token?: string) {
      const ndk = await useNdk();
      if (!nip46Token && !this.nip46Token.length) {
        nip46Token = (await prompt(
          "Enter your NIP-46 connection string",
        )) as string;
        if (!nip46Token) {
          return;
        }
        this.nip46Token = nip46Token;
      } else {
        if (nip46Token) {
          this.nip46Token = nip46Token;
        }
      }
      const signer = new NDKNip46Signer(ndk, this.nip46Token);
      this.signerType = SignerType.NIP46;
      await this.setSigner(signer);
      // If the backend sends an auth_url event, open that URL as a popup so the user can authorize the app
      signer.on("authUrl", (url) => {
        window.open(url, "auth", "width=600,height=600");
      });
      // wait until the signer is ready
      const loggedinUser = await signer.blockUntilReady();
      alert("You are now logged in as " + loggedinUser.npub);
      this.setPubkey(loggedinUser.pubkey);
    },
    resetNip46Signer: async function () {
      this.nip46Token = "";
      await this.initWalletSeedPrivateKeySigner();
    },
    initPrivateKeySigner: async function (nsec?: string) {
      let privateKeyBytes: Uint8Array;
      if (!nsec && !this.privateKeySignerPrivateKey.length) {
        nsec = (await prompt("Enter your nsec")) as string;
        if (!nsec) {
          return;
        }
        privateKeyBytes = nip19.decode(nsec).data as Uint8Array;
      } else {
        if (nsec) {
          privateKeyBytes = nip19.decode(nsec).data as Uint8Array;
        } else {
          privateKeyBytes = hexToBytes(this.privateKeySignerPrivateKey);
        }
      }
      const privateKeyHex = bytesToHex(privateKeyBytes);
      const signer = new NDKPrivateKeySigner(privateKeyHex);
      this.privateKeySignerPrivateKey = privateKeyHex;
      this.signerType = SignerType.PRIVATEKEY;
      this.setPubkey(getPublicKey(privateKeyBytes));
      await this.setSigner(signer);
    },
    async updateIdentity(nsec: string, relays?: string[]) {
      if (relays) this.relays = relays as any;
      await this.checkNip07Signer(true);
      if (this.signerType === SignerType.NIP07 && this.nip07SignerAvailable) {
        await this.initNip07Signer();
      } else {
        await this.initPrivateKeySigner(nsec);
      }
    },
    resetPrivateKeySigner: async function () {
      this.privateKeySignerPrivateKey = "";
      await this.initWalletSeedPrivateKeySigner();
    },
    walletSeedGenerateKeyPair: async function () {
      const walletStore = useWalletStore();
      const sk = walletStore.seed.slice(0, 32);
      const walletPublicKeyHex = getPublicKey(sk); // `pk` is a hex string
      const walletPrivateKeyHex = bytesToHex(sk);
      this.seedSignerPrivateKey = walletPrivateKeyHex;
      this.seedSignerPublicKey = walletPublicKeyHex;
      this.seedSigner = new NDKPrivateKeySigner(this.seedSignerPrivateKey);
    },
    initWalletSeedPrivateKeySigner: async function () {
      await this.walletSeedGenerateKeyPair();
      const signer = new NDKPrivateKeySigner(this.seedSignerPrivateKey);
      this.signerType = SignerType.SEED;
      this.setPubkey(this.seedSignerPublicKey);
      await this.setSigner(signer);
    },
    fetchEventsFromUser: async function () {
      const filter: NDKFilter = { kinds: [1], authors: [this.pubkey] };
      const ndk = await useNdk();
      return await ndk.fetchEvents(filter);
    },

    fetchFollowerCount: async function (pubkey: string): Promise<number> {
      const resolved = this.resolvePubkey(pubkey);
      if (!resolved) return 0;
      pubkey = resolved;
      await this.initNdkReadOnly();
      const filter: NDKFilter = { kinds: [3], "#p": [pubkey] };
      const ndk = await useNdk();
      const events = await ndk.fetchEvents(filter);
      const authors = new Set<string>();
      events.forEach((ev) => authors.add(ev.pubkey));
      return authors.size;
    },

    fetchFollowingCount: async function (pubkey: string): Promise<number> {
      const resolved = this.resolvePubkey(pubkey);
      if (!resolved) return 0;
      pubkey = resolved;
      await this.initNdkReadOnly();
      const filter: NDKFilter = { kinds: [3], authors: [pubkey] };
      const ndk = await useNdk();
      const events = await ndk.fetchEvents(filter);
      let latest: NDKEvent | undefined;
      events.forEach((ev) => {
        if (!latest || ev.created_at > (latest.created_at || 0)) {
          latest = ev;
        }
      });
      if (!latest) return 0;
      const following = new Set<string>();
      latest.tags.forEach((tag: NDKTag) => {
        if (tag[0] === "p" && tag[1]) {
          following.add(tag[1] as string);
        }
      });
      return following.size;
    },

    fetchJoinDate: async function (pubkey: string): Promise<number | null> {
      const resolved = this.resolvePubkey(pubkey);
      if (!resolved) return null;
      pubkey = resolved;
      await this.initNdkReadOnly();
      const filter: NDKFilter = { kinds: [0, 1], authors: [pubkey] };
      const ndk = await useNdk();
      const events = await ndk.fetchEvents(filter);
      let earliest: number | null = null;
      events.forEach((ev) => {
        if (earliest === null || ev.created_at < earliest) {
          earliest = ev.created_at;
        }
      });
      if (earliest !== null) {
        const now = Math.floor(Date.now() / 1000);
        if (earliest > now) {
          earliest = null;
        }
      }
      return earliest;
    },

    fetchMostRecentPost: async function (
      pubkey: string,
    ): Promise<string | null> {
      const resolved = this.resolvePubkey(pubkey);
      if (!resolved) return null;
      pubkey = resolved;
      await this.initNdkReadOnly();
      const filter: NDKFilter = { kinds: [1], authors: [pubkey], limit: 1 };
      const ndk = await useNdk();
      const events = await ndk.fetchEvents(filter);
      let latest: NDKEvent | null = null;
      events.forEach((ev) => {
        if (!latest || ev.created_at > (latest.created_at || 0)) {
          latest = ev as NDKEvent;
        }
      });
      return latest ? (latest.content as string) : null;
    },

    fetchDmRelayUris: async function (
      pubkey: string,
    ): Promise<string[] | null> {
      const resolved = this.resolvePubkey(pubkey);
      if (!resolved) return null;
      pubkey = resolved;
      await this.initNdkReadOnly();
      const filter: NDKFilter = {
        kinds: [10050 as NDKKind],
        authors: [pubkey],
        limit: 1,
      };
      const ndk = await useNdk({ requireSigner: false });
      const events = await ndk.fetchEvents(filter);
      let latest: NDKEvent | null = null;
      events.forEach((ev) => {
        if (!latest || ev.created_at > (latest.created_at || 0)) {
          latest = ev as NDKEvent;
        }
      });
      if (!latest) return null;
      try {
        const parsed = JSON.parse(latest.content);
        if (Array.isArray(parsed)) return parsed as string[];
        if (parsed?.dm && Array.isArray(parsed.dm)) return parsed.dm;
      } catch {
        /* ignore */
      }
      const relays = (latest.tags || [])
        .filter((t: any) => t[0] === "r" && typeof t[1] === "string")
        .map((t: any) => t[1] as string);
      return relays.length ? relays : null;
    },
    fetchMints: async function () {
      const filter: NDKFilter = { kinds: [38000 as NDKKind], limit: 2000 };
      const ndk = await useNdk();
      const events = await ndk.fetchEvents(filter);
      let mintUrls: string[] = [];
      events.forEach((event) => {
        if (event.tagValue("k") == "38172" && event.tagValue("u")) {
          const mintUrl = event.tagValue("u");
          if (
            typeof mintUrl === "string" &&
            mintUrl.length > 0 &&
            mintUrl.startsWith("https://")
          ) {
            mintUrls.push(mintUrl);
          }
        }
      });
      // Count the number of times each mint URL appears
      const mintUrlsSet = new Set(mintUrls);
      const mintUrlsArray = Array.from(mintUrlsSet);
      const mintUrlsCounted = mintUrlsArray.map((url) => {
        return { url: url, count: mintUrls.filter((u) => u === url).length };
      });
      mintUrlsCounted.sort((a, b) => b.count - a.count);
      this.mintRecommendations = mintUrlsCounted;
      return mintUrlsCounted;
    },
  },
});

export function getEventHash(event: NostrEvent): string {
  try {
    return ntGetEventHash(event as any);
  } catch (e) {
    console.error("Failed to hash event", e);
    throw e;
  }
}

export async function signEvent(
  event: NostrEvent,
  privkey: string,
): Promise<string> {
  try {
    const signed = finalizeEvent(event as any, hexToBytes(privkey));
    Object.assign(event, signed);
    return event.sig as string;
  } catch (e) {
    console.error("Failed to sign event", e);
    throw e;
  }
}

export async function publishEvent(event: NostrEvent): Promise<void> {
  const relayUrls = useSettingsStore()
    .defaultNostrRelays.filter((r) => r.startsWith("wss://"))
    .map((r) => r.replace(/\/+$/, ""));
  let healthyRelays: string[] = [];
  try {
    healthyRelays = await filterHealthyRelays(relayUrls);
  } catch {
    healthyRelays = [];
  }
  if (healthyRelays.length === 0) {
    console.error("[nostr] publish failed: all relays unreachable");
    return;
  }
  const pool = new SimplePool();
  try {
    await Promise.any(pool.publish(healthyRelays, event as any));
  } catch (e) {
    console.error("Failed to publish event", e);
  }
}

export async function subscribeToNostr(
  filter: any,
  cb: (ev: NostrEvent) => void,
  relays?: string[],
): Promise<boolean> {
  const relayUrls = (
    relays && relays.length > 0 ? relays : useSettingsStore().defaultNostrRelays
  )
    .filter((r) => r.startsWith("wss://"))
    .map((r) => r.replace(/\/+$/, ""));
  if (!relayUrls || relayUrls.length === 0) {
    console.warn("[nostr] subscribeMany called with empty relay list");
    return false;
  }

  // Ensure at least one relay is reachable before subscribing
  let healthy: string[] = [];
  try {
    healthy = await filterHealthyRelays(relayUrls);
  } catch {
    healthy = [];
  }
  if (healthy.length === 0) {
    console.error("[nostr] subscription failed: all relays unreachable");
    return false;
  }

  const pool = new SimplePool();
  try {
    pool.subscribeMany(healthy, [filter], { onevent: cb });
    return true;
  } catch (e) {
    console.error("Failed to subscribe", e);
    return false;
  }
}
