import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter as NostrFilter } from 'nostr-tools';
import { multiRelaySearch, mergeRelayHints } from '../multiRelaySearch';

const poolState = {
  onSubscribe: undefined as ((params: any) => void) | undefined,
  subscribeCalls: [] as Array<{ relays: string[]; filters: NostrFilter[]; params: any }>,
  closeImpl: undefined as ((reason?: string) => void | Promise<void>) | undefined,
};

vi.mock('nostr-tools', async () => {
  const actual = await vi.importActual<typeof import('nostr-tools')>('nostr-tools');
  class MockSimplePool {
    subscribeMany(relays: string[], filters: NostrFilter[], params: any) {
      poolState.subscribeCalls.push({ relays, filters, params });
      poolState.onSubscribe?.(params);
      return {
        close: vi.fn((reason?: string) => poolState.closeImpl?.(reason)),
      };
    }
    destroy() {
      /* noop */
    }
  }
  return { ...actual, SimplePool: MockSimplePool };
});

describe('multiRelaySearch', () => {
  const sampleEvent: NostrEvent = {
    id: 'abc123',
    kind: 1,
    pubkey: 'pubkey1',
    created_at: 100,
    content: 'hello',
    tags: [],
    sig: 'sig',
  };

beforeEach(() => {
  poolState.onSubscribe = undefined;
  poolState.subscribeCalls.length = 0;
  poolState.closeImpl = undefined;
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

  it('deduplicates events from multiple relays', async () => {
    poolState.onSubscribe = params => {
      params.onevent?.(sampleEvent, 'wss://relay.one');
      params.onevent?.({ ...sampleEvent }, 'wss://relay.two');
      params.oneose?.();
    };

    const result = await multiRelaySearch({
      filters: [{ kinds: [1], limit: 5 }],
      relays: ['wss://relay.one', 'wss://relay.two'],
    });

    expect(result.events).toHaveLength(1);
    expect(poolState.subscribeCalls).toHaveLength(1);
    expect(poolState.subscribeCalls[0].relays).toEqual([
      'wss://relay.one',
      'wss://relay.two',
    ]);
  });

  it('resolves when the timeout triggers', async () => {
    vi.useFakeTimers();
    poolState.onSubscribe = () => {
      // no events, no EOSE -> rely on timeout
    };

    const promise = multiRelaySearch({
      filters: [{ kinds: [1], limit: 5 }],
      relays: ['wss://relay.one'],
      timeoutMs: 1500,
    });

    vi.advanceTimersByTime(1500);
    const result = await promise;
    expect(result.timedOut).toBe(true);
    vi.useRealTimers();
  });

  it('merges pointer relays with base relays', async () => {
    poolState.onSubscribe = params => {
      params.oneose?.();
    };
    const pointer = { relays: ['wss://relay.three'] };

    await multiRelaySearch({
      filters: [{ kinds: [0], limit: 1 }],
      relays: ['wss://relay.one'],
      pointer,
    });

    expect(poolState.subscribeCalls[0].relays).toContain('wss://relay.three');
  });

  it('ignores closing errors when the pool subscription is already closing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    poolState.closeImpl = () => {
      throw new Error('WebSocket is not open: readyState 2 (CLOSING)');
    };
    poolState.onSubscribe = params => {
      params.oneose?.();
    };

    try {
      await multiRelaySearch({
        filters: [{ kinds: [1], limit: 1 }],
        relays: ['wss://relay.one'],
      });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not warn when manual sockets are already closing during finalize', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sockets: MockWebSocket[] = [];

    class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      readyState = MockWebSocket.OPEN;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((evt: { data: string }) => void) | null = null;
      send = vi.fn();
      close = vi.fn(() => {
        if (this.readyState >= MockWebSocket.CLOSING) {
          throw new Error('WebSocket is not open: readyState 2 (CLOSING)');
        }
        this.readyState = MockWebSocket.CLOSING;
      });

      constructor(public url: string) {
        sockets.push(this);
      }
    }

    try {
      const promise = multiRelaySearch({
        filters: [{ kinds: [1], limit: 1 }],
        relays: ['wss://relay.manual'],
        timeoutMs: 1000,
        forceMode: 'manual',
        websocketFactory: () => MockWebSocket as unknown as typeof WebSocket,
      });

      const [socket] = sockets;
      expect(socket).toBeDefined();
      socket.readyState = MockWebSocket.CLOSING;
      socket.onclose?.();

      await promise;

      expect(socket.close).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('mergeRelayHints', () => {
  it('normalizes and merges multiple relay sources', () => {
    const result = mergeRelayHints(
      ['wss://relay.one/'],
      { data: { relays: ['wss://relay.two'] } },
      ['relay.three'],
    );
    expect(result).toEqual([
      'wss://relay.one',
      'wss://relay.two',
      'wss://relay.three',
    ]);
  });
});
