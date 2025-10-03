import {
  ensurePrimary,
  getBaseFreeRelays,
  getPrimaryRelay,
} from "./relayConfig.js";

const FUNDSTR_RELAY = getPrimaryRelay();
const BASE_FREE_RELAYS = getBaseFreeRelays();

const FREE_RELAYS = ensurePrimary(BASE_FREE_RELAYS);

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
const relayDiagnostics = new Map();

const SOFT_FAILURE_CODES = new Set([1008, 1013, 4403]);

function classifyCloseEvent(event) {
  const { code, reason } = event ?? {};
  if (!event) {
    return {
      error: {
        type: "unknown-close",
        message: "Connection closed unexpectedly",
      },
      softFailure: false,
    };
  }

  const normalizedReason = typeof reason === "string" ? reason : "";
  const reasonLower = normalizedReason.toLowerCase();
  if (SOFT_FAILURE_CODES.has(code) || /restricted|origin/.test(reasonLower)) {
    return {
      error: {
        type: "restricted-origin",
        code: code || 403,
        message:
          normalizedReason ||
          "Relay rejected the connection due to origin restrictions.",
      },
      softFailure: true,
    };
  }

  if (code === 1015) {
    return {
      error: {
        type: "tls-error",
        code,
        message:
          normalizedReason ||
          "TLS handshake failed while establishing the WebSocket connection.",
      },
      softFailure: false,
    };
  }

  if (code === 1006) {
    return {
      error: {
        type: "abnormal-closure",
        code,
        message:
          normalizedReason ||
          "Connection closed before the handshake could complete.",
      },
      softFailure: false,
    };
  }

  return {
    error: {
      type: "closed",
      code,
      message:
        normalizedReason || "Connection closed before the relay responded.",
    },
    softFailure: false,
  };
}

function recordRelaySuccess(url) {
  relayDiagnostics.set(url, {
    status: "ok",
    timestamp: Date.now(),
  });
}

function recordRelayFailure(url, error, softFailure) {
  relayDiagnostics.set(url, {
    status: "error",
    timestamp: Date.now(),
    type: error?.type ?? "error",
    code: error?.code,
    message: error?.message ?? "Unknown failure",
    softFailure: Boolean(softFailure),
  });
}

export function getRelayDiagnosticsSnapshot() {
  return Array.from(relayDiagnostics.entries()).map(([url, info]) => ({
    url,
    ...info,
  }));
}

function scheduleFailureLog() {
  if (aggregateTimer) return;
  aggregateTimer = setTimeout(() => {
    const entries = Array.from(reportedFailures.entries());
    reportedFailures.clear();
    aggregateTimer = null;
    if (!entries.length) return;
    const summary = entries
      .map(([u, { count, error }]) => {
        const suffix = count > 1 ? ` (x${count})` : "";
        if (error?.type) {
          return `${u}${suffix} [${error.type}]`;
        }
        return `${u}${suffix}`;
      })
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
  if (cached && now - cached.ts < CACHE_TTL_MS) {
    return { ...cached.result };
  }

  const isFundstr = url === FUNDSTR_RELAY;
  const attemptOnce = (timeoutMs) =>
    new Promise((resolve) => {
      let settled = false;
      let timer = null;
      let ws;

      const finalize = (result) => {
        if (settled) return;
        settled = true;
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        try {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
          }
        } catch {}
        resolve(result);
      };

      try {
        ws = new WebSocket(url, "nostr");
      } catch (error) {
        finalize({
          ok: false,
          error: {
            type: "constructor-error",
            message: error?.message || "WebSocket constructor failed",
          },
          softFailure: false,
        });
        return;
      }

      timer = setTimeout(() => {
        finalize({
          ok: false,
          error: {
            type: "timeout",
            message: `Timed out after ${timeoutMs}ms while waiting for relay response`,
          },
          softFailure: false,
        });
      }, timeoutMs);

      ws.onopen = () => {
        finalize({ ok: true });
      };

      ws.onerror = () => {
        finalize({
          ok: false,
          error: {
            type: "network-error",
            message: "Network error occurred while connecting to relay",
          },
          softFailure: false,
        });
      };

      ws.onclose = (event) => {
        if (settled) return;
        const result = classifyCloseEvent(event);
        finalize({ ok: false, ...result });
      };

      ws.onmessage = (ev) => {
        if (
          settled ||
          typeof ev.data !== "string" ||
          !ev.data.toLowerCase().startsWith("restricted:")
        ) {
          return;
        }
        finalize({
          ok: false,
          error: {
            type: "restricted-origin",
            code: 403,
            message: ev.data,
          },
          softFailure: true,
        });
      };
    });

  const maxAttempts = isFundstr ? 5 : 3;
  let delay = isFundstr ? 1500 : 1000;
  let timeoutMs = isFundstr ? 3000 : 1200;
  let lastResult = { ok: false, error: { type: "unknown" }, softFailure: false };

  for (let i = 0; i < maxAttempts; i++) {
    lastResult = await attemptOnce(timeoutMs);
    if (lastResult.ok) {
      recordRelaySuccess(url);
      const result = { ...lastResult };
      pingCache.set(url, { ts: now, result });
      return { ...result };
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 32000);
      timeoutMs = Math.min(timeoutMs + (isFundstr ? 500 : 250), 5000);
    }
  }

  recordRelayFailure(url, lastResult.error, lastResult.softFailure);
  if (!alreadyReported.has(url)) {
    const prev = reportedFailures.get(url) ?? { count: 0, error: null };
    reportedFailures.set(url, {
      count: prev.count + maxAttempts,
      error: lastResult.error,
    });
    scheduleFailureLog();
  }
  const result = { ...lastResult };
  pingCache.set(url, { ts: now, result });
  return { ...result };
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
      batch.map(async (u) => ({ url: u, result: await pingRelay(u) })),
    );
    const batchHealthy = results
      .filter(({ result }) => result.ok)
      .map(({ url }) => url);
    healthy.push(...batchHealthy);
  }
  const healthyWithFundstr = ensurePrimary(healthy);

  if (healthy.length === 0) {
    if (!allFailedWarned) {
      console.warn("No reachable relays; falling back to FREE_RELAYS");
      allFailedWarned = true;
    }
    const fallback = ensurePrimary(FREE_RELAYS);
    filterCache.set(key, { ts: now, res: fallback });
    return fallback;
  }

  const res =
    healthy.length >= 2 || healthy.includes(FUNDSTR_RELAY)
      ? healthyWithFundstr
      : ensurePrimary(FREE_RELAYS);
  filterCache.set(key, { ts: now, res });
  return res;
}
