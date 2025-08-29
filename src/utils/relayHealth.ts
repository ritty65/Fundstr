import { FREE_RELAYS, FALLBACK_RELAYS } from "src/config/relays";

// keep track of relays that have already produced a constructor error so we only
// emit a single console message per relay. This keeps startup logs readable when
// many relays are unreachable.
const reportedFailures = new Map<string, number>();
let aggregateTimer: ReturnType<typeof setTimeout> | null = null;

// Cache ping results for a short period so repeated health checks
// don't keep hammering the same unreachable relays and flooding logs.
const pingCache = new Map<string, { ok: boolean; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

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
    console.error(`WebSocket ping failed for: ${summary}`);
  }, 0);
}

export async function pingRelay(url: string): Promise<boolean> {
  const cached = pingCache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.ok;
  }

  const attemptOnce = (): Promise<boolean> =>
    new Promise((resolve) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
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
      }, 2000);
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
          resolve(false);
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
  let delay = 2000;
  for (let i = 0; i < maxAttempts; i++) {
    if (await attemptOnce()) {
      pingCache.set(url, { ok: true, ts: Date.now() });
      return true;
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 32000);
    }
  }

  pingCache.set(url, { ok: false, ts: Date.now() });
  reportedFailures.set(url, (reportedFailures.get(url) ?? 0) + maxAttempts);
  scheduleFailureLog();
  return false;
}

export async function filterHealthyRelays(relays: string[]): Promise<string[]> {
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
    const msg = "No reachable relays. Falling back to public relays.";
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(msg);
    } else {
      console.error(msg);
    }
    return FALLBACK_RELAYS;
  }

  return healthy.length >= 2
    ? healthy
    : Array.from(new Set([...healthy, ...FALLBACK_RELAYS]));
}
