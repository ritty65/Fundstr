import { defineStore } from "pinia";
import { ref } from "vue";
import { db } from "./dexie";
import { getEventHash, signEvent, publishEvent } from "./nostr";
import { nip19 } from "nostr-tools";
import { Event as NostrEvent } from "nostr-tools";
import type { Tier } from "./types";
import { toHex, type NostrEvent as RelayEvent } from "@/nostr/relayClient";
import { safeUseLocalStorage } from "src/utils/safeLocalStorage";
import { type NutzapProfileDetails } from "@/nutzap/profileCache";
import { useDiscovery } from "src/api/fundstrDiscovery";
import type {
  Creator as DiscoveryCreator,
  CreatorTier as DiscoveryCreatorTier,
} from "src/lib/fundstrApi";
import type { Creator as FundstrCreator } from "src/lib/fundstrApi";
import { useNdk } from "src/composables/useNdk";

export const FEATURED_CREATORS = [
  "npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m",
  "npub1sg6plzptd64u62a878hep2kev88swjh3tw00gjsfl8f237lmu63q0uf63m",
  "npub1qny3tkh0acurzla8x3zy4nhrjz5zd8l9sy9jys09umwng00manysew95gx",
  "npub1cj8znuztfqkvq89pl8hceph0svvvqk0qay6nydgk9uyq7fhpfsgsqwrz4u",
  "npub1a2cww4kn9wqte4ry70vyfwqyqvpswksna27rtxd8vty6c74era8sdcw83a",
  "npub1s05p3ha7en49dv8429tkk07nnfa9pcwczkf5x5qrdraqshxdje9sq6eyhe",
  "npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6",
  "npub1dergggklka99wwrs92yz8wdjs952h2ux2ha2ed598ngwu9w7a6fsh9xzpc",
  "npub1s5yq6wadwrxde4lhfs56gn64hwzuhnfa6r9mj476r5s4hkunzgzqrs6q7z",
  "npub1spdnfacgsd7lk0nlqkq443tkq4jx9z6c6ksvaquuewmw7d3qltpslcq6j7",
];

export type CreatorProfile = FundstrCreator;

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

  return {
    id,
    name,
    price_sats,
    description,
    media: [],
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

export async function fetchFundstrProfileBundle(
  pubkeyInput: string,
): Promise<FundstrProfileBundle> {
  const discovery = useDiscovery();
  const pubkey = toHex(pubkeyInput);
  const normalizedPubkey = pubkey.toLowerCase();
  let lastError: unknown = null;

  const fetchCreatorByQuery = async (query: string): Promise<DiscoveryCreator | null> => {
    const trimmed = typeof query === "string" ? query.trim() : "";
    if (!trimmed) {
      return null;
    }
    try {
      const response = await discovery.getCreators({ q: trimmed, fresh: true });
      for (const entry of response.results) {
        if (typeof entry.pubkey === "string" && entry.pubkey.toLowerCase() === normalizedPubkey) {
          return entry;
        }
      }
    } catch (error) {
      lastError = error;
      console.error("fetchFundstrProfileBundle discovery query failed", {
        query: trimmed,
        error,
      });
    }
    return null;
  };

  let creator: DiscoveryCreator | null = await fetchCreatorByQuery(pubkey);
  if (!creator) {
    let npubQuery: string | null = null;
    try {
      npubQuery = nip19.npubEncode(pubkey);
    } catch (error) {
      console.warn("Failed to encode pubkey to npub for discovery lookup", error);
    }
    if (npubQuery) {
      creator = await fetchCreatorByQuery(npubQuery);
    }
  }

  if (!creator) {
    throw new FundstrProfileFetchError("No profile records returned from discovery", {
      fallbackAttempted: false,
      cause: lastError ?? undefined,
    });
  }

  const profile = cloneDiscoveryProfile(creator.profile);
  const profileDetails = extractProfileDetailsFromDiscovery(profile);
  const relayHints = collectRelayHintsFromProfile(profile, null, profileDetails);

  let followers: number | null = null;
  if (typeof creator.followers === "number" && Number.isFinite(creator.followers)) {
    followers = creator.followers;
  }

  let following: number | null = null;
  if (typeof creator.following === "number" && Number.isFinite(creator.following)) {
    following = creator.following;
  }

  let joined: number | null = null;
  if (typeof creator.joined === "number" && Number.isFinite(creator.joined)) {
    joined = creator.joined;
  }

  const tierCandidates: DiscoveryCreatorTier[] = Array.isArray(creator.tiers)
    ? (creator.tiers as DiscoveryCreatorTier[])
    : [];

  const ensureTierCandidates = async () => {
    if (tierCandidates.length) {
      return;
    }
    try {
      const tierResponse = await discovery.getCreatorTiers({ id: pubkey, fresh: true });
      if (Array.isArray(tierResponse.tiers) && tierResponse.tiers.length) {
        tierCandidates.push(...(tierResponse.tiers as DiscoveryCreatorTier[]));
      }
    } catch (error) {
      console.warn("fetchFundstrProfileBundle discovery tier lookup failed", {
        pubkey,
        error,
      });
      let npubId: string | null = null;
      try {
        npubId = nip19.npubEncode(pubkey);
      } catch {
        npubId = null;
      }
      if (npubId) {
        try {
          const tierResponse = await discovery.getCreatorTiers({ id: npubId, fresh: true });
          if (Array.isArray(tierResponse.tiers) && tierResponse.tiers.length) {
            tierCandidates.push(...(tierResponse.tiers as DiscoveryCreatorTier[]));
          }
        } catch (npubError) {
          console.warn("fetchFundstrProfileBundle discovery tier lookup via npub failed", {
            pubkey,
            error: npubError,
          });
        }
      }
    }
  };

  await ensureTierCandidates();

  const tiers = tierCandidates
    .map((tier) => convertDiscoveryTier(tier))
    .filter((tier): tier is Tier => tier !== null)
    .map((tier) => normalizeTier(tier));

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

  const displayName =
    overrides.displayName ??
    toNullableString(profile?.display_name ?? profile?.displayName ?? null);
  const name = overrides.name ?? toNullableString(profile?.name);
  const about = overrides.about ?? toNullableString(profile?.about);
  const nip05 = overrides.nip05 ?? toNullableString(profile?.nip05 ?? profile?.nip05_npub);
  const picture = overrides.picture ?? toNullableString(profile?.picture);
  const banner = overrides.banner ?? toNullableString(profile?.banner);

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
          q: normalizedQuery || "*",
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

      if (Array.isArray(bundle.tiers)) {
        try {
          this.updateTierCacheState(pubkey, bundle.tiers, null, {
            updatedAt: bundle.joined ?? null,
          });
        } catch (tierCacheError) {
          console.error("[creators] Failed to update warm tier cache", {
            pubkey,
            error: tierCacheError,
          });
        }
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
          return { ...warmCached, cacheHit: true };
        }

        const cached = await db.profiles.get(pubkey);
        if (cached && now - cached.fetchedAt < cacheExpiry) {
          return { ...cached.profile, cacheHit: true } as CreatorProfile;
        }

        const inflight = this.inFlightCreatorRequests[pubkey];
        if (inflight) {
          return inflight;
        }
      }

      const fetchPromise = (async (): Promise<CreatorProfile | null> => {
        try {
          const bundle = await fetchFundstrProfileBundle(pubkey);
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

      try {
        return await fetchPromise;
      } finally {
        if (this.inFlightCreatorRequests[pubkey] === fetchPromise) {
          delete this.inFlightCreatorRequests[pubkey];
        }
      }
    },

    async loadFeaturedCreators(forceRefresh = false) {
      this.featuredError = "";
      this.loadingFeatured = true;

      const discovery = useDiscovery();

      if (forceRefresh) {
        this.featuredCreators = [];
      }

      const pubkeys: string[] = FEATURED_CREATORS.map((npub) => {
        try {
          const decoded = nip19.decode(npub).data as string;
          return typeof decoded === "string" ? decoded.toLowerCase() : "";
        } catch (e) {
          console.error(`Failed to decode npub: ${npub}`, e);
          return "";
        }
      })
        .map((pubkey) => {
          const trimmed = typeof pubkey === "string" ? pubkey.trim() : "";
          if (!trimmed) {
            return null;
          }
          if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
            return trimmed.toLowerCase();
          }
          try {
            return toHex(trimmed).toLowerCase();
          } catch (error) {
            console.warn("[creators] Invalid featured creator identifier", {
              identifier: pubkey,
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
        const response = await discovery.getCreators({
          q: pubkeys.join(","),
          fresh: forceRefresh,
        });

        const fetchedMap = new Map<string, CreatorProfile>();
        const missingPubkeys = new Set(pubkeys);

        const results = Array.isArray(response.results) ? response.results : [];
        const fetchedEntries = await Promise.all(
          results.map(async (creator) => {
            if (!creator || typeof creator.pubkey !== "string") {
              return null;
            }

            let resolvedHex: string | null = null;
            try {
              resolvedHex = toHex(creator.pubkey).toLowerCase();
            } catch (error) {
              if (/^[0-9a-fA-F]{64}$/.test(creator.pubkey)) {
                resolvedHex = creator.pubkey.toLowerCase();
              } else {
                console.warn("[creators] Skipping featured creator with invalid pubkey", {
                  pubkey: creator.pubkey,
                  error,
                });
                return null;
              }
            }

            if (!resolvedHex || !pubkeySet.has(resolvedHex)) {
              return null;
            }

            const bundle = buildBundleFromDiscoveryCreator(creator);
            const profile = await this.applyBundleToCache(resolvedHex, bundle, {
              cacheHit: Boolean(creator.cacheHit),
              featured: true,
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
