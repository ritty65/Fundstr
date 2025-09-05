import { describe, it, expect } from 'vitest';
import { probeWriteHealth } from '../src/utils/relayHealth';
import { publishToRelaysWithAcks } from '../src/nostr/publish';

describe('relay selection with fallback', () => {
  it('uses fallback relays when user relays unhealthy', async () => {
    const ndk = {
      pool: {
        getRelay: (url: string) => ({
          url,
          async connect() {
            if (url === 'wss://bad') throw new Error('noRelay');
          },
        }),
      },
      publish: () => Promise.resolve(true),
    };
    const userRes = await probeWriteHealth(ndk, ['wss://bad']);
    expect(userRes.healthy.length).toBe(0);
    const fbRes = await probeWriteHealth(ndk, ['wss://good']);
    const targets = [...userRes.healthy, ...fbRes.healthy];
    const res = await publishToRelaysWithAcks(
      ndk,
      {},
      targets,
      { fromFallback: new Set(fbRes.healthy) }
    );
    expect(res.perRelay[0].relay).toBe('wss://good');
    expect(res.perRelay[0].fromFallback).toBe(true);
  });
});
