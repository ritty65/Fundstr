import { defineStore } from "pinia";
import { ref } from "vue";
import { db } from "./dexie";
import { getEventHash, signEvent, publishEvent } from "./nostr";
import { nip19 } from "nostr-tools";
import { Event as NostrEvent } from "nostr-tools";
import type { Tier } from "./types";
import { toHex, type NostrEvent as RelayEvent } from "@/nostr/relayClient";
import { safeUseLocalStorage } from "src/utils/safeLocalStorage";
import { normalizeTierMediaItems } from "src/utils/validateMedia";
import { type NutzapProfileDetails } from "@/nutzap/profileCache";
import { useDiscovery } from "src/api/fundstrDiscovery";
import type {
  Creator as DiscoveryCreator,
  CreatorTier as DiscoveryCreatorTier,
} from "src/lib/fundstrApi";
import type { Creator as FundstrCreator } from "src/lib/fundstrApi";
import { useNdk } from "src/composables/useNdk";
import { shortenNpub } from "src/utils/profile";
import { FEATURED_CREATORS as CONFIG_FEATURED_CREATORS } from "src/config/featured-creators";

export { FEATURED_CREATORS } from "src/config/featured-creators";

export type CreatorProfile = FundstrCreator;
export type CreatorRow = CreatorProfile;

const FRESH_RETRY_BASE_MS = 1500;
const FRESH_RETRY_MAX_MS = 30000;
const FRESH_WARN_DEBOUNCE_MS = 60000;

let nextProfileFreshAttemptAt = 0;
let profileFreshFailureCount = 0;
let lastProfileWarnAt = 0;

let nextTiersFreshAttemptAt = 0;
let tiersFreshFailureCount = 0;
let lastTiersWarnAt = 0;

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

  if (!p2pk && mintList.length === 0 && relayList.length === 0 && !tierAddr) {
    return null;
  }

  return {
    p2pkPubkey: p2pk,
    trustedMints: mintList,
    relays: relayList,
    tierAddr,
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
  const name = typeof tier.name === "string" ? tier.name : "";
  const amountMsat =
    typeof tier.amountMsat === "number" && Number.isFinite(tier.amountMsat)
      ? tier.amountMsat
      : null;
  const price_sats = amountMsat !== null ? Math.max(0, Math.round(amountMsat / 1000)) : 0;
  const description = typeof tier.description === "string" ? tier.description : "";

  const media = normalizeTierMediaItems(tier.media);

  return {
    id,
    name,
    price_sats,
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
  tiers: Tier[] | null;
}

export interface FetchFundstrProfileBundleOptions {
  forceRefresh?: boolean;
}

export async function fetchFundstrProfileBundle(
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
      if (nowWarn - lastProfileWarnAt > FRESH_WARN_DEBOUNCE_MS) {
        console.warn("fetchFundstrProfileBundle using cached discovery profile", {
          query: firstAvailable.query,
          error: firstAvailable.freshError,
        });
        lastProfileWarnAt = nowWarn;
      }
    } else {
      const nowWarn = Date.now();
      if (nowWarn - lastProfileWarnAt > FRESH_WARN_DEBOUNCE_MS) {
        console.warn("fetchFundstrProfileBundle using cached discovery profile", {
          query: firstAvailable?.query ?? pubkey,
          reason: "fresh profile result unavailable",
        });
        lastProfileWarnAt = nowWarn;
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
  }

  const fetchTiersForId = async (id: string): Promise<TierQueryResult> => {
    const cached: DiscoveryCreatorTier[] = [];
    try {
      const response = await discovery.getCreatorTiers({ id, fresh: false });
      if (Array.isArray(response.tiers)) {
        cached.push(...(response.tiers as DiscoveryCreatorTier[]));
      }
    } catch (error) {
      lastError = error;
      console.warn("fetchFundstrProfileBundle cached tier lookup failed", {
        id,
        error,
      });
    }

    let fresh: DiscoveryCreatorTier[] | null = null;
    let freshError: unknown | null = null;
    const now = Date.now();
    const allowFresh = forceRefresh || now >= nextTiersFreshAttemptAt;
    const shouldFetchFresh = (forceRefresh || cached.length === 0) && allowFresh;
    if (shouldFetchFresh) {
      try {
        const request: { id: string; fresh?: boolean; timeoutMs?: number } = {
          id,
          fresh: true,
        };
        request.timeoutMs = undefined;
        const response = await discovery.getCreatorTiers(request);
        if (Array.isArray(response.tiers)) {
          fresh = response.tiers as DiscoveryCreatorTier[];
        } else {
          fresh = [];
        }
        tiersFreshFailureCount = 0;
        nextTiersFreshAttemptAt = 0;
      } catch (error) {
        freshError = error;
        fresh = null;
        lastError = error;
        if (!forceRefresh) {
          tiersFreshFailureCount = Math.min(tiersFreshFailureCount + 1, 6);
          const delay = Math.min(
            FRESH_RETRY_BASE_MS * 2 ** Math.max(tiersFreshFailureCount - 1, 0),
            FRESH_RETRY_MAX_MS,
          );
          nextTiersFreshAttemptAt = Date.now() + delay;
        }
        console.error("fetchFundstrProfileBundle discovery tier lookup failed", {
          id,
          error,
        });
      }
    }

    return { id, cached, fresh, freshError };
  };

  const tierResults: TierQueryResult[] = [];
  for (const id of tierIdentifiers) {
    tierResults.push(await fetchTiersForId(id));
    const lastTierResult = tierResults[tierResults.length - 1];
    if (lastTierResult.fresh !== null) {
      break;
    }
  }

  const tierFreshMatch = tierResults.find((result) => result.fresh !== null);
  const tierFallbackSource = tierResults.find((result) => result.cached.length > 0);
  const finalTierCandidates = tierFreshMatch
    ? [...(tierFreshMatch.fresh ?? [])]
    : tierFallbackSource?.cached
      ? [...tierFallbackSource.cached]
      : [];
  const initialTierCandidates = tierFallbackSource?.cached?.length
    ? [...tierFallbackSource.cached]
    : tierFreshMatch?.fresh
      ? [...tierFreshMatch.fresh]
      : [];

  let usedCachedTierFallback = false;
  if (!tierFreshMatch && tierFallbackSource?.cached?.length) {
    usedCachedTierFallback = true;
    if (tierFallbackSource.freshError) {
      const nowWarn = Date.now();
      if (nowWarn - lastTiersWarnAt > FRESH_WARN_DEBOUNCE_MS) {
        console.warn("fetchFundstrProfileBundle using cached discovery tiers", {
          id: tierFallbackSource.id,
          error: tierFallbackSource.freshError,
        });
        lastTiersWarnAt = nowWarn;
      }
    } else {
      const nowWarn = Date.now();
      if (nowWarn - lastTiersWarnAt > FRESH_WARN_DEBOUNCE_MS) {
        console.warn("fetchFundstrProfileBundle using cached discovery tiers", {
          id: tierFallbackSource.id,
          reason: "fresh tier result unavailable",
        });
        lastTiersWarnAt = nowWarn;
      }
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

  return {
    ...baseBundle,
    tiers: normalizedTiers && normalizedTiers.length ? normalizedTiers : null,
    fetchedFromFallback: usedCachedProfileFallback || usedCachedTierFallback,
  };
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
    .filter((tier): tier is Tier => tier !== null);

  return {
    profile,
    profileEvent: null,
    followers,
    following,
    joined,
    profileDetails,
    relayHints,
    fetchedFromFallback: false,
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
  tierRelayFailures?: Record<string, number>;
  lastFundstrRelayFailureAt?: number | null;
  lastFundstrRelayFailureNotifiedAt?: number | null;
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
    cacheHit: overrides.cacheHit,
    featured: overrides.featured,
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
      searchWarnings: [] as string[],
      featuredError: "",
      tiersMap: {} as Record<string, Tier[]>,
      tierFetchError: false,
      currentUserNpub: "",
      currentUserPrivkey: "",
      favorites,
      warmCache: {} as Record<string, CreatorWarmCache>,
      inFlightCreatorRequests: {} as Record<string, Promise<CreatorProfile | null>>,
      searchAbortController: null as AbortController | null,
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
      meta: { eventId?: string | null; updatedAt?: number | null } = {},
    ) {
      const entry: CreatorWarmCache = {
        ...(this.warmCache[pubkeyHex] ?? {}),
      };
      const normalized = Array.isArray(tiers)
        ? tiers.map((tier) => normalizeTier(tier))
        : [];
      entry.tiersLoaded = true;
      entry.tiers = Array.isArray(tiers) ? normalized : [];
      entry.tierEvent = event ? cloneRelayEvent(event) : null;
      entry.tierEventId = meta.eventId ?? event?.id ?? null;
      entry.tierUpdatedAt = meta.updatedAt ?? event?.created_at ?? null;
      this.warmCache[pubkeyHex] = entry;
      this.tiersMap[pubkeyHex] = normalized;
      this.tierFetchError = false;
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
        ? tiers.map((tier) => normalizeTier(tier))
        : [];
      const updatedAt =
        meta.updatedAt ?? event?.created_at ?? (event ? event.created_at : null);
      this.updateTierCacheState(pubkeyHex, Array.isArray(tiers) ? normalized : [], event, {
        eventId: event?.id ?? null,
        updatedAt,
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
        const normalized = (tierRow.tiers ?? []).map((tier: any) =>
          normalizeTier(tier),
        );
        this.updateTierCacheState(pubkeyHex, normalized, event, {
          eventId: tierRow.eventId,
          updatedAt: tierRow.updatedAt,
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

    async searchCreators(
      query: string,
      { fresh = false }: { fresh?: boolean } = {},
    ) {
      const discovery = useDiscovery();
      const rawQuery = typeof query === "string" ? query.trim() : "";

      if (!rawQuery) {
        if (this.searchAbortController) {
          this.searchAbortController.abort();
          this.searchAbortController = null;
        }
        this.searchResults = [];
        this.error = "";
        this.searchWarnings = [];
        this.searching = false;
        return;
      }

      if (this.searchAbortController) {
        this.searchAbortController.abort();
        this.searchAbortController = null;
      }

      this.searchResults = [];
      this.error = "";
      this.searchWarnings = [];
      this.searching = true;

      const handleFailure = (message: string) => {
        this.error = message;
        this.searchResults = [];
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
        if (!resolvedHex) {
          handleFailure("Invalid identifier");
          this.searching = false;
          return;
        }
      }

      if (!resolvedHex && normalizedQuery.includes("@")) {
        try {
          const ndk = await useNdk({ requireSigner: false });
          const user = await ndk.getUserFromNip05(normalizedQuery);
          if (user?.pubkey) {
            resolvedHex = user.pubkey;
          } else {
            handleFailure("NIP-05 not found");
            this.searching = false;
            return;
          }
        } catch (error) {
          console.error("[creators] NIP-05 lookup failed", error);
          handleFailure("Invalid identifier");
          this.searching = false;
          return;
        }
      }

      if (resolvedHex) {
        if (!/^[0-9a-fA-F]{64}$/.test(resolvedHex)) {
          handleFailure("Invalid pubkey");
          this.searching = false;
          return;
        }
        try {
          const creatorProfile = await this.fetchCreator(resolvedHex, fresh);
          if (creatorProfile) {
            this.searchResults = [cloneCreatorProfile(creatorProfile)];
          } else {
            handleFailure("Failed to fetch profile.");
          }
        } catch (error) {
          console.error("[creators] Creator lookup failed", error);
          handleFailure("Failed to fetch profile.");
        } finally {
          this.searching = false;
        }
        return;
      }

      const controller = new AbortController();
      this.searchAbortController = controller;

      try {
        const response = await discovery.getCreators({
          q: normalizedQuery,
          fresh,
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        this.searchResults = response.results.map((creator) => cloneCreatorProfile(creator));
        this.searchWarnings = Array.isArray(response.warnings)
          ? response.warnings.slice()
          : [];
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error("[creators] Discovery search failed", error);
        handleFailure(
          error instanceof Error
            ? error.message
            : "Unable to load creators. Please try again.",
        );
      } finally {
        if (!controller.signal.aborted) {
          this.searching = false;
          this.searchAbortController = null;
        }
      }
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
        });
      } catch (tierCacheError) {
        console.error("[creators] Failed to update warm tier cache", {
          pubkey,
          error: tierCacheError,
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

      const triggerNetworkFetch = () => {
        const existing = this.inFlightCreatorRequests[pubkey];
        if (existing) {
          return existing;
        }

        const fetchPromise = (async (): Promise<CreatorProfile | null> => {
          try {
            const bundle = await fetchFundstrProfileBundle(pubkey, {
              forceRefresh,
            });
            return await this.applyBundleToCache(pubkey, bundle, { cacheHit: false });
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
          triggerNetworkFetch().catch(() => {});
          return { ...warmCached, cacheHit: true };
        }

        const cached = await db.profiles.get(pubkey);
        if (cached && now - cached.fetchedAt < cacheExpiry) {
          triggerNetworkFetch().catch(() => {});
          return { ...cached.profile, cacheHit: true } as CreatorProfile;
        }

        const inflight = this.inFlightCreatorRequests[pubkey];
        if (inflight) {
          return inflight;
        }
      }

      return await triggerNetworkFetch();
    },

    async loadFeatured(npubs: string[], opts: { fresh?: boolean } = {}) {
      this.featuredError = "";
      this.loadingFeatured = true;

      const discovery = useDiscovery();
      const fresh = Boolean(opts.fresh);

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
        }
      }

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

        if (!combined.length) {
          this.featuredError = "Failed to load featured creators.";
        } else {
          this.featuredError = "";
          if (missingPubkeys.size) {
            console.warn("[creators] Featured creators missing from response", {
              pubkeys: Array.from(missingPubkeys),
            });
          }
        }
      } catch (error) {
        console.error("[creators] Failed to batch load featured creators", error);
        if (!this.featuredCreators.length) {
          this.featuredError = "Failed to load featured creators.";
        }
      } finally {
        this.loadingFeatured = false;
      }
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
