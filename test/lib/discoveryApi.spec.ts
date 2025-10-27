import { afterEach, beforeEach, describe, expect, it, vi, type SpyInstance } from 'vitest';

import { searchCreators } from 'src/lib/discoveryApi';

describe('searchCreators', () => {
  const originalFetch = global.fetch;
  let fetchMock!: ReturnType<typeof vi.fn>;
  let logSpy!: SpyInstance;
  let errorSpy!: SpyInstance;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.restoreAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  it('requests default wildcard and normalizes discovery responses', async () => {
    const backendResponse = {
      count: 2,
      warnings: ['cached entry'],
      results: [
        {
          pubkey: 'a'.repeat(64),
          profile: {
            display_name: 'Profile Display',
            name: 'Profile Name',
            about: 'Profile about',
            picture: 'https://example.com/picture.png',
            banner: 'https://example.com/banner.png',
            nip05: 'profile@nostr.me',
          },
          meta: {
            display_name: 'Meta Display',
            name: 'Meta Name',
            about: 'Meta about',
            picture: 'https://example.com/meta-picture.png',
            banner: 'https://example.com/meta-banner.png',
            nip05: 'meta@nostr.me',
          },
          tiers: [{ id: 'tier-one' }],
          cacheHit: true,
          featured: true,
        },
        {
          pubkey: 'b'.repeat(64),
          profile: {},
          meta: {
            display_name: 'Meta Only Display',
            name: 'Meta Only Name',
            about: 'Meta Only about',
            picture: 'https://example.com/meta-only-picture.png',
            banner: 'https://example.com/meta-only-banner.png',
            nip05: 'meta-only@nostr.me',
          },
          tiers: [{ id: 'tier-two' }],
        },
      ],
      cached: true,
      took_ms: 321,
    };

    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(backendResponse),
    } as unknown as Response;

    fetchMock.mockResolvedValue(response);

    const result = await searchCreators('', undefined);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.fundstr.me/discover/creators?q=*',
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: undefined,
      }),
    );

    expect(result).toEqual({
      count: 2,
      warnings: ['cached entry'],
      cached: true,
      took_ms: 321,
      results: expect.any(Array),
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        pubkey: 'a'.repeat(64),
        displayName: 'Profile Display',
        name: 'Profile Name',
        about: 'Profile about',
        picture: 'https://example.com/picture.png',
        banner: 'https://example.com/banner.png',
        nip05: 'profile@nostr.me',
        tiers: [{ id: 'tier-one' }],
        cacheHit: true,
        featured: true,
        profile: backendResponse.results[0].profile,
      }),
    );

    expect(result.results[1]).toEqual(
      expect.objectContaining({
        pubkey: 'b'.repeat(64),
        displayName: 'Meta Only Display',
        name: 'Meta Only Name',
        about: 'Meta Only about',
        picture: 'https://example.com/meta-only-picture.png',
        banner: 'https://example.com/meta-only-banner.png',
        nip05: 'meta-only@nostr.me',
        tiers: [{ id: 'tier-two' }],
        profile: backendResponse.results[1].profile,
      }),
    );
  });

  it('preserves query strings when building the request URL', async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        count: 0,
        warnings: [],
        results: [],
        cached: false,
        took_ms: 0,
      }),
    } as unknown as Response;

    fetchMock.mockResolvedValue(response);

    await searchCreators('npub1example?filter=paid', undefined);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.fundstr.me/discover/creators?q=npub1example%3Ffilter%3Dpaid',
      expect.any(Object),
    );
  });

  it('throws when the response is not OK', async () => {
    const textMock = vi.fn().mockResolvedValue('server exploded');
    const response = {
      ok: false,
      status: 500,
      text: textMock,
    } as unknown as Response;

    fetchMock.mockResolvedValue(response);

    await expect(searchCreators('alice', undefined)).rejects.toThrow(
      'Request failed with status 500: server exploded',
    );
    expect(textMock).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to search creators:',
      expect.objectContaining({ message: 'Request failed with status 500: server exploded' }),
    );
  });

  it('returns a fallback payload when fetch rejects', async () => {
    const failure = new Error('connection lost');
    fetchMock.mockRejectedValue(failure);

    const result = await searchCreators('alice', undefined);

    expect(result).toEqual({
      count: 0,
      warnings: ['Failed to connect to the discovery service.'],
      results: [],
      cached: false,
      took_ms: 0,
    });

    expect(errorSpy).toHaveBeenCalledWith('Failed to search creators:', failure);
  });

  it('rethrows abort errors without returning fallback data', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    fetchMock.mockRejectedValue(abortError);

    await expect(searchCreators('bob', undefined)).rejects.toBe(abortError);

    expect(logSpy).toHaveBeenCalledWith('Search request was aborted.');
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
