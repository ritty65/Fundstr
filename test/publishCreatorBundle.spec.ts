import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@noble/ciphers/aes.js', () => ({}), { virtual: true });

const hubStore = {
  getTierArray: () => [
    { id: 't1', name: 'Tier', price_sats: 1, publishStatus: 'pending' },
  ],
  publishTierDefinitions: vi.fn(async () => {
    const json = JSON.stringify(
      hubStore.getTierArray().map(({ publishStatus, ...pure }) => pure),
    );
    expect(json).not.toContain('publishStatus');
  }),
  lastPublishedTiersHash: '',
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

let publishDiscoveryProfileMock: any;
vi.mock('../src/stores/nostr', async (importOriginal) => {
  const actual = await importOriginal();
  publishDiscoveryProfileMock = vi.fn().mockResolvedValue({
    ids: [],
    relaysTried: 1,
    byRelay: [],
    anySuccess: true,
    usedFallback: [],
  });
  return {
    ...actual,
    useNostrStore: () => ({
      initSignerIfNotSet: vi.fn(),
      signer: {},
      pubkey: 'hex',
      connect: vi.fn()
    }),
    publishDiscoveryProfile: publishDiscoveryProfileMock,
  };
});

import { publishCreatorBundle } from '../src/stores/nostr';

describe('publishCreatorBundle', () => {
  beforeEach(() => {
    hubStore.publishTierDefinitions.mockClear();
    hubStore.lastPublishedTiersHash = '';
  });

  it('calls publishTierDefinitions only when tiers change and after profile', async () => {
    await publishCreatorBundle();
    expect(hubStore.publishTierDefinitions).toHaveBeenCalledTimes(1);
    await publishCreatorBundle();
    expect(hubStore.publishTierDefinitions).toHaveBeenCalledTimes(1);
    hubStore.lastPublishedTiersHash = 'different';
    await publishCreatorBundle();
    expect(hubStore.publishTierDefinitions).toHaveBeenCalledTimes(2);
    expect(publishDiscoveryProfileMock).toHaveBeenCalled();
    expect(
      publishDiscoveryProfileMock.mock.invocationCallOrder[0]
    ).toBeLessThan(hubStore.publishTierDefinitions.mock.invocationCallOrder[0]);
  });
});
