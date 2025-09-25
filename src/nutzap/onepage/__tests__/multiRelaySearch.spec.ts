import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter as NostrFilter } from 'nostr-tools';
import { multiRelaySearch, mergeRelayHints } from '../multiRelaySearch';

const poolState = {
  onSubscribe: undefined as ((params: any) => void) | undefined,
  subscribeCalls: [] as Array<{ relays: string[]; filters: NostrFilter[]; params: any }>,
};

vi.mock('nostr-tools', async () => {
  const actual = await vi.importActual<typeof import('nostr-tools')>('nostr-tools');
  class MockSimplePool {
    subscribeMany(relays: string[], filters: NostrFilter[], params: any) {
      poolState.subscribeCalls.push({ relays, filters, params });
      poolState.onSubscribe?.(params);
      return {
        close: vi.fn(),
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
