import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@noble/ciphers/aes.js', () => ({}), { virtual: true });

const hubStore = {
  getTierArray: () => [{ id: 't1', name: 'Tier', price_sats: 1 }],
  publishTierDefinitions: vi.fn(),
  lastPublishedTiersHash: ''
};

vi.mock('../src/stores/creatorHub', () => ({
  useCreatorHubStore: () => hubStore
}));

vi.mock('../src/stores/creatorProfile', () => ({
  useCreatorProfileStore: () => ({ profile: {}, mints: [], relays: [] })
}));

vi.mock('../src/stores/p2pk', () => ({
  useP2PKStore: () => ({ firstKey: { publicKey: 'pub' } })
}));

vi.mock('../src/stores/nostr', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNostrStore: () => ({
      initSignerIfNotSet: vi.fn(),
      signer: {},
      pubkey: 'hex',
      connect: vi.fn()
    }),
    publishDiscoveryProfile: vi.fn().mockResolvedValue({ ids: [], failedRelays: [] })
  };
});

import { publishCreatorBundle } from '../src/stores/nostr';

describe('publishCreatorBundle', () => {
  beforeEach(() => {
    hubStore.publishTierDefinitions.mockClear();
    hubStore.lastPublishedTiersHash = '';
  });

  it('calls publishTierDefinitions only when tiers change', async () => {
    await publishCreatorBundle();
    expect(hubStore.publishTierDefinitions).toHaveBeenCalledTimes(1);
    await publishCreatorBundle();
    expect(hubStore.publishTierDefinitions).toHaveBeenCalledTimes(1);
    hubStore.lastPublishedTiersHash = 'different';
    await publishCreatorBundle();
    expect(hubStore.publishTierDefinitions).toHaveBeenCalledTimes(2);
  });
});
