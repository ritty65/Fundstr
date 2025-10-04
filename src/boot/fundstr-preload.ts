import { boot } from "quasar/wrappers";
import { useNostrStore } from "stores/nostr";
import { useCreatorsStore, FEATURED_CREATORS } from "stores/creators";
import {
  queryNutzapProfile,
  queryNutzapTiers,
  toHex,
  type NostrEvent as RelayEvent,
} from "@/nostr/relayClient";
import { parseTierDefinitionEvent } from "src/nostr/tiers";
import { parseNutzapProfileEvent } from "@/nutzap/profileCache";
import type { Tier } from "stores/types";

function normalizeTier(tier: Tier): Tier {
  return {
    ...tier,
    price_sats: tier.price_sats ?? (tier as any).price ?? 0,
    ...(tier.perks && !tier.benefits ? { benefits: [tier.perks] } : {}),
    media: tier.media ? [...tier.media] : [],
  };
}

async function preloadCreators() {
  const nostr = useNostrStore();
  const creators = useCreatorsStore();

  try {
    await nostr.initNdkReadOnly({ fundstrOnly: true });
  } catch (e) {
    console.warn("[fundstr-preload] initNdkReadOnly failed", e);
  }

  const targets = new Set<string>();

  for (const entry of FEATURED_CREATORS) {
    try {
      targets.add(toHex(entry));
    } catch (e) {
      console.warn(`[fundstr-preload] invalid featured pubkey: ${entry}`, e);
    }
  }

  for (const favorite of creators.favoriteHexPubkeys) {
    if (typeof favorite === "string" && favorite.length === 64) {
      targets.add(favorite.toLowerCase());
    }
  }

  const hydrateTasks = Array.from(targets)
    .filter((hex): hex is string => typeof hex === "string" && hex.length === 64)
    .map(async (hex) => {
      await creators.ensureCreatorCacheFromDexie(hex).catch((err) => {
        console.warn(`[fundstr-preload] failed to hydrate cache for ${hex}`, err);
      });

      const profileTask = (async () => {
        let profileEvent: RelayEvent | null = null;
        try {
          profileEvent = await queryNutzapProfile(hex, {
            allowFanoutFallback: false,
          });
        } catch (e) {
          console.warn(`[fundstr-preload] profile fetch failed for ${hex}`, e);
          return;
        }

        if (!profileEvent) {
          return;
        }

        let details = null;
        try {
          details = parseNutzapProfileEvent(profileEvent);
        } catch (e) {
          console.error(
            `[fundstr-preload] failed to parse profile details for ${hex}`,
            e,
          );
        }

        await creators
          .saveProfileCache(hex, profileEvent, details)
          .catch((err) =>
            console.error(`[fundstr-preload] failed to cache profile ${hex}`, err),
          );
      })();

      const tierTask = (async () => {
        let tierEvent: RelayEvent | null = null;
        try {
          tierEvent = await queryNutzapTiers(hex, {
            allowFanoutFallback: false,
          });
        } catch (e) {
          console.warn(`[fundstr-preload] tier fetch failed for ${hex}`, e);
          return;
        }

        if (tierEvent) {
          let tiers: Tier[] = [];
          try {
            tiers = parseTierDefinitionEvent(tierEvent).map((tier) =>
              normalizeTier(tier as Tier),
            );
          } catch (e) {
            console.error(`[fundstr-preload] failed to parse tiers for ${hex}`, e);
            tiers = [];
          }

          await creators
            .saveTierCache(hex, tiers, tierEvent)
            .catch((err) =>
              console.error(`[fundstr-preload] failed to cache tiers ${hex}`, err),
            );
        } else {
          await creators
            .saveTierCache(hex, [], null)
            .catch((err) =>
              console.error(
                `[fundstr-preload] failed to clear tier cache for ${hex}`,
                err,
              ),
            );
        }
      })();

      await Promise.allSettled([profileTask, tierTask]);
    });

  await Promise.allSettled(hydrateTasks);
}

export default boot(() => {
  if (typeof window !== "undefined") {
    const idle = (window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback) => number;
    }).requestIdleCallback;

    if (typeof idle === "function") {
      idle(() => {
        void preloadCreators();
      });
      return;
    }
  }

  void preloadCreators();
});
