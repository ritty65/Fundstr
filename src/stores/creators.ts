import { defineStore } from "pinia";
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
import { queryNutzapTiers, toHex, type NostrEvent as RelayEvent } from "@/nostr/relayClient";
import { fallbackDiscoverRelays } from "@/nostr/discovery";
import { parseTierDefinitionEvent } from "src/nostr/tiers";

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

export const useCreatorsStore = defineStore("creators", {
  state: () => ({
    searchResults: [] as CreatorProfile[],
    searching: false,
    error: "",
    tiersMap: {} as Record<string, Tier[]>,
    tierFetchError: false,
    currentUserNpub: "",
    currentUserPrivkey: "",
  }),
  actions: {
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
      opts: { relayHints?: string[] } = {},
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

      const cached = await db.creatorsTierDefinitions.get(hex);
      if (cached) {
        const rawEvent = cached.rawEventJson
          ? JSON.parse(cached.rawEventJson)
          : undefined;
        this.tiersMap[hex] = cached.tiers.map((t: any) => ({
          ...t,
          price_sats: t.price_sats ?? t.price ?? 0,
          ...(t.perks && !t.benefits ? { benefits: [t.perks] } : {}),
          media: t.media ? [...t.media] : [],
        }));
        void rawEvent;
      }

      const relayHints = new Set(
        (opts.relayHints ?? [])
          .map((url) => url.trim())
          .filter((url) => !!url),
      );

      let event: RelayEvent | null = null;
      let lastError: unknown = null;

      try {
        event = await queryNutzapTiers(hex);
      } catch (e) {
        lastError = e;
        console.error("fetchTierDefinitions Fundstr query failed", e);
      }

      if (!event && relayHints.size) {
        try {
          event = await queryNutzapTiers(hex, {
            fanout: Array.from(relayHints),
            allowFanoutFallback: true,
          });
        } catch (e) {
          lastError = e;
          console.error("fetchTierDefinitions hinted query failed", e);
        }
      }

      if (!event) {
        try {
          const discovered = await fallbackDiscoverRelays(hex);
          for (const url of discovered) relayHints.add(url);
          if (relayHints.size) {
            event = await queryNutzapTiers(hex, {
              fanout: Array.from(relayHints),
              allowFanoutFallback: true,
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
          this.tiersMap[hex] = [];
          await db.creatorsTierDefinitions.delete(hex);
        }
        return;
      }

      let tiersArray: Tier[] = [];
      try {
        tiersArray = parseTierDefinitionEvent(event).map((tier) => ({
          ...tier,
          price_sats: tier.price_sats ?? (tier as any).price ?? 0,
        }));
      } catch (e) {
        console.error("Failed to parse tier event", e);
        this.tierFetchError = true;
        notifyWarning("Unable to retrieve subscription tiers");
        return;
      }

      this.tiersMap[hex] = tiersArray;
      await db.creatorsTierDefinitions.put({
        creatorNpub: hex,
        tiers: tiersArray as any,
        eventId: event.id,
        updatedAt: event.created_at,
        rawEventJson: JSON.stringify(event),
      });
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

      await db.creatorsTierDefinitions.put({
        creatorNpub,
        tiers: tiersArray,
        eventId: event.id!,
        updatedAt: created_at,
        rawEventJson: JSON.stringify(event),
      });

      this.tiersMap[creatorNpub] = tiersArray;
    },
  },
});
