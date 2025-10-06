import { boot } from "quasar/wrappers";
import { useNostrStore } from "stores/nostr";
import { useCreatorsStore, FEATURED_CREATORS } from "stores/creators";
import { queryNutzapProfile, queryNutzapTiers, toHex } from "@/nostr/relayClient";
import { parseTierDefinitionEvent } from "src/nostr/tiers";
import { parseNutzapProfileEvent } from "@/nutzap/profileCache";
import type { Tier } from "stores/types";

const CONCURRENCY_LIMIT = 3;
const REQUEST_TIMEOUT_MS = 4000;
const MAX_TIMEOUTS_BEFORE_ABORT = 3;

function normalizeTier(tier: Tier): Tier {
  return {
    ...tier,
    price_sats: tier.price_sats ?? (tier as any).price ?? 0,
    ...(tier.perks && !tier.benefits ? { benefits: [tier.perks] } : {}),
    media: tier.media ? [...tier.media] : [],
  };
}

type QueryResult<T> =
  | { status: "ok"; value: T }
  | { status: "timeout" }
  | { status: "error"; error: unknown };

function withTimeout<T>(factory: () => Promise<T>, ms: number): Promise<QueryResult<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return new Promise<QueryResult<T>>((resolve) => {
    timeoutId = setTimeout(() => resolve({ status: "timeout" }), ms);
    factory()
      .then((value) => resolve({ status: "ok", value }))
      .catch((error) => resolve({ status: "error", error }));
  }).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

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
): Promise<"ok" | "timeout"> {
  await creators.ensureCreatorCacheFromDexie(hex).catch((err) => {
    console.warn(`[fundstr-preload] failed to hydrate cache for ${hex}`, err);
  });

  let timedOut = false;
  const writes: Promise<unknown>[] = [];

  const profileResult = await withTimeout(
    () =>
      queryNutzapProfile(hex, {
        allowFanoutFallback: false,
      }),
    REQUEST_TIMEOUT_MS,
  );

  if (profileResult.status === "timeout") {
    timedOut = true;
  } else if (profileResult.status === "error") {
    console.warn(
      `[fundstr-preload] profile fetch failed for ${hex}`,
      profileResult.error,
    );
  } else if (profileResult.value) {
    const details = parseNutzapProfileEvent(profileResult.value);
    writes.push(
      creators
        .saveProfileCache(hex, profileResult.value, details)
        .catch((err) =>
          console.error(`[fundstr-preload] failed to cache profile ${hex}`, err),
        ),
    );
  }

  const tierResult = await withTimeout(
    () =>
      queryNutzapTiers(hex, {
        allowFanoutFallback: false,
      }),
    REQUEST_TIMEOUT_MS,
  );

  if (tierResult.status === "timeout") {
    timedOut = true;
  } else if (tierResult.status === "error") {
    console.warn(`[fundstr-preload] tier fetch failed for ${hex}`, tierResult.error);
  } else {
    const tierEvent = tierResult.value;
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
      writes.push(
        creators
          .saveTierCache(hex, tiers, tierEvent)
          .catch((err) =>
            console.error(`[fundstr-preload] failed to cache tiers ${hex}`, err),
          ),
      );
    } else {
      writes.push(
        creators
          .saveTierCache(hex, [], null)
          .catch((err) =>
            console.error(
              `[fundstr-preload] failed to clear tier cache for ${hex}`,
              err,
            ),
          ),
      );
    }
  }

  if (writes.length > 0) {
    await Promise.allSettled(writes);
  }

  return timedOut ? "timeout" : "ok";
}

type PreloadState = {
  timeouts: number;
  cancelled: boolean;
};

async function runPreloadQueue(
  targets: string[],
  creators: ReturnType<typeof useCreatorsStore>,
  state: PreloadState,
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
    while (!state.cancelled) {
      const index = cursor++;
      if (index >= list.length) {
        break;
      }
      const hex = list[index];
      const result = await hydrateCreator(hex, creators);
      if (result === "timeout") {
        state.timeouts += 1;
        if (state.timeouts >= MAX_TIMEOUTS_BEFORE_ABORT) {
          state.cancelled = true;
        }
      }
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
      const state: PreloadState = { timeouts: 0, cancelled: false };
      void runPreloadQueue(favorites, creators, state);
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
    const state: PreloadState = { timeouts: 0, cancelled: false };
    void runPreloadQueue(featuredTargets, creators, state);
  });

  scheduleFavoritesPreload(seenTargets, creators, deferredInit);
});
