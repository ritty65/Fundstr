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
import { FUNDSTR_REQ_URL, WS_FIRST_TIMEOUT_MS } from "@/nutzap/relayEndpoints";
import { safeUseLocalStorage } from "src/utils/safeLocalStorage";
import type { NutzapProfileDetails } from "@/nutzap/profileCache";

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
  profile: any;
  followers: number;
  following: number;
  joined: number | null;
}

const CUSTOM_LINK_WS_TIMEOUT_MS = Math.min(WS_FIRST_TIMEOUT_MS, 1200);

export interface FundstrProfileBundle {
  profile: Record<string, any> | null;
  profileEvent: RelayEvent | null;
  followers: number;
  following: number;
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
  try {
    events = await queryNostr(filters, {
      preferFundstr: true,
      allowFanoutFallback: false,
      wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
    });
  } catch (error) {
    console.error("fetchFundstrProfileBundle Fundstr query failed", error);
    throw error instanceof Error ? error : new Error(String(error));
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

  return {
    profile,
    profileEvent: preferredProfile ?? null,
    followers: followerSet.size,
    following,
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
      searching: false,
      error: "",
      tiersMap: {} as Record<string, Tier[]>,
      tierFetchError: false,
      currentUserNpub: "",
      currentUserPrivkey: "",
      favorites,
      warmCache: {} as Record<string, CreatorWarmCache>,
      warmupQueued: false,
      warmupReady: false,
      warmupCompleted: false,
      warmupTask: null as Promise<void> | null,
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

    queueWarmupFetch() {
      if (this.warmupCompleted) {
        return Promise.resolve();
      }

      this.warmupQueued = true;
      return this.startWarmupTaskIfNeeded();
    },

    markWarmupReady() {
      if (this.warmupCompleted) {
        return Promise.resolve();
      }

      if (this.warmupReady) {
        return this.warmupTask ?? Promise.resolve();
      }
      this.warmupReady = true;
      return this.startWarmupTaskIfNeeded();
    },

    startWarmupTaskIfNeeded() {
      if (this.warmupCompleted) {
        return Promise.resolve();
      }

      if (!this.warmupQueued || !this.warmupReady) {
        return this.warmupTask ?? Promise.resolve();
      }

      if (this.warmupTask) {
        return this.warmupTask;
      }

      const run = async () => {
        const nostr = useNostrStore();
        try {
          await nostr.initNdkReadOnly({ fundstrOnly: true });
        } catch (e) {
          console.warn("[creators] initNdkReadOnly failed", e);
        }

        const targets = new Set<string>();

        for (const entry of FEATURED_CREATORS) {
          try {
            targets.add(toHex(entry));
          } catch (e) {
            console.warn(`[creators] invalid featured pubkey: ${entry}`, e);
          }
        }

        for (const favorite of this.favoriteHexPubkeys) {
          if (typeof favorite === "string" && favorite.length === 64) {
            targets.add(favorite.toLowerCase());
          }
        }

        const tasks = Array.from(targets).map(async (hex) => {
          if (!hex || hex.length !== 64) {
            return;
          }

          await this.ensureCreatorCacheFromDexie(hex).catch((err) => {
            console.warn(`[creators] failed to hydrate cache for ${hex}`, err);
          });

          let profileEvent: RelayEvent | null = null;
          let profileFetched = false;
          try {
            profileEvent = await queryNutzapProfile(hex, {
              allowFanoutFallback: false,
            });
            profileFetched = true;
          } catch (e) {
            console.warn(`[creators] profile fetch failed for ${hex}`, e);
          }

          if (profileFetched) {
            const details = parseNutzapProfileEvent(profileEvent);
            await this.saveProfileCache(hex, profileEvent, details).catch(
              (err) => {
                console.error(
                  `[creators] failed to cache profile ${hex}`,
                  err,
                );
              },
            );
          }

          let tierEvent: RelayEvent | null = null;
          let tiersFetched = false;
          try {
            tierEvent = await queryNutzapTiers(hex, {
              allowFanoutFallback: false,
            });
            tiersFetched = true;
          } catch (e) {
            console.warn(`[creators] tier fetch failed for ${hex}`, e);
          }

          if (tiersFetched) {
            if (tierEvent) {
              let tiers: Tier[] = [];
              try {
                tiers = parseTierDefinitionEvent(tierEvent).map((tier) =>
                  normalizeTier(tier as Tier),
                );
              } catch (e) {
                console.error(
                  `[creators] failed to parse tiers for ${hex}`,
                  e,
                );
                tiers = [];
              }
              await this.saveTierCache(hex, tiers, tierEvent).catch((err) => {
                console.error(`[creators] failed to cache tiers ${hex}`, err);
              });
            } else {
              await this.saveTierCache(hex, [], null).catch((err) => {
                console.error(
                  `[creators] failed to clear tier cache for ${hex}`,
                  err,
                );
              });
            }
          }
        });

        await Promise.allSettled(tasks);
      };

      const task = run()
        .catch((err) => {
          console.warn("[creators] warmup task failed", err);
        })
        .finally(() => {
          this.warmupTask = null;
          this.warmupCompleted = true;
          this.warmupQueued = false;
        });

      this.warmupTask = task;
      return task;
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

    async searchCreators(query: string) {
      const nostrStore = useNostrStore();
      this.searchResults = [];
      this.error = "";
      if (!query) {
        return;
      }
      this.searching = true;
      await nostrStore.initNdkReadOnly();
      const ndk = await useNdk({ requireSigner: false });
      let pubkey = query.trim();
      if (pubkey.startsWith("npub")) {
        try {
          const decoded = nip19.decode(pubkey);
          pubkey =
            typeof decoded.data === "string" ? (decoded.data as string) : "";
        } catch (e) {
          console.error(e);
          this.error = "Invalid npub";
          this.searching = false;
          return;
        }
      } else if (!/^[0-9a-fA-F]{64}$/.test(pubkey)) {
        this.error = "Invalid pubkey";
        this.searching = false;
        return;
      }
      try {
        const user = ndk.getUser({ pubkey });
        await user.fetchProfile();
        const followers = await nostrStore.fetchFollowerCount(pubkey);
        const following = await nostrStore.fetchFollowingCount(pubkey);
        const joined = await nostrStore.fetchJoinDate(pubkey);
        this.searchResults.push({
          pubkey,
          profile: user.profile,
          followers,
          following,
          joined,
        });
      } catch (e) {
        console.error(e);
      } finally {
        this.searching = false;
      }
    },

    async loadFeaturedCreators() {
      const nostrStore = useNostrStore();
      this.searchResults = [];
      this.error = "";
      this.searching = true;
      await nostrStore.initNdkReadOnly();
      const ndk = await useNdk({ requireSigner: false });

      const pubkeys: string[] = [];
      for (const entry of FEATURED_CREATORS) {
        let pubkey = entry;
        if (entry.startsWith("npub") || entry.startsWith("nprofile")) {
          try {
            const decoded = nip19.decode(entry);
            if (typeof decoded.data === "string") {
              pubkey = decoded.data as string;
            } else if (
              typeof decoded.data === "object" &&
              (decoded.data as any).pubkey
            ) {
              pubkey = (decoded.data as any).pubkey as string;
            }
          } catch (e) {
            console.error("Failed to decode", entry, e);
            continue;
          }
        }
        pubkeys.push(pubkey);
      }

      try {
        const results = await Promise.all(
          pubkeys.map(async (pubkey) => {
            try {
              const user = ndk.getUser({ pubkey });
              const [_, followers, following, joined] = await Promise.all([
                user.fetchProfile(),
                nostrStore.fetchFollowerCount(pubkey),
                nostrStore.fetchFollowingCount(pubkey),
                nostrStore.fetchJoinDate(pubkey),
              ]);
              return {
                pubkey,
                profile: user.profile,
                followers,
                following,
                joined,
              } as CreatorProfile;
            } catch (e) {
              console.error(e);
              return null;
            }
          }),
        );

        results.forEach((res) => {
          if (res) {
            this.searchResults.push(res);
          }
        });
      } catch (e) {
        console.error(e);
      } finally {
        this.searching = false;
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

      const relayHints = new Set(
        (opts.relayHints ?? [])
          .map((url) => url.trim())
          .filter((url) => !!url),
      );
      const fundstrOnly = opts.fundstrOnly === true;
      let event: RelayEvent | null = null;
      let lastError: unknown = null;

      try {
        event = await queryNutzapTiers(hex, {
          httpBase: FUNDSTR_REQ_URL,
          allowFanoutFallback: false,
          wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
        });
      } catch (e) {
        lastError = e;
        console.error("fetchTierDefinitions Fundstr query failed", e);
      }

      if (!event && relayHints.size) {
        try {
          event = await queryNutzapTiers(hex, {
            httpBase: FUNDSTR_REQ_URL,
            fanout: Array.from(relayHints),
            allowFanoutFallback: !fundstrOnly,
            wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
          });
        } catch (e) {
          lastError = e;
          console.error("fetchTierDefinitions hinted query failed", e);
        }
      }

      if (!event && !fundstrOnly) {
        try {
          const discovered = await fallbackDiscoverRelays(hex);
          for (const url of discovered) relayHints.add(url);
          if (relayHints.size) {
            event = await queryNutzapTiers(hex, {
              httpBase: FUNDSTR_REQ_URL,
              fanout: Array.from(relayHints),
              allowFanoutFallback: true,
              wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
            });
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
