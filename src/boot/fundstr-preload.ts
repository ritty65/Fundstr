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

export default boot(async () => {
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

  for (const hex of targets) {
    if (!hex || hex.length !== 64) continue;
    await creators.ensureCreatorCacheFromDexie(hex).catch((err) => {
      console.warn(`[fundstr-preload] failed to hydrate cache for ${hex}`, err);
    });

    let profileEvent: RelayEvent | null = null;
    let profileFetched = false;
    try {
      profileEvent = await queryNutzapProfile(hex, {
        allowFanoutFallback: false,
      });
      profileFetched = true;
    } catch (e) {
      console.warn(`[fundstr-preload] profile fetch failed for ${hex}`, e);
    }

    if (profileFetched) {
      const details = parseNutzapProfileEvent(profileEvent);
      await creators
        .saveProfileCache(hex, profileEvent, details)
        .catch((err) =>
          console.error(`[fundstr-preload] failed to cache profile ${hex}`, err),
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
      console.warn(`[fundstr-preload] tier fetch failed for ${hex}`, e);
    }

    if (tiersFetched) {
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
    }
  }
});
