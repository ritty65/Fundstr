import { describe, it, expect, vi } from 'vitest';
vi.mock('@noble/ciphers/aes.js', () => ({}), { virtual: true });

let createdEvents: any[] = [];

vi.mock('../src/composables/useNdk', () => ({
  useNdk: vi.fn().mockResolvedValue({})
}));

vi.mock('../src/nostr/publish', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    publishToRelaysWithAcks: vi.fn().mockImplementation((_ndk, _ev, relays: string[]) => {
      return Promise.resolve({
        perRelay: relays.map((url) => ({ relay: url, status: url.includes('good') ? 'ok' : 'timeout' })),
        ok: relays.some((u) => u.includes('good')),
        acks: relays.some((u) => u.includes('good')) ? 1 : 0,
        requiredAcks: 1,
      });
    }),
  };
});

vi.mock('../src/config/relays', () => ({
  VETTED_OPEN_WRITE_RELAYS: ['wss://good'],
}));

const connectMock = vi.fn();

vi.mock('../src/stores/nostr', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNostrStore: () => ({ signer: {}, connect: connectMock }),
  };
});

vi.mock('@nostr-dev-kit/ndk', () => {
  class MockNDKEvent {
    kind?: number;
    tags: any[] = [];
    content = '';
    created_at?: number;
    constructor() {
      createdEvents.push(this);
    }
    sign = vi.fn();
    publish = vi.fn();
    rawEvent() { return {} as any; }
  }
  return { NDKEvent: MockNDKEvent };
});

import { publishDiscoveryProfile } from '../src/stores/nostr';

describe('publishDiscoveryProfile', () => {
  it('pushes tier address tag', async () => {
    createdEvents = [];
    await publishDiscoveryProfile({
      profile: {},
      p2pkPub: 'pub',
      mints: [],
      relays: ['wss://relay'],
      tierAddr: '30000:pub:tiers'
    });
    const ev = createdEvents.find(e => e.kind === 10019);
    expect(ev.tags).toContainEqual(['a', '30000:pub:tiers']);
  });

  it('uses fallback relays when user relays fail', async () => {
    createdEvents = [];
    const report = await publishDiscoveryProfile({
      profile: {},
      p2pkPub: 'pub',
      mints: [],
      relays: ['wss://bad'],
    });
    expect(report.anySuccess).toBe(true);
    expect(report.relaysTried).toBeGreaterThan(0);
    expect(report.usedFallback.length).toBeGreaterThan(0);
  });
});
