import { defineStore } from "pinia";
import { ref } from "vue";
import { db } from "./dexie";
import {
  useNostrStore,
  getEventHash,
  signEvent,
  publishEvent,
} from "./nostr";
import { useNdk } from "src/composables/useNdk";
import { nip19 } from "nostr-tools";
import { Event as NostrEvent } from "nostr-tools";
import { notifyWarning } from "src/js/notify";
import type { Tier } from "./types";
import {
  queryNostr,
  queryNutzapTiers,
  normalizeEvents,
  pickLatestReplaceable,
  toHex,
  type Filter,
  type NostrEvent as RelayEvent,
} from "@/nostr/relayClient";
import { fallbackDiscoverRelays } from "@/nostr/discovery";
import { parseTierDefinitionEvent } from "src/nostr/tiers";
import {
  FUNDSTR_REQ_URL,
  FUNDSTR_WS_URL,
  WS_FIRST_TIMEOUT_MS,
} from "@/nutzap/relayEndpoints";
import { safeUseLocalStorage } from "src/utils/safeLocalStorage";
import {
  parseNutzapProfileEvent,
  type NutzapProfileDetails,
} from "@/nutzap/profileCache";
import { FALLBACK_RELAYS } from "@/config/relays";
import { simpleRelayQuery, SimpleRelayError } from "@/nutzap/simpleRelay";

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

export interface CreatorProfile {
  pubkey: string;
  profile: Record<string, any> | null;
  followers: number | null;
  following: number | null;
  joined: number | null;
}

const CUSTOM_LINK_WS_TIMEOUT_MS = Math.min(WS_FIRST_TIMEOUT_MS, 1200);
const TIER_RELAY_FAILURE_TTL_MS = 5 * 60 * 1000;
const TIER_FETCH_TIMEOUT_MS = 1200;
const FUNDSTR_FAILURE_NOTIFY_TTL_MS = 5 * 60 * 1000;

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

export interface FundstrProfileBundle {
  profile: Record<string, any> | null;
  profileEvent: RelayEvent | null;
  followers: number;
  following: number;
  profileDetails: NutzapProfileDetails | null;
  relayHints: string[];
  fetchedFromFallback: boolean;
}

export async function fetchFundstrProfileBundle(
  pubkeyInput: string,
): Promise<FundstrProfileBundle> {
  const pubkey = toHex(pubkeyInput);
  const filters: Filter[] = [
    { kinds: [0, 10019], authors: [pubkey] },
    { kinds: [3], authors: [pubkey] },
    { kinds: [3], "#p": [pubkey] },
  ];

  let events: RelayEvent[] = [];
  let lastError: unknown = null;
  try {
    events = await queryNostr(filters, {
      preferFundstr: true,
      allowFanoutFallback: false,
      wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
    });
  } catch (error) {
    lastError = error;
    console.error("fetchFundstrProfileBundle Fundstr query failed", error);
  }

  let fallbackAttempted = false;

  if (!events.length) {
    try {
      const direct = await simpleRelayQuery(filters, {
        timeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
      });
      if (direct.length) {
        events = direct;
        console.info("[creators] direct Fundstr relay query succeeded", {
          pubkey,
          filters,
        });
      }
    } catch (directError) {
      lastError = directError;
      const label =
        directError instanceof SimpleRelayError ? directError.message : String(directError);
      console.warn("fetchFundstrProfileBundle direct relay query failed", label);
    }
  }

  if (!events.length) {
    fallbackAttempted = true;
    const fallbackRelays = new Set<string>(FALLBACK_RELAYS);
    try {
      const discovered = await fallbackDiscoverRelays(pubkey);
      for (const url of discovered) {
        const trimmed = url.trim();
        if (trimmed) {
          fallbackRelays.add(trimmed);
        }
      }
    } catch (discoveryError) {
      console.warn(
        "fetchFundstrProfileBundle fallback relay discovery failed",
        discoveryError,
      );
    }

    const fanout = Array.from(fallbackRelays);

    if (fanout.length) {
      try {
        events = await queryNostr(filters, {
          preferFundstr: true,
          allowFanoutFallback: true,
          fanout,
          wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
        });
        if (events.length) {
          console.warn("[creators] Fundstr profile fallback succeeded", {
            pubkey,
            relays: fanout,
          });
        }
      } catch (fallbackError) {
        lastError = fallbackError;
        console.error(
          "fetchFundstrProfileBundle fallback query failed",
          fallbackError,
        );
      }
    }
  }

  const normalized = normalizeEvents(events);

  const preferredProfile =
    pickLatestReplaceable(normalized, { kind: 10019, pubkey }) ??
    pickLatestReplaceable(normalized, { kind: 0, pubkey });

  let profile: Record<string, any> | null = null;
  if (preferredProfile?.content) {
    try {
      const parsed = JSON.parse(preferredProfile.content);
      if (parsed && typeof parsed === "object") {
        profile = { ...(parsed as Record<string, any>) };
      }
    } catch (err) {
      console.warn("Failed to parse profile content", err);
    }
  }

  const followingEvent = pickLatestReplaceable(normalized, { kind: 3, pubkey });
  let following = 0;
  if (followingEvent) {
    const followingSet = new Set<string>();
    for (const tag of followingEvent.tags ?? []) {
      if (tag[0] === "p" && typeof tag[1] === "string") {
        followingSet.add(tag[1].toLowerCase());
      }
    }
    following = followingSet.size;
  }

  const followerSet = new Set<string>();
  for (const ev of normalized) {
    if (ev.kind !== 3 || ev.pubkey === pubkey) continue;
    for (const tag of ev.tags ?? []) {
      if (tag[0] === "p" && typeof tag[1] === "string") {
        if (tag[1].toLowerCase() === pubkey) {
          followerSet.add(ev.pubkey.toLowerCase());
          break;
        }
      }
    }
  }

  if (!preferredProfile && !profile && !normalized.length) {
    throw new FundstrProfileFetchError(
      "No profile events returned from Fundstr or fallback relays",
      {
        fallbackAttempted,
        cause: lastError ?? undefined,
      },
    );
  }

  const profileDetails = parseNutzapProfileEvent(preferredProfile ?? null);
  const relayHints = collectRelayHintsFromProfile(
    profile,
    preferredProfile ?? null,
    profileDetails,
  );

  return {
    profile,
    profileEvent: preferredProfile ?? null,
    followers: followerSet.size,
    following,
    profileDetails,
    relayHints,
    fetchedFromFallback: fallbackAttempted && events.length > 0,
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
      tiersMap: {} as Record<string, Tier[]>,
      tierFetchError: false,
      currentUserNpub: "",
      currentUserPrivkey: "",
      favorites,
      warmCache: {} as Record<string, CreatorWarmCache>,
      inFlightCreatorRequests: {} as Record<string, Promise<CreatorProfile | null>>,
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

    async searchCreators(query: string, forceRefresh = false) {
      this.searchResults = [];
      this.error = "";
      if (!query) {
        return;
      }
      this.searching = true;

      let pubkey = query.trim();
      try {
        if (pubkey.startsWith("npub")) {
          const decoded = nip19.decode(pubkey);
          pubkey = typeof decoded.data === "string" ? (decoded.data as string) : "";
        } else if (pubkey.startsWith("nprofile")) {
          const decoded = nip19.decode(pubkey);
          if (typeof decoded.data === 'object' && (decoded.data as any).pubkey) {
            pubkey = (decoded.data as any).pubkey;
          }
        } else if (pubkey.includes('@')) {
          // NIP-05
          const ndk = await useNdk({ requireSigner: false });
          const user = await ndk.getUserFromNip05(pubkey);
          if (user) {
            pubkey = user.pubkey;
          } else {
            this.error = "NIP-05 not found";
            this.searching = false;
            return;
          }
        }
      } catch(e) {
        console.error(e);
        this.error = "Invalid identifier";
        this.searching = false;
        return;
      }


      if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
        this.error = "Invalid pubkey";
        this.searching = false;
        return;
      }

      try {
        const creatorProfile = await this.fetchCreator(pubkey, forceRefresh);
        if (creatorProfile) {
          this.searchResults.push(creatorProfile);
        } else {
          this.error = "Failed to fetch profile.";
        }
      } catch (e) {
        console.error(e);
        this.error = "Failed to fetch profile.";
      } finally {
        this.searching = false;
      }
    },

    async fetchCreator(pubkey: string, forceRefresh = false) {
      const now = Date.now();
      const cacheExpiry = 3 * 60 * 60 * 1000; // 3 hours

      if (!forceRefresh) {
        const cached = await db.profiles.get(pubkey);
        if (cached && (now - cached.fetchedAt < cacheExpiry)) {
          return cached.profile;
        }

        const inflight = this.inFlightCreatorRequests[pubkey];
        if (inflight) {
          return inflight;
        }
      }

      const nostrStore = useNostrStore();

      const fetchPromise = (async (): Promise<CreatorProfile | null> => {
        try {
          await nostrStore.initNdkReadOnly();
          const ndk = await useNdk({ requireSigner: false });
          const user = ndk.getUser({ pubkey });

          const profilePromise = user
            .fetchProfile()
            .then(() => (user.profile as Record<string, any> | null) ?? null)
            .catch((error) => {
              console.warn(`Failed to fetch profile metadata for ${pubkey}`, error);
              return null;
            });

          const followersPromise = nostrStore
            .fetchFollowerCount(pubkey)
            .catch((error) => {
              console.warn(`Failed to fetch follower count for ${pubkey}`, error);
              return null;
            });

          const followingPromise = nostrStore
            .fetchFollowingCount(pubkey)
            .catch((error) => {
              console.warn(`Failed to fetch following count for ${pubkey}`, error);
              return null;
            });

          const joinedPromise = nostrStore
            .fetchJoinDate(pubkey)
            .catch((error) => {
              console.warn(`Failed to fetch join date for ${pubkey}`, error);
              return null;
            });

          const [profile, followers, following, joined] = await Promise.all([
            profilePromise,
            followersPromise,
            followingPromise,
            joinedPromise,
          ]);

          const creatorProfile: CreatorProfile = {
            pubkey,
            profile,
            followers,
            following,
            joined,
          };

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
        } catch (error) {
          console.error(`Failed to fetch profile for ${pubkey}:`, error);
          return null;
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
      this.error = "";
      this.loadingFeatured = true;
      if (forceRefresh) {
        this.featuredCreators = [];
      }

      const pubkeys: string[] = FEATURED_CREATORS.map(npub => {
        try {
          return nip19.decode(npub).data as string;
        } catch (e) {
          console.error(`Failed to decode npub: ${npub}`, e);
          return null;
        }
      }).filter((pubkey): pubkey is string => pubkey !== null);

      try {
        const profiles = await Promise.all(
          pubkeys.map(pubkey => this.fetchCreator(pubkey, forceRefresh))
        );
        this.featuredCreators = profiles.filter((p): p is CreatorProfile => p !== null);
      } catch (e) {
        console.error("Failed to load featured creators:", e);
        this.error = "Failed to load featured creators.";
      } finally {
        this.loadingFeatured = false;
      }
    },

    async fetchTierDefinitions(
      creatorNpub: string,
      opts: { relayHints?: string[]; fundstrOnly?: boolean } = {},
    ) {
      this.tierFetchError = false;

      let hex: string;
      try {
        hex = toHex(creatorNpub);
      } catch (e) {
        console.error("Invalid creator pubkey", e);
        this.tierFetchError = true;
        notifyWarning("Unable to retrieve subscription tiers");
        return;
      }

      await this.ensureCreatorCacheFromDexie(hex);

      const ensureWarmEntry = () => {
        if (!this.warmCache[hex]) {
          this.warmCache[hex] = {} as CreatorWarmCache;
        }
        return this.warmCache[hex]!;
      };

      let guardTimer: ReturnType<typeof setTimeout> | null = null;
      const guardPromise = new Promise<null>((resolve) => {
        guardTimer = setTimeout(() => {
          const cache = this.warmCache[hex];
          if (cache?.tiersLoaded || (Array.isArray(cache?.tiers) && cache.tiers.length > 0)) {
            this.tierFetchError = false;
          } else {
            this.tierFetchError = true;
          }
          resolve(null);
        }, TIER_FETCH_TIMEOUT_MS);
      });

      const fetchPromise = (async () => {
        const relayHints = new Set(
          (opts.relayHints ?? [])
            .map((url) => url.trim())
            .filter((url) => !!url),
        );
        let event: RelayEvent | null = null;
        let lastError: unknown = null;
        let fallbackAttempted = false;
        const attemptedFallbackRelays = new Set<string>();

        const takeRelayFailures = (now: number) => {
          const entry = ensureWarmEntry();
          const failures = { ...(entry.tierRelayFailures ?? {}) };
          let mutated = false;
          for (const [relay, ts] of Object.entries(failures)) {
            if (typeof ts !== "number" || now - ts > TIER_RELAY_FAILURE_TTL_MS) {
              delete failures[relay];
              mutated = true;
            }
          }
          if (mutated || entry.tierRelayFailures === undefined) {
            entry.tierRelayFailures = { ...failures };
          }
          return { entry, failures };
        };

        const markRelayFailure = (relays: string[]) => {
          if (!relays.length) return;
          const failureAt = Date.now();
          const { entry, failures } = takeRelayFailures(failureAt);
          for (const relay of relays) {
            failures[relay] = failureAt;
          }
          entry.tierRelayFailures = { ...failures };
        };

        const clearRelayFailures = (relays: string[]) => {
          if (!relays.length) return;
          const { entry, failures } = takeRelayFailures(Date.now());
          let changed = false;
          for (const relay of relays) {
            if (relay in failures) {
              delete failures[relay];
              changed = true;
            }
          }
          if (changed) {
            entry.tierRelayFailures = { ...failures };
          }
        };

        try {
          event = await queryNutzapTiers(hex, {
            httpBase: FUNDSTR_REQ_URL,
            fundstrWsUrl: FUNDSTR_WS_URL,
            allowFanoutFallback: false,
            wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
          });
          const entry = ensureWarmEntry();
          entry.lastFundstrRelayFailureAt = null;
          entry.lastFundstrRelayFailureNotifiedAt = null;
        } catch (e) {
          lastError = e;
          const entry = ensureWarmEntry();
          const now = Date.now();
          entry.lastFundstrRelayFailureAt = now;
          const shouldNotify =
            !entry.lastFundstrRelayFailureNotifiedAt ||
            now - entry.lastFundstrRelayFailureNotifiedAt > FUNDSTR_FAILURE_NOTIFY_TTL_MS;
          if (shouldNotify) {
            notifyWarning(
              "We're having trouble reaching Fundstr relays. We'll keep trying in the background.",
            );
            entry.lastFundstrRelayFailureNotifiedAt = now;
          }
          console.error("fetchTierDefinitions Fundstr query failed", e);
        }

        const tryFallback = async (extraRelays: Iterable<string>) => {
          const now = Date.now();
          const baseRelays = Array.from(
            new Set<string>(
              [...relayHints, ...extraRelays].map((url) => url.trim()).filter(Boolean),
            ),
          );
          if (!baseRelays.length) {
            return null;
          }
          fallbackAttempted = true;
          const { failures } = takeRelayFailures(now);
          const eligible = baseRelays.filter((relay) => {
            const failureAt = failures[relay];
            return !(typeof failureAt === "number" && now - failureAt < TIER_RELAY_FAILURE_TTL_MS);
          });
          if (!eligible.length) {
            return null;
          }
          eligible.forEach((url) => attemptedFallbackRelays.add(url));
          try {
            const result = await queryNutzapTiers(hex, {
              httpBase: FUNDSTR_REQ_URL,
              fundstrWsUrl: FUNDSTR_WS_URL,
              fanout: eligible,
              allowFanoutFallback: true,
              wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
            });
            if (result) {
              eligible.forEach((url) => relayHints.add(url));
              clearRelayFailures(eligible);
            }
            return result;
          } catch (err) {
            lastError = err;
            markRelayFailure(eligible);
            console.error("fetchTierDefinitions fallback query failed", err);
            return null;
          }
        };

        if (!event) {
          try {
            const direct = await simpleRelayQuery(
              [
                {
                  kinds: [30019, 30000],
                  authors: [hex],
                  ["#d"]: ["tiers"],
                  limit: 2,
                },
              ],
              { timeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS },
            );
            if (direct.length) {
              const preferred = pickTierDefinitionEvent(
                direct as unknown as NostrEvent[],
              );
              if (preferred) {
                event = preferred;
                const entry = ensureWarmEntry();
                entry.lastFundstrRelayFailureAt = null;
                entry.lastFundstrRelayFailureNotifiedAt = null;
                console.info("[creators] direct Fundstr relay tiers fetch succeeded", {
                  pubkey: hex,
                });
              }
            }
          } catch (directError) {
            lastError = directError;
            const entry = ensureWarmEntry();
            const now = Date.now();
            entry.lastFundstrRelayFailureAt = now;
            const shouldNotify =
              !entry.lastFundstrRelayFailureNotifiedAt ||
              now - entry.lastFundstrRelayFailureNotifiedAt > FUNDSTR_FAILURE_NOTIFY_TTL_MS;
            if (shouldNotify) {
              notifyWarning(
                "We're having trouble reaching Fundstr relays. We'll keep trying in the background.",
              );
              entry.lastFundstrRelayFailureNotifiedAt = now;
            }
            const label =
              directError instanceof SimpleRelayError ? directError.message : String(directError);
            console.warn("fetchTierDefinitions direct relay query failed", label);
          }
        }

        if (!event && relayHints.size) {
          const hinted = await tryFallback(relayHints);
          if (hinted) {
            event = hinted;
          }
        }

        if (!event) {
          const defaults = new Set(FALLBACK_RELAYS);
          if (defaults.size) {
            const fallbackEvent = await tryFallback(defaults);
            if (fallbackEvent) {
              event = fallbackEvent;
              console.warn("[creators] tier fallback using default relays", {
                pubkey: hex,
                relays: Array.from(defaults),
              });
            }
          }
        }

        if (!event) {
          try {
            const discovered = await fallbackDiscoverRelays(hex);
            if (discovered.length) {
              const discoveryEvent = await tryFallback(discovered);
              if (discoveryEvent) {
                event = discoveryEvent;
                console.warn(
                  "[creators] tier fallback succeeded with discovered relays",
                  {
                    pubkey: hex,
                    relays: discovered,
                  },
                );
              }
            }
          } catch (e) {
            lastError = e;
            console.error("NIP-65 discovery failed", e);
          }
        }

        if (!event) {
          if (lastError) {
            this.tierFetchError = true;
            notifyWarning("Unable to retrieve subscription tiers");
          } else {
            this.tierFetchError = false;
            await this.saveTierCache(hex, [], null);
          }
          return;
        }

        let tiersArray: Tier[] = [];
        try {
          tiersArray = parseTierDefinitionEvent(event).map((tier) =>
            normalizeTier(tier as Tier),
          );
        } catch (e) {
          console.error("Failed to parse tier event", e);
          this.tierFetchError = true;
          notifyWarning("Unable to retrieve subscription tiers");
          return;
        }

        await this.saveTierCache(hex, tiersArray, event);
        this.tierFetchError = false;

        const eventRelayHints = new Set<string>();
        for (const tag of event.tags ?? []) {
          if (tag[0] === "relay" || tag[0] === "r") {
            const relay = typeof tag[1] === "string" ? tag[1].trim() : "";
            if (relay) {
              eventRelayHints.add(relay);
            }
          }
        }

        return {
          usedFallback: fallbackAttempted && !!event,
          relayHints: Array.from(new Set<string>([
            ...relayHints,
            ...eventRelayHints,
          ])),
          attemptedRelays: Array.from(attemptedFallbackRelays),
        };
      })()
        .finally(() => {
          if (guardTimer) {
            clearTimeout(guardTimer);
            guardTimer = null;
          }
        });

      fetchPromise.catch(() => {});
      const result = await Promise.race([fetchPromise, guardPromise]);
      if (result !== null) {
        return result;
      }
      return;
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
