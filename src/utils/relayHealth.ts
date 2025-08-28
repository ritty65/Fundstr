import { FREE_RELAYS } from "src/config/relays";

// keep track of relays that have already produced a constructor error so we only
// emit a single console message per relay. This keeps startup logs readable when
// many relays are unreachable.
const reportedFailures = new Map<string, number>();
let aggregateTimer: ReturnType<typeof setTimeout> | null = null;

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
          try {
            ws.close();
          } catch {}
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

  const maxAttempts = 6;
  let delay = 1000;
  for (let i = 0; i < maxAttempts; i++) {
    if (await attemptOnce()) return true;
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 32000);
    }
  }

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
    throw new Error("no reachable relays");
  }

  return healthy.length >= 2 ? healthy : FREE_RELAYS;
}
