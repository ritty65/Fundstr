import { afterEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import {
  fundstrFirstQuery,
  normalizeAuthor,
  isNostrEvent,
  pickLatestReplaceable,
  pickLatestParamReplaceable,
} from '../nostrHelpers';

describe('normalizeAuthor', () => {
  const hexKey = '5015f8a13449bcc6e21b54de0dc6be037ce8e90c96582343c5c8f668c67515e8';

  it('accepts 64-char hex keys', () => {
    expect(normalizeAuthor(hexKey.toUpperCase())).toBe(hexKey);
  });

  it('decodes npub identifiers to hex', () => {
    const npub = nip19.npubEncode(hexKey);
    expect(normalizeAuthor(npub)).toBe(hexKey);
  });

  it('rejects invalid inputs', () => {
    expect(() => normalizeAuthor('npub1invalid')).toThrow();
    expect(() => normalizeAuthor('')).toThrow();
    expect(() => normalizeAuthor('1234')).toThrow();
  });
});

describe('isNostrEvent', () => {
  const baseEvent = {
    id: 'ab'.repeat(32),
    pubkey: 'cd'.repeat(32),
    created_at: Math.floor(Date.now() / 1000),
    kind: 10019,
    tags: [],
    content: '{}',
    sig: 'ef'.repeat(64),
  };

  it('recognizes valid NIP-01 events', () => {
    expect(isNostrEvent(baseEvent)).toBe(true);
  });

  it('rejects events with invalid fields', () => {
    expect(isNostrEvent({ ...baseEvent, sig: 'notvalid' })).toBe(false);
    expect(isNostrEvent({ ...baseEvent, id: 'xyz' })).toBe(false);
    expect(isNostrEvent({ ...baseEvent, created_at: 'not-a-number' })).toBe(false);
  });
});

describe('replaceable selectors', () => {
  const baseEvent = {
    pubkey: 'aa'.repeat(32),
    tags: [['d', 'tiers']],
  };

  it('pickLatestReplaceable returns the newest event for a key', () => {
    const events = [
      { ...baseEvent, kind: 10019, created_at: 10, id: '10'.repeat(32) },
      { ...baseEvent, kind: 10019, created_at: 20, id: '20'.repeat(32) },
      { ...baseEvent, kind: 10019, created_at: 15, id: '15'.repeat(32) },
    ];
    const latest = pickLatestReplaceable(events);
    expect(latest?.created_at).toBe(20);
  });

  it('pickLatestParamReplaceable respects the first d tag', () => {
    const events = [
      {
        ...baseEvent,
        kind: 30019,
        created_at: 5,
        id: '05'.repeat(32),
        tags: [['d', 'tiers'], ['d', 'other']],
      },
      {
        ...baseEvent,
        kind: 30019,
        created_at: 10,
        id: '10'.repeat(32),
        tags: [['d', 'tiers']],
      },
    ];
    const latest = pickLatestParamReplaceable(events);
    expect(latest?.created_at).toBe(10);
  });
});

describe('fundstrFirstQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws a readable error when the HTTP bridge responds with non-JSON', async () => {
    const globalAny = globalThis as Record<string, unknown>;
    const hadWebSocket = Object.prototype.hasOwnProperty.call(globalAny, 'WebSocket');
    const originalWebSocket = globalAny.WebSocket;
    delete globalAny.WebSocket;

    const htmlBody = '<!doctype html><html><body>Upstream failure</body></html>';
    const response = new Response(htmlBody, {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });

    const fetchSpy = vi
      .spyOn(globalThis as { fetch: typeof fetch }, 'fetch')
      .mockResolvedValue(response);

    try {
      const queryPromise = fundstrFirstQuery([{ kinds: [10019] }], 0);
      await expect(queryPromise).rejects.toThrowError(/Unexpected response \(200, text\/html\)/);
      await expect(queryPromise).rejects.toThrowError(/Upstream failure/);
    } finally {
      if (hadWebSocket) {
        globalAny.WebSocket = originalWebSocket;
      } else {
        delete globalAny.WebSocket;
      }
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
