import { boot } from "quasar/wrappers";
import { useNostrStore } from "stores/nostr";
import {
  useCreatorsStore,
  FEATURED_CREATORS,
  fetchFundstrProfileBundle,
} from "stores/creators";
import { toHex } from "@/nostr/relayClient";

const CONCURRENCY_LIMIT = 2;
function normalizeHexTarget(entry: string, seen: Set<string>): string | null {
  if (typeof entry !== "string" || !entry.trim()) {
    return null;
  }

  let candidate = entry.trim();
  if (candidate.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(candidate)) {
    try {
      candidate = toHex(candidate);
    } catch (e) {
      console.warn(`[fundstr-preload] invalid pubkey: ${entry}`, e);
      return null;
    }
  }

  const hex = candidate.toLowerCase();
  if (hex.length !== 64) {
    return null;
  }
  if (seen.has(hex)) {
    return null;
  }
  seen.add(hex);
  return hex;
}

async function hydrateCreator(
  hex: string,
  creators: ReturnType<typeof useCreatorsStore>,
): Promise<void> {
  await creators.ensureCreatorCacheFromDexie(hex).catch((err) => {
    console.warn(`[fundstr-preload] failed to hydrate cache for ${hex}`, err);
  });

  try {
    const bundle = await fetchFundstrProfileBundle(hex);

    const updatedAt = bundle.joined ?? null;

    await creators
      .saveProfileCache(hex, bundle.profileEvent, bundle.profileDetails, { updatedAt })
      .catch((error) => {
        console.error(`[fundstr-preload] failed to cache discovery profile ${hex}`, error);
      });

    const tiers = Array.isArray(bundle.tiers) ? bundle.tiers : [];
    creators.updateTierCacheState(hex, tiers, null, { updatedAt });
  } catch (error) {
    console.warn(`[fundstr-preload] discovery fetch failed for ${hex}`, error);
  }
}

async function runPreloadQueue(
  targets: string[],
  creators: ReturnType<typeof useCreatorsStore>,
): Promise<void> {
  if (!targets.length) {
    return;
  }

  const list = targets.filter((hex) => hex && hex.length === 64);
  if (!list.length) {
    return;
  }

  let cursor = 0;
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= list.length) {
        break;
      }
      const hex = list[index];
      await hydrateCreator(hex, creators);
    }
  };

  const workerCount = Math.min(CONCURRENCY_LIMIT, list.length);
  await Promise.allSettled(Array.from({ length: workerCount }, () => worker()));
}

function scheduleFavoritesPreload(
  seenTargets: Set<string>,
  creators: ReturnType<typeof useCreatorsStore>,
  initPromise: Promise<unknown>,
): void {
  if (typeof window === "undefined") {
    return;
  }

  let started = false;

  const start = () => {
    if (started) {
      return;
    }
    started = true;
    cleanup();
    void initPromise.then(() => {
      const favorites = creators.favoriteHexPubkeys
        .map((favorite) => normalizeHexTarget(favorite, seenTargets))
        .filter((hex): hex is string => Boolean(hex));
      if (!favorites.length) {
        return;
      }
      void runPreloadQueue(favorites, creators);
    });
  };

  const cleanup = () => {
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("keydown", start);
    window.removeEventListener("touchstart", start);
  };

  window.addEventListener("pointerdown", start, { once: true });
  window.addEventListener("keydown", start, { once: true });
  window.addEventListener("touchstart", start, { once: true });
}

export default boot(() => {
  const nostr = useNostrStore();
  const creators = useCreatorsStore();
  const seenTargets = new Set<string>();

  const deferredInit = Promise.resolve().then(async () => {
    try {
      await nostr.initNdkReadOnly({ fundstrOnly: true });
    } catch (e) {
      console.warn("[fundstr-preload] initNdkReadOnly failed", e);
    }
  });

  void deferredInit.then(() => {
    const featuredTargets = FEATURED_CREATORS.map((entry) =>
      normalizeHexTarget(entry, seenTargets),
    ).filter((hex): hex is string => Boolean(hex));
    if (!featuredTargets.length) {
      return;
    }
    void runPreloadQueue(featuredTargets, creators);
  });

  scheduleFavoritesPreload(seenTargets, creators, deferredInit);
});
