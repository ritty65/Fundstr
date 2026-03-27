import NDK from "@nostr-dev-kit/ndk";
import { sanitizeRelayUrls } from "./relay";
import { FREE_RELAYS } from "src/config/relays";

const CACHE_TTL_MS = 60_000;
const FAILURE_WINDOW_MS = 3 * 60_000;
const FAILURE_SUPPRESS_MS = 2 * 60_000;
const FAILURE_THRESHOLD = 2;
const RELAY_HEALTH_TIMEOUT_MS = 1500;

const cache = new Map<string, { ts: number; res: string[] }>();
const relayFailureCache = new Map<
  string,
  { firstFailureAt: number; failures: number; suppressUntil: number }
>();

function normalizeRelay(url: string): string | null {
  const normalized = sanitizeRelayUrls([url])[0];
  return normalized || null;
}

function shouldSuppressRelay(url: string): boolean {
  const entry = relayFailureCache.get(url);
  if (!entry) return false;
  const now = Date.now();
  if (entry.suppressUntil && entry.suppressUntil > now) {
    return true;
  }
  if (entry.suppressUntil && entry.suppressUntil <= now) {
    relayFailureCache.delete(url);
    return false;
  }
  if (now - entry.firstFailureAt > FAILURE_WINDOW_MS) {
    relayFailureCache.delete(url);
    return false;
  }
  return false;
}

export function markRelayFailure(url: string): void {
  const normalized = normalizeRelay(url);
  if (!normalized) return;
  const now = Date.now();
  const entry = relayFailureCache.get(normalized);
  if (!entry || now - entry.firstFailureAt > FAILURE_WINDOW_MS) {
    relayFailureCache.set(normalized, {
      firstFailureAt: now,
      failures: 1,
      suppressUntil: 0,
    });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= FAILURE_THRESHOLD) {
    entry.suppressUntil = now + FAILURE_SUPPRESS_MS;
  }
  relayFailureCache.set(normalized, entry);
}

export function markRelaySuccess(url: string): void {
  const normalized = normalizeRelay(url);
  if (!normalized) return;
  relayFailureCache.delete(normalized);
}

export function filterSuppressedRelays(relays: string[]): string[] {
  const cleaned = sanitizeRelayUrls(relays);
  return cleaned.filter((url) => !shouldSuppressRelay(url));
}

export async function filterHealthyRelays(relays: string[]): Promise<string[]> {
  const cleaned = sanitizeRelayUrls(relays);
  const eligible = cleaned.filter((url) => !shouldSuppressRelay(url));
  const key = eligible.slice().sort().join(",");
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.res;

  const probe = new NDK({ explicitRelayUrls: eligible });
  const results = await Promise.all(
    eligible.map(async (url) => {
      try {
        const relay =
          probe.pool?.getRelay?.(url, true) ??
          probe.pool?.relays?.get?.(url) ??
          probe.addExplicitRelay(url);
        if (!relay?.connect) {
          throw new Error("noRelay");
        }
        await relay.connect(RELAY_HEALTH_TIMEOUT_MS);
        markRelaySuccess(url);
        return url;
      } catch {
        markRelayFailure(url);
        return null;
      }
    }),
  );

  for (const relay of probe.pool?.relays?.values?.() ?? []) {
    try {
      relay.disconnect?.();
    } catch {
      /* ignore probe cleanup failures */
    }
  }

  const connected = results.filter((url): url is string => Boolean(url));

  for (const url of eligible) {
    if (connected.includes(url)) {
      markRelaySuccess(url);
    } else {
      markRelayFailure(url);
    }
  }

  const res = connected.length > 0 ? connected : FREE_RELAYS;
  cache.set(key, { ts: now, res });
  return res;
}

export async function probeWriteHealth(
  ndk: any,
  relays: string[],
  { timeoutMs = 1200 }: { timeoutMs?: number } = {},
): Promise<{ healthy: string[]; unhealthy: string[] }> {
  const healthy: string[] = [];
  const unhealthy: string[] = [];

  await Promise.allSettled(
    relays.map(async (url) => {
      try {
        const relay = ndk.pool?.getRelay ? ndk.pool.getRelay(url, true) : null;
        if (!relay) throw new Error("noRelay");
        await relay.connect?.({ timeoutMs });
        healthy.push(url);
      } catch {
        unhealthy.push(url);
      }
    }),
  );

  return { healthy, unhealthy };
}
