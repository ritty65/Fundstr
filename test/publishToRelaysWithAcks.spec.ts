import { describe, it, expect } from 'vitest';
import { publishToRelaysWithAcks } from '../src/nostr/publish';

class MockRelay {
  constructor(public url: string, private delay: number, private willAck: boolean | null) {}
  async connect() { /* no-op */ }
  publish() {
    if (this.willAck === null) {
      return new Promise<Set<any>>(() => {}); // never resolves
    }
    return new Promise<Set<any>>((resolve) => {
      setTimeout(() => {
        const result = new Set<any>();
        if (this.willAck) {
          result.add(this);
        }
        resolve(result);
      }, this.delay);
    });
  }
}

describe('publishToRelaysWithAcks', () => {
  it('resolves per relay and times out correctly', async () => {
    const relays: Record<string, MockRelay> = {
      'wss://ok': new MockRelay('wss://ok', 10, true),
      'wss://rejected': new MockRelay('wss://rejected', 10, false),
      'wss://slow': new MockRelay('wss://slow', 200, null),
    };
    const ndk = {
      pool: { getRelay: (u: string) => relays[u] },
      publish: (_ev: any, { relays: [relay] }: any) => (relay as MockRelay).publish(),
    };
    const res = await publishToRelaysWithAcks(ndk, {}, ['wss://ok', 'wss://rejected', 'wss://slow'], { timeoutMs: 50, minAcks: 1 });
    const map = Object.fromEntries(res.perRelay.map(r => [r.relay, r.status]));
    expect(map['wss://ok']).toBe('ok');
    expect(map['wss://rejected']).toBe('rejected');
    expect(map['wss://slow']).toBe('timeout');
    expect(res.ok).toBe(true);
  });
});
