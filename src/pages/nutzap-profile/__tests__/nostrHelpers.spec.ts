import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import {
  fundstrRelayClient,
  RelayPublishError,
  type FundstrRelayStatus,
} from 'src/nutzap/relayClient';

vi.hoisted(() => {
  vi.stubEnv('VITE_NUTZAP_ALLOW_WSS_WRITES', 'true');
  vi.stubEnv('VITE_NUTZAP_PRIMARY_RELAY_WSS', 'wss://relay.primal.net');
  vi.stubEnv('VITE_NUTZAP_PRIMARY_RELAY_HTTP', 'https://relay.primal.net');
  vi.stubEnv('VITE_NUTZAP_WS_TIMEOUT_MS', '500');
  vi.stubEnv('VITE_NUTZAP_HTTP_TIMEOUT_MS', '75');
  return undefined;
});

afterAll(() => {
  vi.unstubAllEnvs();
});

const ndkMock = vi.hoisted(() => {
  const listeners = new Map<string, Set<(relay: any) => void>>();
  const relay = { url: 'wss://relay.primal.net', connected: false };
  const pool = {
    relays: new Map([[relay.url, relay]]),
    on(event: string, cb: (relay: any) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(cb);
    },
  };
  return {
    pool,
    relay,
    emit(event: string) {
      if (event === 'relay:connect' || event === 'relay:heartbeat') {
        relay.connected = true;
      } else if (event === 'relay:disconnect' || event === 'relay:stalled') {
        relay.connected = false;
      }
      const set = listeners.get(event);
      if (!set) return;
      for (const cb of Array.from(set)) {
        cb(relay);
      }
    },
    reset() {
      listeners.clear();
      relay.connected = false;
      pool.relays = new Map([[relay.url, relay]]);
    },
  };
});

vi.mock('src/nutzap/ndkInstance', () => ({
  getNutzapNdk: () => ({ pool: ndkMock.pool }),
}));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];
  onopen: (() => void) | null = null;
  onclose: ((ev?: any) => void) | null = null;
  onerror: ((err: any) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({});
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  emitMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

describe('fundstrRelayClient', () => {
  const globalAny = globalThis as Record<string, unknown>;
  let originalWebSocket: unknown;
  let originalWindow: unknown;

  beforeEach(() => {
    ndkMock.reset();
    MockWebSocket.instances = [];
    originalWebSocket = globalAny.WebSocket;
    globalAny.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    (fundstrRelayClient as any).WSImpl = MockWebSocket;
    originalWindow = globalAny.window;
    globalAny.window = { nostr: { signEvent: vi.fn() } };
    fundstrRelayClient.clearForTests();
    (fundstrRelayClient as any).allowWsWrites = true;
    expect((fundstrRelayClient as any).WSImpl).toBe(MockWebSocket);
    expect((fundstrRelayClient as any).allowWsWrites).toBe(true);
  });

  afterEach(() => {
    fundstrRelayClient.clearForTests();
    (fundstrRelayClient as any).WSImpl = undefined;
    globalAny.WebSocket = originalWebSocket;
    globalAny.window = originalWindow;
    vi.useRealTimers();
  });

  it('sends REQ and CLOSE messages around subscription lifecycle', () => {
    const statuses: FundstrRelayStatus[] = [];
    const stop = fundstrRelayClient.onStatusChange(status => {
      statuses.push(status);
    });

    const subId = fundstrRelayClient.subscribe([{ kinds: [42] }], () => {});
    expect(MockWebSocket.instances).toHaveLength(1);

    const socket = MockWebSocket.instances[0];
    socket.open();

    expect(statuses).toContain('connected');
    expect(socket.sentMessages).toContain(JSON.stringify(['REQ', subId, { kinds: [42] }]));

    fundstrRelayClient.unsubscribe(subId);
    expect(socket.sentMessages).toContain(JSON.stringify(['CLOSE', subId]));

    stop();
  });

  it('emits reconnect status when the socket closes unexpectedly', () => {
    vi.useFakeTimers();
    const statuses: FundstrRelayStatus[] = [];
    const stop = fundstrRelayClient.onStatusChange(status => {
      statuses.push(status);
    });

    const subA = fundstrRelayClient.subscribe([{ kinds: [1] }], () => {});
    const subB = fundstrRelayClient.subscribe([{ kinds: [2] }], () => {});
    expect(MockWebSocket.instances).toHaveLength(1);

    const socket = MockWebSocket.instances[0];
    socket.open();
    ndkMock.emit('relay:connect');
    expect(statuses).toContain('connected');

    socket.close();
    expect(statuses).toContain('reconnecting');

    vi.runOnlyPendingTimers();
    expect(MockWebSocket.instances).toHaveLength(2);

    const nextSocket = MockWebSocket.instances[1];
    nextSocket.open();

    expect(nextSocket.sentMessages).toEqual(
      expect.arrayContaining([
        JSON.stringify(['REQ', subA, { kinds: [1] }]),
        JSON.stringify(['REQ', subB, { kinds: [2] }]),
      ])
    );

    fundstrRelayClient.unsubscribe(subA);
    fundstrRelayClient.unsubscribe(subB);
    stop();
  });

  describe('requestOnce', () => {
    it('falls back to HTTP when the websocket times out', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi
        .spyOn(globalThis as { fetch: typeof fetch }, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify([{ id: 'evt1' }]), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );

      try {
        const promise = fundstrRelayClient.requestOnce(
          [{ kinds: [1], authors: ['abc'] }],
          {
            timeoutMs: 25,
            httpFallback: {
              url: FUNDSTR_REQ_URL,
              timeoutMs: HTTP_FALLBACK_TIMEOUT_MS,
            },
          }
        );

        expect(MockWebSocket.instances).toHaveLength(1);
        const socket = MockWebSocket.instances[0];
        socket.open();

        vi.advanceTimersByTime(25);

        const events = await promise;
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(events).toEqual([{ id: 'evt1' }]);
      } finally {
        fetchSpy.mockRestore();
      }
    });

    it('throws a readable error when HTTP fallback responds with non-JSON', async () => {
      const fetchSpy = vi
        .spyOn(globalThis as { fetch: typeof fetch }, 'fetch')
        .mockResolvedValue(
          new Response('<!doctype html><html><body>Upstream failure</body></html>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          })
        );

      try {
        const promise = fundstrRelayClient.requestOnce(
          [{ kinds: [1], authors: ['abc'] }],
          {
            timeoutMs: WS_FIRST_TIMEOUT_MS,
            httpFallback: {
              url: FUNDSTR_REQ_URL,
              timeoutMs: HTTP_FALLBACK_TIMEOUT_MS,
            },
          }
        );

        expect(MockWebSocket.instances).toHaveLength(1);
        const socket = MockWebSocket.instances[0];
        socket.open();
        const reqMessage = socket.sentMessages.find(msg => msg.includes('"REQ"'));
        expect(reqMessage).toBeTruthy();
        const [, subId] = JSON.parse(reqMessage as string) as [string, string];
        socket.emitMessage(['EOSE', subId]);

        await expect(promise).rejects.toThrow(/Unexpected response \(200, text\/html\)/);
        await expect(promise).rejects.toThrow(/Upstream failure/);
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });

  describe('publish', () => {
    const signedEvent = {
      id: 'aa'.repeat(32),
      pubkey: 'bb'.repeat(32),
      created_at: Math.floor(Date.now() / 1000),
      kind: 1,
      tags: [],
      content: 'hello',
      sig: 'cc'.repeat(64),
    };

    it('sends EVENT and resolves on OK ack', async () => {
      (globalAny.window as any).nostr.signEvent = vi.fn().mockImplementation(() => signedEvent);

      const promise = fundstrRelayClient.publish({ kind: 1, tags: [], content: 'hello' });

      await Promise.resolve();
      await Promise.resolve();
      expect(MockWebSocket.instances).toHaveLength(1);
      const socket = MockWebSocket.instances[0];
      const originalSend = socket.send.bind(socket);
      socket.send = (data: string) => {
        originalSend(data);
        const [, payload] = JSON.parse(data) as [string, any];
        socket.emitMessage(['OK', payload.id, true, 'ack message']);
      };
      socket.open();
      await Promise.resolve();

      const result = await promise;
      expect(result.event.id).toBe(signedEvent.id);
      expect(result.ack).toEqual({
        id: signedEvent.id,
        accepted: true,
        message: 'ack message',
        via: 'websocket',
      });

      const sent = socket.sentMessages.find(msg => msg.includes('"EVENT"'));
      expect(sent).toBeTruthy();
      const [, payload] = JSON.parse(sent as string) as [string, any];
      expect(payload.id).toBe(signedEvent.id);
    });

    it('rejects with RelayPublishError when relay returns OK false', async () => {
      (globalAny.window as any).nostr.signEvent = vi.fn().mockImplementation(() => signedEvent);

      const promise = fundstrRelayClient.publish({ kind: 1, tags: [], content: 'oops' });

      await Promise.resolve();
      await Promise.resolve();
      expect(MockWebSocket.instances).toHaveLength(1);
      const socket = MockWebSocket.instances[0];
      const originalSend = socket.send.bind(socket);
      socket.send = (data: string) => {
        originalSend(data);
        const [, payload] = JSON.parse(data) as [string, any];
        socket.emitMessage(['OK', payload.id, false, 'duplicate']);
      };
      socket.open();
      await Promise.resolve();

      await promise.catch(err => {
        expect(err).toBeInstanceOf(RelayPublishError);
        const rejection = err as RelayPublishError;
        expect(rejection.ack.accepted).toBe(false);
        expect(rejection.ack.message).toBe('duplicate');
        expect(rejection.ack.id).toBe(signedEvent.id);
      });

      const sent = socket.sentMessages.find(msg => msg.includes('"EVENT"'));
      expect(sent).toBeTruthy();
    });

    it('falls back to HTTP when websocket is unavailable', async () => {
      (fundstrRelayClient as any).WSImpl = undefined;
      MockWebSocket.instances = [];
      (globalAny.window as any).nostr.signEvent = vi.fn().mockImplementation(() => signedEvent);

      const fetchSpy = vi
        .spyOn(globalThis as { fetch: typeof fetch }, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ id: signedEvent.id, accepted: true, message: 'http ok' }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            }
          )
        );

      try {
        const result = await fundstrRelayClient.publish({ kind: 1, tags: [], content: 'hi' });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(result.ack.via).toBe('http');
        expect(result.ack.message).toBe('http ok');
      } finally {
        fetchSpy.mockRestore();
      }
    });
  });
});
import {
  isNostrEvent,
  FUNDSTR_REQ_URL,
  WS_FIRST_TIMEOUT_MS,
  HTTP_FALLBACK_TIMEOUT_MS,
} from '../nostrHelpers';
import {
  normalizeAuthor,
  pickLatestReplaceable,
  pickLatestParamReplaceable,
} from 'src/nutzap/profileShared';

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

describe('relay endpoint defaults', () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('uses default relay URLs when environment variables are blank', async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_NUTZAP_ALLOW_WSS_WRITES', 'true');
    vi.stubEnv('VITE_NUTZAP_PRIMARY_RELAY_HTTP', '   ');
    vi.stubEnv('VITE_NUTZAP_PRIMARY_RELAY_WSS', '\n');

    const { FUNDSTR_REQ_URL, FUNDSTR_WS_URL } = await import('../nostrHelpers');
    expect(FUNDSTR_WS_URL).toBe('wss://relay.primal.net');
    expect(FUNDSTR_REQ_URL).toBe('https://relay.primal.net/req');
  });
});

