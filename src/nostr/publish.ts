export type AckOutcome = 'ok' | 'failed' | 'timeout' | 'blocked';

// Select relays for publishing, ensuring a minimum count by appending vetted fallbacks.
export function selectPublishRelays(
  preferred: string[],
  vetted: string[],
  min = 4, // Increased minimum
  max = 8,   // Added maximum
): { targets: string[]; usedFallback: string[] } {
  const targets = new Set<string>();
  const usedFallback: string[] = [];

  preferred.forEach((u) => {
    if (u) targets.add(u);
  });

  // Shuffle the vetted relays to distribute the load
  const shuffledVetted = [...vetted].sort(() => Math.random() - 0.5);

  for (const v of shuffledVetted) {
    if (targets.size >= max) break;
    if (!targets.has(v)) {
      targets.add(v);
      usedFallback.push(v);
    }
  }

  // Ensure minimum is met
  while(targets.size < min && shuffledVetted.length > 0) {
    const nextRelay = shuffledVetted.pop();
    if (nextRelay && !targets.has(nextRelay)) {
      targets.add(nextRelay);
      usedFallback.push(nextRelay);
    }
  }

  return { targets: Array.from(targets), usedFallback };
}

export type RelayResult = { url: string; ok: boolean; err?: string; ack?: boolean };
export type PublishReport = {
  ids?: string[];
  relaysTried: number;
  byRelay: RelayResult[];
  anySuccess: boolean;
  usedFallback: string[];
};

export async function publishWithAck(relay: any, event: any, timeoutMs = 2000): Promise<AckOutcome> {
  try {
    const res = relay.publish(event);
    if (res && typeof res.on === 'function') {
      return await new Promise<AckOutcome>((resolve) => {
        let done = false;
        const to = setTimeout(() => {
          if (!done) {
            done = true;
            resolve('timeout');
          }
        }, timeoutMs);
        res.on('ok', () => {
          if (!done) {
            done = true;
            clearTimeout(to);
            resolve('ok');
          }
        });
        res.on('failed', (reason: string) => {
          if (!done) {
            done = true;
            clearTimeout(to);
            if (/restricted|blocked|kind/i.test(reason)) resolve('blocked');
            else resolve('failed');
          }
        });
      });
    }
    await Promise.race([
      Promise.resolve(res),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs)),
    ]);
    return 'ok';
  } catch (e: any) {
    if (String(e?.message || e).match(/restricted|blocked|kind/i)) return 'blocked';
    if (String(e?.message || e).includes('timeout')) return 'timeout';
    return 'failed';
  }
}

export async function publishDMSequential(relays: any[], event: any, timeoutMs = 2000) {
  const results: Record<string, AckOutcome> = {};
  for (const r of relays) {
    const outcome = await publishWithAck(r, event, timeoutMs);
    results[r.url ?? r] = outcome;
    if (outcome === 'ok') return { ok: true, firstAck: r.url ?? r, results };
  }
  return { ok: false, firstAck: null, results };
}
// --- ADD near the bottom of src/nostr/publish.ts ---

export type RelayPublishStatus = "ok" | "timeout" | "rejected" | "notConnected" | "exception";

export interface PerRelayResult {
  relay: string;
  status: RelayPublishStatus;
  latencyMs?: number;
  error?: string;
  fromFallback?: boolean;
}

export interface PublishBundleResult {
  perRelay: PerRelayResult[];
  ok: boolean;        // acks >= requiredAcks
  acks: number;
  requiredAcks: number;
}

/**
 * Publish a single Nostr event to many relays with per-relay timeouts and per-relay results.
 * Minimal surface; does not change existing publish API.
 */
export async function publishToRelaysWithAcks(
  ndk: any,                    // keep any to avoid ripple typing; use your NDK type if available
  event: any,                  // ditto
  relays: string[],
  opts: { timeoutMs?: number; minAcks?: number; fromFallback?: Set<string> } = {}
): Promise<PublishBundleResult> {
  const timeoutMs = Math.max(500, opts.timeoutMs ?? 4000);
  const requiredAcks = Math.max(1, opts.minAcks ?? 1);
  const fromFallback = opts.fromFallback ?? new Set<string>();

  const perRelay: PerRelayResult[] = [];
  let acks = 0;

  await Promise.allSettled(
    relays.map(async (url) => {
      const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      const end = () => Math.round(((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - start);

      try {
        const relay = ndk.pool?.getRelay ? ndk.pool.getRelay(url, true) : null;
        if (!relay) throw new Error("notConnected");
        await relay.connect?.({ timeoutMs: 1200 }).catch(() => { throw new Error("notConnected"); });

        const ack = await Promise.race<Set<any>>([
          ndk.publish(event, { relays: [relay] }),
          new Promise<Set<any>>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
        ]);

        if (ack.size > 0) {
          acks++;
          perRelay.push({ relay: url, status: "ok", latencyMs: end(), fromFallback: fromFallback.has(url) });
        } else {
          perRelay.push({ relay: url, status: "rejected", latencyMs: end(), fromFallback: fromFallback.has(url) });
        }
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        const status: RelayPublishStatus =
          msg === "timeout" ? "timeout" :
          msg === "notConnected" ? "notConnected" : "exception";

        perRelay.push({ relay: url, status, latencyMs: end(), error: msg, fromFallback: fromFallback.has(url) });
      }
    })
  );

  return { perRelay, ok: acks >= requiredAcks, acks, requiredAcks };
}

