export let FUNDSTR_RELAY = "wss://relay.fundstr.me";
const BASE_FREE_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
  "wss://relayable.org",
];

let configuredFreeRelays = [...BASE_FREE_RELAYS];

function ensureFundstr(relays) {
  const seen = new Set();
  const ordered = [];
  for (const url of [FUNDSTR_RELAY, ...relays]) {
    if (url && !seen.has(url)) {
      ordered.push(url);
      seen.add(url);
    }
  }
  return ordered;
}

function getFreeRelays() {
  return ensureFundstr(configuredFreeRelays);
}

function sanitizeRelayList(relays) {
  const seen = new Set();
  const sanitized = [];
  for (const entry of relays) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("ws://") && !trimmed.startsWith("wss://")) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    sanitized.push(trimmed);
  }
  return sanitized;
}

export function configureRelayDefaults(config = {}) {
  let updated = false;
  const maybePrimary =
    typeof config.fundstrRelay === "string"
      ? config.fundstrRelay.trim()
      : "";
  if (maybePrimary && maybePrimary !== FUNDSTR_RELAY) {
    FUNDSTR_RELAY = maybePrimary;
    updated = true;
  }

  const providedRelays = Array.isArray(config.relays)
    ? config.relays
    : Array.isArray(config.freeRelays)
      ? config.freeRelays
      : null;
  if (providedRelays) {
    const sanitized = sanitizeRelayList(providedRelays);
    const withoutPrimary = sanitized.filter((url) => url !== FUNDSTR_RELAY);
    const changed =
      withoutPrimary.length !== configuredFreeRelays.length ||
      withoutPrimary.some((url, idx) => configuredFreeRelays[idx] !== url);
    if (changed) {
      configuredFreeRelays = withoutPrimary.length
        ? withoutPrimary
        : [...BASE_FREE_RELAYS];
      updated = true;
    }
  }

  if (updated) {
    resetCaches();
  }

  return {
    fundstrRelay: FUNDSTR_RELAY,
    relays: getFreeRelays(),
  };
}

export function getRelayDefaults() {
  return {
    fundstrRelay: FUNDSTR_RELAY,
    relays: getFreeRelays(),
  };
}

// keep track of relays that have already produced a constructor error so we only
// emit a single console message per relay. This keeps startup logs readable when
// many relays are unreachable.
const reportedFailures = new Map();
const alreadyReported = new Set();
let aggregateTimer = null;
let allFailedWarned = false;

const CACHE_TTL_MS = 60_000;
const pingCache = new Map();
const filterCache = new Map();

function resetCaches() {
  pingCache.clear();
  filterCache.clear();
  reportedFailures.clear();
  alreadyReported.clear();
  if (aggregateTimer) {
    clearTimeout(aggregateTimer);
    aggregateTimer = null;
  }
  allFailedWarned = false;
}

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

export async function pingRelay(url) {
  const cached = pingCache.get(url);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.ok;

  const isFundstr = url === FUNDSTR_RELAY;
  const attemptOnce = (timeoutMs) =>
    new Promise((resolve) => {
      let settled = false;
      let ws;
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
      }, timeoutMs);
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

  const maxAttempts = isFundstr ? 5 : 3;
  let delay = isFundstr ? 1500 : 1000;
  let timeoutMs = isFundstr ? 3000 : 1200;
  for (let i = 0; i < maxAttempts; i++) {
    if (await attemptOnce(timeoutMs)) {
      pingCache.set(url, { ts: now, ok: true });
      return true;
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 32000);
      timeoutMs = Math.min(timeoutMs + (isFundstr ? 500 : 250), 5000);
    }
  }

  if (!alreadyReported.has(url)) {
    reportedFailures.set(url, (reportedFailures.get(url) ?? 0) + maxAttempts);
    scheduleFailureLog();
  }
  pingCache.set(url, { ts: now, ok: false });
  return false;
}

export async function filterHealthyRelays(relays) {
  const key = relays.slice().sort().join("|");
  const cached = filterCache.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.res;

  const healthy = [];
  const batchSize = 10;

  for (let i = 0; i < relays.length; i += batchSize) {
    const batch = relays.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (u) => ((await pingRelay(u)) ? u : null)),
    );
    const batchHealthy = results.filter((u) => !!u);
    healthy.push(...batchHealthy);
  }
  const healthyWithFundstr = ensureFundstr(healthy);

  if (healthy.length === 0) {
    if (!allFailedWarned) {
      console.warn(
        "No reachable relays; falling back to configured backup relays",
      );
      allFailedWarned = true;
    }
    const fallback = getFreeRelays();
    filterCache.set(key, { ts: now, res: fallback });
    return fallback;
  }

  const res =
    healthy.length >= 2 || healthy.includes(FUNDSTR_RELAY)
      ? healthyWithFundstr
      : getFreeRelays();
  filterCache.set(key, { ts: now, res });
  return res;
}
