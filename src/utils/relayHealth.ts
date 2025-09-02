import { FREE_RELAYS } from "src/config/relays";

// keep track of relays that have already produced a constructor error so we only
// emit a single console message per relay. This keeps startup logs readable when
// many relays are unreachable.
const reportedFailures = new Map<string, number>();
const alreadyReported = new Set<string>();
const handshakeWarned = new Set<string>();
let aggregateTimer: ReturnType<typeof setTimeout> | null = null;
let allFailedWarned = false;

const CACHE_TTL_MS = 60_000;
const pingCache = new Map<string, { ts: number; ok: boolean }>();
const ls =
  typeof localStorage !== "undefined" ? (localStorage as Storage) : null;
const filterCache = new Map<string, { ts: number; res: string[] }>();

function scheduleFailureLog() {
  if (aggregateTimer) return;
  aggregateTimer = setTimeout(() => {
    const entries = Array.from(reportedFailures.entries());
    reportedFailures.clear();
    aggregateTimer = null;
    if (!entries.length) return;
    const summary = entries
      .map(([u, c]) => (c > 1 ? `${u} (x${c})` : u))
      .join(", ");
    for (const [u] of entries) {
      alreadyReported.add(u);
    }
    console.error(`WebSocket ping failed for: ${summary}`);
  }, 0);
}

export async function pingRelay(url: string): Promise<boolean> {
  const now = Date.now();
  const cacheKey = `relayHealth.${url}`;
  const cached = pingCache.get(url);
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.ok;
  if (ls) {
    try {
      const raw = ls.getItem(cacheKey);
      if (raw) {
        const data = JSON.parse(raw) as { ts: number; ok: boolean };
        if (now - data.ts < CACHE_TTL_MS) {
          pingCache.set(url, data);
          return data.ok;
        }
      }
    } catch {}
  }
  const attemptOnce = (useProtocol = false): Promise<boolean> =>
    new Promise((resolve) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = useProtocol ? new WebSocket(url, "nostr") : new WebSocket(url);
      } catch {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          if (ws.readyState === WebSocket.OPEN) {
            try {
              ws.close();
            } catch {}
          } else if (ws.readyState === WebSocket.CONNECTING) {
            ws.onopen = () => {
              try {
                ws.close();
              } catch {}
            };
          }
          resolve(false);
        }
      }, 1000);
      ws.onopen = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve(true);
        }
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          try {
            ws.close();
          } catch {}
          if (!useProtocol) {
            if (!handshakeWarned.has(url)) {
              console.warn(
                `Relay handshake failed for: ${url} (retrying with \"nostr\" protocol)`,
              );
              handshakeWarned.add(url);
            }
            attemptOnce(true).then(resolve);
          } else {
            resolve(false);
          }
        }
      };
      ws.onmessage = (ev) => {
        if (
          !settled &&
          typeof ev.data === "string" &&
          ev.data.startsWith("restricted:")
        ) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve(false);
        }
      };
    });

  const maxAttempts = 3;
  let delay = 1000;
  for (let i = 0; i < maxAttempts; i++) {
    if (await attemptOnce()) {
      const res = { ts: now, ok: true };
      pingCache.set(url, res);
      if (ls) {
        try {
          ls.setItem(cacheKey, JSON.stringify(res));
        } catch {}
      }
      return true;
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 32000);
    }
  }

  if (!alreadyReported.has(url)) {
    reportedFailures.set(url, (reportedFailures.get(url) ?? 0) + maxAttempts);
    scheduleFailureLog();
  }
  const res = { ts: now, ok: false };
  pingCache.set(url, res);
  if (ls) {
    try {
      ls.setItem(cacheKey, JSON.stringify(res));
    } catch {}
  }
  return false;
}

export async function anyRelayReachable(relays: string[]): Promise<boolean> {
  for (const url of relays) {
    if (await pingRelay(url)) return true;
  }
  return false;
}

export async function filterHealthyRelays(relays: string[]): Promise<string[]> {
  const key = relays.slice().sort().join("|");
  const cached = filterCache.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.res;

  const healthy: string[] = [];
  // Process relays in small batches to avoid exhausting browser resources
  const batchSize = 10;

  for (let i = 0; i < relays.length; i += batchSize) {
    const batch = relays.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (u) => ((await pingRelay(u)) ? u : null)),
    );
    const batchHealthy = results.filter((u): u is string => !!u);
    healthy.push(...batchHealthy);
  }
  if (healthy.length === 0) {
    if (!allFailedWarned) {
      console.warn("No reachable relays; falling back to FREE_RELAYS");
      allFailedWarned = true;
    }
    filterCache.set(key, { ts: now, res: FREE_RELAYS });
    return FREE_RELAYS;
  }

  const res = healthy.length >= 2 ? healthy : FREE_RELAYS;
  filterCache.set(key, { ts: now, res });
  return res;
}
