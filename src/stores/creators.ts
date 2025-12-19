import { defineStore } from "pinia";
import { ref } from "vue";
import { db } from "./dexie";
import { getEventHash, signEvent, publishEvent } from "./nostr";
import { nip19 } from "nostr-tools";
import { Event as NostrEvent } from "nostr-tools";
import type { Tier } from "./types";
import {
  queryNutzapTiers,
  toHex,
  type NostrEvent as RelayEvent,
} from "@/nostr/relayClient";
import { safeUseLocalStorage } from "src/utils/safeLocalStorage";
import { normalizeTierMediaItems } from "src/utils/validateMedia";
import { debug } from "src/js/logger";
import { type NutzapProfileDetails } from "@/nutzap/profileCache";
import {
  NETWORK_CHANGE_WARNING,
  RecoverableDiscoveryError,
  isNetworkChangeWarning,
  useDiscovery,
} from "src/api/fundstrDiscovery";
import { findProfiles, toNpub, type PhonebookProfile } from "src/api/phonebook";
import { waitForOnline } from "src/composables/useNetworkStatus";
import type {
  Creator as DiscoveryCreator,
  CreatorTier as DiscoveryCreatorTier,
} from "src/lib/fundstrApi";
import { isValidTier, normalizeTierFrequency } from "src/utils/tiers";
import {
  fetchCreators as fetchLegacyCreators,
  type Creator as FundstrCreator,
} from "src/lib/fundstrApi";
import { useNdk } from "src/composables/useNdk";
import { shortenNpub } from "src/utils/profile";
import { FEATURED_CREATORS as CONFIG_FEATURED_CREATORS } from "src/config/featured-creators";
import { parseTiersContent as parseNutzapTiersContent } from "@/nutzap/profileShared";
import type { Tier as NutzapTier } from "@/nutzap/types";
import {
  addTelemetryBreadcrumb,
  captureTelemetryWarning,
} from "src/utils/telemetry/sentry";

export { FEATURED_CREATORS } from "src/config/featured-creators";

export interface CreatorProfile extends FundstrCreator {
  tierSecurityBlocked?: boolean | null;
  tierFetchFailed?: boolean | null;
  refreshedInBackground?: boolean | null;
}
export type CreatorRow = CreatorProfile;

export type CreatorSearchFilters = {
  hasTiers?: boolean;
  hasLightning?: boolean;
  featured?: boolean;
  nip05Verified?: boolean;
  fundstrCreator?: boolean;
  signalOnly?: boolean;
};

export type CreatorSearchSort = "relevance" | "followers";

const FRESH_RETRY_BASE_MS = 1500;
const FRESH_RETRY_MAX_MS = 30000;
const FRESH_FALLBACK_LOG_DEBOUNCE_MS = 60000;
const TIER_SECURITY_COOLDOWN_MS = 5 * 60 * 1000;
const FIREFOX_TIER_SECURITY_WARNING =
  "Firefox may block tier lookups. Disable Enhanced Tracking Protection for staging.fundstr.me to load fresh donation tiers. We're showing cached tier data until then.";

const BUNDLE_CACHE_EXPIRY_MS = 3 * 60 * 60 * 1000;
const BUNDLE_FALLBACK_DELAY_MS = 1400;
const DISCOVERY_TIER_TIMEOUT_MS = 5000;
const DISCOVERY_ENRICHMENT_WARNING =
  "Discovery enrichment failed. Showing phonebook details without discovery extras.";

const inFlightBundleRequests = new Map<string, Promise<FundstrProfileBundle>>();

let nextProfileFreshAttemptAt = 0;
let profileFreshFailureCount = 0;
let lastProfileFallbackLogAt = 0;

let nextTiersFreshAttemptAt = 0;
let tiersFreshFailureCount = 0;
let lastTierFallbackLogAt = 0;
let tierSecurityCooldownUntil = 0;
let lastTierSecurityLogAt = 0;
let lastTierTimeoutWarnAt = 0;
let searchRequestCounter = 0;

function getBundleFallbackDelayMs(): number {
  let delay = BUNDLE_FALLBACK_DELAY_MS;
  if (typeof navigator === "undefined") {
    return delay;
  }
  const connection = (navigator as any)?.connection;
  if (!connection) {
    return delay;
  }
  if (connection.saveData) {
    delay = Math.max(delay, 2400);
  }
  const effectiveType = typeof connection.effectiveType === "string" ? connection.effectiveType : "";
  if (effectiveType === "2g") {
    delay = Math.max(delay, 3400);
  } else if (effectiveType === "3g") {
    delay = Math.max(delay, 2600);
  }
  if (typeof connection.rtt === "number" && Number.isFinite(connection.rtt)) {
    if (connection.rtt >= 600) {
      delay = Math.max(delay, 3200);
    } else if (connection.rtt >= 350) {
      delay = Math.max(delay, 2200);
    }
  }
  return delay;
}

export class FundstrProfileFetchError extends Error {
  fallbackAttempted: boolean;

  constructor(
    message: string,
    {
      fallbackAttempted = false,
      cause,
    }: { fallbackAttempted?: boolean; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "FundstrProfileFetchError";
    this.fallbackAttempted = fallbackAttempted;
    if (cause !== undefined) {
      (this as any).cause = cause;
    }
  }
}

function collectRelayHintsFromProfile(
  profile: Record<string, any> | null,
  profileEvent: RelayEvent | null,
  profileDetails: NutzapProfileDetails | null,
): string[] {
  const hints = new Set<string>();
  const append = (value?: unknown) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    hints.add(trimmed);
  };
  if (Array.isArray(profile?.relays)) {
    for (const relay of profile.relays) append(relay);
  } else if (profile?.relays && typeof profile.relays === "object") {
    for (const relay of Object.keys(profile.relays)) append(relay);
  }
  if (profileDetails?.relays) {
    for (const relay of profileDetails.relays) append(relay);
  }
  for (const tag of profileEvent?.tags ?? []) {
    if (tag[0] === "relay" || tag[0] === "r") {
      append(tag[1]);
    }
  }
  return Array.from(hints);
}

function isDomException(error: unknown): boolean {
  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return true;
  }
  const name = (error as { name?: unknown }).name;
  return typeof name === "string" && name === "DOMException";
}

function isSecurityDomException(error: unknown): boolean {
  if (!isDomException(error)) {
    return false;
  }
  const domError = error as DOMException & { code?: unknown };
  const securityErrCode =
    typeof DOMException !== "undefined" && typeof DOMException.SECURITY_ERR === "number"
      ? DOMException.SECURITY_ERR
      : 18;
  if (domError.name === "SecurityError") {
    return true;
  }
  if (typeof domError.code === "number" && domError.code === securityErrCode) {
    return true;
  }
  return false;
}

function isTierSecurityBlockedError(error: unknown): boolean {
  return isSecurityDomException(error);
}

function isAbortError(error: unknown): boolean {
  const name = (error as { name?: unknown })?.name;
  if (name === "AbortError") {
    return true;
  }
  if (!isDomException(error)) {
    return false;
  }
  const domError = error as DOMException & { code?: unknown };
  const abortErrCode =
    typeof DOMException !== "undefined" && typeof DOMException.ABORT_ERR === "number"
      ? DOMException.ABORT_ERR
      : 20;
  return typeof domError.code === "number" && domError.code === abortErrCode;
}

function hasNetworkChangeWarning(warnings: string[]): boolean {
  return warnings.some((warning) => isNetworkChangeWarning(warning));
}

function logTierSecurityError(
  id: string,
  phase: "cached" | "fresh",
  error: unknown,
): void {
  tierSecurityCooldownUntil = Date.now() + TIER_SECURITY_COOLDOWN_MS;
  const nowWarn = Date.now();
  if (nowWarn - lastTierSecurityLogAt > FRESH_FALLBACK_LOG_DEBOUNCE_MS) {
    console.warn("fetchFundstrProfileBundle tier lookup blocked by browser security policy", {
      id,
      phase,
      error,
    });
    lastTierSecurityLogAt = nowWarn;
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function cloneDiscoveryProfile(
  profile: Record<string, unknown> | null | undefined,
): Record<string, any> | null {
  if (!isRecord(profile)) {
    return null;
  }
  try {
    return JSON.parse(JSON.stringify(profile)) as Record<string, any>;
  } catch (error) {
    console.warn("Failed to deep-clone discovery profile payload", error);
    return { ...(profile as Record<string, any>) };
  }
}

function extractProfileDetailsFromDiscovery(
  profile: Record<string, any> | null,
): NutzapProfileDetails | null {
  if (!profile) {
    return null;
  }

  const trustedMints = new Set<string>();
  const relays = new Set<string>();
  let p2pk = "";
  let tierAddr: string | undefined;
  let displayName: string | undefined;
  let name: string | undefined;
  let about: string | undefined;
  let picture: string | undefined;

  const appendMint = (value: unknown) => {
    if (!Array.isArray(value)) {
      return;
    }
    for (const entry of value) {
      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (trimmed) {
          trustedMints.add(trimmed);
        }
      }
    }
  };

  const appendRelays = (value: unknown) => {
    if (!value) {
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") {
          const trimmed = entry.trim();
          if (trimmed) {
            relays.add(trimmed);
          }
        }
      }
    } else if (isRecord(value)) {
      for (const key of Object.keys(value)) {
        const trimmed = key.trim();
        if (trimmed) {
          relays.add(trimmed);
        }
      }
    }
  };

  const considerRecord = (candidate: unknown) => {
    if (!isRecord(candidate)) {
      return;
    }
    if (
      typeof candidate.display_name === "string" &&
      candidate.display_name.trim()
    ) {
      displayName ??= candidate.display_name.trim();
    }
    if (typeof candidate.displayName === "string" && candidate.displayName.trim()) {
      displayName ??= candidate.displayName.trim();
    }
    if (typeof candidate.name === "string" && candidate.name.trim()) {
      name ??= candidate.name.trim();
    }
    if (typeof candidate.about === "string" && candidate.about.trim()) {
      about ??= candidate.about.trim();
    }
    if (typeof candidate.picture === "string" && candidate.picture.trim()) {
      picture ??= candidate.picture.trim();
    }
    if (typeof candidate.p2pk === "string" && candidate.p2pk.trim()) {
      p2pk = candidate.p2pk.trim();
    }
    if (typeof candidate.p2pkPubkey === "string" && candidate.p2pkPubkey.trim()) {
      p2pk = candidate.p2pkPubkey.trim();
    }
    if (typeof candidate.p2pk_pubkey === "string" && candidate.p2pk_pubkey.trim()) {
      p2pk = candidate.p2pk_pubkey.trim();
    }
    appendMint(candidate.mints);
    appendMint(candidate.trustedMints);
    appendMint(candidate.trusted_mints);
    appendRelays(candidate.relays);
    if (typeof candidate.tierAddr === "string" && candidate.tierAddr.trim()) {
      tierAddr = candidate.tierAddr.trim();
    }
    if (typeof candidate.tier_addr === "string" && candidate.tier_addr.trim()) {
      tierAddr = candidate.tier_addr.trim();
    }
  };

  considerRecord(profile);
  considerRecord(profile.nutzap);
  considerRecord(profile.nutzapProfile);
  considerRecord(profile.nutzap_profile);

  const mintList = Array.from(trustedMints);
  const relayList = Array.from(relays);

  const hasMetadata = Boolean(
    (displayName && displayName.length) ||
      (name && name.length) ||
      (about && about.length) ||
      (picture && picture.length),
  );

  if (!p2pk && mintList.length === 0 && relayList.length === 0 && !tierAddr && !hasMetadata) {
    return null;
  }

  return {
    p2pkPubkey: p2pk,
    trustedMints: mintList,
    relays: relayList,
    tierAddr,
    display_name: displayName,
    name,
    about,
    picture,
  };
}

function convertDiscoveryTier(tier: DiscoveryCreatorTier): Tier | null {
  if (!tier || typeof tier.id !== "string") {
    return null;
  }
  const id = tier.id.trim();
  if (!id) {
    return null;
  }
  const title = typeof tier.name === "string" ? tier.name : "";
  const amountMsat =
    typeof tier.amountMsat === "number" && Number.isFinite(tier.amountMsat)
      ? tier.amountMsat
      : null;
  const price_sats =
    amountMsat !== null ? Math.max(0, Math.round(amountMsat / 1000)) : 0;
  const description = typeof tier.description === "string" ? tier.description : "";

  const media = Array.isArray(tier.media) ? [...tier.media] : undefined;
  const frequency = normalizeTierFrequency(tier.cadence ?? (tier as any).frequency);

  const converted: Tier = {
    id,
    name: title,
    price_sats,
    description,
    media,
    frequency,
  };

  return isValidTier(converted) ? converted : null;
}

function convertNutzapTierToDiscoveryTier(
  tier: NutzapTier,
): DiscoveryCreatorTier | null {
  if (!tier || typeof tier.id !== "string") {
    return null;
  }
  const id = tier.id.trim();
  if (!id) {
    return null;
  }

  const name = typeof tier.title === "string" ? tier.title : "";
  const price = Number.isFinite(tier.price) ? Number(tier.price) : null;
  const amountMsat = price !== null ? Math.max(0, Math.round(price * 1000)) : null;
  const cadence = typeof tier.frequency === "string" ? tier.frequency : null;
  const description =
    typeof tier.description === "string" && tier.description.length
      ? tier.description
      : null;
  const media = normalizeTierMediaItems(tier.media);

  return {
    id,
    name,
    amountMsat,
    cadence,
    description,
    media,
  };
}

export interface FundstrProfileBundle {
  profile: Record<string, any> | null;
  profileEvent: RelayEvent | null;
  followers: number | null;
  following: number | null;
  joined: number | null;
  profileDetails: NutzapProfileDetails | null;
  relayHints: string[];
  fetchedFromFallback: boolean;
  tierDataFresh: boolean;
  tierSecurityBlocked: boolean;
  tierFetchFailed: boolean;
  tiers: Tier[] | null;
  cacheHit?: boolean;
  refreshedInBackground?: boolean;
}

export interface FetchFundstrProfileBundleOptions {
  forceRefresh?: boolean;
}

async function fetchFundstrProfileBundleFromDiscovery(
  pubkeyInput: string,
  options: FetchFundstrProfileBundleOptions = {},
): Promise<FundstrProfileBundle> {
  const discovery = useDiscovery();
  const pubkey = toHex(pubkeyInput);
  const normalizedPubkey = pubkey.toLowerCase();
  const forceRefresh = Boolean(options?.forceRefresh);
  let lastError: unknown = null;

  const findCreatorMatch = (
    results: DiscoveryCreator[] | undefined,
  ): DiscoveryCreator | null => {
    if (!Array.isArray(results)) {
      return null;
    }
    for (const entry of results) {
      if (typeof entry?.pubkey !== "string") {
        continue;
      }
      if (entry.pubkey.toLowerCase() === normalizedPubkey) {
        return entry;
      }
    }
    return null;
  };

  interface CreatorQueryResult {
    query: string;
    cached: DiscoveryCreator | null;
    fresh: DiscoveryCreator | null;
    freshError: unknown | null;
  }

  const fetchCreatorByQuery = async (query: string): Promise<CreatorQueryResult> => {
    const trimmed = typeof query === "string" ? query.trim() : "";
    if (!trimmed) {
      return { query: "", cached: null, fresh: null, freshError: null };
    }

    let cached: DiscoveryCreator | null = null;
    try {
      const response = await discovery.getCreators({ q: trimmed, fresh: false });
      cached = findCreatorMatch(response.results as DiscoveryCreator[]);
    } catch (error) {
      lastError = error;
      console.warn("fetchFundstrProfileBundle cached discovery query failed", {
        query: trimmed,
        error,
      });
    }

    let fresh: DiscoveryCreator | null = null;
    let freshError: unknown | null = null;
    const now = Date.now();
    const allowFresh = forceRefresh || now >= nextProfileFreshAttemptAt;
    const shouldFetchFresh = (forceRefresh || !cached) && allowFresh;
    if (shouldFetchFresh) {
      try {
        const response = await discovery.getCreators({
          q: trimmed,
          fresh: true,
          timeoutMs: undefined,
        });
        fresh = findCreatorMatch(response.results as DiscoveryCreator[]);
        profileFreshFailureCount = 0;
        nextProfileFreshAttemptAt = 0;
      } catch (error) {
        freshError = error;
        lastError = error;
        if (!forceRefresh) {
          profileFreshFailureCount = Math.min(profileFreshFailureCount + 1, 6);
          const delay = Math.min(
            FRESH_RETRY_BASE_MS * 2 ** Math.max(profileFreshFailureCount - 1, 0),
            FRESH_RETRY_MAX_MS,
          );
          nextProfileFreshAttemptAt = Date.now() + delay;
        }
        console.error("fetchFundstrProfileBundle discovery query failed", {
          query: trimmed,
          error,
        });
      }
    }

    return { query: trimmed, cached, fresh, freshError };
  };

  const creatorResults: CreatorQueryResult[] = [];
  creatorResults.push(await fetchCreatorByQuery(pubkey));

  let npubQuery: string | null = null;
  try {
    npubQuery = nip19.npubEncode(pubkey);
  } catch (error) {
    npubQuery = null;
    console.warn("Failed to encode pubkey to npub for discovery lookup", error);
  }

  if (
    (!creatorResults[0].fresh && !creatorResults[0].cached) ||
    (creatorResults[0].cached && !creatorResults[0].fresh && npubQuery)
  ) {
    if (npubQuery) {
      creatorResults.push(await fetchCreatorByQuery(npubQuery));
    }
  }

  const firstAvailable = creatorResults.find(
    (result) => result.cached || result.fresh,
  );
  const freshMatch = creatorResults.find((result) => result.fresh);
  const finalCreator = freshMatch?.fresh ?? firstAvailable?.cached ?? null;
  const initialCreator = firstAvailable?.cached ?? firstAvailable?.fresh ?? finalCreator ?? null;

  if (!finalCreator) {
    throw new FundstrProfileFetchError("No profile records returned from discovery", {
      fallbackAttempted: creatorResults.some((result) => Boolean(result.cached)),
      cause: lastError ?? undefined,
    });
  }

  let usedCachedProfileFallback = false;
  if (!freshMatch?.fresh && firstAvailable?.cached) {
    usedCachedProfileFallback = true;
    if (firstAvailable.freshError) {
      const nowWarn = Date.now();
      if (nowWarn - lastProfileFallbackLogAt > FRESH_FALLBACK_LOG_DEBOUNCE_MS) {
        debug("fetchFundstrProfileBundle using cached discovery profile", {
          query: firstAvailable.query,
          error: firstAvailable.freshError,
        });
        lastProfileFallbackLogAt = nowWarn;
      }
    } else {
      const nowWarn = Date.now();
      if (nowWarn - lastProfileFallbackLogAt > FRESH_FALLBACK_LOG_DEBOUNCE_MS) {
        debug("fetchFundstrProfileBundle using cached discovery profile", {
          query: firstAvailable?.query ?? pubkey,
          reason: "fresh profile result unavailable",
        });
        lastProfileFallbackLogAt = nowWarn;
      }
    }
  }

  const tierIdentifiers: string[] = [pubkey];
  if (npubQuery) {
    tierIdentifiers.push(npubQuery);
  }

  interface TierQueryResult {
    id: string;
    cached: DiscoveryCreatorTier[];
    fresh: DiscoveryCreatorTier[] | null;
    freshError: unknown | null;
    securityBlocked: boolean;
    aborted: boolean;
    backoffBlocked: boolean;
    nextRetryAt: number | null;
  }

  const fetchTiersForId = async (id: string): Promise<TierQueryResult> => {
    const cached: DiscoveryCreatorTier[] = [];
    let nextRetryAt: number | null = null;
    let securityBlocked = false;
    try {
      const response = await discovery.getCreatorTiers({
        id,
        fresh: false,
        timeoutMs: DISCOVERY_TIER_TIMEOUT_MS,
      });
      if (Array.isArray(response.tiers)) {
        cached.push(...(response.tiers as DiscoveryCreatorTier[]));
      }
    } catch (error) {
      lastError = error;
      if (isTierSecurityBlockedError(error)) {
        logTierSecurityError(id, "cached", error);
        securityBlocked = true;
        nextTiersFreshAttemptAt = Math.max(
          nextTiersFreshAttemptAt,
          tierSecurityCooldownUntil,
        );
      } else {
        const aborted = isAbortError(error);
        const logMessage = aborted
          ? "fetchFundstrProfileBundle cached tier lookup aborted"
          : "fetchFundstrProfileBundle cached tier lookup failed";
        console.warn(logMessage, {
          id,
          error,
          retryable: aborted,
        });
      }
    }
    let fresh: DiscoveryCreatorTier[] | null = null;
    let freshError: unknown | null = null;
    let aborted = false;
    const now = Date.now();
    const allowFreshBase =
      forceRefresh || (now >= nextTiersFreshAttemptAt && now >= tierSecurityCooldownUntil);
    const allowFresh = securityBlocked ? false : allowFreshBase;
    const backoffBlocked =
      !forceRefresh &&
      !securityBlocked &&
      cached.length === 0 &&
      !allowFreshBase &&
      now < nextTiersFreshAttemptAt;
    const shouldFetchFresh = (forceRefresh || cached.length === 0) && allowFresh;
    if (shouldFetchFresh) {
      try {
        const request: { id: string; fresh?: boolean; timeoutMs?: number } = {
          id,
          fresh: true,
          timeoutMs: DISCOVERY_TIER_TIMEOUT_MS,
        };
        const response = await discovery.getCreatorTiers(request);
        if (Array.isArray(response.tiers)) {
          fresh = response.tiers as DiscoveryCreatorTier[];
        } else {
          fresh = [];
        }
        tiersFreshFailureCount = 0;
        nextTiersFreshAttemptAt = 0;
        tierSecurityCooldownUntil = 0;
      } catch (error) {
        freshError = error;
        fresh = null;
        lastError = error;
        if (isTierSecurityBlockedError(error)) {
          logTierSecurityError(id, "fresh", error);
          securityBlocked = true;
          nextTiersFreshAttemptAt = Math.max(
            nextTiersFreshAttemptAt,
            tierSecurityCooldownUntil,
          );
        } else {
          aborted = isAbortError(error);
          if (!forceRefresh) {
            tiersFreshFailureCount = Math.min(tiersFreshFailureCount + 1, 6);
            const delay = Math.min(
              FRESH_RETRY_BASE_MS * 2 ** Math.max(tiersFreshFailureCount - 1, 0),
              FRESH_RETRY_MAX_MS,
            );
            nextTiersFreshAttemptAt = Date.now() + delay;
            nextRetryAt = nextTiersFreshAttemptAt;
          }

          const logContext = {
            id,
            error,
            cachedCount: cached.length,
            retryable: aborted || !forceRefresh,
            nextRetryAt: aborted || !forceRefresh ? nextTiersFreshAttemptAt : undefined,
            timeoutMs: DISCOVERY_TIER_TIMEOUT_MS,
          };

          if (aborted) {
            const nowWarn = Date.now();
            if (nowWarn - lastTierTimeoutWarnAt > FRESH_FALLBACK_LOG_DEBOUNCE_MS) {
              console.warn(
                "fetchFundstrProfileBundle discovery tier lookup timed out; using cached tiers",
                logContext,
              );
              lastTierTimeoutWarnAt = nowWarn;
            }
            addTelemetryBreadcrumb("discovery tier lookup timed out", logContext, "warning");
            captureTelemetryWarning("discovery tier lookup timed out", logContext);
          } else {
            console.error("fetchFundstrProfileBundle discovery tier lookup failed", logContext);
            addTelemetryBreadcrumb("discovery tier lookup failed", logContext, "error");
          }
        }
      }
    }

    return {
      id,
      cached,
      fresh,
      freshError,
      securityBlocked,
      aborted,
      backoffBlocked,
      nextRetryAt,
    };
  };

  const tierResults: TierQueryResult[] = [];
  for (const id of tierIdentifiers) {
    tierResults.push(await fetchTiersForId(id));
    const lastTierResult = tierResults[tierResults.length - 1];
    if (
      lastTierResult.fresh !== null ||
      (lastTierResult.aborted && lastTierResult.cached.length > 0)
    ) {
      break;
    }
  }

  const tierLookupFailed =
    tierResults.length > 0 &&
    tierResults.every(
      (result) =>
        result.fresh === null &&
        result.cached.length === 0 &&
        Boolean(result.freshError),
    );

  const tierLookupAborted = tierResults.some((result) => result.aborted);
  const tierLookupBackoff =
    tierResults.length > 0 &&
    tierResults.every(
      (result) => result.fresh === null && result.cached.length === 0,
    ) &&
    tierResults.some((result) => result.backoffBlocked);

  const tierSecurityBlocked = tierResults.some((result) => result.securityBlocked);
  const tierFreshMatch = tierResults.find((result) => result.fresh !== null);
  const tierFallbackSource = tierResults.find((result) => result.cached.length > 0);
  const tierRetryPlan = tierResults
    .filter((result) => result.nextRetryAt)
    .map((result) => ({ id: result.id, nextRetryAt: result.nextRetryAt }))
    .sort((a, b) => (a.nextRetryAt ?? 0) - (b.nextRetryAt ?? 0));
  let finalTierCandidates = tierFreshMatch
    ? [...(tierFreshMatch.fresh ?? [])]
    : tierFallbackSource?.cached
      ? [...tierFallbackSource.cached]
      : [];
  let tierFetchFailed =
    tierLookupFailed ||
    tierLookupBackoff ||
    (tierLookupAborted && !tierFallbackSource);
  let initialTierCandidates = tierFallbackSource?.cached?.length
    ? [...tierFallbackSource.cached]
    : tierFreshMatch?.fresh
      ? [...tierFreshMatch.fresh]
      : [];

  let usedCachedTierFallback = false;
  let usedNutzapTierFallback = false;
  if (!tierFreshMatch && tierFallbackSource?.cached?.length) {
    usedCachedTierFallback = true;
    if (tierFallbackSource.freshError) {
      const nowWarn = Date.now();
      if (nowWarn - lastTierFallbackLogAt > FRESH_FALLBACK_LOG_DEBOUNCE_MS) {
        debug("fetchFundstrProfileBundle using cached discovery tiers", {
          id: tierFallbackSource.id,
          error: tierFallbackSource.freshError,
        });
        lastTierFallbackLogAt = nowWarn;
      }
    } else {
      const nowWarn = Date.now();
      if (nowWarn - lastTierFallbackLogAt > FRESH_FALLBACK_LOG_DEBOUNCE_MS) {
        debug("fetchFundstrProfileBundle using cached discovery tiers", {
          id: tierFallbackSource.id,
          reason: "fresh tier result unavailable",
        });
        lastTierFallbackLogAt = nowWarn;
      }
    }
  }

  if (tierLookupAborted && tierFallbackSource?.cached?.length) {
    addTelemetryBreadcrumb(
      "discovery tiers served from cache after timeout",
      {
        id: tierFallbackSource.id,
        cachedCount: tierFallbackSource.cached.length,
        retryPlan: tierRetryPlan,
      },
      "warning",
    );
  }

  const shouldAttemptNutzapFallback =
    tierResults.length > 0 &&
    tierResults.every((result) => result.fresh === null) &&
    tierResults.every((result) => result.cached.length === 0) &&
    tierResults.some((result) => !!result.freshError);

  if (shouldAttemptNutzapFallback) {
    const nutzapQueryInput =
      typeof finalCreator?.pubkey === "string" && finalCreator.pubkey.trim()
        ? finalCreator.pubkey
        : typeof npubQuery === "string" && npubQuery
          ? npubQuery
          : tierResults[0]?.id ?? pubkey;
    try {
      const nutzapEvent = await queryNutzapTiers(nutzapQueryInput);
      const recoveredTiers =
        nutzapEvent?.content
          ? parseNutzapTiersContent(nutzapEvent.content)
              .map((tier) => convertNutzapTierToDiscoveryTier(tier))
              .filter((tier): tier is DiscoveryCreatorTier => tier !== null)
          : [];
      if (recoveredTiers.length > 0) {
        finalTierCandidates = [...recoveredTiers];
        initialTierCandidates = [...recoveredTiers];
        usedNutzapTierFallback = true;
        tierFetchFailed = false;
        const nowWarn = Date.now();
        if (nowWarn - lastTierFallbackLogAt > FRESH_FALLBACK_LOG_DEBOUNCE_MS) {
          debug("fetchFundstrProfileBundle recovered tiers via nutzap fallback", {
            id: nutzapQueryInput,
          });
          lastTierFallbackLogAt = nowWarn;
        }
      }
    } catch (error) {
      lastError = lastError ?? error;
      console.warn("fetchFundstrProfileBundle nutzap tier fallback failed", {
        id: nutzapQueryInput,
        error,
      });
    }
  }

  const selectCreatorForBundle = (
    source: DiscoveryCreator | null,
    tiers: DiscoveryCreatorTier[],
  ): DiscoveryCreator | null => {
    if (!source) {
      return null;
    }
    return {
      ...(source as DiscoveryCreator),
      tiers,
    };
  };

  const initialCreatorForBundle = selectCreatorForBundle(
    initialCreator,
    initialTierCandidates,
  );
  const finalCreatorForBundle = selectCreatorForBundle(
    finalCreator,
    finalTierCandidates,
  );

  const baseBundle = finalCreatorForBundle
    ? buildBundleFromDiscoveryCreator(finalCreatorForBundle)
    : initialCreatorForBundle
      ? buildBundleFromDiscoveryCreator(initialCreatorForBundle)
      : null;

  if (!baseBundle) {
    throw new FundstrProfileFetchError("No profile records returned from discovery", {
      fallbackAttempted: usedCachedProfileFallback || usedCachedTierFallback,
      cause: lastError ?? undefined,
    });
  }

  const normalizedTiers = Array.isArray(baseBundle.tiers)
    ? baseBundle.tiers.map((tier) => normalizeTier(tier))
    : null;

  const tierDataFresh =
    !usedCachedTierFallback && !tierSecurityBlocked && !usedNutzapTierFallback;

  if (finalTierCandidates.length > 0) {
    tierFetchFailed = false;
  }

  return {
    ...baseBundle,
    tierDataFresh,
    tierSecurityBlocked,
    tierFetchFailed,
    tiers: normalizedTiers && normalizedTiers.length ? normalizedTiers : null,
    fetchedFromFallback:
      usedCachedProfileFallback || usedCachedTierFallback || usedNutzapTierFallback,
  };
}

function buildBundleFromCachedCreatorProfile(
  creator: CreatorProfile,
  details: NutzapProfileDetails | null,
): FundstrProfileBundle {
  const profile = creator.profile ? JSON.parse(JSON.stringify(creator.profile)) : null;
  const profileDetails = details ?? extractProfileDetailsFromDiscovery(profile);
  const relayHints = collectRelayHintsFromProfile(profile, null, profileDetails);

  const followers =
    typeof creator.followers === "number" && Number.isFinite(creator.followers)
      ? creator.followers
      : null;
  const following =
    typeof creator.following === "number" && Number.isFinite(creator.following)
      ? creator.following
      : null;
  const joined =
    typeof creator.joined === "number" && Number.isFinite(creator.joined)
      ? creator.joined
      : null;

  const tiers = Array.isArray(creator.tiers)
    ? creator.tiers.map((tier) => normalizeTier(tier))
    : null;

  return {
    profile,
    profileEvent: null,
    followers,
    following,
    joined,
    profileDetails,
    relayHints,
    fetchedFromFallback: Boolean((creator as any).fetchedFromFallback),
    tierDataFresh: creator.tierDataFresh !== false,
    tierSecurityBlocked: creator.tierSecurityBlocked === true,
    tierFetchFailed: creator.tierFetchFailed === true,
    tiers,
    cacheHit: true,
  };
}

function buildBundleFromLegacyCreator(creator: FundstrCreator): FundstrProfileBundle {
  const profile = creator.profile ? JSON.parse(JSON.stringify(creator.profile)) : null;
  const profileDetails = extractProfileDetailsFromDiscovery(profile);
  const relayHints = collectRelayHintsFromProfile(profile, null, profileDetails);

  const followers =
    typeof creator.followers === "number" && Number.isFinite(creator.followers)
      ? creator.followers
      : null;
  const following =
    typeof creator.following === "number" && Number.isFinite(creator.following)
      ? creator.following
      : null;
  const joined =
    typeof creator.joined === "number" && Number.isFinite(creator.joined)
      ? creator.joined
      : null;

  const tiers = Array.isArray(creator.tiers)
    ? creator.tiers
        .map((tier) => convertDiscoveryTier(tier as unknown as DiscoveryCreatorTier))
        .filter((tier): tier is Tier => tier !== null && isValidTier(tier))
    : null;

  const tierSecurityBlocked = (creator as any).tierSecurityBlocked === true;
  const tierFetchFailed = (creator as any).tierFetchFailed === true;
  const tierDataFresh = (creator as any).tierDataFresh === false ? false : true;

  return {
    profile,
    profileEvent: null,
    followers,
    following,
    joined,
    profileDetails,
    relayHints,
    fetchedFromFallback: true,
    tierDataFresh,
    tierSecurityBlocked,
    tierFetchFailed,
    tiers: tiers && tiers.length ? tiers : null,
  };
}

async function loadBundleFromCache(
  pubkeyHex: string,
  forceRefresh: boolean,
): Promise<FundstrProfileBundle | null> {
  if (forceRefresh) {
    return null;
  }

  try {
    const cached = await db.profiles.get(pubkeyHex);
    if (!cached) {
      return null;
    }
    if (Date.now() - cached.fetchedAt > BUNDLE_CACHE_EXPIRY_MS) {
      return null;
    }

    const creator = cached.profile as CreatorProfile | null;
    if (!creator) {
      return null;
    }

    let details: NutzapProfileDetails | null = null;
    try {
      const detailsRow = await db.nutzapProfiles.get(pubkeyHex);
      details = detailsRow?.profile ?? null;
    } catch (error) {
      console.warn("fetchFundstrProfileBundle failed to load cached profile details", {
        pubkey: pubkeyHex,
        error,
      });
    }

    return buildBundleFromCachedCreatorProfile(creator, details);
  } catch (error) {
    console.warn("fetchFundstrProfileBundle failed to load Dexie cache", {
      pubkey: pubkeyHex,
      error,
    });
    return null;
  }
}

async function fetchBundleFromLegacy(pubkeyHex: string): Promise<FundstrProfileBundle> {
  const normalizedPubkey = pubkeyHex.toLowerCase();
  const tried = new Set<string>();
  const queries: string[] = [];
  if (pubkeyHex) {
    queries.push(pubkeyHex);
  }
  try {
    const npub = nip19.npubEncode(pubkeyHex);
    if (npub) {
      queries.push(npub);
    }
  } catch (error) {
    console.warn("Failed to encode pubkey to npub for nostr fallback", { pubkey: pubkeyHex, error });
  }

  let lastError: unknown = null;

  for (const query of queries) {
    const trimmed = typeof query === "string" ? query.trim() : "";
    if (!trimmed || tried.has(trimmed)) {
      continue;
    }
    tried.add(trimmed);

    try {
      const results = await fetchLegacyCreators(trimmed, 8, 0);
      const match = results.find((entry) => {
        if (!entry || typeof entry.pubkey !== "string") {
          return false;
        }
        return entry.pubkey.trim().toLowerCase() === normalizedPubkey;
      });
      if (match) {
        return buildBundleFromLegacyCreator(match);
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new FundstrProfileFetchError("No profile records returned from nostr fallback", {
    fallbackAttempted: true,
    cause: lastError ?? undefined,
  });
}

async function fetchFundstrProfileBundleNetwork(
  pubkeyHex: string,
  forceRefresh: boolean,
): Promise<FundstrProfileBundle> {
  const normalizedPubkey = pubkeyHex.toLowerCase();
  let fallbackStarted = false;
  let fallbackPromise: Promise<FundstrProfileBundle> | null = null;
  let fallbackError: unknown = null;
  let discoveryError: unknown = null;

  return await new Promise<FundstrProfileBundle>((resolve, reject) => {
    let settled = false;
    let discoverySettled = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanupTimer = () => {
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
    };

    const finalizeFailure = (cause: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanupTimer();
      if (cause instanceof FundstrProfileFetchError) {
        reject(cause);
        return;
      }
      reject(
        new FundstrProfileFetchError(
          "No profile records returned from discovery or fallback",
          {
            fallbackAttempted: true,
            cause,
          },
        ),
      );
    };

    const startFallback = (reason: "timeout" | "error") => {
      if (fallbackStarted) {
        return;
      }
      fallbackStarted = true;
      debug("discovery:timeout→nostr", {
        pubkey: normalizedPubkey,
        reason,
      });

      const promise = fetchBundleFromLegacy(pubkeyHex);
      fallbackPromise = promise;
      promise
        .then((bundle) => {
        if (settled) {
          return bundle;
        }
        settled = true;
        cleanupTimer();
        debug("nostr:fallback-hit", { pubkey: normalizedPubkey });
        resolve(bundle);
        return bundle;
      })
        .catch((error) => {
          fallbackError = error;
          if (discoverySettled && !settled) {
            finalizeFailure(error ?? discoveryError);
          }
        });
    };

    fallbackTimer = setTimeout(() => startFallback("timeout"), getBundleFallbackDelayMs());

    fetchFundstrProfileBundleFromDiscovery(pubkeyHex, { forceRefresh })
      .then(async (bundle) => {
        discoverySettled = true;
        if (settled) {
          if (!fallbackStarted) {
            return;
          }
          const creatorsStore = useCreatorsStore();
          const refreshedBundle = {
            ...bundle,
            refreshedInBackground: true,
          };
          try {
            await creatorsStore.applyBundleToCache(normalizedPubkey, refreshedBundle, {
              cacheHit: false,
              refreshedInBackground: true,
            });
            debug("discovery:background-refresh", {
              pubkey: normalizedPubkey,
              tierDataFresh: bundle.tierDataFresh,
            });
          } catch (error) {
            console.warn("[creators] Failed to apply background discovery refresh", {
              pubkey: normalizedPubkey,
              error,
            });
          }
          return;
        }
        settled = true;
        cleanupTimer();
        debug("discovery:hit", {
          pubkey: normalizedPubkey,
          fetchedFromFallback: bundle.fetchedFromFallback,
          tierDataFresh: bundle.tierDataFresh,
        });
        resolve(bundle);
      })
      .catch((error) => {
        discoveryError = error;
        discoverySettled = true;
        if (!fallbackStarted) {
          startFallback("error");
        }
        if (!fallbackStarted) {
          finalizeFailure(error);
          return;
        }
        if (fallbackPromise) {
          fallbackPromise.catch(() => {
            if (!settled) {
              finalizeFailure(fallbackError ?? discoveryError);
            }
          });
        }
      });
  });
}

export async function fetchFundstrProfileBundle(
  pubkeyInput: string,
  options: FetchFundstrProfileBundleOptions = {},
): Promise<FundstrProfileBundle> {
  const forceRefresh = Boolean(options?.forceRefresh);
  const pubkeyHex = toHex(pubkeyInput);
  const cacheKey = pubkeyHex.toLowerCase();

  const startNetworkFetch = (refresh: boolean): Promise<FundstrProfileBundle> => {
    const fetchPromise = (async () => {
      try {
        return await fetchFundstrProfileBundleNetwork(pubkeyHex, refresh);
      } finally {
        if (inFlightBundleRequests.get(cacheKey) === fetchPromise) {
          inFlightBundleRequests.delete(cacheKey);
        }
      }
    })();

    inFlightBundleRequests.set(cacheKey, fetchPromise);
    return fetchPromise;
  };

  if (!forceRefresh) {
    const cached = await loadBundleFromCache(cacheKey, forceRefresh);
    if (cached) {
      const existing = inFlightBundleRequests.get(cacheKey);
      if (!existing) {
        const refreshPromise = startNetworkFetch(true);
        refreshPromise.catch(() => {});
      }
      return { ...cached, cacheHit: true };
    }
  }

  const existing = inFlightBundleRequests.get(cacheKey);
  if (existing) {
    return existing;
  }

  return await startNetworkFetch(forceRefresh);
}

function buildBundleFromDiscoveryCreator(
  creator: DiscoveryCreator,
): FundstrProfileBundle {
  const profile = cloneDiscoveryProfile(creator.profile);
  const profileDetails = extractProfileDetailsFromDiscovery(profile);
  const relayHints = collectRelayHintsFromProfile(profile, null, profileDetails);

  const followers =
    typeof creator.followers === "number" && Number.isFinite(creator.followers)
      ? creator.followers
      : null;
  const following =
    typeof creator.following === "number" && Number.isFinite(creator.following)
      ? creator.following
      : null;
  const joined =
    typeof creator.joined === "number" && Number.isFinite(creator.joined)
      ? creator.joined
      : null;

  const tierCandidates: DiscoveryCreatorTier[] = Array.isArray(creator.tiers)
    ? (creator.tiers as DiscoveryCreatorTier[])
    : [];
  const tiers = tierCandidates
    .map((tier) => convertDiscoveryTier(tier))
    .filter((tier): tier is Tier => tier !== null && isValidTier(tier));

  return {
    profile,
    profileEvent: null,
    followers,
    following,
    joined,
    profileDetails,
    relayHints,
    fetchedFromFallback: false,
    tierDataFresh: true,
    tierSecurityBlocked: false,
    tierFetchFailed: false,
    tiers: tiers.length ? tiers : null,
  };
}

export interface CreatorWarmCache {
  profileLoaded?: boolean;
  profileDetails?: NutzapProfileDetails | null;
  profileEvent?: RelayEvent | null;
  profileEventId?: string | null;
  profileUpdatedAt?: number | null;
  tiersLoaded?: boolean;
  tiers?: Tier[] | null;
  tierEvent?: RelayEvent | null;
  tierEventId?: string | null;
  tierUpdatedAt?: number | null;
  tierDataFresh?: boolean | null;
  tierSecurityBlocked?: boolean | null;
  tierFetchFailed?: boolean | null;
  tierRelayFailures?: Record<string, number>;
  lastFundstrRelayFailureAt?: number | null;
  lastFundstrRelayFailureNotifiedAt?: number | null;
  refreshedInBackground?: boolean | null;
}

function parseCachedProfileContent(
  entry: CreatorWarmCache | undefined,
): Record<string, any> | null {
  if (!entry?.profileEvent?.content) {
    return null;
  }
  try {
    const parsed = JSON.parse(entry.profileEvent.content);
    if (parsed && typeof parsed === "object") {
      return { ...(parsed as Record<string, any>) };
    }
  } catch (error) {
    console.warn("Failed to parse cached profile content", error);
  }
  return null;
}

export interface PrefillCreatorCacheEntry {
  pubkey: string;
  profileEvent?: RelayEvent | null;
  tierEvent?: RelayEvent | null;
  profileDetails?: NutzapProfileDetails | null;
  tiers?: Tier[] | null;
}

function cloneRelayEvent(event: RelayEvent | null): RelayEvent | null {
  if (!event) return null;
  try {
    return JSON.parse(JSON.stringify(event)) as RelayEvent;
  } catch (e) {
    console.warn("Failed to clone relay event", e);
    return event;
  }
}

function cloneProfileDetails(
  details: NutzapProfileDetails | null | undefined,
): NutzapProfileDetails | null {
  if (!details) return null;
  return {
    p2pkPubkey: details.p2pkPubkey,
    trustedMints: Array.from(details.trustedMints ?? []),
    relays: Array.from(details.relays ?? []),
    tierAddr: details.tierAddr,
    display_name: details.display_name,
    name: details.name,
    about: details.about,
    picture: details.picture,
  };
}

function normalizeTier(tier: Tier): Tier {
  return {
    ...tier,
    price_sats: tier.price_sats ?? (tier as any).price ?? 0,
    ...(tier.perks && !tier.benefits ? { benefits: [tier.perks] } : {}),
    media: tier.media ? [...tier.media] : [],
  };
}

function cloneCreatorProfile(source: FundstrCreator): CreatorProfile {
  const profile = source.profile
    ? JSON.parse(JSON.stringify(source.profile))
    : null;
  const tierSummary = source.tierSummary
    ? { ...source.tierSummary }
    : source.tierSummary ?? null;
  const metrics = source.metrics ? { ...source.metrics } : source.metrics ?? null;
  const tiers = Array.isArray(source.tiers)
    ? source.tiers.map((tier) => ({ ...tier }))
    : source.tiers === undefined
      ? undefined
      : [];

  return {
    ...source,
    profile,
    tierSummary,
    metrics,
    tiers,
  };
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes"].includes(normalized);
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
}

function computeTierSummary(tiers: Tier[] | null | undefined) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return null;
  }
  const cheapest = tiers.reduce<number | null>((acc, tier) => {
    const price = Number.isFinite(tier.price_sats) ? tier.price_sats : 0;
    if (acc === null || price < acc) {
      return price;
    }
    return acc;
  }, null);
  return {
    count: tiers.length,
    cheapestPriceMsat:
      cheapest !== null && cheapest !== undefined ? Math.max(0, cheapest) * 1000 : null,
  };
}

function mergeDiscoveryIntoPhonebook(
  phonebookCreator: CreatorProfile,
  discoveryCreator: CreatorProfile,
): CreatorProfile {
  const merged: CreatorProfile = { ...phonebookCreator };

  const applyString = (value: unknown, setter: (value: string) => void) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (!trimmed) return;
    setter(trimmed);
  };

  const applyRecord = (value: unknown, setter: (value: Record<string, any>) => void) => {
    if (!isRecord(value) || Object.keys(value).length === 0) return;
    setter(value);
  };

  const applyArray = <T>(value: unknown, setter: (value: T[]) => void) => {
    if (!Array.isArray(value) || value.length === 0) return;
    setter(value as T[]);
  };

  const applyNumber = (value: unknown, setter: (value: number) => void) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      setter(value);
    }
  };

  const applyBoolean = (value: unknown, setter: (value: boolean) => void) => {
    if (value === true || value === false) {
      setter(value);
    }
  };

  applyString(discoveryCreator.displayName, (value) => {
    if (!merged.displayName) {
      merged.displayName = value;
    }
  });
  applyString(discoveryCreator.name, (value) => {
    if (!merged.name) {
      merged.name = value;
    }
  });
  applyString(discoveryCreator.about, (value) => {
    if (!merged.about) {
      merged.about = value;
    }
  });
  applyString(discoveryCreator.picture, (value) => {
    if (!merged.picture) {
      merged.picture = value;
    }
  });
  applyString(discoveryCreator.nip05, (value) => {
    if (!merged.nip05) {
      merged.nip05 = value;
    }
  });
  applyString(discoveryCreator.banner, (value) => {
    if (!merged.banner) {
      merged.banner = value;
    }
  });

  applyRecord(discoveryCreator.profile, (value) => {
    merged.profile = value;
  });
  applyRecord(discoveryCreator.metrics, (value) => {
    merged.metrics = value as any;
  });
  applyRecord(discoveryCreator.tierSummary, (value) => {
    merged.tierSummary = value as any;
  });

  applyArray(discoveryCreator.tiers, (value) => {
    merged.tiers = value as any;
  });

  applyNumber(discoveryCreator.followers, (value) => {
    merged.followers = value;
  });
  applyNumber(discoveryCreator.following, (value) => {
    merged.following = value;
  });
  applyNumber(discoveryCreator.joined, (value) => {
    merged.joined = value;
  });

  applyBoolean(discoveryCreator.tierDataFresh, (value) => {
    merged.tierDataFresh = value;
  });
  applyBoolean(discoveryCreator.tierSecurityBlocked, (value) => {
    merged.tierSecurityBlocked = value;
  });
  applyBoolean(discoveryCreator.tierFetchFailed, (value) => {
    merged.tierFetchFailed = value;
  });
  applyBoolean(discoveryCreator.featured, (value) => {
    merged.featured = value;
  });
  applyBoolean(discoveryCreator.hasLightning, (value) => {
    merged.hasLightning = value;
  });
  applyBoolean(discoveryCreator.hasTiers, (value) => {
    merged.hasTiers = value;
  });
  applyBoolean(discoveryCreator.isCreator, (value) => {
    merged.isCreator = value;
  });
  applyBoolean(discoveryCreator.isPersonal, (value) => {
    merged.isPersonal = value;
  });

  return merged;
}

export function mergeCreatorProfileWithFallback(
  fallbackProfile: CreatorProfile | null | undefined,
  incomingProfile: CreatorProfile | null | undefined,
): CreatorProfile | null {
  if (!fallbackProfile) {
    return incomingProfile ?? null;
  }
  if (!incomingProfile) {
    return fallbackProfile ?? null;
  }

  const merged: CreatorProfile = { ...fallbackProfile, ...incomingProfile };
  const applyNonEmptyString = (
    value: unknown,
    fallback: unknown,
    setter: (value: string) => void,
  ) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        setter(trimmed);
        return;
      }
    }
    if (typeof fallback === "string") {
      const trimmedFallback = fallback.trim();
      if (trimmedFallback) {
        setter(trimmedFallback);
      }
    }
  };

  applyNonEmptyString(incomingProfile.displayName, fallbackProfile.displayName, (value) => {
    merged.displayName = value;
  });
  applyNonEmptyString(incomingProfile.name, fallbackProfile.name, (value) => {
    merged.name = value;
  });
  applyNonEmptyString(incomingProfile.about, fallbackProfile.about, (value) => {
    merged.about = value;
  });
  applyNonEmptyString(incomingProfile.picture, fallbackProfile.picture, (value) => {
    merged.picture = value;
  });
  applyNonEmptyString(incomingProfile.nip05, fallbackProfile.nip05, (value) => {
    merged.nip05 = value;
  });
  applyNonEmptyString(incomingProfile.banner, fallbackProfile.banner, (value) => {
    merged.banner = value;
  });

  return merged;
}

function applyPhonebookOverrides(
  creator: CreatorProfile,
  phonebook: PhonebookProfile,
): CreatorProfile {
  const base = createCreatorFromPhonebook(phonebook);
  return mergeDiscoveryIntoPhonebook(base, creator);
}

function createCreatorFromPhonebook(profile: PhonebookProfile): CreatorProfile {
  const displayName =
    toNullableString(profile.display_name) ?? toNullableString(profile.name) ?? null;
  const name = toNullableString(profile.name);
  const about = toNullableString(profile.about);
  const picture = toNullableString(profile.picture);
  const nip05 = toNullableString(profile.nip05);

  return {
    pubkey: profile.pubkey.toLowerCase(),
    profile: null,
    followers: null,
    following: null,
    joined: null,
    displayName,
    name,
    about,
    nip05,
    picture,
    banner: null,
    tierSummary: null,
    metrics: null,
    tiers: [],
    tierDataFresh: null,
  };
}

function creatorHasTiers(profile: CreatorProfile): boolean {
  if (profile.hasTiers !== undefined && profile.hasTiers !== null) {
    return Boolean(profile.hasTiers);
  }

  if (profile.tierSummary && typeof profile.tierSummary.count === "number") {
    if (profile.tierSummary.count > 0) {
      return true;
    }
  }

  if (Array.isArray(profile.tiers) && profile.tiers.length > 0) {
    return true;
  }

  return false;
}

function creatorHasLightning(profile: CreatorProfile): boolean {
  if (profile.hasLightning !== undefined && profile.hasLightning !== null) {
    return Boolean(profile.hasLightning);
  }

  if (profile?.tierDataFresh === false) {
    return false;
  }

  const profileRecord = (profile?.profile ?? {}) as Record<string, unknown>;
  const metaRecord = (profile?.meta ?? {}) as Record<string, unknown>;

  const hasExplicitLightning = [
    metaRecord["lud16"],
    metaRecord["lud06"],
    profileRecord["lud16"],
    profileRecord["lud06"],
  ].some((value) => typeof value === "string" && value.trim().length > 0);

  if (hasExplicitLightning) {
    return true;
  }

  const hasNutzapSignal = [
    profileRecord["has_nutzap"],
    metaRecord["has_nutzap"],
    (profile as Record<string, unknown> | null | undefined)?.["has_nutzap"],
  ].some(isTruthyFlag);

  if (hasNutzapSignal) {
    return true;
  }

  if (creatorHasTiers(profile)) {
    return true;
  }

  const normalizedCandidates = [
    profileRecord["lightning"],
    metaRecord["lightning"],
    profileRecord["lightning_address"],
    metaRecord["lightning_address"],
  ].map((value) => (typeof value === "string" ? value.trim().toLowerCase() : ""));

  return normalizedCandidates.some((candidate) => candidate.includes("lnbc"));
}

export function creatorHasVerifiedNip05(profile: CreatorProfile): boolean {
  if (profile.nip05Verified !== undefined && profile.nip05Verified !== null) {
    return Boolean(profile.nip05Verified);
  }

  const profileRecord = (profile?.profile ?? {}) as Record<string, unknown>;
  const metaRecord = (profile?.meta ?? {}) as Record<string, unknown>;

  const verificationFlags = [
    (profile as Record<string, unknown> | null | undefined)?.["nip05_verified"],
    profileRecord["nip05_verified"],
    profileRecord["nip05Verified"],
    profileRecord["nip05_valid"],
    metaRecord["nip05_verified"],
    metaRecord["nip05Verified"],
    metaRecord["nip05_valid"],
    metaRecord["verified_nip05"],
    metaRecord["nip05_verified_value"],
  ];

  if (verificationFlags.some(isTruthyFlag)) {
    return true;
  }

  const nip05Value =
    toNullableString(profile.nip05) ??
    toNullableString(profileRecord["nip05"]) ??
    toNullableString(metaRecord["nip05"]);

  const verifiedHandle =
    toNullableString(metaRecord["nip05_verified_value"]) ??
    toNullableString(profileRecord["nip05_verified_value"]) ??
    toNullableString((profile as Record<string, unknown> | null | undefined)?.["nip05_verified_value"]);

  return Boolean(
    nip05Value &&
      verifiedHandle &&
      nip05Value.trim().toLowerCase() === verifiedHandle.trim().toLowerCase(),
  );
}

export function creatorIsFundstrCreator(profile: CreatorProfile): boolean {
  if (profile.isCreator !== undefined && profile.isCreator !== null) {
    return Boolean(profile.isCreator);
  }

  const profileRecord = (profile?.profile ?? {}) as Record<string, unknown>;
  const metaRecord = (profile?.meta ?? {}) as Record<string, unknown>;

  return [
    (profile as Record<string, unknown> | null | undefined)?.["fundstrCreator"],
    profileRecord["fundstr_creator"],
    profileRecord["fundstrCreator"],
    metaRecord["fundstr_creator"],
    metaRecord["fundstrCreator"],
  ].some(isTruthyFlag);
}

export function creatorIsSignalOnly(profile: CreatorProfile): boolean {
  const profileRecord = (profile?.profile ?? {}) as Record<string, unknown>;
  const metaRecord = (profile?.meta ?? {}) as Record<string, unknown>;

  const candidates = [
    (profile as Record<string, unknown> | null | undefined)?.["signalOnly"],
    profileRecord["signal_only"],
    profileRecord["signalOnly"],
    metaRecord["signal_only"],
    metaRecord["signalOnly"],
    profile.metrics?.signal_only,
  ];

  return candidates.some(isTruthyFlag);
}

function applyCreatorFilters(
  profiles: CreatorProfile[],
  filters: CreatorSearchFilters = {},
  sort: CreatorSearchSort = "relevance",
): CreatorProfile[] {
  const filtered = profiles.filter((profile) => {
    if (filters.hasTiers && !creatorHasTiers(profile)) {
      return false;
    }

    if (filters.hasLightning && !creatorHasLightning(profile)) {
      return false;
    }

    if (filters.featured && !profile.featured) {
      return false;
    }

    if (filters.nip05Verified && !creatorHasVerifiedNip05(profile)) {
      return false;
    }

    if (filters.fundstrCreator && !creatorIsFundstrCreator(profile)) {
      return false;
    }

    if (filters.signalOnly && !creatorIsSignalOnly(profile)) {
      return false;
    }

    return true;
  });

  if (sort === "followers") {
    return filtered
      .slice()
      .sort(
        (a, b) =>
          (b.followers ?? Number.NEGATIVE_INFINITY) - (a.followers ?? Number.NEGATIVE_INFINITY),
      );
  }

  return filtered.slice();
}

function createCreatorFromBundle(
  pubkey: string,
  bundle: FundstrProfileBundle,
  overrides: Partial<CreatorProfile> = {},
): CreatorProfile {
  const profile = bundle.profile ? JSON.parse(JSON.stringify(bundle.profile)) : null;
  const followers =
    typeof bundle.followers === "number" && Number.isFinite(bundle.followers)
      ? bundle.followers
      : null;
  const following =
    typeof bundle.following === "number" && Number.isFinite(bundle.following)
      ? bundle.following
      : null;
  const joined =
    typeof bundle.joined === "number" && Number.isFinite(bundle.joined)
      ? bundle.joined
      : null;

  const tiers = Array.isArray(bundle.tiers)
    ? bundle.tiers.map((tier) => normalizeTier(tier))
    : undefined;

  const tierSummary = overrides.tierSummary ?? computeTierSummary(tiers ?? null);

  const metrics = overrides.metrics ?? null;

  const overrideDisplayName = toNullableString(overrides.displayName);
  const overrideName = toNullableString(overrides.name);
  const overrideAbout = toNullableString(overrides.about);
  const overrideNip05 = toNullableString(overrides.nip05);
  const overridePicture = toNullableString(overrides.picture);
  const overrideBanner = toNullableString(overrides.banner);

  const displayName =
    overrideDisplayName ??
    toNullableString(profile?.display_name ?? profile?.displayName ?? null);
  const name = overrideName ?? toNullableString(profile?.name);
  const about = overrideAbout ?? toNullableString(profile?.about);
  const nip05 = overrideNip05 ?? toNullableString(profile?.nip05 ?? profile?.nip05_npub);
  const picture = overridePicture ?? toNullableString(profile?.picture);
  const banner = overrideBanner ?? toNullableString(profile?.banner);

  const creator: CreatorProfile = {
    pubkey,
    profile,
    followers,
    following,
    joined,
    displayName,
    name,
    about,
    nip05,
    picture,
    banner,
    tierSummary,
    metrics,
    tiers,
    tierDataFresh: overrides.tierDataFresh ?? (bundle.tierDataFresh !== false),
    tierSecurityBlocked:
      overrides.tierSecurityBlocked !== undefined
        ? overrides.tierSecurityBlocked
        : bundle.tierSecurityBlocked,
    tierFetchFailed:
      overrides.tierFetchFailed !== undefined
        ? overrides.tierFetchFailed
        : bundle.tierFetchFailed,
    refreshedInBackground:
      overrides.refreshedInBackground !== undefined
        ? overrides.refreshedInBackground
        : bundle.refreshedInBackground === true,
    cacheHit: overrides.cacheHit,
    featured: overrides.featured,
    hasLightning: overrides.hasLightning ?? null,
    hasTiers: overrides.hasTiers ?? null,
    isCreator: overrides.isCreator ?? null,
    isPersonal: overrides.isPersonal ?? null,
  };

  return creator;
}

export const useCreatorsStore = defineStore("creators", {
  state: () => {
    const favorites =
      typeof window !== "undefined" && typeof localStorage !== "undefined"
        ? safeUseLocalStorage<string[]>("findCreators.favorites.v1", [])
        : ref<string[]>([]);
    return {
      searchResults: [] as CreatorProfile[],
      featuredCreators: [] as CreatorProfile[],
      searching: false,
      loadingFeatured: false,
      error: "",
      searchStatusMessage: "",
      searchWarnings: [] as string[],
      featuredError: "",
      featuredStatusMessage: "",
      tiersMap: {} as Record<string, Tier[]>,
      tierFetchError: false,
      currentUserNpub: "",
      currentUserPrivkey: "",
      favorites,
      warmCache: {} as Record<string, CreatorWarmCache>,
      inFlightCreatorRequests: {} as Record<string, Promise<CreatorProfile | null>>,
      searchAbortController: null as AbortController | null,
      unfilteredSearchResults: [] as CreatorProfile[],
    };
  },
  getters: {
    featured(state): CreatorProfile[] {
      return state.featuredCreators;
    },
    loadingSearch(state): boolean {
      return state.searching;
    },
    errorSearch(state): string {
      return state.error;
    },
    errorFeatured(state): string {
      return state.featuredError;
    },
    favoriteHexPubkeys(): string[] {
      const raw = Array.isArray(this.favorites?.value)
        ? this.favorites.value
        : [];
      const seen = new Set<string>();
      for (const entry of raw) {
        if (typeof entry !== "string") continue;
        const trimmed = entry.trim();
        if (!trimmed) continue;
        if (trimmed.length === 64 && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
          seen.add(trimmed.toLowerCase());
          continue;
        }
        if (trimmed.startsWith("npub")) {
          try {
            seen.add(toHex(trimmed));
          } catch (e) {
            console.warn("Invalid favorite pubkey", e);
          }
        }
      }
      return Array.from(seen);
    },
    getCreatorCache(state) {
      return (hex: string) => state.warmCache[hex];
    },
    getCreatorTiers(state) {
      return (hex: string): Tier[] | null => {
        const cacheEntry = state.warmCache[hex];
        if (cacheEntry?.tiersLoaded && Array.isArray(cacheEntry.tiers)) {
          return cacheEntry.tiers.map((tier) => normalizeTier(tier));
        }
        const mapped = state.tiersMap[hex];
        if (Array.isArray(mapped)) {
          return mapped.map((tier) => normalizeTier(tier));
        }
        return null;
      };
    },
    prefillCacheEntries(): PrefillCreatorCacheEntry[] {
      const results: PrefillCreatorCacheEntry[] = [];
      for (const [pubkey, data] of Object.entries(this.warmCache)) {
        if (!data) continue;
        const hasProfile =
          data.profileLoaded &&
          (data.profileEvent !== undefined || data.profileDetails !== undefined);
        const hasTiers =
          data.tiersLoaded &&
          (data.tierEvent !== undefined || Array.isArray(data.tiers));
        if (!hasProfile && !hasTiers) continue;
        results.push({
          pubkey,
          profileEvent: cloneRelayEvent(data.profileEvent ?? null),
          tierEvent: cloneRelayEvent(data.tierEvent ?? null),
          profileDetails: cloneProfileDetails(data.profileDetails),
          tiers: Array.isArray(data.tiers)
            ? data.tiers.map((tier) => ({
                ...tier,
                benefits: tier.benefits ? [...tier.benefits] : undefined,
                media: tier.media
                  ? tier.media.map((media) => ({ ...media }))
                  : undefined,
              }))
            : data.tiers ?? null,
        });
      }
      return results;
    },
  },
  actions: {
    getFavoriteHexes(): string[] {
      return this.favoriteHexPubkeys;
    },

    hasProfileCache(pubkeyHex: string): boolean {
      return this.warmCache[pubkeyHex]?.profileLoaded === true;
    },

    hasTierCache(pubkeyHex: string): boolean {
      return this.warmCache[pubkeyHex]?.tiersLoaded === true;
    },

    buildCreatorProfileFromCache(pubkeyHex: string): CreatorProfile | null {
      const entry = this.getCreatorCache(pubkeyHex);
      if (!entry) {
        return null;
      }

      const hasProfile =
        entry.profileLoaded === true || entry.profileEvent !== undefined;
      const hasTiers =
        entry.tiersLoaded === true ||
        (Array.isArray(entry.tiers) && entry.tiers.length > 0) ||
        entry.tierEvent !== undefined;

      if (!hasProfile && !hasTiers) {
        return null;
      }

      return {
        pubkey: pubkeyHex,
        profile: parseCachedProfileContent(entry),
        followers: null,
        following: null,
        joined: entry.profileUpdatedAt ?? null,
        cacheHit: true,
        tierDataFresh: entry.tierDataFresh ?? null,
        tierSecurityBlocked: entry.tierSecurityBlocked ?? null,
        tierFetchFailed: entry.tierFetchFailed ?? null,
        refreshedInBackground: entry.refreshedInBackground ?? null,
      };
    },

    updateProfileCacheState(
      pubkeyHex: string,
      details: NutzapProfileDetails | null,
      event: RelayEvent | null,
      meta: { eventId?: string | null; updatedAt?: number | null } = {},
    ) {
      const entry: CreatorWarmCache = {
        ...(this.warmCache[pubkeyHex] ?? {}),
      };
      entry.profileLoaded = true;
      entry.profileDetails = cloneProfileDetails(details);
      entry.profileEvent = event ? cloneRelayEvent(event) : null;
      entry.profileEventId = meta.eventId ?? event?.id ?? null;
      entry.profileUpdatedAt = meta.updatedAt ?? event?.created_at ?? null;
      this.warmCache[pubkeyHex] = entry;
    },

    updateTierCacheState(
      pubkeyHex: string,
      tiers: Tier[] | null,
      event: RelayEvent | null,
      meta: {
        eventId?: string | null;
        updatedAt?: number | null;
        fresh?: boolean | null;
        securityBlocked?: boolean | null;
        fetchFailed?: boolean | null;
      } = {},
    ) {
      const entry: CreatorWarmCache = {
        ...(this.warmCache[pubkeyHex] ?? {}),
      };
      const normalized = Array.isArray(tiers)
        ? tiers.filter(isValidTier).map((tier) => normalizeTier(tier))
        : [];
      entry.tiersLoaded = true;
      entry.tiers = normalized;
      entry.tierEvent = event ? cloneRelayEvent(event) : null;
      entry.tierEventId = meta.eventId ?? event?.id ?? null;
      entry.tierUpdatedAt = meta.updatedAt ?? event?.created_at ?? null;
      if (meta.fresh !== undefined) {
        entry.tierDataFresh = meta.fresh;
      }
      if (meta.securityBlocked !== undefined) {
        entry.tierSecurityBlocked = meta.securityBlocked;
      }
      if (meta.fetchFailed !== undefined) {
        entry.tierFetchFailed = meta.fetchFailed ?? null;
        if (meta.fetchFailed === true) {
          this.tierFetchError = true;
        } else if (meta.fetchFailed === false) {
          this.tierFetchError = false;
        }
      }
      this.warmCache[pubkeyHex] = entry;
      this.tiersMap[pubkeyHex] = normalized;
    },

    async saveProfileCache(
      pubkeyHex: string,
      event: RelayEvent | null,
      details: NutzapProfileDetails | null,
      meta: { updatedAt?: number | null } = {},
    ) {
      const updatedAt =
        meta.updatedAt ??
        event?.created_at ??
        (details || event ? Math.floor(Date.now() / 1000) : null);
      this.updateProfileCacheState(pubkeyHex, details, event, {
        eventId: event?.id ?? null,
        updatedAt,
      });
      try {
        await db.nutzapProfiles.put({
          pubkey: pubkeyHex,
          profile: cloneProfileDetails(details),
          eventId: event?.id ?? null,
          updatedAt: updatedAt ?? undefined,
          rawEventJson: event ? JSON.stringify(event) : undefined,
        });
      } catch (e) {
        console.error("Failed to persist Nutzap profile cache", e);
      }
    },

    async saveTierCache(
      pubkeyHex: string,
      tiers: Tier[] | null,
      event: RelayEvent | null,
      meta: { updatedAt?: number | null } = {},
    ) {
      const normalized = Array.isArray(tiers)
        ? tiers.filter(isValidTier).map((tier) => normalizeTier(tier))
        : [];
      const updatedAt =
        meta.updatedAt ?? event?.created_at ?? (event ? event.created_at : null);
      this.updateTierCacheState(pubkeyHex, Array.isArray(tiers) ? normalized : [], event, {
        eventId: event?.id ?? null,
        updatedAt,
        fresh: true,
        securityBlocked: false,
        fetchFailed: false,
      });
      try {
        if (event) {
          await db.creatorsTierDefinitions.put({
            creatorNpub: pubkeyHex,
            tiers: normalized as any,
            eventId: event.id,
            updatedAt: event.created_at,
            rawEventJson: JSON.stringify(event),
          });
        } else {
          await db.creatorsTierDefinitions.delete(pubkeyHex);
        }
      } catch (e) {
        console.error("Failed to persist tier cache", e);
      }
    },

    async loadCreatorCacheFromDexie(pubkeyHex: string) {
      const [profileRow, tierRow] = await Promise.all([
        db.nutzapProfiles.get(pubkeyHex),
        db.creatorsTierDefinitions.get(pubkeyHex),
      ]);
      if (profileRow) {
        let event: RelayEvent | null = null;
        if (profileRow.rawEventJson) {
          try {
            event = JSON.parse(profileRow.rawEventJson) as RelayEvent;
          } catch (e) {
            console.error("Failed to parse cached profile event", e);
          }
        }
        this.updateProfileCacheState(pubkeyHex, profileRow.profile ?? null, event, {
          eventId: profileRow.eventId ?? null,
          updatedAt: profileRow.updatedAt ?? null,
        });
      }
      if (tierRow) {
        let event: RelayEvent | null = null;
        if (tierRow.rawEventJson) {
          try {
            event = JSON.parse(tierRow.rawEventJson) as RelayEvent;
          } catch (e) {
            console.error("Failed to parse cached tier event", e);
          }
        }
        const normalized = (tierRow.tiers ?? [])
          .filter((tier: any) => isValidTier(tier))
          .map((tier: any) => normalizeTier(tier));
        this.updateTierCacheState(pubkeyHex, normalized, event, {
          eventId: tierRow.eventId,
          updatedAt: tierRow.updatedAt,
          fetchFailed: false,
        });
      }
      return this.warmCache[pubkeyHex];
    },

    async ensureCreatorCacheFromDexie(pubkeyHex: string) {
      const entry = this.warmCache[pubkeyHex];
      if (entry?.profileLoaded && entry?.tiersLoaded) {
        return entry;
      }
      return this.loadCreatorCacheFromDexie(pubkeyHex);
    },

    async applyPhonebookResults(
      results: PhonebookProfile[],
      signal?: AbortSignal,
      options: { filters?: CreatorSearchFilters; sort?: CreatorSearchSort } = {},
    ): Promise<{ applied: boolean; networkWarning: boolean }> {
      const discovery = useDiscovery();
      const profiles = Array.isArray(results)
        ? results
            .map((profile) => ({
              ...profile,
              pubkey: (profile.pubkey || "").trim().toLowerCase(),
            }))
            .filter((profile) => /^[0-9a-fA-F]{64}$/.test(profile.pubkey))
        : [];

      if (!profiles.length) {
        return { applied: false, networkWarning: false };
      }

      const warnings: string[] = [];
      let discoveryResults: CreatorProfile[] = [];

      try {
        const response = await discovery.getCreatorsByPubkeys({
          npubs: profiles.map((profile) => toNpub(profile.pubkey)),
          signal,
        });
        discoveryResults = response.results.map((creator) => cloneCreatorProfile(creator));
        const discoveryWarnings = Array.isArray(response.warnings)
          ? response.warnings
              .filter((warning): warning is string => typeof warning === "string")
              .map((warning) => warning.trim())
              .filter(Boolean)
          : [];
        warnings.push(...discoveryWarnings);
      } catch (error) {
        if (signal?.aborted) {
          throw error;
        }
        warnings.push(DISCOVERY_ENRICHMENT_WARNING);
        console.warn("[creators] Phonebook enrichment failed", error);
      }

      if (signal?.aborted) {
        return { applied: false, networkWarning: false };
      }

      if (hasNetworkChangeWarning(warnings)) {
        return { applied: false, networkWarning: true };
      }

      const discoveryMap = new Map<string, CreatorProfile>();
      for (const creator of discoveryResults) {
        const key = creator.pubkey?.toLowerCase();
        if (key) {
          discoveryMap.set(key, creator);
        }
      }

      const merged: CreatorProfile[] = [];

      for (const profile of profiles) {
        if (signal?.aborted) {
          return { applied: false, networkWarning: false };
        }

        const phonebookCreator = createCreatorFromPhonebook(profile);

        const enriched = discoveryMap.get(profile.pubkey);
        if (enriched) {
          merged.push(mergeDiscoveryIntoPhonebook(phonebookCreator, enriched));
          continue;
        }

        try {
          const fetched = await this.fetchCreator(profile.pubkey, false);
          if (fetched) {
            merged.push(
              mergeDiscoveryIntoPhonebook(phonebookCreator, cloneCreatorProfile(fetched)),
            );
            continue;
          }
        } catch (error) {
          if (signal?.aborted) {
            throw error;
          }
          console.warn("[creators] Phonebook creator fetch failed", {
            pubkey: profile.pubkey,
            error,
          });
        }

        merged.push(phonebookCreator);
      }

      if (!merged.length) {
        return { applied: false, networkWarning: false };
      }

      if (
        merged.some((profile) => profile.tierSecurityBlocked === true) &&
        !warnings.includes(FIREFOX_TIER_SECURITY_WARNING)
      ) {
        warnings.push(FIREFOX_TIER_SECURITY_WARNING);
      }

      const uniqueWarnings = Array.from(new Set(warnings));

      this.error = "";
      this.searchStatusMessage = "";
      this.unfilteredSearchResults = merged;
      this.searchResults = applyCreatorFilters(merged, options.filters, options.sort);
      this.searchWarnings = uniqueWarnings;

      return { applied: true, networkWarning: false };
    },

    applySearchFilters(
      filters: CreatorSearchFilters = {},
      sort: CreatorSearchSort = "relevance",
    ) {
      this.searchResults = applyCreatorFilters(this.unfilteredSearchResults, filters, sort);
    },

    async searchCreators(
      query: string,
      options: { fresh?: boolean; filters?: CreatorSearchFilters; sort?: CreatorSearchSort } = {},
    ) {
      const { fresh = false, filters = {}, sort = "relevance" } = options;
      const discovery = useDiscovery();
      const rawQuery = typeof query === "string" ? query.trim() : "";

      const applyTierWarnings = (
        profiles: CreatorProfile[],
        warnings: string[] = [],
      ): string[] => {
        const filtered = warnings.slice();
        if (
          profiles.some((profile) => profile.tierSecurityBlocked === true) &&
          !filtered.includes(FIREFOX_TIER_SECURITY_WARNING)
        ) {
          filtered.push(FIREFOX_TIER_SECURITY_WARNING);
        }
        return filtered;
      };

      const mergeFeaturedResults = async (
        profiles: CreatorProfile[],
        signal: AbortSignal,
      ): Promise<CreatorProfile[]> => {
        const featuredNpubs = CONFIG_FEATURED_CREATORS.filter(
          (npub) => typeof npub === "string" && npub.trim(),
        );

        if (!featuredNpubs.length) {
          return profiles;
        }

        const normalizedQueryLower = normalizedQuery.toLowerCase();
        const matchesQuery = (value: unknown): boolean => {
          if (typeof value !== "string") {
            return false;
          }
          return value.trim().toLowerCase() === normalizedQueryLower;
        };

        const existingPubkeys = new Set(
          profiles
            .map((profile) => profile.pubkey?.toLowerCase())
            .filter(Boolean) as string[],
        );

        const cachedFeaturedProfiles = new Map<string, CreatorProfile>();
        for (const profile of this.featuredCreators) {
          if (profile?.pubkey) {
            cachedFeaturedProfiles.set(profile.pubkey.toLowerCase(), profile);
          }
        }

        const featuredEntries = featuredNpubs
          .map((npub) => {
            try {
              return { npub, pubkey: toHex(npub).toLowerCase() };
            } catch {
              return null;
            }
          })
          .filter((entry): entry is { npub: string; pubkey: string } => Boolean(entry));

        if (!featuredEntries.length) {
          return profiles;
        }

        const ensureCachedProfile = async (pubkey: string): Promise<CreatorProfile | null> => {
          const cached = cachedFeaturedProfiles.get(pubkey);
          if (cached) {
            return cached;
          }

          try {
            await this.ensureCreatorCacheFromDexie(pubkey);
          } catch (error) {
            console.warn("[creators] Failed to hydrate featured creator cache during search", {
              pubkey,
              error,
            });
          }

          const hydrated = this.buildCreatorProfileFromCache(pubkey);
          if (hydrated) {
            cachedFeaturedProfiles.set(pubkey, hydrated);
          }

          return hydrated ?? null;
        };

        const matchedPubkeys: string[] = [];

        for (const entry of featuredEntries) {
          if (matchesQuery(entry.npub) || matchesQuery(entry.pubkey)) {
            matchedPubkeys.push(entry.pubkey);
            continue;
          }

          if (signal.aborted) {
            return profiles;
          }

          const cached = await ensureCachedProfile(entry.pubkey);
          const candidateNames = [
            fallbackName(cached),
            toNullableString((cached as any)?.displayName),
            toNullableString((cached as any)?.name),
            toNullableString((cached?.profile as any)?.display_name),
            toNullableString((cached?.profile as any)?.name),
          ];

          if (candidateNames.some(matchesQuery)) {
            matchedPubkeys.push(entry.pubkey);
          }
        }

        const uniqueMatches = matchedPubkeys.filter((pubkey, index, arr) => {
          return pubkey && arr.indexOf(pubkey) === index && !existingPubkeys.has(pubkey);
        });

        if (!uniqueMatches.length) {
          return profiles;
        }

        const discovery = useDiscovery();
        const fetchedProfiles = new Map<string, CreatorProfile>();

        try {
          const response = await discovery.getCreatorsByPubkeys({
            npubs: uniqueMatches.map((pubkey) => {
              try {
                return nip19.npubEncode(pubkey);
              } catch {
                return pubkey;
              }
            }),
            signal,
          });

          for (const creator of response.results ?? []) {
            if (!creator?.pubkey) continue;
            const key = creator.pubkey.toLowerCase();
            fetchedProfiles.set(key, { ...cloneCreatorProfile(creator), featured: true });
          }
        } catch (error) {
          if (!signal.aborted) {
            console.warn("[creators] Featured creator hydration failed", error);
          }
        }

        for (const pubkey of uniqueMatches) {
          if (fetchedProfiles.has(pubkey)) continue;

          const cached = await ensureCachedProfile(pubkey);
          if (cached) {
            fetchedProfiles.set(pubkey, { ...cached, featured: true });
            continue;
          }

          if (signal.aborted) {
            break;
          }

          try {
            const fetched = await this.fetchCreator(pubkey, fresh);
            if (fetched) {
              fetchedProfiles.set(pubkey, { ...fetched, featured: true });
            }
          } catch (error) {
            if (!signal.aborted) {
              console.warn("[creators] Featured creator fetch failed", { pubkey, error });
            }
          }
        }

        if (!fetchedProfiles.size) {
          return profiles;
        }

        const orderedMatches = featuredEntries
          .map((entry) => entry.pubkey)
          .filter((pubkey) => fetchedProfiles.has(pubkey))
          .map((pubkey) => fetchedProfiles.get(pubkey) as CreatorProfile);

        return profiles.concat(orderedMatches);
      };

      const applyResults = async (
        profiles: CreatorProfile[],
        warnings: string[] = [],
      ) => {
        const mergedProfiles = await mergeFeaturedResults(profiles, controller.signal);
        this.unfilteredSearchResults = mergedProfiles;
        this.searchResults = applyCreatorFilters(mergedProfiles, filters, sort);
        this.searchWarnings = applyTierWarnings(mergedProfiles, warnings);
        this.searchStatusMessage = "";
      };

      const clearResults = () => {
        this.unfilteredSearchResults = [];
        this.searchResults = [];
      };

      if (!rawQuery) {
        if (this.searchAbortController) {
          this.searchAbortController.abort();
          this.searchAbortController = null;
        }
        clearResults();
        this.error = "";
        this.searchStatusMessage = "";
        this.searchWarnings = [];
        this.searching = false;
        return;
      }

      if (this.searchAbortController) {
        this.searchAbortController.abort();
        this.searchAbortController = null;
      }

      const previousResults = this.searchResults.slice();
      const previousUnfiltered = this.unfilteredSearchResults.slice();
      const previousWarnings = this.searchWarnings.slice();

      clearResults();
      this.error = "";
      this.searchStatusMessage = "";
      this.searchWarnings = [];
      this.searching = true;
      const searchRequestId = (searchRequestCounter += 1);

      const handleFailure = (message: string) => {
        this.error = message;
        clearResults();
      };

      const restorePreviousResults = () => {
        this.unfilteredSearchResults = previousUnfiltered;
        this.searchResults = previousResults;
        this.searchWarnings = previousWarnings;
        this.error = "";
      };

      const handleNetworkWarning = async () => {
        restorePreviousResults();
        this.searchStatusMessage = NETWORK_CHANGE_WARNING;
        this.searching = false;
        this.searchAbortController = null;
        await waitForOnline();
        if (searchRequestId !== searchRequestCounter) {
          return;
        }
        if (this.searchAbortController?.signal.aborted) {
          return;
        }
        void this.searchCreators(rawQuery, { fresh: true, filters, sort });
      };

      const resolveNip19 = (value: string): string | null => {
        try {
          const decoded = nip19.decode(value);
          if (typeof decoded.data === "string") {
            return decoded.data;
          }
          if (typeof decoded.data === "object" && decoded.data && (decoded.data as any).pubkey) {
            return String((decoded.data as any).pubkey);
          }
        } catch (error) {
          console.warn("[creators] Failed to decode NIP-19 identifier", error);
        }
        return null;
      };

      let normalizedQuery = rawQuery;
      let resolvedHex: string | null = null;

      if (normalizedQuery.startsWith("npub") || normalizedQuery.startsWith("nprofile")) {
        resolvedHex = resolveNip19(normalizedQuery);
        resolvedHex ??= null;
      }

      if (!resolvedHex && normalizedQuery.includes("@")) {
        try {
          const ndk = await useNdk({ requireSigner: false });
          const user = await ndk.getUserFromNip05(normalizedQuery);
          resolvedHex = user?.pubkey ?? null;
        } catch (error) {
          console.error("[creators] NIP-05 lookup failed", error);
          resolvedHex = null;
        }
      }

      if (resolvedHex && /^[0-9a-fA-F]{64}$/.test(resolvedHex)) {
        normalizedQuery = resolvedHex.toLowerCase();
      } else {
        resolvedHex = null;
      }

      const controller = new AbortController();
      this.searchAbortController = controller;

      let phonebookResponse:
        | { results: PhonebookProfile[]; count: number; warning?: string }
        | null = null;

      try {
        phonebookResponse = await findProfiles(normalizedQuery, controller.signal);
      } catch (error) {
        phonebookResponse = { query: normalizedQuery, results: [], count: 0 };
      }

      const phonebookResults = phonebookResponse?.results ?? [];
      if (isNetworkChangeWarning(phonebookResponse?.warning ?? "")) {
        void handleNetworkWarning();
        return;
      }

      if (!controller.signal.aborted && phonebookResponse?.count && phonebookResults.length) {
        try {
          const appliedResult = await this.applyPhonebookResults(
            phonebookResults,
            controller.signal,
            {
              filters,
              sort,
            },
          );
          if (appliedResult.networkWarning) {
            void handleNetworkWarning();
            return;
          }
          if (appliedResult.applied) {
            await applyResults(this.unfilteredSearchResults, this.searchWarnings ?? []);
            this.searching = false;
            this.searchAbortController = null;
            return;
          }
        } catch (error) {
          if (controller.signal.aborted) {
            this.searching = false;
            this.searchAbortController = null;
            return;
          }
          console.warn("[creators] Failed to hydrate phonebook results", error);
        }
      }

      if (controller.signal.aborted) {
        this.searching = false;
        this.searchAbortController = null;
        return;
      }

      if (resolvedHex) {
        try {
          const creatorProfile = await this.fetchCreator(resolvedHex, fresh);
          if (creatorProfile) {
            const warnings = creatorProfile.tierSecurityBlocked
              ? [FIREFOX_TIER_SECURITY_WARNING]
              : [];
            await applyResults([cloneCreatorProfile(creatorProfile)], warnings);
          } else {
            handleFailure("Failed to fetch profile.");
          }
        } catch (error) {
          console.error("[creators] Creator lookup failed", error);
          handleFailure("Failed to fetch profile.");
        } finally {
          this.searching = false;
          this.searchAbortController = null;
        }
        return;
      }

      const filterWarnings = (warnings: unknown): string[] => {
        if (!Array.isArray(warnings)) {
          return [];
        }
        const seen = new Set<string>();
        const filtered: string[] = [];
        for (const warning of warnings) {
          if (typeof warning !== "string") continue;
          const trimmed = warning.trim();
          if (!trimmed || seen.has(trimmed)) continue;
          seen.add(trimmed);
          filtered.push(trimmed);
        }
        return filtered;
      };

      try {
        const response = await discovery.getCreators({
          q: normalizedQuery,
          fresh: false,
          signal: controller.signal,
        });
        const profiles = response.results.map((creator) => cloneCreatorProfile(creator));
        const warnings = filterWarnings(response.warnings);
        if (hasNetworkChangeWarning(warnings)) {
          void handleNetworkWarning();
          return;
        }

        this.error = "";
        this.searchStatusMessage = "";
        await applyResults(profiles, warnings);
        debug("discovery:hit", {
          query: normalizedQuery,
          count: profiles.length,
        });
      } catch (error) {
        if (controller.signal.aborted) {
          this.searching = false;
          this.searchAbortController = null;
          return;
        }
        handleFailure("Failed to fetch profiles.");
        console.warn("[creators] discovery search failed", error);
      }

      this.searching = false;
      this.searchAbortController = null;
    },

    async applyBundleToCache(
      pubkey: string,
      bundle: FundstrProfileBundle,
      overrides: Partial<CreatorProfile> = {},
    ): Promise<CreatorProfile> {
      const creatorProfile = createCreatorFromBundle(pubkey, bundle, overrides);

      try {
        await this.saveProfileCache(pubkey, bundle.profileEvent, bundle.profileDetails, {
          updatedAt: bundle.joined ?? null,
        });
      } catch (cacheError) {
        console.error("[creators] Failed to persist Fundstr profile cache", {
          pubkey,
          error: cacheError,
        });
      }

      try {
        this.updateTierCacheState(pubkey, bundle.tiers ?? null, null, {
          updatedAt: bundle.joined ?? null,
          fresh: bundle.tierDataFresh !== false,
          securityBlocked: bundle.tierSecurityBlocked,
          fetchFailed: bundle.tierFetchFailed === true,
        });
      } catch (tierCacheError) {
        console.error("[creators] Failed to update warm tier cache", {
          pubkey,
          error: tierCacheError,
        });
      }

      try {
        const entry: CreatorWarmCache = {
          ...(this.warmCache[pubkey] ?? {}),
        };
        entry.refreshedInBackground = bundle.refreshedInBackground === true;
        this.warmCache[pubkey] = entry;
      } catch (refreshError) {
        console.error("[creators] Failed to update refresh flag", {
          pubkey,
          error: refreshError,
        });
      }

      try {
        await db.profiles.put({
          pubkey,
          profile: creatorProfile,
          fetchedAt: Date.now(),
        });
      } catch (persistError) {
        console.error(`Failed to cache profile for ${pubkey}`, persistError);
      }

      return creatorProfile;
    },

    async fetchCreator(pubkey: string, forceRefresh = false) {
      const now = Date.now();
      const cacheExpiry = 3 * 60 * 60 * 1000; // 3 hours

      const triggerNetworkFetch = (refresh = forceRefresh) => {
        const existing = this.inFlightCreatorRequests[pubkey];
        if (existing) {
          return existing;
        }

        const fetchPromise = (async (): Promise<CreatorProfile | null> => {
          try {
            const bundle = await fetchFundstrProfileBundle(pubkey, {
              forceRefresh: refresh,
            });
            const result = await this.applyBundleToCache(pubkey, bundle, {
              cacheHit: bundle.cacheHit === true,
            });

            if (!refresh && bundle.cacheHit === true) {
              try {
                const cacheKey = toHex(pubkey).toLowerCase();
                const background = inFlightBundleRequests.get(cacheKey);
                if (background) {
                  background
                    .then(async (freshBundle) => {
                      if (freshBundle && freshBundle.cacheHit !== true) {
                        await this.applyBundleToCache(pubkey, freshBundle, {
                          cacheHit: false,
                        });
                      }
                    })
                    .catch((error) => {
                      console.warn("[creators] Background creator refresh failed", {
                        pubkey,
                        error,
                      });
                    });
                }
              } catch (hexError) {
                console.warn("[creators] Failed to watch background refresh", {
                  pubkey,
                  error: hexError,
                });
              }
            }

            return result;
          } catch (error) {
            console.error("[creators] Discovery profile fetch failed", {
              pubkey,
              error,
            });
            throw error;
          }
        })();

        this.inFlightCreatorRequests[pubkey] = fetchPromise;

        fetchPromise.finally(() => {
          if (this.inFlightCreatorRequests[pubkey] === fetchPromise) {
            delete this.inFlightCreatorRequests[pubkey];
          }
        });

        return fetchPromise;
      };

      if (!forceRefresh) {
        try {
          await this.ensureCreatorCacheFromDexie(pubkey);
        } catch (error) {
          console.warn("[creators] Failed to hydrate warm cache before fetch", {
            pubkey,
            error,
          });
        }

        const warmCached = this.buildCreatorProfileFromCache(pubkey);
        if (warmCached) {
          triggerNetworkFetch(false).catch(() => {});
          return { ...warmCached, cacheHit: true };
        }

        const cached = await db.profiles.get(pubkey);
        if (cached && now - cached.fetchedAt < cacheExpiry) {
          triggerNetworkFetch(false).catch(() => {});
          return { ...cached.profile, cacheHit: true } as CreatorProfile;
        }

        const inflight = this.inFlightCreatorRequests[pubkey];
        if (inflight) {
          return inflight;
        }
      }

      return await triggerNetworkFetch(forceRefresh);
    },

    async loadFeatured(npubs: string[], opts: { fresh?: boolean } = {}) {
      this.featuredError = "";
      this.loadingFeatured = true;
      this.featuredStatusMessage = "";

      const discovery = useDiscovery();
      const fresh = Boolean(opts.fresh);
      const staleTierWarning =
        "Showing cached tier data. Some donation options may be temporarily unavailable.";

      if (fresh) {
        this.featuredCreators = [];
      }

      const normalizedNpubs = (Array.isArray(npubs) ? npubs : [])
        .map((npub) => (typeof npub === "string" ? npub.trim() : ""))
        .filter((npub) => Boolean(npub));

      if (!normalizedNpubs.length) {
        this.featuredCreators = [];
        this.loadingFeatured = false;
        return;
      }

      const pubkeys: string[] = normalizedNpubs
        .map((npub) => {
          try {
            return toHex(npub);
          } catch (error) {
            console.warn("[creators] Invalid featured creator npub", {
              npub,
              error,
            });
            return null;
          }
        })
        .filter((pubkey): pubkey is string => Boolean(pubkey));

      const pubkeySet = new Set(pubkeys);
      const cachedEntries = new Map<string, CreatorProfile>();

      await Promise.all(
        pubkeys.map(async (pubkey) => {
          try {
            await this.ensureCreatorCacheFromDexie(pubkey);
          } catch (error) {
            console.warn("[creators] Failed to hydrate featured creator cache", {
              pubkey,
              error,
            });
          }
          const cached = this.buildCreatorProfileFromCache(pubkey);
          if (cached) {
            cachedEntries.set(pubkey, { ...cached, cacheHit: true, featured: true });
          }
        }),
      );

      if (cachedEntries.size) {
        const orderedCached = pubkeys
          .map((pubkey) => cachedEntries.get(pubkey))
          .filter((profile): profile is CreatorProfile => Boolean(profile));
        if (orderedCached.length) {
          this.featuredCreators = orderedCached;
          const cachedSecurityBlocked = orderedCached.some(
            (profile) => profile.tierSecurityBlocked === true,
          );
          if (cachedSecurityBlocked) {
            this.featuredStatusMessage = FIREFOX_TIER_SECURITY_WARNING;
          } else if (orderedCached.some((profile) => profile.tierDataFresh === false)) {
            this.featuredStatusMessage = staleTierWarning;
          }
        }
      }

      const needsPhonebookEnrichment = (profile?: CreatorProfile | null) => {
        if (!profile) {
          return true;
        }
        const missingName = !profile.displayName && !profile.name;
        return (
          missingName ||
          typeof profile.about !== "string" ||
          !profile.about?.trim() ||
          typeof profile.picture !== "string" ||
          !profile.picture?.trim()
        );
      };

      try {
        const response = await discovery.getCreatorsByPubkeys({
          npubs: normalizedNpubs,
          fresh,
          swr: true,
        });

        const fetchedMap = new Map<string, CreatorProfile>();
        const missingPubkeys = new Set(pubkeys);

        const results = Array.isArray(response.results) ? response.results : [];
        const fetchedEntries = await Promise.all(
          results.map(async (creator) => {
            if (!creator || typeof creator.pubkey !== "string") {
              return null;
            }

            const resolvedHex = creator.pubkey.trim().toLowerCase();
            if (!/^[0-9a-fA-F]{64}$/.test(resolvedHex)) {
              console.warn("[creators] Skipping featured creator with invalid pubkey", {
                pubkey: creator.pubkey,
              });
              captureTelemetryWarning(
                "[creators] Skipping featured creator with invalid pubkey",
                {
                  reason: "invalid_pubkey",
                  source: "featured_creators",
                  valueLength:
                    typeof creator.pubkey === "string" ? creator.pubkey.length : null,
                },
              );
              addTelemetryBreadcrumb(
                "Featured creator skipped",
                {
                  reason: "invalid_pubkey",
                  source: "featured_creators",
                },
                "warning",
              );
              return null;
            }

            if (!resolvedHex || !pubkeySet.has(resolvedHex)) {
              return null;
            }

            const bundle = buildBundleFromDiscoveryCreator(creator);
            const profile = await this.applyBundleToCache(resolvedHex, bundle, {
              cacheHit: Boolean(creator.cacheHit),
              featured: true,
              displayName: creator.displayName ?? null,
              name: creator.name ?? null,
              about: creator.about ?? null,
              picture: creator.picture ?? null,
              banner: creator.banner ?? null,
              nip05: creator.nip05 ?? null,
            });

            return { pubkey: resolvedHex, profile };
          }),
        );

        for (const entry of fetchedEntries) {
          if (!entry) {
            continue;
          }
          missingPubkeys.delete(entry.pubkey);
          fetchedMap.set(entry.pubkey, entry.profile);
        }

        const combined = pubkeys
          .map((pubkey) => fetchedMap.get(pubkey) ?? cachedEntries.get(pubkey))
          .filter((profile): profile is CreatorProfile => Boolean(profile));

        this.featuredCreators = combined;
        const combinedSecurityBlocked = combined.some(
          (profile) => profile.tierSecurityBlocked === true,
        );
        if (combinedSecurityBlocked) {
          this.featuredStatusMessage = FIREFOX_TIER_SECURITY_WARNING;
        } else if (combined.some((profile) => profile.tierDataFresh === false)) {
          this.featuredStatusMessage = staleTierWarning;
        } else if (!this.featuredError) {
          this.featuredStatusMessage = "";
        }

        if (!combined.length) {
          this.featuredError = "Failed to load featured creators.";
        } else {
          this.featuredError = "";
          if (missingPubkeys.size) {
            console.warn("[creators] Featured creators missing from response", {
              pubkeys: Array.from(missingPubkeys),
            });
            captureTelemetryWarning(
              "[creators] Featured creators missing from response",
              {
                missingCount: missingPubkeys.size,
                source: "featured_creators",
              },
            );
            addTelemetryBreadcrumb(
              "Featured creators missing from response",
              { missingCount: missingPubkeys.size },
              "warning",
            );
          }
        }
      } catch (error) {
        console.error("[creators] Failed to batch load featured creators", error);
        if (!this.featuredCreators.length) {
          this.featuredError = "Failed to load featured creators.";
        }
      }

      const currentCombined = Array.isArray(this.featuredCreators)
        ? this.featuredCreators.filter(Boolean)
        : [];
      const combinedMap = new Map<string, CreatorProfile>();
      for (const profile of currentCombined) {
        if (profile?.pubkey) {
          combinedMap.set(profile.pubkey, profile);
        }
      }

      const phonebookTargets = pubkeys.filter((pubkey) =>
        needsPhonebookEnrichment(combinedMap.get(pubkey)),
      );

      if (phonebookTargets.length) {
        const phonebookResults = await Promise.all(
          phonebookTargets.map(async (pubkey) => {
            try {
              const response = await findProfiles(toNpub(pubkey));
              const match = response.results.find((result) => result.pubkey === pubkey);
              if (!match) {
                return null;
              }

              const phonebookCreator = createCreatorFromPhonebook(match);
              const existing = combinedMap.get(pubkey);
              const merged = existing
                ? mergeDiscoveryIntoPhonebook(cloneCreatorProfile(existing), phonebookCreator)
                : phonebookCreator;

              merged.featured = merged.featured ?? true;

              return { pubkey, profile: merged };
            } catch (error) {
              console.warn("[creators] Phonebook fallback failed for featured creator", {
                pubkey,
                error,
              });
              return null;
            }
          }),
        );

        for (const entry of phonebookResults) {
          if (!entry) {
            continue;
          }
          combinedMap.set(entry.pubkey, entry.profile);
        }

        this.featuredCreators = pubkeys
          .map((pubkey) => combinedMap.get(pubkey))
          .filter((profile): profile is CreatorProfile => Boolean(profile));
      }

      this.loadingFeatured = false;
    },

    async loadFeaturedCreators(forceRefresh = false) {
      return this.loadFeatured(CONFIG_FEATURED_CREATORS, { fresh: forceRefresh });
    },

    async refreshFeatured(npubs: string[]) {
      return this.loadFeatured(npubs, { fresh: true });
    },

    async publishTierDefinitions(tiersArray: Tier[]) {
      const creatorNpub = this.currentUserNpub;
      const created_at = Math.floor(Date.now() / 1000);
      const content = JSON.stringify(
        tiersArray.map((t) => ({ ...t, price: t.price_sats })),
      );

      const event: Partial<NostrEvent> = {
        pubkey: creatorNpub,
        created_at,
        kind: 30019,
        tags: [["d", "tiers"]],
        content,
      };
      event.id = getEventHash(event as any);
      event.sig = await signEvent(event as any, this.currentUserPrivkey);
      await publishEvent(event as any);
      const relayEvent: RelayEvent = {
        id: event.id!,
        pubkey: creatorNpub,
        created_at,
        kind: 30019,
        tags: [["d", "tiers"]],
        content,
        sig: event.sig!,
      };
      await this.saveTierCache(creatorNpub, tiersArray, relayEvent);
    },
  },
});

function shortPubkey(pubkey: string): string {
  if (!pubkey) {
    return "";
  }
  try {
    const npub = nip19.npubEncode(pubkey);
    return shortenNpub(npub);
  } catch {
    return shortenNpub(pubkey);
  }
}

export function fallbackName(row: CreatorRow | null | undefined): string {
  if (!row) {
    return "";
  }

  const primaryDisplay = toNullableString((row as any).displayName);
  if (primaryDisplay) {
    return primaryDisplay;
  }

  const metaDisplay = toNullableString((row.profile as any)?.display_name);
  if (metaDisplay) {
    return metaDisplay;
  }

  const primaryName = toNullableString((row as any).name);
  if (primaryName) {
    return primaryName;
  }

  const metaName = toNullableString((row.profile as any)?.name);
  if (metaName) {
    return metaName;
  }

  return shortPubkey(typeof row.pubkey === "string" ? row.pubkey : "");
}

export function avatar(row: CreatorRow | null | undefined): string {
  if (!row) {
    return "";
  }

  const direct = toNullableString((row as any).picture);
  if (direct) {
    return direct;
  }

  const profilePicture = toNullableString((row.profile as any)?.picture);
  if (profilePicture) {
    return profilePicture;
  }

  return "";
}
