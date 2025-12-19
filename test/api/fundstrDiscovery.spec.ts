import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nip19 } from 'nostr-tools';

import { createFundstrDiscoveryClient, __test__ } from '../../src/api/fundstrDiscovery';

const { createTimeoutSignal, fetchJsonWithRetry } = __test__;

const originalFetch = globalThis.fetch;

describe('fundstrDiscovery client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    if (originalFetch) {
      (globalThis as any).fetch = originalFetch;
    } else {
      delete (globalThis as any).fetch;
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalFetch) {
      (globalThis as any).fetch = originalFetch;
    } else {
      delete (globalThis as any).fetch;
    }
  });

  it('aborts merged signals when the timeout elapses', async () => {
    vi.useFakeTimers();

    const { signal, cleanup } = createTimeoutSignal(undefined, 1_000);

    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(DOMException);
    expect((signal.reason as DOMException).name).toBe('AbortError');

    cleanup();
  });

  it('mirrors external abort signals and reasons', () => {
    const controller = new AbortController();
    const reason = new Error('stop');

    const { signal, cleanup } = createTimeoutSignal(controller.signal, 5_000);

    controller.abort(reason);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe(reason);

    cleanup();
  });

  it('retries fetches that fail before succeeding', async () => {
    vi.useFakeTimers();

    const payload = { ok: true };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('fail', { status: 500 }))
      .mockResolvedValueOnce(new Response('still bad', { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }));

    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchJsonWithRetry('/resource', { timeoutMs: 50 }, 3, 25);

    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ ok: true, data: payload });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('surfaces the final error after exhausting retries', async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response('nope', { status: 503 })));
    vi.stubGlobal('fetch', fetchMock);

    const promise = fetchJsonWithRetry('/resource', { timeoutMs: 50 }, 3, 10);
    const expectation = expect(promise).resolves.toMatchObject({ ok: false, warning: 'Limited results (discovery unavailable)' });

    await vi.runAllTimersAsync();

    await expectation;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('warns instead of throwing on non-JSON responses', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response('<html>nope</html>', { status: 200, headers: { 'content-type': 'text/html' } })),
    );

    vi.stubGlobal('fetch', fetchMock);

    const client = createFundstrDiscoveryClient();
    const creators = await client.getCreators({ q: 'alice' });

    expect(creators.results).toEqual([]);
    expect(creators.count).toBe(0);
    expect(creators.warnings).toContain('Limited results (discovery unavailable)');
  });

  it('normalizes discovery creator payloads', async () => {
    const uppercasePubkey = 'A'.repeat(64);
    const bundleResponse = {
      query: '',
      creators: [
        {
          pubkey: uppercasePubkey,
          meta: {
            displayName: 'Alice Meta ',
            username: ' alice ',
            picture: 'https://cdn.fundstr.me/avatar.png ',
            lightning_address: 'alice@ln.example',
            website: ' https://fundstr.example ',
          },
          profile: {
            display_name: 'Alice Profile ',
            bio: ' Hello ',
            cover: 'https://cdn.fundstr.me/banner.png ',
            nip05: ' alice@nostr.example ',
          },
          has_nutzap: true,
          nutzapProfile: { trusted_mints: ['mint'] },
          tiers: [
            {
              id: 'tier-1',
              name: 'Supporter',
              price_sats: 10,
              media: ['https://cdn.fundstr.me/image.png'],
            },
            {
              identifier: 'tier-2',
              price: 20,
              about: ' VIP ',
            },
            {
              name: 'no-id tier',
            },
          ],
        },
      ],
      warnings: [' stale ', 7],
      took_ms: 120,
      swr_cache_hit: true,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(bundleResponse), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ results: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const client = createFundstrDiscoveryClient();
    const creators = await client.getCreators({ q: ' alice ' });

    expect(creators.count).toBe(1);
    expect(creators.cached).toBe(true);
    expect(creators.tookMs).toBe(120);
    expect(creators.warnings).toEqual([' stale ', '7']);
    expect(creators.results).toHaveLength(1);

    const [creator] = creators.results;
    expect(creator.pubkey).toBe(uppercasePubkey.toLowerCase());
    expect(creator.displayName).toBe('Alice Profile');
    expect(creator.name).toBe('alice');
    expect(creator.about).toBe('Hello');
    expect(creator.picture).toBe('https://cdn.fundstr.me/avatar.png');
    expect(creator.banner).toBe('https://cdn.fundstr.me/banner.png');
    expect(creator.nip05).toBe('alice@nostr.example');
    expect(creator.profile?.lud16).toBe('alice@ln.example');
    expect(creator.profile?.website).toBe('https://fundstr.example');
    expect(creator.profile?.has_nutzap).toBe(true);
    expect(creator.profile?.nutzapProfile).toEqual({ trusted_mints: ['mint'] });
    expect(creator.tiers).toEqual([
      {
        id: 'tier-1',
        name: 'Supporter',
        amountMsat: 10_000,
        cadence: null,
        description: null,
        media: [{ url: 'https://cdn.fundstr.me/image.png' }],
      },
      {
        id: 'tier-2',
        name: 'Tier TIER-2',
        amountMsat: 20_000,
        cadence: null,
        description: 'VIP',
        media: [],
      },
    ]);

    const byPubkeys = await client.getCreatorsByPubkeys({ npubs: [nip19.npubEncode(creator.pubkey)] });

    expect(byPubkeys.query).toBe('by-pubkeys');
    expect(byPubkeys.results).toEqual([]);
    expect(byPubkeys.count).toBe(0);
    expect(byPubkeys.warnings).toEqual([]);
    expect(byPubkeys.cached).toBe(false);
  });

  it('normalizes tiers from nutzap bundles and flags stale results', async () => {
    const pubkeyHex = 'b'.repeat(64);
    const npub = nip19.npubEncode(pubkeyHex);

    const bundle = {
      pubkey: npub,
      tiers: [
        {
          id: 'gold',
          name: 'Supporter',
          price_sats: 50,
          media: ['https://cdn.fundstr.me/video.mp4'],
        },
        {
          identifier: 'silver',
          price: 25,
          media: [{ url: 'https://cdn.fundstr.me/audio.mp3', type: 'audio/mp3', title: 'Song' }],
        },
      ],
      stale: false,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(bundle), { status: 200, headers: { 'content-type': 'application/json' } }));

    vi.stubGlobal('fetch', fetchMock);

    const client = createFundstrDiscoveryClient();
    const tiers = await client.getCreatorTiers({ id: npub });

    expect(tiers.pubkey).toBe(pubkeyHex);
    expect(tiers.cached).toBe(true);
    expect(tiers.tiers).toEqual([
      {
        id: 'gold',
        name: 'Supporter',
        amountMsat: 50_000,
        cadence: null,
        description: null,
        media: [{ url: 'https://cdn.fundstr.me/video.mp4' }],
      },
      {
        id: 'silver',
        name: 'Tier SILVER',
        amountMsat: 25_000,
        cadence: null,
        description: null,
        media: [{ url: 'https://cdn.fundstr.me/audio.mp3', title: 'Song' }],
      },
    ]);
  });

  it('throws when the discovery bundle is malformed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createFundstrDiscoveryClient();

    await expect(client.getNutzapBundle('npub1invalid')).rejects.toThrow(
      'Invalid Nutzap bundle response from discovery service',
    );
  });

  it('skips malformed creator records instead of failing completely', async () => {
    const validPubkey = 'a'.repeat(64);
    const bundleResponse = {
      results: [
        {
          pubkey: validPubkey,
          meta: { displayName: 'Valid One' },
        },
        {
          pubkey: 'invalid-pubkey', // This should cause a crash currently
          meta: { displayName: 'Invalid One' },
        },
      ],
      count: 2,
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(bundleResponse), { status: 200, headers: { 'content-type': 'application/json' } }),
      );

    vi.stubGlobal('fetch', fetchMock);

    const client = createFundstrDiscoveryClient();

    // This should now resolve, filtering out the bad one
    const response = await client.getCreators({ q: 'test' });

    expect(response.results).toHaveLength(1);
    expect(response.results[0].pubkey).toBe(validPubkey);

    // Check that we got a warning about the skipped record
    expect(response.warnings.length).toBeGreaterThan(0);
    expect(response.warnings[0]).toContain('Skipping invalid creator record');
  });
});
