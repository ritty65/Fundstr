import { SimplePool, type Event } from 'nostr-tools';
import { PRIMARY_RELAY, FALLBACK_RELAYS } from '@/config/relays';

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
  } = {}
): Promise<{ ok: boolean; relay?: string }> {
  const pool = new SimplePool(); // SimplePool is designed for multi-relay publish/list.
  const relays = [primary, ...fallbacks];
  let resolved = false;
  let okRelay: string | undefined;

  await Promise.allSettled(
    relays.map(async (relay) => {
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
    })
  );

  // Give any pending 'ok' microtasks a breath; then close sockets.
  await new Promise((r) => setTimeout(r, 25));
  pool.close(relays);
  return { ok: !!okRelay, relay: okRelay };
}
