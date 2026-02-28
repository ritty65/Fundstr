import { afterEach, describe, expect, it, vi } from 'vitest';

type PublishStatus = import('@/lib/publish').PublishStatus;

type Listener = (...args: any[]) => void;

class MockPublication {
  private listeners = new Map<string, Listener[]>();

  constructor(readonly relay: string) {}

  on(event: 'ok' | 'failed', handler: Listener) {
    const existing = this.listeners.get(event) ?? [];
    existing.push(handler);
    this.listeners.set(event, existing);
    return this;
  }

  emit(event: 'ok' | 'failed', ...args: any[]) {
    for (const handler of this.listeners.get(event) ?? []) {
      handler(...args);
    }
  }
}

const publicationsByRelay = new Map<string, MockPublication[]>();

function trackPublication(relay: string, publication: MockPublication) {
  const list = publicationsByRelay.get(relay) ?? [];
  list.push(publication);
  publicationsByRelay.set(relay, list);
}

function lastPublication(relay: string) {
  const list = publicationsByRelay.get(relay);
  if (!list?.length) {
    throw new Error(`No publication recorded for relay ${relay}`);
  }
  return list[list.length - 1];
}

vi.mock('nostr-tools', () => ({
  __esModule: true,
  SimplePool: class {
    publish(relays: string[]) {
      const relay = relays[0];
      const publication = new MockPublication(relay);
      trackPublication(relay, publication);
      return publication;
    }

    close(_relays: string[]) {
      /* no-op */
    }
  },
}));

async function importPublishModule(proxyBase?: string) {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('VITE_PROXY_BASE_HTTP', proxyBase ?? '');
  vi.stubEnv('VITE_PROXY_BASE_WSS', '');
  return import('@/lib/publish');
}

function createEvent() {
  return {
    id: 'evt',
    kind: 1,
    content: '',
    created_at: 0,
    pubkey: 'pub',
    sig: 'sig',
    tags: [] as string[][],
  };
}

afterEach(() => {
  publicationsByRelay.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('publishWithFallback', () => {
  it('uses HTTP proxy and reports success sequence', async () => {
    const { publishWithFallback } = await importPublishModule('https://proxy.test');
    const statuses: PublishStatus[] = [];
    const json = vi.fn().mockResolvedValue({ ok: true });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, statusText: 'OK', json });
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishWithFallback(createEvent(), {
      proxyMode: true,
      onStatus: status => statuses.push(status),
    });

    expect(fetchMock).toHaveBeenCalledWith('https://proxy.test/event', expect.any(Object));
    expect(statuses).toEqual([
      { phase: 'connecting', relay: 'proxy' },
      { phase: 'publishing', relay: 'proxy' },
      { phase: 'ok', relay: 'proxy' },
      { phase: 'done', okOn: 'proxy' },
    ]);
    expect(result).toEqual({ ok: true, relay: 'proxy' });
  });

  it('fails fast when proxy HTTP request is not ok', async () => {
    const { publishWithFallback } = await importPublishModule('https://proxy.test');
    const statuses: PublishStatus[] = [];
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, statusText: 'Bad Gateway', json: vi.fn() });
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishWithFallback(createEvent(), {
      proxyMode: true,
      onStatus: status => statuses.push(status),
    });

    expect(statuses).toEqual([
      { phase: 'connecting', relay: 'proxy' },
      { phase: 'failed', relay: 'proxy', reason: 'Bad Gateway' },
    ]);
    expect(result).toEqual({ ok: false });
  });

  it('handles proxy bad ack payloads', async () => {
    const { publishWithFallback } = await importPublishModule('https://proxy.test');
    const statuses: PublishStatus[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, statusText: 'OK', json: vi.fn().mockResolvedValue({ ok: false }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishWithFallback(createEvent(), {
      proxyMode: true,
      onStatus: status => statuses.push(status),
    });

    expect(statuses).toEqual([
      { phase: 'connecting', relay: 'proxy' },
      { phase: 'failed', relay: 'proxy', reason: 'bad-ack' },
    ]);
    expect(result).toEqual({ ok: false });
  });

  it('surfaces proxy network errors', async () => {
    const { publishWithFallback } = await importPublishModule('https://proxy.test');
    const statuses: PublishStatus[] = [];
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network-down')));

    const result = await publishWithFallback(createEvent(), {
      proxyMode: true,
      onStatus: status => statuses.push(status),
    });

    expect(statuses).toEqual([
      { phase: 'connecting', relay: 'proxy' },
      { phase: 'failed', relay: 'proxy', reason: 'network-down' },
    ]);
    expect(result).toEqual({ ok: false });
  });

  it('resolves on first ok relay and ignores later oks', async () => {
    const { publishWithFallback } = await importPublishModule();
    const statuses: PublishStatus[] = [];
    const resultPromise = publishWithFallback(createEvent(), {
      primary: 'wss://primary',
      fallbacks: ['wss://secondary'],
      onStatus: status => statuses.push(status),
    });

    lastPublication('wss://primary').emit('ok');
    lastPublication('wss://secondary').emit('ok');

    const result = await resultPromise;

    expect(result).toEqual({ ok: true, relay: 'wss://primary' });
    expect(statuses.filter(s => s.phase === 'ok')).toEqual([{ phase: 'ok', relay: 'wss://primary' }]);
    expect(statuses.filter(s => s.phase === 'done')).toEqual([{ phase: 'done', okOn: 'wss://primary' }]);
  });

  it('propagates failed reasons when no relay succeeds', async () => {
    const { publishWithFallback } = await importPublishModule();
    const statuses: PublishStatus[] = [];
    const resultPromise = publishWithFallback(createEvent(), {
      primary: 'wss://primary',
      fallbacks: ['wss://secondary'],
      onStatus: status => statuses.push(status),
    });

    lastPublication('wss://primary').emit('failed', 'auth-error');
    lastPublication('wss://secondary').emit('failed', 'rate-limit');

    const result = await resultPromise;

    expect(result).toEqual({ ok: false, relay: undefined });
    expect(statuses).toContainEqual({ phase: 'failed', relay: 'wss://primary', reason: 'auth-error' });
    expect(statuses).toContainEqual({ phase: 'failed', relay: 'wss://secondary', reason: 'rate-limit' });
  });

  it('reports ack timeout when relay never acks', async () => {
    vi.useFakeTimers();
    const { publishWithFallback } = await importPublishModule();
    const statuses: PublishStatus[] = [];
    const resultPromise = publishWithFallback(createEvent(), {
      primary: 'wss://primary',
      fallbacks: [],
      ackTimeoutMs: 5,
      onStatus: status => statuses.push(status),
    });

    await vi.advanceTimersByTimeAsync(5);
    await vi.advanceTimersByTimeAsync(25);

    const result = await resultPromise;

    expect(statuses).toContainEqual({ phase: 'failed', relay: 'wss://primary', reason: 'ack-timeout' });
    expect(result).toEqual({ ok: false, relay: undefined });
  });
});
