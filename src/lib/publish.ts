import { SimplePool, type Event } from 'nostr-tools';
import { PRIMARY_RELAY, FALLBACK_RELAYS } from '@/config/relays';

const PROXY_BASE_HTTP = import.meta.env.VITE_PROXY_BASE_HTTP || '';

function hasHttpProxy() {
  return !!PROXY_BASE_HTTP;
}

// NIP-01: relays send ["OK", <event-id>, true/false, <msg>] on acceptance/rejection.
// We resolve success on first OK.

export type PublishStatus =
  | { phase: 'connecting'; relay: string }
  | { phase: 'publishing'; relay: string }
  | { phase: 'ok'; relay: string }
  | { phase: 'failed'; relay: string; reason?: string }
  | { phase: 'done'; okOn?: string };

export async function publishWithFallback(
  event: Event,
  {
    primary = PRIMARY_RELAY,
    fallbacks = FALLBACK_RELAYS,
    ackTimeoutMs = 8000,
    onStatus = (_: PublishStatus) => {},
    proxyMode = false,
  } = {},
): Promise<{ ok: boolean; relay?: string }> {
  if (proxyMode && hasHttpProxy()) {
    try {
      onStatus({ phase: 'connecting', relay: 'proxy' });
      const r = await fetch(`${PROXY_BASE_HTTP}/event`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(event),
      });
      if (!r.ok) {
        onStatus({ phase: 'failed', relay: 'proxy', reason: r.statusText });
        return { ok: false };
      }
      onStatus({ phase: 'publishing', relay: 'proxy' });
      onStatus({ phase: 'ok', relay: 'proxy' });
      onStatus({ phase: 'done', okOn: 'proxy' });
      return { ok: true, relay: 'proxy' };
    } catch (e: any) {
      onStatus({ phase: 'failed', relay: 'proxy', reason: e?.message || 'error' });
      return { ok: false };
    }
  }

  const pool = new SimplePool(); // SimplePool is designed for multi-relay publish/list.
  const relays = [primary, ...fallbacks];
  let resolved = false;
  let okRelay: string | undefined;

  await Promise.allSettled(
    relays.map(async relay => {
      try {
        onStatus({ phase: 'connecting', relay });

        const pub = pool.publish([relay], event);
        onStatus({ phase: 'publishing', relay });

        // Bound acks per relay
        const timer = setTimeout(() => {
          if (!resolved) onStatus({ phase: 'failed', relay, reason: 'ack-timeout' });
        }, ackTimeoutMs);

        pub.on('ok', () => {
          clearTimeout(timer);
          if (!resolved) {
            resolved = true;
            okRelay = relay;
            onStatus({ phase: 'ok', relay });
            onStatus({ phase: 'done', okOn: relay });
          }
        });

        pub.on('failed', (reason: string) => {
          clearTimeout(timer);
          if (!resolved) onStatus({ phase: 'failed', relay, reason });
        });
      } catch (e: any) {
        if (!resolved) onStatus({ phase: 'failed', relay, reason: e?.message || 'error' });
      }
    }),
  );

  // Give any pending 'ok' microtasks a breath; then close sockets.
  await new Promise(r => setTimeout(r, 25));
  pool.close(relays);
  return { ok: !!okRelay, relay: okRelay };
}

