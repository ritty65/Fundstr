import { beforeEach, describe, it, expect, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
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
  DEFAULT_RELAYS: ['wss://good'],
  FREE_RELAYS: [],
}));

const connectMock = vi.fn();
const SAMPLE_PUBKEY = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';

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

import * as nostrModule from '../src/stores/nostr';

const { publishDiscoveryProfile } = nostrModule;

beforeEach(() => {
  connectMock.mockReset();
  setActivePinia(createPinia());
  const store = nostrModule.useNostrStore();
  store.signer = {} as any;
  store.connect = connectMock as any;
});

describe('publishDiscoveryProfile', () => {
  it('pushes tier address tag', async () => {
    createdEvents = [];
    await publishDiscoveryProfile({
      profile: { display_name: 'Alice', picture: 'https://img' },
      p2pkPub: SAMPLE_PUBKEY,
      mints: ['https://mint'],
      relays: ['wss://relay'],
      tierAddr: '30000:pub:tiers'
    });
    const ev = createdEvents.find(e => e.kind === 10019);
    const body = JSON.parse(ev.content);
    expect(body.tierAddr).toBe('30000:pub:tiers');
    expect(ev.tags).toContainEqual(['t','nutzap-profile']);
    expect(ev.tags).toContainEqual(['mint','https://mint','sat']);
    expect(ev.tags).toContainEqual(['relay','wss://relay']);
  });

  it('uses fallback relays when user relays fail', async () => {
    createdEvents = [];
    const report = await publishDiscoveryProfile({
      profile: {},
      p2pkPub: SAMPLE_PUBKEY,
      mints: [],
      relays: ['wss://bad'],
    });
    expect(report.anySuccess).toBe(true);
    expect(report.relaysTried).toBeGreaterThan(0);
    expect(report.usedFallback.length).toBeGreaterThan(0);
  });
});
