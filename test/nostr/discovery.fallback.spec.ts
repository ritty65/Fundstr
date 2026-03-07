import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/nostr/relayClient', () => ({
  toHex: vi.fn(),
  queryNostr: vi.fn(),
}));

import { fallbackDiscoverRelays } from '../../src/nostr/discovery';
import { queryNostr, toHex } from '../../src/nostr/relayClient';

const toHexMock = vi.mocked(toHex);
const queryNostrMock = vi.mocked(queryNostr);

describe('fallbackDiscoverRelays', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('returns an empty array when the pubkey cannot be converted', async () => {
    toHexMock.mockImplementation(() => {
      throw new Error('bad npub');
    });

    await expect(fallbackDiscoverRelays('npub1bad')).resolves.toEqual([]);
    expect(toHexMock).toHaveBeenCalledWith('npub1bad');
    expect(queryNostrMock).not.toHaveBeenCalled();
  });

  it('returns a deduplicated, trimmed list of relays from discovery events', async () => {
    const hex = 'f'.repeat(64);
    toHexMock.mockReturnValue(hex);
    queryNostrMock.mockResolvedValue([
      {
        tags: [
          ['r', ' wss://relay.one '],
          ['p', 'ignored'],
          ['r', 'wss://relay.two'],
          ['r', '\twss://relay.one  '],
          ['r', ''],
          ['x', 'wss://not-a-relay'],
          ['r', ' wss://relay.three '],
          ['r', '  '],
        ],
      },
    ] as any);

    await expect(fallbackDiscoverRelays('npub1good')).resolves.toEqual([
      'wss://relay.one',
      'wss://relay.two',
      'wss://relay.three',
    ]);

    expect(toHexMock).toHaveBeenCalledWith('npub1good');
    expect(queryNostrMock).toHaveBeenCalledWith(
      [{ kinds: [10002], authors: [hex], limit: 1 }],
      { preferFundstr: false, fanout: [] },
    );
  });
});
