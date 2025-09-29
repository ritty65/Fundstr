import { describe, it, expect, vi } from 'vitest';
vi.mock('@noble/ciphers/aes.js', () => ({}), { virtual: true });

const rebuildNdkMock = vi.fn(async (relays: string[]) => {
  const map = new Map(relays.map(u => [u, { url: u, connected: true, connect: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn() }]));
  return { pool: { relays: map, on: vi.fn() }, explicitRelayUrls: relays } as any;
});

vi.mock('../src/composables/useNdk', () => ({
  rebuildNdk: rebuildNdkMock,
  useNdk: vi.fn()
}));

import { useNostrStore } from '../src/stores/nostr';

describe('connect', () => {
  it('uses only provided relays', async () => {
    const store = useNostrStore();
    const ndk = await store.connect(['wss://a', 'wss://b']);
    expect(Array.from(ndk.pool.relays.keys())).toEqual(['wss://a', 'wss://b']);
  });
});
