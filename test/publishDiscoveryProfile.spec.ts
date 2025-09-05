import { describe, it, expect, vi } from 'vitest';
vi.mock('@noble/ciphers/aes.js', () => ({}), { virtual: true });

let createdEvents: any[] = [];
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

vi.mock('../src/composables/useNdk', () => ({
  useNdk: vi.fn().mockResolvedValue({})
}));

const connectMock = vi.fn();

vi.mock('../src/stores/nostr', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNostrStore: () => ({ signer: {}, connect: connectMock }),
    publishWithTimeout: vi.fn().mockResolvedValue(undefined),
    urlsToRelaySet: vi.fn().mockResolvedValue({ relays: [] } as any),
  };
});

vi.mock('@nostr-dev-kit/ndk', async () => {
  const actual: any = await vi.importActual('@nostr-dev-kit/ndk');
  return { ...actual, NDKEvent: MockNDKEvent };
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
});
