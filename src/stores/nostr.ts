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
  NDKRelayStatus,
  NDKTag,
  ProfilePointer,
  NDKSubscription,
  NDKPublishError,
} from "@nostr-dev-kit/ndk";
import {
  nip19,
  nip04,
  SimplePool,
  getEventHash as ntGetEventHash,
  finalizeEvent,
  verifyEvent,
  Event as NostrEvent,
} from "nostr-tools";
import { bytesToHex, hexToBytes, randomBytes } from "@noble/hashes/utils"; // already an installed dependency
import { sha256 } from "@noble/hashes/sha256";
import { decodeBase64, encodeBase64 } from "src/utils/base64";
import { ensureCompressed } from "src/utils/ecash";
import { useWalletStore } from "./wallet";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { useLocalStorage } from "@vueuse/core";
import { useSettingsStore } from "./settings";
import { useReceiveTokensStore } from "./receiveTokensStore";
import {
  getEncodedTokenV4,
  PaymentRequestPayload,
  Token,
} from "@cashu/cashu-ts";
import { useTokensStore } from "./tokens";
import { filterHealthyRelays } from "src/utils/relayHealth";
import { DEFAULT_RELAYS, FREE_RELAYS, VETTED_OPEN_WRITE_RELAYS } from "src/config/relays";
import { publishToRelaysWithAcks, selectPublishRelays, PublishReport, RelayResult } from "src/nostr/publish";
import { sanitizeRelayUrls } from "src/utils/relay";
import { getNdk } from "src/boot/ndk";
import { getTrustedTime } from "src/utils/time";
import {
  notifyApiError,
  notifyError,
  notifySuccess,
  notifyWarning,
  notify,
} from "src/js/notify";
import { useNdk, rebuildNdk } from "src/composables/useNdk";
import { useSendTokensStore } from "./sendTokensStore";
import { usePRStore } from "./payment-request";
import token from "../js/token";
import { HistoryToken } from "./tokens";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { useDmChatsStore } from "./dmChats";
import { cashuDb, type LockedToken } from "./dexie";
import { v4 as uuidv4 } from "uuid";
import { useRouter } from "vue-router";
import { useP2PKStore } from "./p2pk";
import { watch, type Ref } from "vue";
import { fetchFundstrProfileBundle, useCreatorsStore } from "./creators";
import { frequencyToDays } from "src/constants/subscriptionFrequency";
import { useMessengerStore } from "./messenger";
import { decryptDM, encryptDM } from "../nostr/crypto";
import { useCreatorProfileStore } from "./creatorProfile";
import { buildKind10019NutzapProfile } from "src/nostr/builders";
import { NutzapProfileSchema, type NutzapProfilePayload } from "src/nostr/nutzapProfile";
import {
  FUNDSTR_REQ_URL,
  FUNDSTR_WS_URL,
  WS_FIRST_TIMEOUT_MS,
} from "@/nutzap/relayEndpoints";
import { getNutzapNdk } from "src/nutzap/ndkInstance";
import { publishNostrEvent } from "src/nutzap/relayPublishing";
import { useFundstrRelayStatus } from "src/nutzap/relayClient";
import { safeUseLocalStorage } from "src/utils/safeLocalStorage";
import { updateCreatorCache } from "@/lib/fundstrApi";
import {
  decryptData,
  deriveKey,
  encryptData,
  generateSalt,
  SALT_STORAGE_KEY,
} from "src/utils/crypto-service";

// --- Relay connectivity helpers ---
export type WriteConnectivity = {
  urlsTried: string[];
  urlsConnected: string[];
  elapsedMs: number;
};

export async function ensureWriteConnectivity(
  userUrls: string[],
  {
    minConnected = 2,
    timeoutMs = 5000,
    cap = 6,
  }: { minConnected?: number; timeoutMs?: number; cap?: number } = {},
): Promise<WriteConnectivity> {
  const cleaned = sanitizeRelayUrls(userUrls);
  const candidates = [...new Set([...cleaned, ...FREE_RELAYS])].slice(0, cap);

  const ndk = await getNdk();
  const pool = ndk.pool;

  const started = Date.now();
  const connected: string[] = [];
  const tried: string[] = [];

  for (const url of candidates) {
    tried.push(url);
    ndk.addExplicitRelay(url);
  }

  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, timeoutMs);

    function onConnect(relay: any) {
      const normalized = normalizeWsUrls([relay.url])[0];
      if (!normalized) return;
      if (!connected.includes(normalized)) connected.push(normalized);
      if (connected.length >= Math.min(minConnected, candidates.length)) {
        pool.off("relay:connect", onConnect);
        clearTimeout(t);
        resolve();
      }
    }
    pool.on("relay:connect", onConnect);

    for (const r of pool.relays.values()) {
      const normalized = normalizeWsUrls([r.url])[0];
      if (r.status === 1 /* OPEN */ && normalized && !connected.includes(normalized)) {
        connected.push(normalized);
      }
    }
    if (connected.length >= Math.min(minConnected, candidates.length)) {
      pool.off("relay:connect", onConnect);
      clearTimeout(t);
      resolve();
    }
  });

  return {
    urlsTried: tried,
    urlsConnected: normalizeWsUrls(connected),
    elapsedMs: Date.now() - started,
  };
}

export type PublishResult = {
  okOn: string[];
  failedOn: string[];
  missingAcks: string[];
  elapsedMs: number;
};

export interface CreatorProfilePayload {
  profile: { display_name?: string; picture?: string; about?: string };
  p2pkPub: string;
  mints: string[];
  tierAddr?: string;
}

async function publishDiscoveryProfileWithAcks(
  ndk: NDK,
  payload: CreatorProfilePayload,
  opts: { targetRelays: string[]; ackTimeoutMs: number },
): Promise<{
  okOn: string[];
  failedOn: string[];
  missingAcks: string[];
}> {
  const { targetRelays, ackTimeoutMs } = opts;

  const kind0 = new NDKEvent(ndk);
  kind0.kind = 0;
  kind0.content = JSON.stringify(payload.profile);
  kind0.created_at = Math.floor(Date.now() / 1000);

  const kind10002 = new NDKEvent(ndk);
  kind10002.kind = 10002;
  kind10002.tags = targetRelays.map((r) => ["r", r]);
  kind10002.created_at = kind0.created_at;

  const kind10019 = new NDKEvent(ndk);
  kind10019.kind = 10019;
  kind10019.tags = [
    ["pubkey", payload.p2pkPub],
    ...payload.mints.map((m) => ["mint", m]),
    ...targetRelays.map((r) => ["relay", r]),
  ];
  if (payload.tierAddr) {
    kind10019.tags.push(["a", payload.tierAddr]);
  }
  kind10019.content = "";
  kind10019.created_at = kind0.created_at;

  await Promise.all([kind0.sign(), kind10002.sign(), kind10019.sign()]);

  const okOn: string[] = [];
  const failedOn: string[] = [];
  const missingAcks: string[] = [];

  const events = [kind0, kind10002, kind10019];
  for (const url of targetRelays) {
    const relay = ndk.pool.relays.get(url);
    if (!relay) {
      failedOn.push(url);
      continue;
    }
    let allOk = true;
    for (const ev of events) {
      try {
        await Promise.race([
          relay.publish(ev),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), ackTimeoutMs),
          ),
        ]);
      } catch (e) {
        if ((e as Error).message === "timeout") {
          missingAcks.push(url);
        } else {
          failedOn.push(url);
        }
        allOk = false;
        break;
      }
    }
    if (allOk) okOn.push(url);
  }

  return { okOn, failedOn, missingAcks };
}

const RECONNECT_BACKOFF_MS = 15000; // 15s cooldown after failed attempts
const MAX_RECONNECT_BACKOFF_MS = 5 * 60_000; // cap at 5 minutes

export class WalletLockedError extends Error {
  constructor(message = "Wallet locked") {
    super(message);
    this.name = "WalletLockedError";
  }
}

export type NostrSignerErrorCode =
  | "extension-unavailable"
  | "enable-missing"
  | "enable-timeout"
  | "enable-denied"
  | "user-timeout"
  | "user-error"
  | "ready-timeout"
  | "capability-missing";

export class NostrSignerError extends Error {
  code: NostrSignerErrorCode;
  remediation?: string;
  details?: Record<string, unknown>;

  constructor(
    code: NostrSignerErrorCode,
    message: string,
    options: { remediation?: string; details?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "NostrSignerError";
    this.code = code;
    this.remediation = options.remediation;
    this.details = options.details;
    if (options.cause) (this as any).cause = options.cause;
  }
}

const ENCRYPTION_CHECK_KEY = "cashu.ndk.encryptionCheck";
const SENSITIVE_STORAGE_KEYS = [
  "cashu.ndk.pubkey",
  "cashu.ndk.signerType",
  "cashu.ndk.nip46Token",
  "cashu.ndk.privateKeySignerPrivateKey",
  "cashu.ndk.seedSignerPrivateKey",
  "cashu.ndk.seedSignerPublicKey",
  ENCRYPTION_CHECK_KEY,
];

function hasEncryptedSecrets(): boolean {
  return SENSITIVE_STORAGE_KEYS.some((k) => Boolean(localStorage.getItem(k)));
}

export function npubToHex(s: string): string | null {
  const input = s.trim();
  debug("[npubToHex] input", input);
  try {
    const decoded = nip19.decode(input);
    debug("[npubToHex] decoded", decoded);
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

const AES_BLOCK_SIZE = 16;

function getSubtleCrypto(): SubtleCrypto {
  const globalCrypto: Crypto | undefined =
    (globalThis as any)?.crypto ?? (globalThis as any)?.webcrypto;
  const subtle: SubtleCrypto | undefined =
    globalCrypto?.subtle ?? (globalCrypto as any)?.webcrypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SubtleCrypto API is unavailable");
  }
  return subtle;
}

function pkcs7Pad(data: Uint8Array): Uint8Array {
  const padLength = AES_BLOCK_SIZE - (data.length % AES_BLOCK_SIZE || AES_BLOCK_SIZE);
  const padded = new Uint8Array(data.length + padLength);
  padded.set(data);
  padded.fill(padLength, data.length);
  return padded;
}

function pkcs7Unpad(data: Uint8Array): Uint8Array {
  if (data.length === 0 || data.length % AES_BLOCK_SIZE !== 0) {
    throw new Error("Invalid AES-CBC payload");
  }
  const padLength = data[data.length - 1];
  if (padLength === 0 || padLength > AES_BLOCK_SIZE) {
    throw new Error("Invalid PKCS#7 padding");
  }
  const end = data.length - padLength;
  for (let i = end; i < data.length; i += 1) {
    if (data[i] !== padLength) {
      throw new Error("Malformed PKCS#7 padding");
    }
  }
  return data.subarray(0, end);
}

async function aesCbcEncrypt(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const cryptoKey = await subtle.importKey(
    "raw",
    key,
    { name: "AES-CBC" },
    false,
    ["encrypt"],
  );
  const padded = pkcs7Pad(plaintext);
  const ciphertext = await subtle.encrypt({ name: "AES-CBC", iv }, cryptoKey, padded);
  return new Uint8Array(ciphertext);
}

async function aesCbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const cryptoKey = await subtle.importKey(
    "raw",
    key,
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const plaintext = await subtle.decrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    ciphertext,
  );
  return pkcs7Unpad(new Uint8Array(plaintext));
}

async function encryptWithSharedSecret(
  shared: Uint8Array | string,
  message: string,
): Promise<string> {
  const ss = typeof shared === "string" ? hexToBytes(shared) : shared;
  const key = ss.length === 32 ? ss : ss.slice(1, 33);
  const iv = randomBytes(AES_BLOCK_SIZE);
  const plaintext = new TextEncoder().encode(message);
  const ciphertext = await aesCbcEncrypt(key, iv, plaintext);
  const ctb64 = encodeBase64(ciphertext);
  const ivb64 = encodeBase64(iv);
  return `${ctb64}?iv=${ivb64}`;
}

async function decryptWithSharedSecret(
  shared: Uint8Array | string,
  data: string,
): Promise<string> {
  const ss = typeof shared === "string" ? hexToBytes(shared) : shared;
  const key = ss.length === 32 ? ss : ss.slice(1, 33);
  const [ctb64, ivb64] = data.split("?iv=");
  const iv = decodeBase64(ivb64);
  const ciphertext = decodeBase64(ctb64);
  const plaintext = await aesCbcDecrypt(key, iv, ciphertext);
  return new TextDecoder().decode(plaintext);
}

async function encryptWithSharedSecretV2(
  shared: Uint8Array | string,
  message: string,
): Promise<string> {
  return encryptWithSharedSecret(shared, message);
}

export async function encryptNip04(
  recipient: string,
  message: string,
  opts: { privKey?: string | Uint8Array; externalSigner?: boolean } = {},
): Promise<string> {
  const { privKey } = opts;
  const nostr = (window as any)?.nostr;
  if (!privKey) {
    if (nostr?.nip04?.encrypt) {
      return await nostr.nip04.encrypt(recipient, message);
    }
    throw new Error("Signer does not support NIP-04 encryption");
  }
  return await nip04.encrypt(privKey as any, recipient, message);
}

async function decryptNip04(
  sender: string,
  content: string,
  privKey?: string | Uint8Array,
): Promise<string> {
  const nostr = (window as any)?.nostr;
  if (!privKey) {
    if (nostr?.nip04?.decrypt) {
      return await nostr.nip04.decrypt(sender, content);
    }
    throw new Error("Signer does not support NIP-04 decryption");
  }
  return await nip04.decrypt(privKey as any, sender, content);
}

// --- Nutzap helpers (NIP-61) ----------------------------------------------

import type { NostrEvent } from "@nostr-dev-kit/ndk";
import { queryNutzapProfile, toHex } from "@/nostr/relayClient";
import { fallbackDiscoverRelays } from "@/nostr/discovery";
import type { NostrEvent as RelayEvent } from "@/nostr/relayClient";

interface NutzapProfile {
  hexPub: string;
  p2pkPubkey: string;
  trustedMints: string[];
  relays?: string[];
  tierAddr?: string;
}

interface NutzapProfileCacheRecord {
  profile: NutzapProfile | null;
  fetchedAt: number;
}

interface PersistedNutzapProfileCache {
  version: number;
  entries: Record<string, NutzapProfileCacheRecord>;
}

const NUTZAP_PROFILE_CACHE_VERSION = 1;
const NUTZAP_PROFILE_CACHE_STORAGE_KEY = "cashu.ndk.nutzapProfileCache";
const NUTZAP_PROFILE_CACHE_STALE_AFTER_MS = 6 * 60 * 60 * 1000; // 6 hours
const NUTZAP_PROFILE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const nutzapProfileCache = new Map<string, NutzapProfileCacheRecord>();
const nutzapProfileFetches = new Map<string, Promise<NutzapProfile | null>>();

let nutzapProfileCacheStorage: Ref<PersistedNutzapProfileCache> | null = null;
let nutzapProfileCacheHydrated = false;

function getNutzapProfileCacheStorage(): Ref<PersistedNutzapProfileCache> {
  if (!nutzapProfileCacheStorage) {
    nutzapProfileCacheStorage = safeUseLocalStorage<PersistedNutzapProfileCache>(
      NUTZAP_PROFILE_CACHE_STORAGE_KEY,
      {
        version: NUTZAP_PROFILE_CACHE_VERSION,
        entries: {},
      },
    );
  }
  return nutzapProfileCacheStorage;
}

function pruneExpiredNutzapProfiles(now = Date.now()) {
  if (!nutzapProfileCacheHydrated) return;
  const storage = getNutzapProfileCacheStorage();
  const entries = { ...storage.value.entries };
  let mutated = false;
  for (const [hex, entry] of Object.entries(entries)) {
    if (now - entry.fetchedAt >= NUTZAP_PROFILE_CACHE_MAX_AGE_MS) {
      delete entries[hex];
      nutzapProfileCache.delete(hex);
      mutated = true;
    }
  }
  if (mutated) {
    storage.value = {
      version: NUTZAP_PROFILE_CACHE_VERSION,
      entries,
    };
  }
}

function ensureNutzapProfileCacheHydrated() {
  if (nutzapProfileCacheHydrated) return;
  const storage = getNutzapProfileCacheStorage();
  if (storage.value.version !== NUTZAP_PROFILE_CACHE_VERSION) {
    storage.value = {
      version: NUTZAP_PROFILE_CACHE_VERSION,
      entries: {},
    };
    nutzapProfileCacheHydrated = true;
    return;
  }

  const now = Date.now();
  const retainedEntries: Record<string, NutzapProfileCacheRecord> = {};
  for (const [hex, entry] of Object.entries(storage.value.entries ?? {})) {
    if (!entry) continue;
    if (now - entry.fetchedAt >= NUTZAP_PROFILE_CACHE_MAX_AGE_MS) {
      continue;
    }
    nutzapProfileCache.set(hex, entry);
    retainedEntries[hex] = entry;
  }

  if (Object.keys(retainedEntries).length !== Object.keys(storage.value.entries ?? {}).length) {
    storage.value = {
      version: NUTZAP_PROFILE_CACHE_VERSION,
      entries: retainedEntries,
    };
  }

  nutzapProfileCacheHydrated = true;
}

function persistNutzapProfileCacheEntry(hex: string, profile: NutzapProfile | null) {
  ensureNutzapProfileCacheHydrated();
  const now = Date.now();
  const storage = getNutzapProfileCacheStorage();
  const entries = { ...storage.value.entries };
  const record: NutzapProfileCacheRecord = { profile, fetchedAt: now };
  entries[hex] = record;
  nutzapProfileCache.set(hex, record);

  for (const [key, entry] of Object.entries(entries)) {
    if (now - entry.fetchedAt >= NUTZAP_PROFILE_CACHE_MAX_AGE_MS) {
      delete entries[key];
      if (key !== hex) nutzapProfileCache.delete(key);
    }
  }

  storage.value = {
    version: NUTZAP_PROFILE_CACHE_VERSION,
    entries,
  };
}

function removeNutzapProfileCacheEntry(hex: string) {
  if (!nutzapProfileCacheHydrated) return;
  const storage = getNutzapProfileCacheStorage();
  if (!storage.value.entries?.[hex]) return;
  const entries = { ...storage.value.entries };
  delete entries[hex];
  nutzapProfileCache.delete(hex);
  storage.value = {
    version: NUTZAP_PROFILE_CACHE_VERSION,
    entries,
  };
}

function getNutzapProfileCacheStatus(hex: string) {
  const entry = nutzapProfileCache.get(hex);
  if (!entry) return null;
  const age = Date.now() - entry.fetchedAt;
  return {
    entry,
    isStale: age >= NUTZAP_PROFILE_CACHE_STALE_AFTER_MS,
    isExpired: age >= NUTZAP_PROFILE_CACHE_MAX_AGE_MS,
  };
}

function scheduleNutzapProfileRefresh(
  hex: string,
  opts: { fundstrOnly?: boolean } = {},
  awaitResult = false,
): Promise<NutzapProfile | null> {
  let promise = nutzapProfileFetches.get(hex);
  if (!promise) {
    promise = fetchNutzapProfileFromNetwork(hex, opts)
      .then((profile) => {
        persistNutzapProfileCacheEntry(hex, profile);
        return profile;
      })
      .finally(() => {
        nutzapProfileFetches.delete(hex);
      });
    nutzapProfileFetches.set(hex, promise);
  }

  if (!awaitResult) {
    promise.catch((err) => {
      console.warn(`[nostr] Failed to refresh Nutzap profile for ${hex}`, err);
    });
    return promise;
  }
  return promise;
}


const CUSTOM_LINK_WS_TIMEOUT_MS = Math.min(WS_FIRST_TIMEOUT_MS, 1200);

export class RelayConnectionError extends Error {
  constructor(message?: string) {
    super(message ?? "Unable to connect to Nostr relays");
    this.name = "RelayConnectionError";
  }
}

export async function urlsToRelaySet(
  urls?: string[],
  connectNow = true,
): Promise<NDKRelaySet | undefined> {
  if (!urls?.length) return undefined;

  const normalizedUrls = normalizeWsUrls(urls);
  if (!normalizedUrls.length) return undefined;

  const ndk = await useNdk({ requireSigner: false });
  // Ensure selected relays exist in the pool
  for (const u of normalizedUrls) {
    if (!ndk.pool.relays.has(u)) {
      ndk.addExplicitRelay(u);
    }
  }

  const set = new NDKRelaySet(new Set(), ndk);
  for (const u of normalizedUrls) {
    const r = ndk.pool.getRelay(u);
    if (r) set.addRelay(r);
  }

  if (connectNow) {
    try {
      await ndk.connect();
    } catch {
      // swallow; connectivity will be checked separately
    }
  }

  return set;
}

export async function waitForRelaySetConnectivity(
  set: NDKRelaySet,
  timeoutMs = 4000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if ([...set.relays].some((r: any) => r.connected === true)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new RelayConnectionError("No selected relay connected");
}

export const RELAY_CONNECT_TIMEOUT_MS = 6000;

/** Wraps relay.connect() in a timeout (ms) so it never hangs forever */
function connectWithTimeout(
  relay: any,
  ms = RELAY_CONNECT_TIMEOUT_MS,
): Promise<void> {
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
  constructor(message = "Publishing timed out") {
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

export function normalizeWsUrls(urls: string[]): string[] {
  return Array.from(
    new Set(
      urls
        .filter(Boolean)
        .map((u) => String(u).trim().replace(/\/+$/, ""))
        .filter((u) => u.startsWith("ws")),
    ),
  );
}

/**
 * Publish a signed NDKEvent to many relays and resolve as soon as ANY relay
 * ACKs with "OK". Uses nostr-tools SimplePool so one bad relay can't stall.
 */
export async function publishRawToAny(
  ev: NDKEvent,
  urls: string[],
  timeoutMs = 12_000,
): Promise<{ okUrl: string }> {
  const relays = normalizeWsUrls(urls);
  if (!relays.length) throw new Error("No relay URLs provided");

  const pool = new SimplePool();
  const raw = ev.rawEvent();

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new PublishTimeoutError("Publish timed out"));
      }
    }, timeoutMs);

    const pub = pool.publish(relays, raw as any);

    pub.on("ok", (url: string) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ okUrl: url });
      }
    });

    const failures = new Set<string>();
    pub.on("failed", (url: string, reason: string) => {
      failures.add(`${url}: ${reason}`);
      if (!settled && failures.size === relays.length) {
        settled = true;
        clearTimeout(timer);
        reject(
          new Error(
            `All relays refused: ${Array.from(failures).join(", ")}`,
          ),
        );
      }
    });
  });
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

export async function publishDmNip04(
  ev: NDKEvent,
  relays: string[],
  timeoutMs = 30000,
): Promise<boolean> {
  const relaySet = await urlsToRelaySet(relays);
  if (!relaySet) return false;
  try {
    await publishWithTimeout(ev, relaySet, timeoutMs);
    notifySuccess("NIP-04 event published");
    return true;
  } catch (e) {
    console.error(e);
    if (e instanceof NDKPublishError) {
      const urls = relaySet.relayUrls?.join(", ") || relays.join(", ");
      notifyError(`Could not publish NIP-04 event to: ${urls}`);
    } else if (e instanceof PublishTimeoutError) {
      notifyError(
        "Publishing NIP-04 event timed out. Check your network connection or relay availability.",
      );
    } else {
      notifyError("Could not publish NIP-04 event");
    }
    return false;
  }
}

export type RelayAck = { ok: boolean; reason?: string };

export async function publishWithAcks(
  event: NostrEvent,
  relays: string[],
  timeoutMs = 5000,
): Promise<Record<string, RelayAck>> {
  const pool = new SimplePool();
  const results: Record<string, RelayAck> = {};
  const pub = pool.publish(relays, event as any);
  return await new Promise((resolve) => {
    const timer = setTimeout(() => {
      for (const r of relays) {
        if (!results[r]) results[r] = { ok: false, reason: "timeout" };
      }
      resolve(results);
    }, timeoutMs);

    const finish = () => {
      if (Object.keys(results).length >= relays.length) {
        clearTimeout(timer);
        resolve(results);
      }
    };

    pub.on("ok", (relay: any) => {
      const url = relay.url || relay;
      results[url] = { ok: true };
      finish();
    });

    pub.on("failed", (relay: any, reason: any) => {
      const url = relay.url || relay;
      results[url] = { ok: false, reason: String(reason) };
      finish();
    });
  });
}

export async function ensureRelayConnectivity(ndk: NDK) {
  const relays = Object.values(ndk.pool.relays);
  if (relays.length === 0) {
    throw new Error("No relays configured");
  }
  const connections = relays.map(
    (r) =>
      new Promise<void>((resolve, reject) => {
        if (r.status === NDKRelayStatus.CONNECTED) {
          resolve();
          return;
        }
        const timeout = setTimeout(() => {
          r.off("connect", connectCallback);
          reject(new Error(`Timeout connecting to ${r.url}`));
        }, 5000);
        const connectCallback = () => {
          clearTimeout(timeout);
          r.off("connect", connectCallback);
          resolve();
        };
        r.on("connect", connectCallback);
      }),
  );
  await Promise.any(connections);
}

export async function anyRelayReachable(relays: string[]): Promise<boolean> {
  const healthy = await filterHealthyRelays(relays);
  return healthy.length > 0;
}

/**
 * Fetches the receiver’s ‘kind:10019’ Nutzap profile.
 */
async function fetchNutzapProfileFromNetwork(
  hex: string,
  opts: { fundstrOnly?: boolean } = {},
): Promise<NutzapProfile | null> {
  const fundstrOnly = opts.fundstrOnly === true;
  let event: RelayEvent | null = null;
  let lastError: unknown = null;

  try {
    event = await queryNutzapProfile(hex, {
      httpBase: FUNDSTR_REQ_URL,
      fundstrWsUrl: FUNDSTR_WS_URL,
      allowFanoutFallback: false,
      wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
    });
  } catch (e) {
    lastError = e;
  }

  if (!event && !fundstrOnly) {
    try {
      const discovered = await fallbackDiscoverRelays(hex);
      if (discovered.length) {
        event = await queryNutzapProfile(hex, {
          httpBase: FUNDSTR_REQ_URL,
          fundstrWsUrl: FUNDSTR_WS_URL,
          fanout: discovered,
          allowFanoutFallback: true,
          wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
        });
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!event) {
    if (lastError instanceof Error) {
      throw new RelayConnectionError(lastError.message);
    }
    return null;
  }

  let parsedPayload: NutzapProfilePayload | null = null;
  if (event.content) {
    try {
      const parsed = JSON.parse(event.content);
      parsedPayload = NutzapProfileSchema.parse(parsed);
    } catch (e) {
      console.warn("Invalid Nutzap profile JSON", e);
    }
  }

  const relaySet = new Set<string>();
  const mintSet = new Set<string>();
  let tierAddr: string | undefined = parsedPayload?.tierAddr;
  let p2pkValue = parsedPayload?.p2pk ?? "";

  if (Array.isArray(parsedPayload?.relays)) {
    for (const relay of parsedPayload!.relays) {
      if (typeof relay === "string" && relay) relaySet.add(relay);
    }
  }
  if (Array.isArray(parsedPayload?.mints)) {
    for (const mint of parsedPayload!.mints) {
      if (typeof mint === "string" && mint) mintSet.add(mint);
    }
  }

  for (const tag of event.tags || []) {
    if (tag[0] === "mint" && typeof tag[1] === "string" && tag[1]) {
      mintSet.add(tag[1]);
    } else if (tag[0] === "relay" && typeof tag[1] === "string" && tag[1]) {
      relaySet.add(tag[1]);
    } else if (tag[0] === "a" && typeof tag[1] === "string" && tag[1]) {
      if (!tierAddr) tierAddr = tag[1];
    } else if (tag[0] === "pubkey" && typeof tag[1] === "string" && tag[1]) {
      if (!p2pkValue) p2pkValue = tag[1];
    }
  }

  if (!p2pkValue && !mintSet.size && !relaySet.size) {
    return null;
  }

  let p2pkPubkey = p2pkValue;
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

  return {
    hexPub: hex,
    p2pkPubkey,
    trustedMints: Array.from(mintSet),
    relays: relaySet.size ? Array.from(relaySet) : undefined,
    tierAddr,
  };
}

export async function fetchNutzapProfile(
  npubOrHex: string,
  opts: { fundstrOnly?: boolean; forceRefresh?: boolean } = {},
): Promise<NutzapProfile | null> {
  let hex: string;
  try {
    hex = toHex(npubOrHex);
  } catch (e) {
    throw new Error("Invalid npub");
  }

  ensureNutzapProfileCacheHydrated();
  pruneExpiredNutzapProfiles();

  const { forceRefresh = false, fundstrOnly } = opts;
  const fetchOpts = fundstrOnly === undefined ? {} : { fundstrOnly };
  const status = getNutzapProfileCacheStatus(hex);
  if (status) {
    if (status.isExpired) {
      removeNutzapProfileCacheEntry(hex);
    } else {
      if (status.isStale && !forceRefresh) {
        scheduleNutzapProfileRefresh(hex, fetchOpts);
      }
      if (!forceRefresh) {
        return status.entry.profile;
      }
    }
  }

  const profile = await scheduleNutzapProfileRefresh(hex, fetchOpts, true);

  if (forceRefresh) {
    persistNutzapProfileCacheEntry(hex, profile);
  }
  return profile;
}

export function refreshCachedNutzapProfiles(): void {
  ensureNutzapProfileCacheHydrated();
  pruneExpiredNutzapProfiles();
  for (const hex of nutzapProfileCache.keys()) {
    scheduleNutzapProfileRefresh(hex);
  }
}

/** Publishes a ‘kind:10019’ Nutzap profile event. */
export async function publishNutzapProfile(opts: {
  p2pkPub: string;
  mints: string[];
  relays?: string[];
  tierAddr?: string;
}) {
  const nostr = useNostrStore();
  if (!nostr.signer) {
    throw new Error("Signer required to publish Nutzap profile");
  }
  await nostr.connect(opts.relays ?? nostr.relays);

  const compressedP2pk = ensureCompressed(opts.p2pkPub);
  const relays = (opts.relays ?? []).filter((url) => typeof url === "string" && url.length);

  const tags: string[][] = [
    ["t", "nutzap-profile"],
    ["client", "fundstr"],
    ["pubkey", compressedP2pk],
  ];
  relays.forEach((relay) => {
    tags.push(["relay", relay]);
  });
  opts.mints.forEach((mint) => {
    if (mint) {
      tags.push(["mint", mint, "sat"]);
    }
  });
  if (opts.tierAddr) {
    tags.push(["a", opts.tierAddr]);
  }

  const body: NutzapProfilePayload = {
    p2pk: compressedP2pk,
    mints: opts.mints,
  };
  if (relays.length) body.relays = relays;
  if (opts.tierAddr) body.tierAddr = opts.tierAddr;

  const ndk = await useNdk();
  if (!ndk) {
    throw new Error(
      "NDK not initialised \u2013 call initSignerIfNotSet() first",
    );
  }
  const nutzapNdk = getNutzapNdk();
  nutzapNdk.signer = (nostr.signer as any) ?? undefined;

  try {
    await ensureRelayConnectivity(ndk);
  } catch (e: any) {
    notifyWarning("Relay connection failed", e?.message ?? String(e));
  }
  try {
    const createdAt = Math.floor(Date.now() / 1000);
    const result = await publishNostrEvent({
      kind: 10019,
      tags,
      content: JSON.stringify({ v: 1, ...body }),
      created_at: createdAt,
    });
    if (result?.event) {
      try {
        await updateCreatorCache({ profileEvent: result.event });
      } catch (error: any) {
        const message =
          error?.message === "rate_limited"
            ? "Cache throttled (10m). Your Nostr events are live; discovery will refresh soon."
            : "Cache update deferred. Your Nostr events are live.";
        console.warn("[cache-update]", message, error);
        notify(message);
      }
    }
    return result.event.id;
  } catch (e: any) {
    notifyError(e?.message ?? String(e));
    throw e;
  }
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
  tierAddr?: string;
  timeoutMs?: number;
  clampTime?: boolean;
}): Promise<PublishReport> {
  const nostr = useNostrStore();
  if (!nostr.signer) {
    throw new Error("Signer required to publish a discoverable profile.");
  }
  const { targets, usedFallback } = selectPublishRelays(
    opts.relays,
    VETTED_OPEN_WRITE_RELAYS,
    2,
  );
  await nostr.connect(targets);
  const ndk = await useNdk();
  if (!ndk) {
    throw new Error("NDK not initialized. Cannot publish profile.");
  }

  let now = Math.floor(Date.now() / 1000);
  const trustedMs = await getTrustedTime(ndk, targets);
  if (trustedMs && now > Math.floor(trustedMs / 1000) + 5 * 60) {
    if (!opts.clampTime) {
      throw new Error(
        "System clock is too far ahead; adjust your device time.",
      );
    }
    now = Math.floor(trustedMs / 1000);
  }

  // --- 1. Prepare Kind 0 (Profile Metadata) ---
  const kind0Event = new NDKEvent(ndk);
  kind0Event.kind = 0;
  kind0Event.content = JSON.stringify(opts.profile);
  kind0Event.created_at = now;

  // --- 2. Prepare Kind 10002 (Relay List) ---
  const kind10002Event = new NDKEvent(ndk);
  kind10002Event.kind = 10002;
  kind10002Event.tags = opts.relays.map((r) => ["r", r]); // 'r' tag for each relay URL
  kind10002Event.content = "";
  kind10002Event.created_at = now;

  // --- 3. Prepare Kind 10019 (Nutzap/Payment Profile) ---
  const kind10019Event = new NDKEvent(ndk);
  const npBody: NutzapProfilePayload = {
    p2pk: ensureCompressed(opts.p2pkPub),
    mints: opts.mints,
    relays: opts.relays,
  };
  if (opts.tierAddr) npBody.tierAddr = opts.tierAddr;
  const kind10019Payload = buildKind10019NutzapProfile(
    nostr.pubkey,
    npBody,
    opts.profile,
  );
  kind10019Event.kind = kind10019Payload.kind;
  kind10019Event.tags = kind10019Payload.tags;
  kind10019Event.content = kind10019Payload.content;
  kind10019Event.created_at = now;

  const eventsToPublish = [kind0Event, kind10002Event, kind10019Event];

  await Promise.all(eventsToPublish.map((ev) => ev.sign()));

  const aggregate = new Map<string, RelayResult>();
  const fromFallback = new Set(usedFallback);
  for (const ev of eventsToPublish) {
    const res = await publishToRelaysWithAcks(ndk, ev, targets, {
      timeoutMs: opts.timeoutMs ?? 4000,
      fromFallback,
    });
    res.perRelay.forEach((r) => {
      const existing = aggregate.get(r.relay) || { url: r.relay, ok: true };
      if (r.status !== "ok") {
        existing.ok = false;
        existing.err = r.status;
      } else {
        existing.ack = true;
      }
      aggregate.set(r.relay, existing);
    });
  }

  const byRelay = Array.from(aggregate.values());
  const anySuccess = byRelay.some((r) => r.ok);

  if (anySuccess) {
    try {
      const nostrProfileEvent = await kind10019Event.toNostrEvent();
      if (nostrProfileEvent) {
        await updateCreatorCache({ profileEvent: nostrProfileEvent });
      }
    } catch (error: any) {
      const message =
        error?.message === "rate_limited"
          ? "Cache throttled (10m). Your Nostr events are live; discovery will refresh soon."
          : "Cache update deferred. Your Nostr events are live.";
      console.warn("[cache-update]", message, error);
      notify(message);
    }
  }

  return {
    ids: eventsToPublish.map((e) => e.id),
    relaysTried: targets.length,
    byRelay,
    anySuccess,
    usedFallback,
  };
}

/** Publishes a ‘kind:9321’ Nutzap event. */
export async function publishNutzap(opts: {
  content: string;
  receiverHex: string;
  relayHints?: string[];
}) {
  const nostr = useNostrStore();
  await nostr.initSignerIfNotSet();
  await nostr.connect(opts.relayHints ?? nostr.relays);
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

type NostrEventLog = {
  id: string;
  created_at: number;
};

type CachedProfile = {
  profile: any;
  fetchedAt: number;
};

interface SignerCaps {
  nip04Encrypt: boolean;
  nip04Decrypt: boolean;
  nip44Encrypt: boolean;
  nip44Decrypt: boolean;
  getSharedSecret: boolean;
}

type Nip07FailureCause =
  | "extension-missing"
  | "enable-failed"
  | "user-failed"
  | "core-methods-missing"
  | "unknown";

export enum SignerType {
  NIP07 = "NIP07",
  NIP46 = "NIP46",
  PRIVATEKEY = "PRIVATEKEY",
  SEED = "SEED",
}

type InitSignerBehaviorOptions = {
  skipRelayConnect?: boolean;
};

type ReadOnlyInitOptions = {
  fundstrOnly?: boolean;
  suppressWarnings?: boolean;
};

type DmSubscriptionOptions = {
  suppressWarnings?: boolean;
};

export const useNostrStore = defineStore("nostr", {
  state: () => {
    ensureNutzapProfileCacheHydrated();
    pruneExpiredNutzapProfiles();
    const lastNip04EventTimestamp = useLocalStorage<number>(
      "cashu.ndk.nip04.lastEventTimestamp",
      0,
    );
    const lastNip17EventTimestamp = useLocalStorage<number>(
      "cashu.ndk.nip17.lastEventTimestamp",
      0,
    );
    const now = Math.floor(Date.now() / 1000);
    if (lastNip04EventTimestamp.value > now) {
      lastNip04EventTimestamp.value = now;
    }
    if (lastNip17EventTimestamp.value > now) {
      lastNip17EventTimestamp.value = now;
    }
    return {
      connected: false,
      pubkey: "",
      relays: useSettingsStore().defaultNostrRelays ?? ([] as string[]),
      encryptionKey: null as CryptoKey | null,
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
      signerCaps: useLocalStorage<SignerCaps>("cashu.ndk.signerCaps", {
        nip04Encrypt: false,
        nip04Decrypt: false,
        nip44Encrypt: false,
        nip44Decrypt: false,
        getSharedSecret: false,
      }),
      nip07SignerAvailable: true,
      nip07Checked: false,
      nip07Warned: false,
      nip07CheckPromise: null as Promise<boolean> | null,
      nip07RetryAttempts: 0,
      nip07RetryInterval: null as ReturnType<typeof setInterval> | null,
      nip07LastError: null as string | null,
      nip07LastFailureCause: null as Nip07FailureCause | null,
      mintRecommendations: useLocalStorage<MintRecommendation[]>(
        "cashu.ndk.mintRecommendations",
        [],
      ),
      initialized: false,
      secureStorageLoaded: false,
      secureWatchersRegistered: false,
      lastError: "" as string | null,
      connectionFailed: false,
      reconnectBackoffUntil: 0,
      reconnectFailures: 0,
      failedRelays: [] as string[],
      connectedRelays: new Set<string>(),
      readOnlyMode: "default" as "default" | "fundstr-only",
      cachedNip07Relays: null as string[] | null,
      pendingGetRelays: null as Promise<Record<string, any> | null> | null,
      lastNip04EventTimestamp,
      lastNip17EventTimestamp,
      nip17EventIdsWeHaveSeen: useLocalStorage<NostrEventLog[]>(
        "cashu.ndk.nip17EventIdsWeHaveSeen",
        [],
      ),
      profiles: useLocalStorage<
        Record<string, { profile: any; fetchedAt: number }>
      >("cashu.ndk.profiles", {}),
      dmListenersStop: null as null | (() => void),
      dmListenersOptions: null as { suppressWarnings?: boolean } | null,
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
    numConnectedRelays: (state) => state.connectedRelays.size,
  },
  actions: {
    getConnectedRelayUrls() {
      return Array.from(this.connectedRelays);
    },
    hasEncryptedSecrets() {
      return hasEncryptedSecrets();
    },
    ensureEncryptionSalt() {
      let salt = localStorage.getItem(SALT_STORAGE_KEY);
      if (!salt) {
        salt = generateSalt();
        localStorage.setItem(SALT_STORAGE_KEY, salt);
      }
      return salt;
    },
    async setEncryptionKeyFromPin(pin: string) {
      const salt = this.ensureEncryptionSalt();
      this.encryptionKey = await deriveKey(pin, salt);
      await this.secureSetItem(ENCRYPTION_CHECK_KEY, "ready");
      this.registerSecureWatchers();
      this.secureStorageLoaded = true;
    },
    async unlockWithPin(pin: string) {
      const salt = localStorage.getItem(SALT_STORAGE_KEY);
      if (!salt) {
        throw new Error("No wallet salt found. Set up your wallet first.");
      }
      this.encryptionKey = await deriveKey(pin, salt);
      this.secureStorageLoaded = false;
      await this.loadKeysFromStorage();
    },
    async secureSetItem(key: string, value: string) {
      if (!this.encryptionKey) {
        throw new WalletLockedError();
      }
      const enc = await encryptData(this.encryptionKey, value);
      localStorage.setItem(key, enc);
    },
    async secureGetItem(key: string): Promise<string | null> {
      if (!this.encryptionKey) {
        throw new WalletLockedError();
      }
      const val = localStorage.getItem(key);
      if (!val) return null;
      return await decryptData(this.encryptionKey, val);
    },
    registerSecureWatchers() {
      if (this.secureWatchersRegistered) return;
      watch(
        () => this.pubkey,
        async (v) => {
          await this.secureSetItem("cashu.ndk.pubkey", v);
        },
      );
      watch(
        () => this.signerType,
        async (v) => {
          await this.secureSetItem("cashu.ndk.signerType", v.toString());
        },
      );
      watch(
        () => this.nip46Token,
        async (v) => {
          await this.secureSetItem("cashu.ndk.nip46Token", v);
        },
      );
      watch(
        () => this.privateKeySignerPrivateKey,
        async (v) => {
          await this.secureSetItem("cashu.ndk.privateKeySignerPrivateKey", v);
        },
      );
      watch(
        () => this.seedSignerPrivateKey,
        async (v) => {
          await this.secureSetItem("cashu.ndk.seedSignerPrivateKey", v);
        },
      );
      watch(
        () => this.seedSignerPublicKey,
        async (v) => {
          await this.secureSetItem("cashu.ndk.seedSignerPublicKey", v);
        },
      );
      this.secureWatchersRegistered = true;
    },
    loadKeysFromStorage: async function () {
      if (this.secureStorageLoaded) return;
      if (!this.encryptionKey) {
        if (hasEncryptedSecrets()) {
          throw new WalletLockedError();
        }
        return;
      }
      const checkValue = await this.secureGetItem(ENCRYPTION_CHECK_KEY);
      if (!checkValue) {
        await this.secureSetItem(ENCRYPTION_CHECK_KEY, "ready");
      }
      const pk = await this.secureGetItem("cashu.ndk.pubkey");
      if (pk) this.pubkey = pk;
      const st = await this.secureGetItem("cashu.ndk.signerType");
      if (st) this.signerType = st as SignerType;
      const nip46 = await this.secureGetItem("cashu.ndk.nip46Token");
      if (nip46) this.nip46Token = nip46;
      const pks = await this.secureGetItem("cashu.ndk.privateKeySignerPrivateKey");
      if (pks) this.privateKeySignerPrivateKey = pks;
      const seedSk = await this.secureGetItem("cashu.ndk.seedSignerPrivateKey");
      if (seedSk) this.seedSignerPrivateKey = seedSk;
      const seedPk = await this.secureGetItem("cashu.ndk.seedSignerPublicKey");
      if (seedPk) this.seedSignerPublicKey = seedPk;
      this.registerSecureWatchers();
      this.secureStorageLoaded = true;
    },
    initNdkReadOnly: async function (opts: ReadOnlyInitOptions = {}) {
      try {
        await this.loadKeysFromStorage();
      } catch (e) {
        if (e instanceof WalletLockedError) {
          return;
        }
        throw e;
      }
      const { fundstrOnly, suppressWarnings } = opts;
      const requestedMode =
        fundstrOnly === true
          ? "fundstr-only"
          : fundstrOnly === false
            ? "default"
            : undefined;
      const desiredMode = requestedMode ?? this.readOnlyMode ?? "default";
      const modeChanged = this.readOnlyMode !== desiredMode;
      const ndk = await useNdk({
        requireSigner: false,
        fundstrOnly,
      });
      if (modeChanged) {
        this.connected = false;
        this.connectedRelays.clear();
      } else if (this.connected) {
        return;
      }
      try {
        await ndk.connect();
        this.lastError = null;
        this.connectionFailed = false;
        this.readOnlyMode = desiredMode;
        ndk.pool.on("relay:connect", (r: any) => {
          this.connectedRelays.add(r.url);
          this.connected = this.connectedRelays.size > 0;
        });
        ndk.pool.on("relay:disconnect", (r: any) => {
          this.connectedRelays.delete(r.url);
          this.connected = this.connectedRelays.size > 0;
        });
        (ndk.pool as any).on?.("relay:stalled", (r: any) => {
          if (!this.failedRelays.includes(r.url)) {
            this.failedRelays.push(r.url);
            notifyWarning(`Relay ${r.url} stalled, reconnecting`);
          }
          this.connectedRelays.delete(r.url);
          this.connected = this.connectedRelays.size > 0;
        });
        (ndk.pool as any).on?.("relay:heartbeat", (r: any) => {
          const idx = this.failedRelays.indexOf(r.url);
          if (idx !== -1) this.failedRelays.splice(idx, 1);
        });
      } catch (e: any) {
        console.warn("[nostr] read-only connect failed", e);
        if (!suppressWarnings) {
          notifyWarning(`Failed to connect to relays`, e?.message ?? String(e));
        }
        this.lastError = e?.message ?? String(e);
        this.connectionFailed = true;
        if (!suppressWarnings) {
          window.dispatchEvent(new Event("nostr-connect-failed"));
        }
      }
    },
    disconnect: async function () {
      const ndk = await useNdk();
      for (const relay of ndk.pool.relays.values()) relay.disconnect();
      this.signer = undefined;
      this.connected = false;
      this.connectedRelays.clear();
    },
    waitForNostrGlobals: async function (timeoutMs: number): Promise<boolean> {
      if ((window as any).nostr) return true;

      const startedAt = Date.now();

      return new Promise((resolve) => {
        const check = () => {
          const available = Boolean((window as any).nostr);
          const elapsed = Date.now() - startedAt;

          if (available || elapsed >= timeoutMs) {
            clearInterval(interval);
            resolve(available);
          }
        };

        const interval = window.setInterval(check, 100);
        check();
      });
    },
    async connectBrowserSigner() {
      const nostrAvailable = await this.waitForNostrGlobals(18000);
      const ext: any = (window as any).nostr;

      if (!nostrAvailable || !ext) {
        throw new NostrSignerError(
          "extension-unavailable",
          "Nostr browser extension not installed or enabled. If your signer omits enable(), we'll still try once core methods appear (Brave may inject slowly).",
          {
            remediation:
              "Install or enable a NIP-07 signer extension (e.g. nos2x/Alby) and allow access. Some browsers delay injection; wait a few more seconds and retry.",
          },
        );
      }

      const nip07 = new NDKNip07Signer();
      const enableTimeoutMs = 9000;
      const userTimeoutMs = 7000;
      const readyTimeoutMs = 9000;

      const hasEnable = typeof ext?.enable === "function";
      const hasCoreMethods =
        typeof ext?.getPublicKey === "function" && typeof ext?.signEvent === "function";
      const enablePromise = hasEnable ? ext.enable() : undefined;

      if (!hasEnable && !hasCoreMethods) {
        throw new NostrSignerError(
          "capability-missing",
          "NIP-07 signer missing enable() and core methods (getPublicKey/signEvent).",
          {
            remediation:
              "Update or reinstall your NIP-07 extension so it exposes getPublicKey/signEvent.",
          },
        );
      }

      const updateSignerCaps = (caps: SignerCaps) => {
        this.signerCaps = caps;
      };

      const withTimeout = async <T>(
        promise: Promise<T>,
        ms: number,
        onTimeout: () => NostrSignerError,
      ) =>
        Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(onTimeout()), ms),
          ),
        ]);

      if (enablePromise) {
        try {
          await withTimeout(enablePromise, enableTimeoutMs, () =>
            new NostrSignerError(
              "enable-timeout",
              "Signer approval timed out.",
              {
                remediation:
                  "Confirm the browser did not block the extension prompt and approve access.",
              },
            ),
          );
        } catch (error) {
          if (error instanceof NostrSignerError) throw error;
          throw new NostrSignerError(
            "enable-denied",
            "The signer request was denied or blocked.",
            {
              remediation: "Approve the extension's access request to continue.",
              cause: error,
            },
          );
        }
      }

      let user;
      if (hasEnable) {
        try {
          user = await withTimeout(nip07.user(), userTimeoutMs, () =>
            new NostrSignerError(
              "user-timeout",
              "Timed out waiting for the signer user.",
              {
                remediation: "Ensure the extension is unlocked and retry.",
              },
            ),
          );
        } catch (error) {
          if (error instanceof NostrSignerError) throw error;
          throw new NostrSignerError("user-error", "Failed to fetch signer user.", {
            remediation: "Unlock your NIP-07 extension and try again.",
            cause: error,
          });
        }
      }

      try {
        const readyUser = hasEnable
          ? await withTimeout(nip07.blockUntilReady(), readyTimeoutMs, () =>
              new NostrSignerError(
                "ready-timeout",
                "Signer initialization timed out.",
                {
                  remediation: "Keep the extension unlocked and retry the connection.",
                },
              ),
            )
          : null;

        const caps = {
          nip04Encrypt: typeof ext?.nip04?.encrypt === "function",
          nip04Decrypt: typeof ext?.nip04?.decrypt === "function",
          nip44Encrypt: typeof ext?.nip44?.encrypt === "function",
          nip44Decrypt: typeof ext?.nip44?.decrypt === "function",
          getSharedSecret: typeof ext?.getSharedSecret === "function",
        };

        updateSignerCaps(caps);

        const nip04Supported = caps.nip04Encrypt && caps.nip04Decrypt;
        const nip44Supported = caps.nip44Encrypt && caps.nip44Decrypt;

        if (!nip04Supported) {
          throw new NostrSignerError(
            "capability-missing",
            "Signer missing required NIP-04 encryption/decryption capabilities.",
            {
              remediation:
                "Grant encryption permissions in your extension settings, then retry.",
              details: { caps },
            },
          );
        }

        if (!nip44Supported) {
          notifyWarning(
            "Signer missing NIP-44 support; continuing with NIP-04 only.",
            "Some newer DM features may be limited until NIP-44 is enabled.",
          );
          updateSignerCaps({ ...caps, nip44Encrypt: false, nip44Decrypt: false });
        }

        let resolvedUser = readyUser ?? user;

        if (!resolvedUser?.pubkey && hasCoreMethods) {
          const pubkey = await withTimeout(
            Promise.resolve(ext.getPublicKey()),
            userTimeoutMs,
            () =>
              new NostrSignerError(
                "pubkey-timeout",
                "Timed out waiting for the signer public key.",
                {
                  remediation:
                    "If your browser delays extension injection (e.g., Brave), keep this tab open a bit longer and retry.",
                },
              ),
          );
          if (pubkey) {
            resolvedUser = { pubkey } as typeof user;
          }
        }

        if (!resolvedUser?.pubkey) {
          throw new NostrSignerError("user-error", "Signer did not return a pubkey.");
        }

        this.signer = nip07;
        this.signerType = SignerType.NIP07;
        this.probeSignerCaps();
        this.setPubkey(resolvedUser.pubkey);
        useNdk({ requireSigner: true }).catch(() => {});
      } catch (error) {
        if (error instanceof NostrSignerError) throw error;
        throw new NostrSignerError("user-error", "Failed to finalize signer connection.", {
          cause: error,
        });
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
      const ndk = await rebuildNdk(this.relays, this.signer, true);
      ndk.explicitRelayUrls = this.relays;

      // 3. connect every relay with a 6-second guard, but do not await ndk.connect() again
      const relaysArr = Array.from(ndk.pool.relays.values());
      this.connectedRelays.clear();
      const connectPromises = relaysArr.map((r) => connectWithTimeout(r, 6000));

      // wait for any to connect to reset backoff
      try {
        await Promise.any(connectPromises);
        this.lastError = null;
        this.reconnectBackoffUntil = 0;
        this.reconnectFailures = 0;
        this.failedRelays = [];
        this.connectionFailed = false;
      } catch (e: any) {
        this.lastError = e?.message ?? String(e);
        this.reconnectFailures++;
        const backoff = Math.min(
          RECONNECT_BACKOFF_MS * 2 ** this.reconnectFailures,
          MAX_RECONNECT_BACKOFF_MS,
        );
        this.reconnectBackoffUntil = Date.now() + backoff;
        this.connectionFailed = true;
        window.dispatchEvent(new Event("nostr-connect-failed"));
        notifyError(this.lastError);
      }

      // 4. keep icons in RelayManager.vue fresh
      ndk.pool.on("relay:connect", (r: any) => {
        this.connectedRelays.add(r.url);
        this.connected = this.connectedRelays.size > 0;
        this.relays = [...this.relays];
      });
      ndk.pool.on("relay:disconnect", (r: any) => {
        this.connectedRelays.delete(r.url);
        this.connected = this.connectedRelays.size > 0;
        this.relays = [...this.relays];
      });
      (ndk.pool as any).on?.("relay:stalled", (r: any) => {
        if (!this.failedRelays.includes(r.url)) {
          this.failedRelays.push(r.url);
          notifyWarning(`Relay ${r.url} stalled, reconnecting`);
        }
        this.connectedRelays.delete(r.url);
        this.connected = this.connectedRelays.size > 0;
        this.relays = [...this.relays];
      });
      (ndk.pool as any).on?.("relay:heartbeat", (r: any) => {
        const idx = this.failedRelays.indexOf(r.url);
        if (idx !== -1) this.failedRelays.splice(idx, 1);
      });

      // 5. track relay health – never throw
      Promise.allSettled(connectPromises).then((res) =>
        res.forEach((r, i) => {
          const url = relaysArr[i].url;
          if (r.status === "rejected") {
            if (!this.failedRelays.includes(url)) {
              this.failedRelays.push(url);
              notifyWarning(`Relay ${url} unreachable`);
            }
          } else {
            const idx = this.failedRelays.indexOf(url);
            if (idx !== -1) this.failedRelays.splice(idx, 1);
          }
        }),
      );

      return ndk;
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
    initSignerIfNotSet: async function (options: InitSignerBehaviorOptions = {}) {
      try {
        await this.loadKeysFromStorage();
      } catch (e) {
        if (e instanceof WalletLockedError) {
          return;
        }
        throw e;
      }
      if (this.signerType === SignerType.NIP07) {
        const available = await this.checkNip07Signer();
        if (!available && !this.signer) {
          if (!this.initialized) {
            await this.initNdkReadOnly();
            this.initialized = true;
          }
          return;
        }
      }
      if (!this.signer) {
        this.initialized = false; // force re-initialisation
      }
      if (!this.initialized) {
        await this.initSigner(options);
        if (!options.skipRelayConnect) {
          await this.ensureNdkConnected();
        }
      }
    },
    initSigner: async function (options: InitSignerBehaviorOptions = {}) {
      if (this.signerType === SignerType.NIP07) {
        await this.initNip07Signer(options);
      } else if (this.signerType === SignerType.PRIVATEKEY) {
        await this.initPrivateKeySigner(undefined, options);
      } else {
        await this.initWalletSeedPrivateKeySigner(options);
      }
      this.initialized = true;
    },
    probeSignerCaps: function () {
      const ext: any = (window as any)?.nostr;
      this.signerCaps = {
        nip04Encrypt: typeof ext?.nip04?.encrypt === "function",
        nip04Decrypt: typeof ext?.nip04?.decrypt === "function",
        nip44Encrypt: typeof ext?.nip44?.encrypt === "function",
        nip44Decrypt: typeof ext?.nip44?.decrypt === "function",
        getSharedSecret: typeof ext?.getSharedSecret === "function",
      };
    },
    setSigner: async function (
      signer: NDKSigner,
      options: InitSignerBehaviorOptions = {},
    ) {
      this.signer = signer;
      this.probeSignerCaps();
      if (!options.skipRelayConnect) {
        await this.connect();
      }
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
        useDmChatsStore().setActivePubkey(pubkey);
        useDmChatsStore().loadChats(pubkey);
      } catch (e) {
        console.error(e);
      }
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
        useMessengerStore().start();
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
      if (this.nip07CheckPromise) return this.nip07CheckPromise;

      const maxRetries = 3;
      const enableTimeoutMs = 7000;
      const userTimeoutMs = 6000;
      const globalTimeoutMs = 32000;
      const baseDelayMs = 750;
      const maxDelayMs = 4000;
      const flag = localStorage.getItem("nip07.enabled");

      const withTimeout = async <T>(promise: Promise<T> | undefined, ms: number, msg: string) => {
        if (!promise) throw new Error("NIP-07 extension unavailable");
        return Promise.race([
          promise,
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(msg)), ms),
          ),
        ]);
      };

      const runCheck = async () => {
        if (this.nip07Checked && this.nip07SignerAvailable && !force) return true;

        const startedAt = Date.now();
        let delayMs = baseDelayMs;
        let attempts = 0;
        let lastFailureCause: Nip07FailureCause | null = null;
        let nip07Signer: NDKNip07Signer | null = null;

        while (Date.now() - startedAt < globalTimeoutMs) {
          const nostr = (window as any).nostr;
          const nostrAvailable = Boolean(nostr);
          const hasEnable = typeof nostr?.enable === "function";
          const hasCoreMethods =
            typeof nostr?.getPublicKey === "function" && typeof nostr?.signEvent === "function";

          if (!nostrAvailable) {
            this.nip07SignerAvailable = false;
            this.nip07Checked = false;
            this.nip07RetryAttempts = attempts;
            this.nip07LastError = "NIP-07 extension not detected";
            lastFailureCause = "extension-missing";
            this.nip07LastFailureCause = lastFailureCause;
          } else if (!hasEnable && !hasCoreMethods) {
            this.nip07SignerAvailable = false;
            this.nip07Checked = false;
            this.nip07RetryAttempts = attempts;
            this.nip07LastError = "NIP-07 extension missing enable() and core methods";
            lastFailureCause = "core-methods-missing";
            this.nip07LastFailureCause = lastFailureCause;
            break;
          } else {
            try {
              attempts += 1;
              this.nip07RetryAttempts = attempts;
              if (hasEnable && (!flag || force || !this.nip07SignerAvailable)) {
                await withTimeout(nostr.enable(), enableTimeoutMs, "NIP-07 enable timed out");
              }
              if (!nip07Signer) {
                nip07Signer = new NDKNip07Signer();
              }
              const signer = nip07Signer;
              if (hasEnable) {
                await withTimeout(signer.user(), userTimeoutMs, "NIP-07 user() timed out");
              } else if (hasCoreMethods) {
                await withTimeout(
                  Promise.resolve(nostr.getPublicKey()),
                  userTimeoutMs,
                  "NIP-07 getPublicKey() timed out",
                );
              }
              this.nip07SignerAvailable = true;
              this.nip07Checked = true;
              this.nip07RetryAttempts = 0;
              this.nip07LastError = null;
              this.nip07LastFailureCause = null;
              localStorage.setItem("nip07.enabled", "1");
              if (this.nip07RetryInterval) {
                clearInterval(this.nip07RetryInterval);
                this.nip07RetryInterval = null;
              }
              return true;
            } catch (e) {
              this.nip07SignerAvailable = false;
              this.nip07Checked = false;
              this.nip07RetryAttempts = attempts;
              this.nip07LastError =
                e instanceof Error ? e.message : typeof e === "string" ? e : "Unknown NIP-07 error";

              if (this.nip07LastError?.includes("enable")) {
                lastFailureCause = "enable-failed";
              } else if (
                this.nip07LastError?.includes("user") ||
                this.nip07LastError?.includes("getPublicKey")
              ) {
                lastFailureCause = "user-failed";
              } else {
                lastFailureCause = "unknown";
              }

              this.nip07LastFailureCause = lastFailureCause;
            }
          }

          const hitRetryLimit =
            attempts >= maxRetries && lastFailureCause !== "extension-missing" && !force;
          if (hitRetryLimit) break;

          const remainingMs = globalTimeoutMs - (Date.now() - startedAt);
          if (remainingMs <= 0) break;

          await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, remainingMs)));
          delayMs = Math.min(delayMs * 2, maxDelayMs);
        }

        if (this.signerType === SignerType.NIP07 && !this.nip07RetryInterval) {
          this.nip07RetryInterval = window.setInterval(async () => {
            const available = await this.checkNip07Signer(true);
            if (available) {
              clearInterval(this.nip07RetryInterval!);
              this.nip07RetryInterval = null;
              await this.initSignerIfNotSet();
            }
          }, Math.min(delayMs, maxDelayMs));
        }

        this.nip07LastFailureCause = lastFailureCause;
        return false;
      };

      this.nip07CheckPromise = runCheck();
      try {
        return await this.nip07CheckPromise;
      } finally {
        this.nip07CheckPromise = null;
      }
    },
    initNip07Signer: async function (options: InitSignerBehaviorOptions = {}) {
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
          await this.setSigner(signer, options);

          let urls: string[] | null = null;
          if (this.cachedNip07Relays) {
            urls = this.cachedNip07Relays;
          } else {
            if (!this.pendingGetRelays) {
              this.pendingGetRelays = signer.getRelays?.() || Promise.resolve(null);
            }
            const relays = await this.pendingGetRelays;
            this.pendingGetRelays = null;
            if (relays) {
              urls = sanitizeRelayUrls(Object.keys(relays));
              if (urls.length) this.cachedNip07Relays = urls;
            }
          }
          if (urls && urls.length) {
            this.relays = urls;
            const settings = useSettingsStore();
            settings.defaultNostrRelays = urls;
          }
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
    initPrivateKeySigner: async function (
      nsec?: string,
      options: InitSignerBehaviorOptions = {},
    ) {
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
      await this.setSigner(signer, options);
    },
    async updateIdentity(
      nsec?: string,
      relays?: string[],
      opts: { onProgress?: (step: string) => void; preferNip07?: boolean } = {},
    ) {
      const { onProgress, preferNip07 = false } = opts;
      try {
        if (relays) this.relays = relays as any;
        const nip07Available = await this.checkNip07Signer(true);

        if ((preferNip07 || this.signerType === SignerType.NIP07) && nip07Available) {
          await this.initNip07Signer();
        } else {
          if (!nsec) {
            throw new Error("A private key is required to update your Nostr identity.");
          }
          await this.initPrivateKeySigner(nsec);
        }

        await this.bootstrapIdentity(onProgress);
      } catch (e) {
        console.error("Failed to update identity", e);
        notifyError(
          "Failed to bootstrap Nostr identity",
          (e as Error)?.message ?? String(e),
        );
        throw e;
      }
    },
    async bootstrapIdentity(update?: (step: string) => void) {
      const progress = (msg: string) => update?.(msg);
      if (!this.hasIdentity) {
        throw new Error("No Nostr identity configured");
      }

      progress("Loading profile");
      await this.getProfile(this.pubkey);

      progress("Refreshing relay list");
      const relays = await this.fetchUserRelays(this.pubkey);
      if (Array.isArray(relays) && relays.length) {
        this.relays = relays as any;
      }

      progress("Connecting to relays");
      await this.ensureNdkConnected(this.relays as any);
      this.ensureDmListeners({ suppressWarnings: true });

      progress("Syncing messages");
      const dmChatsStore = useDmChatsStore();
      dmChatsStore.loadChats(this.pubkey);
      const messengerStore = useMessengerStore();
      await messengerStore.loadIdentity({ refresh: true });
      await messengerStore.start();

      progress("Updating creator data");
      const creatorsStore = useCreatorsStore();
      const creatorProfileStore = useCreatorProfileStore();
      const bundle = await fetchFundstrProfileBundle(this.pubkey, {
        forceRefresh: true,
      });
      creatorsStore.updateProfileCacheState(
        this.pubkey,
        bundle.profileDetails,
        bundle.profileEvent,
        {
          eventId: bundle.profileEvent?.id,
          updatedAt: bundle.joined,
        },
      );
      creatorsStore.updateTierCacheState(
        this.pubkey,
        bundle.tiers,
        bundle.profileEvent,
        {
          fresh: bundle.tierDataFresh,
          securityBlocked: bundle.tierSecurityBlocked,
          fetchFailed: bundle.tierFetchFailed,
        },
      );
      if (bundle.profileDetails) {
        creatorProfileStore.setProfile({
          ...bundle.profileDetails,
          pubkey: this.pubkey,
          mints: bundle.profileDetails.mints ?? [],
          relays: bundle.profileDetails.relays ?? (this.relays as any),
        });
        creatorProfileStore.markClean();
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
    initWalletSeedPrivateKeySigner: async function (
      options: InitSignerBehaviorOptions = {},
    ) {
      await this.walletSeedGenerateKeyPair();
      const signer = new NDKPrivateKeySigner(this.seedSignerPrivateKey);
      this.signerType = SignerType.SEED;
      this.setPubkey(this.seedSignerPublicKey);
      await this.setSigner(signer, options);
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
    encryptDmContent: async function (
      privKey: string | Uint8Array | undefined,
      recipient: string,
      message: string,
    ): Promise<string> {
      const key =
        typeof privKey === "string" || privKey instanceof Uint8Array ? privKey : undefined;
      const { content } = await encryptDM(recipient, message, key);
      return content;
    },

    decryptDmContent: async function (
      privKey: string | Uint8Array | undefined,
      sender: string,
      content: string,
    ): Promise<string> {
      const plaintext = await decryptDM(sender, content, privKey);
      if (plaintext == null) {
        throw new Error('Unable to decrypt message');
      }
      return plaintext;
    },
    sendDirectMessageUnified: async function (
      recipient: string,
      message: string,
      privKey?: string,
      pubKey?: string,
      relays?: string[],
    ): Promise<{ success: boolean; event: NDKEvent | null }> {
      const recResolved = this.resolvePubkey(recipient);
      if (!recResolved) {
        notifyError("Invalid recipient pubkey");
        return { success: false, event: null };
      }
      recipient = recResolved;
      if (pubKey) {
        const senderResolved = this.resolvePubkey(pubKey);
        if (!senderResolved) {
          notifyError("Invalid sender pubkey");
          return { success: false, event: null };
        }
        pubKey = senderResolved;
      }
      await this.initSignerIfNotSet();
      const external =
        this.signerType === SignerType.NIP07 ||
        this.signerType === SignerType.NIP46;
      const key = privKey || this.privKeyHex;
      if (!key && !external) {
        notifyError("No private key available for messaging");
        return { success: false, event: null };
      }
      const signer = privKey ? new NDKPrivateKeySigner(privKey) : this.signer;
      const senderPubkey =
        pubKey || (privKey ? getPublicKey(hexToBytes(privKey)) : this.pubkey);
      const ndk = await useNdk();
      const event = new NDKEvent(ndk);
      event.kind = NDKKind.EncryptedDirectMessage;
      try {
        event.content = await this.encryptDmContent(key, recipient, message);
      } catch (e: any) {
        notifyError(e?.message || "Failed to encrypt message");
        return { success: false, event: null };
      }
      event.tags = [
        ["p", recipient],
        ["p", senderPubkey],
      ];
      await event.sign(signer);

      const relayCandidates = relays && relays.length ? relays : this.relays;
      let selected = await selectPreferredRelays(relayCandidates);
      if (selected.length === 0) {
        const fallback = await selectPreferredRelays([
          ...DEFAULT_RELAYS,
          ...FREE_RELAYS,
        ]);
        selected = fallback;
        if (selected.length === 0) {
          console.error(
            "[nostr] NIP-04 publish failed: all relays unreachable",
          );
          notifyError("Could not publish NIP-04 event");
          return { success: false, event: null };
        }
      }
      await this.ensureNdkConnected(selected);
      try {
        await ensureRelayConnectivity(ndk);
      } catch (e: any) {
        notifyError(
          "Unable to connect to Nostr relays",
          e?.message ?? String(e),
        );
        return { success: false, event: null };
      }
      const success = await publishDmNip04(event, selected);
      return { success, event: success ? event : null };
    },
    sendNip04DirectMessage: async function (...args: any[]) {
      // legacy alias
      // @ts-expect-error -- dynamic invocation
      return await (this as any).sendDirectMessageUnified(...args);
    },
    ensureDmListeners: function (options: DmSubscriptionOptions = {}) {
      this.dmListenersOptions = options;
      if (this.dmListenersStop) {
        return;
      }

      const relayStatus = useFundstrRelayStatus();
      const stop = watch(
        relayStatus,
        (status, previous) => {
          if (status === "connected" && previous !== "connected") {
            const opts = this.dmListenersOptions ?? {};
            void this.subscribeToNip17DirectMessages(opts).catch((err) => {
              if (!opts.suppressWarnings) {
                notifyWarning(
                  "Failed to subscribe to NIP-17 direct messages",
                  err?.message ?? String(err),
                );
              } else {
                console.warn("[nostr] Failed to subscribe to NIP-17 DMs", err);
              }
            });
            void this.subscribeToNip04DirectMessages(opts).catch((err) => {
              if (!opts.suppressWarnings) {
                notifyWarning(
                  "Failed to subscribe to NIP-04 direct messages",
                  err?.message ?? String(err),
                );
              } else {
                console.warn("[nostr] Failed to subscribe to NIP-04 DMs", err);
              }
            });
          }
        },
        { immediate: true },
      );

      this.dmListenersStop = () => {
        stop();
        this.dmListenersStop = null;
      };
    },
    subscribeToNip04DirectMessages: async function (
      options: DmSubscriptionOptions = {},
    ) {
      await this.initSignerIfNotSet();
      await this.initNdkReadOnly(options);
      const privKey = this.privKeyHex;
      const pubKey = this.pubkey;
      let nip04DirectMessageEvents: Set<NDKEvent> = new Set();
      const fetchEventsPromise = new Promise<Set<NDKEvent>>(async (resolve) => {
        if (!this.lastNip04EventTimestamp) {
          this.lastNip04EventTimestamp = Math.floor(Date.now() / 1000);
        }
        const now = Math.floor(Date.now() / 1000);
        if (this.lastNip04EventTimestamp > now) {
          this.lastNip04EventTimestamp = now;
        }
        debug(
          `### Subscribing to NIP-04 direct messages to ${pubKey} since ${this.lastNip04EventTimestamp}`,
        );
        const ndk = await useNdk();
        try {
          await ndk.connect();
        } catch (e: any) {
          if (!options.suppressWarnings) {
            notifyWarning("Relay connection failed", e?.message ?? String(e));
          }
        }
        const sub = ndk.subscribe(
          {
            kinds: [NDKKind.EncryptedDirectMessage],
            "#p": [pubKey],
            since: this.lastNip04EventTimestamp,
          } as NDKFilter,
          { closeOnEose: false, groupable: false },
        );
        sub.on("event", (event: NDKEvent) => {
          debug("event");
          this.decryptDmContent(privKey, event.pubkey, event.content).then(
            (content) => {
              debug("NIP-04 DM from", event.pubkey);
              debug("Content:", content);
              nip04DirectMessageEvents.add(event);
              this.lastNip04EventTimestamp = Math.floor(Date.now() / 1000);
              this.parseMessageForEcash(content, event.pubkey);
              try {
                const chatStore = useDmChatsStore();
                chatStore.addIncoming(new NDKEvent(undefined, event.rawEvent()));
              } catch {}
            },
          );
        });
      });
      try {
        nip04DirectMessageEvents = await fetchEventsPromise;
      } catch (error) {
        console.error("Error fetching contact events:", error);
      }
    },
    subscribeToNip04DirectMessagesCallback: async function (
      privKey: string | undefined,
      pubKey: string,
      cb: (event: NostrEvent, decrypted: string) => void,
      since?: number,
    ) {
      const resolved = this.resolvePubkey(pubKey);
      if (!resolved) return;
      pubKey = resolved;
      await this.initNdkReadOnly();
      if (since === undefined) {
        if (!this.lastNip04EventTimestamp) {
          this.lastNip04EventTimestamp = Math.floor(Date.now() / 1000);
        }
        since = this.lastNip04EventTimestamp;
      }
      const filter: NDKFilter = {
        kinds: [NDKKind.EncryptedDirectMessage],
        "#p": [pubKey],
        since,
      };
      const ndk = await useNdk();
      const sub = ndk.subscribe(filter, {
        closeOnEose: false,
        groupable: false,
      });
      sub.on("event", async (ev: NDKEvent) => {
        const decrypted = await this.decryptDmContent(
          privKey,
          ev.pubkey,
          ev.content,
        );
        const raw = await ev.toNostrEvent();
        this.lastNip04EventTimestamp = Math.floor(Date.now() / 1000);
        cb(raw, decrypted);
      });
    },
    sendNip17DirectMessageToNprofile: async function (
      nprofile: string,
      message: string,
    ): Promise<{ success: boolean; event?: NDKEvent }> {
      const result = nip19.decode(nprofile);
      const pubkey: string = (result.data as ProfilePointer).pubkey;
      const relays: string[] | undefined = (result.data as ProfilePointer)
        .relays;
      return await this.sendNip17DirectMessage(pubkey, message, relays);
    },
    randomTimeUpTo2DaysInThePast: function () {
      return Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 172800);
    },
    sendNip17DirectMessage: async function (
      recipient: string,
      message: string,
      relays?: string[],
    ): Promise<{ success: boolean; event?: NDKEvent }> {
      const recResolved = this.resolvePubkey(recipient);
      if (!recResolved) {
        return { success: false };
      }
      recipient = recResolved;
      await this.initSignerIfNotSet();

      // 1. Create the Rumor (the actual DM content)
      const rumor = new NDKEvent(await useNdk());
      rumor.kind = 14 as NDKKind;
      rumor.content = message;
      rumor.tags = [["p", recipient]];
      await rumor.sign(this.signer);

      // 2. Create the Seal (the encrypted wrapper for the rumor)
      const seal = new NDKEvent(await useNdk());
      seal.kind = 13 as NDKKind;
      seal.content = await rumor.encrypt(await this.signer.user());
      await seal.sign(this.signer);

      // 3. Create the Gift Wrap
      const giftWrap = new NDKEvent(await useNdk());
      giftWrap.kind = 1059 as NDKKind;
      giftWrap.tags = [["p", recipient]];
      giftWrap.content = await seal.toJson();

      // Sign with an ephemeral key for anonymity
      const ephemeralSigner = new NDKPrivateKeySigner();
      await giftWrap.sign(ephemeralSigner);

      // 4. Publish the Gift Wrap
      const ndk = await useNdk();
      const published = await ndk.publish(giftWrap, new Set(relays));

      return { success: published.size > 0, event: giftWrap };
    },

    async fetchUserRelays(pubkey: string): Promise<string[]> {
      const ndk = await useNdk();
      const user = ndk.getUser({ pubkey });
      try {
        await user.fetchProfile();
        await user.fetchRelayList();
        const relayList = user.relayList;
        if (relayList) {
          return Array.from(relayList.readRelayUrls);
        }
      } catch {}
      return [];
    },

    async publishRelayList(relays: string[]) {
      const ndk = await useNdk();
      const event = new NDKEvent(ndk);
      event.kind = 10002 as NDKKind;
      event.tags = relays.map((r) => ["r", r]);
      await event.sign(this.signer);
      await ndk.publish(event);
    },
    subscribeToNip17DirectMessages: async function (
      options: DmSubscriptionOptions = {},
    ) {
      await this.initSignerIfNotSet();
      await this.initNdkReadOnly(options);
      const privKey = this.privKeyHex;
      const pubKey = this.pubkey;
      let nip17DirectMessageEvents: Set<NDKEvent> = new Set();
      const fetchEventsPromise = new Promise<Set<NDKEvent>>(async (resolve) => {
        if (!this.lastNip17EventTimestamp) {
          this.lastNip17EventTimestamp = Math.floor(Date.now() / 1000);
        }
        const now = Math.floor(Date.now() / 1000);
        if (this.lastNip17EventTimestamp > now) {
          this.lastNip17EventTimestamp = now;
        }
        const since = this.lastNip17EventTimestamp - 172800; // last 2 days
        debug(
          `### Subscribing to NIP-17 direct messages to ${pubKey} since ${since}`,
        );
        const ndk = await useNdk();
        try {
          await ndk.connect();
        } catch (e: any) {
          if (!options.suppressWarnings) {
            notifyWarning("Relay connection failed", e?.message ?? String(e));
          }
        }
        const sub = ndk.subscribe(
          {
            kinds: [1059 as NDKKind],
            "#p": [pubKey],
            since: since,
          } as NDKFilter,
          { closeOnEose: false, groupable: false },
        );

        sub.on("event", async (wrapEvent: NDKEvent) => {
          const eventLog = {
            id: wrapEvent.id,
            created_at: wrapEvent.created_at,
          } as NostrEventLog;
          if (this.nip17EventIdsWeHaveSeen.find((e) => e.id === wrapEvent.id)) {
            // debug(`### Already seen NIP-17 event ${wrapEvent.id} (time: ${wrapEvent.created_at})`);
            return;
          } else {
            debug(`### New event ${wrapEvent.id}`);
            this.nip17EventIdsWeHaveSeen.push(eventLog);
            // remove all events older than 10 days to keep the list small
            const fourDaysAgo =
              Math.floor(Date.now() / 1000) - 10 * 24 * 60 * 60;
            this.nip17EventIdsWeHaveSeen = this.nip17EventIdsWeHaveSeen.filter(
              (e) => e.created_at > fourDaysAgo,
            );
          }
          let dmEvent: NDKEvent;
          let content: string;
          try {
            const wappedContent = await this.decryptDmContent(
              privKey,
              wrapEvent.pubkey,
              wrapEvent.content,
            );
            const sealEvent = JSON.parse(wappedContent) as NostrEvent;
            if (!verifyEvent(sealEvent)) {
              debug("### NIP-17 DM verification failed: invalid signature");
              notifyWarning("Discarded invalid NIP-17 direct message");
              return;
            }
            const dmEventString = await this.decryptDmContent(
              privKey,
              sealEvent.pubkey,
              sealEvent.content,
            );
            const dmRaw = JSON.parse(dmEventString) as NostrEvent;
            dmEvent = new NDKEvent(ndk, dmRaw);

            if (sealEvent.pubkey !== dmEvent.pubkey) {
              debug(
                "### NIP-17 DM verification failed: pubkey mismatch",
                sealEvent.pubkey,
                dmEvent.pubkey,
              );
              notifyWarning("Discarded invalid NIP-17 direct message");
              return;
            }

            content = dmEvent.content;
            debug("### NIP-17 DM from", dmEvent.pubkey);
            debug("Content:", content);
          } catch (e) {
            console.error(e);
            return;
          }
          nip17DirectMessageEvents.add(dmEvent);
          this.lastNip17EventTimestamp = Math.floor(Date.now() / 1000);
          this.parseMessageForEcash(content, dmEvent.pubkey);
          try {
            const chatStore = useDmChatsStore();
            chatStore.addIncoming(dmEvent);
          } catch {}
        });
      });
      try {
        nip17DirectMessageEvents = await fetchEventsPromise;
      } catch (error) {
        console.error("Error fetching contact events:", error);
      }
    },
    parseMessageForEcash: async function (message: string, sender?: string) {
      if (sender && sender === this.pubkey) return;
      // first check if the message can be converted to a json and then to a PaymentRequestPayload
      try {
        const payload = JSON.parse(message) as any;
        if (
          payload &&
          payload.type === "cashu_subscription_payment" &&
          payload.token
        ) {
          const decoded = token.decode(payload.token);
          const amount = decoded
            ? token.getProofs(decoded).reduce((s, p) => s + p.amount, 0)
            : 0;
          const unlockTs = payload.unlock_time ?? payload.unlockTime ?? 0;
          const creatorsStore = useCreatorsStore();
          const tierName = creatorsStore.tiersMap[this.pubkey || ""]?.find(
            (t) => t.id === payload.tier_id,
          )?.name;
          const entry = {
            id: uuidv4(),
            tokenString: payload.token,
            amount,
            owner: "creator",
            creatorNpub: this.pubkey,
            subscriberNpub: sender,
            tierId: payload.tier_id ?? "",
            ...(tierName ? { tierName } : {}),
            intervalKey: payload.subscription_id ?? "",
            unlockTs,
            autoRedeem: true,
            status:
              unlockTs && unlockTs > Math.floor(Date.now() / 1000)
                ? "pending"
                : "unlockable",
            subscriptionEventId: null,
            subscriptionId: payload.subscription_id,
            monthIndex: payload.month_index,
            totalPeriods: payload.total_months,
            frequency: (payload as any).frequency || "monthly",
            intervalDays:
              (payload as any).interval_days ||
              frequencyToDays(((payload as any).frequency as any) || "monthly"),
            label: "Subscription payment",
          };
          await cashuDb.lockedTokens.put(entry as any);
          const receiveStore = useReceiveTokensStore();
          receiveStore.receiveData.tokensBase64 = payload.token;
          await receiveStore.enqueue(() =>
            receiveStore.receiveToken(payload.token, DEFAULT_BUCKET_ID),
          );
          return;
        }
        if (payload && payload.type === "cashu_subscription_claimed") {
          const sub = await cashuDb.subscriptions.get(payload.subscription_id);
          const idx = sub?.intervals.findIndex(
            (i) => i.monthIndex === payload.month_index,
          );
          if (sub && idx !== undefined && idx >= 0) {
            sub.intervals[idx].status = "claimed";
            await cashuDb.subscriptions.update(sub.id, {
              intervals: sub.intervals,
            });
            notifySuccess("Subscription payment claimed");
          }
          return;
        }
        if (payload && payload.proofs) {
          const receiveStore = useReceiveTokensStore();
          const prStore = usePRStore();
          const sendTokensStore = useSendTokensStore();
          const tokensStore = useTokensStore();
          const proofs = payload.proofs;
          const mint = payload.mint;
          const unit = payload.unit;
          const token = {
            proofs: proofs,
            mint: mint,
            unit: unit,
          } as Token;

          const tokenStr = getEncodedTokenV4(token);

          const tokenInHistory = tokensStore.tokenAlreadyInHistory(tokenStr);
          if (tokenInHistory && tokenInHistory.amount > 0) {
            debug("### incoming token already in history");
            return;
          }
          await this.addPendingTokenToHistory(tokenStr, false);
          receiveStore.receiveData.tokensBase64 = tokenStr;
          sendTokensStore.showSendTokens = false;
          if (prStore.receivePaymentRequestsAutomatically) {
            const success = await receiveStore.receiveIfDecodes();
            if (success) {
              prStore.showPRDialog = false;
            } else {
              notifyWarning("Could not receive incoming payment");
            }
          } else {
            prStore.showPRDialog = false;
            receiveStore.showReceiveTokens = true;
          }
          return;
        }

        // check for locked token format
        if (
          payload.token &&
          payload.bucketId &&
          (payload.unlockTime !== undefined ||
            payload.unlock_time !== undefined)
        ) {
          const buckets = useBucketsStore();
          if (!buckets.bucketList.find((b) => b.id === payload.bucketId)) {
            buckets.buckets.push({
              id: payload.bucketId,
              name: payload.bucketId.slice(0, 8),
              creatorPubkey: sender,
            });
          }

          let amount = payload.amount;
          if (amount === undefined) {
            try {
              const decoded = token.decode(payload.token);
              amount = decoded
                ? token.getProofs(decoded).reduce((s, p) => (s += p.amount), 0)
                : 0;
            } catch {}
          }

          const unlockTs = payload.unlock_time ?? payload.unlockTime ?? 0;
          const entry = {
            id: uuidv4(),
            tokenString: payload.token,
            amount: amount || 0,
            owner: "creator",
            creatorNpub: this.pubkey,
            subscriberNpub: sender,
            tierId: payload.bucketId,
            intervalKey: payload.referenceId,
            unlockTs,
            autoRedeem: true,
            status:
              unlockTs && unlockTs > Math.floor(Date.now() / 1000)
                ? "pending"
                : "unlockable",
            subscriptionEventId: null,
            label: "Locked tokens",
          };
          await cashuDb.lockedTokens.put(entry as any);
          return;
        }
      } catch (e) {
        // debug("### parsing message for ecash failed");
        return;
      }

      debug("### parsing message for ecash", message);
      const receiveStore = useReceiveTokensStore();
      const words = message.split(" ");
      const tokens = words.filter((word) => {
        return word.startsWith("cashu");
      });
      for (const tokenStr of tokens) {
        receiveStore.receiveData.tokensBase64 = tokenStr;
        receiveStore.showReceiveTokens = true;
        await this.addPendingTokenToHistory(tokenStr);
      }
    },
    addPendingTokenToHistory: function (tokenStr: string, verbose = true) {
      const receiveStore = useReceiveTokensStore();
      const tokensStore = useTokensStore();
      if (tokensStore.tokenAlreadyInHistory(tokenStr)) {
        notifySuccess("Ecash already in history");
        receiveStore.showReceiveTokens = false;
        return;
      }
      const decodedToken = token.decode(tokenStr);
      if (decodedToken == undefined) {
        throw Error("could not decode token");
      }
      // get amount from decodedToken.token.proofs[..].amount
      const amount = token
        .getProofs(decodedToken)
        .reduce((sum, el) => (sum += el.amount), 0);

      tokensStore.addPendingToken({
        amount: amount,
        tokenStr: tokenStr,
        mint: token.getMint(decodedToken),
        unit: token.getUnit(decodedToken),
        label: "",
        description: receiveStore.receiveData.description ?? "",
        bucketId: DEFAULT_BUCKET_ID,
      });
      receiveStore.showReceiveTokens = false;
      // show success notification
      if (verbose) {
        notifySuccess("Ecash added to history.");
      }
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
