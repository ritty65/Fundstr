import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { verifyReadBack } from '../../src/nostr/readBack';
import {
  __testing as fallbackTesting,
  getFreeRelayFallbackStatus,
  hasFallbackAttempt,
  isFallbackUnreachable,
  markFallbackUnreachable,
  onFreeRelayFallbackStatusChange,
  recordFallbackAttempt,
  resetFallbackState,
} from '../../src/nostr/freeRelayFallback';

describe('verifyReadBack', () => {
  function createHarness() {
    const sub = {
      on: vi.fn(),
      stop: vi.fn(),
    };
    const relay = { connect: vi.fn(() => Promise.resolve()) };
    const ndk = {
      pool: {
        getRelay: vi.fn(() => relay),
      },
      subscribe: vi.fn(() => sub),
    };
    return { sub, relay, ndk };
  }

  function getHandlers(sub: { on: ReturnType<typeof vi.fn> }, type: string) {
    return sub.on.mock.calls
      .filter(([event]) => event === type)
      .map(([, cb]) => cb as () => void);
  }

  it('resolves true when an event is received before timeout', async () => {
    const { sub, relay, ndk } = createHarness();

    const promise = verifyReadBack({
      ndk: ndk as any,
      relayUrl: 'wss://relay.example',
      authorHex: 'a'.repeat(64),
      kind: 30019,
      dTag: 'tiers',
      timeoutMs: 500,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(ndk.pool.getRelay).toHaveBeenCalledWith('wss://relay.example', true);
    const eventHandlers = getHandlers(sub, 'event');
    expect(eventHandlers.length).toBeGreaterThan(0);
    eventHandlers.forEach((handler) => handler());

    await expect(promise).resolves.toBe(true);
    expect(sub.stop).toHaveBeenCalled();
    expect(ndk.subscribe).toHaveBeenCalledWith(
      { kinds: [30019], authors: ['a'.repeat(64)], limit: 1, '#d': ['tiers'] },
      { closeOnEose: true, relays: [relay] },
    );
  });

  it('resolves false on EOSE and clears timers', async () => {
    const { sub, ndk } = createHarness();

    const promise = verifyReadBack({
      ndk: ndk as any,
      relayUrl: 'wss://relay.example',
      authorHex: 'b'.repeat(64),
      kind: 30000,
    });

    await Promise.resolve();
    await Promise.resolve();

    const eoseHandlers = getHandlers(sub, 'eose');
    expect(eoseHandlers.length).toBeGreaterThan(0);
    eoseHandlers.forEach((handler) => handler());

    await expect(promise).resolves.toBe(false);
    expect(sub.stop).toHaveBeenCalled();
  });

  it('times out when no events are received', async () => {
    vi.useFakeTimers();
    const { sub, ndk } = createHarness();

    const promise = verifyReadBack({
      ndk: ndk as any,
      relayUrl: 'wss://timeout.example',
      authorHex: 'c'.repeat(64),
      kind: 1,
      timeoutMs: 250,
    });

    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(300);
    await expect(promise).resolves.toBe(false);
    expect(sub.stop).toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe('free relay fallback telemetry', () => {
  const ndk: any = {};

  beforeEach(() => {
    fallbackTesting.clearTelemetry();
    resetFallbackState(ndk);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('tracks attempts, unreachable status, and listener notifications', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const updates: any[] = [];
    const off = onFreeRelayFallbackStatusChange((status) => {
      updates.push(status);
    });
    updates.length = 0; // ignore initial snapshot

    const timestamp = recordFallbackAttempt(ndk);
    expect(timestamp).toBe(Date.now());
    expect(hasFallbackAttempt(ndk)).toBe(true);
    expect(getFreeRelayFallbackStatus()).toEqual({
      lastAttemptAt: timestamp,
      unreachable: false,
    });

    expect(updates.at(-1)).toEqual({
      lastAttemptAt: timestamp,
      unreachable: false,
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    markFallbackUnreachable(ndk, 'bootstrap', new Error('boom'));
    markFallbackUnreachable(ndk, 'bootstrap');

    expect(isFallbackUnreachable(ndk)).toBe(true);
    expect(getFreeRelayFallbackStatus()).toEqual({
      lastAttemptAt: timestamp,
      unreachable: true,
    });
    expect(updates.at(-1)).toEqual({
      lastAttemptAt: timestamp,
      unreachable: true,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);

    resetFallbackState(ndk);
    expect(hasFallbackAttempt(ndk)).toBe(false);
    expect(isFallbackUnreachable(ndk)).toBe(false);
    expect(getFreeRelayFallbackStatus()).toEqual({
      lastAttemptAt: null,
      unreachable: false,
    });
    expect(updates.at(-1)).toEqual({
      lastAttemptAt: null,
      unreachable: false,
    });

    off();
  });
});
