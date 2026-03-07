import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { publishNostrEvent } from '../../src/nutzap/relayPublishing';
import { selectPublishRelays } from '../../src/nostr/publish';

const { getNutzapNdkMock, ndkEventSignSpy, ndkEventToEventSpy } = vi.hoisted(() => ({
  getNutzapNdkMock: vi.fn(() => ({ ndk: true })),
  ndkEventSignSpy: vi.fn(),
  ndkEventToEventSpy: vi.fn(),
}));

vi.mock('../../src/nutzap/ndkInstance', () => ({
  getNutzapNdk: getNutzapNdkMock,
}));

vi.mock('@nostr-dev-kit/ndk', () => ({
  NDKEvent: class {
    payload: any;
    constructor(public ndk: unknown, payload: any) {
      this.payload = payload;
    }
    async sign() {
      ndkEventSignSpy(this.payload);
    }
    async toNostrEvent() {
      ndkEventToEventSpy(this.payload);
      return {
        id: 'd'.repeat(64),
        pubkey: 'e'.repeat(64),
        created_at: this.payload.created_at,
        kind: this.payload.kind,
        tags: this.payload.tags,
        content: this.payload.content,
        sig: 'f'.repeat(128),
      };
    }
  },
}));

let originalWindow: any;

beforeEach(() => {
  originalWindow = (globalThis as any).window;
});

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as any).window;
  } else {
    (globalThis as any).window = originalWindow;
  }
  getNutzapNdkMock.mockClear();
  ndkEventSignSpy.mockClear();
  ndkEventToEventSpy.mockClear();
});

describe('publishNostrEvent signing paths', () => {
  it('uses window.nostr when available and rejects malformed signatures', async () => {
    const signEventMock = vi.fn(async (unsigned: any) => ({
      ...unsigned,
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      sig: 'c'.repeat(128),
    }));
    const sendMock = vi.fn(async (event: any) => ({
      id: event.id,
      accepted: true,
      via: 'ws' as const,
    }));

    (globalThis as any).window = {
      ...(originalWindow ?? {}),
      nostr: { signEvent: signEventMock },
    };

    const template = {
      kind: 10019,
      tags: [
        ['t', ' nutzap-profile '],
        ['relay', 'wss://relay.example', 'extra'],
        [],
        null as any,
      ],
      content: '  hello  ',
    };

    const result = await publishNostrEvent(template, { send: sendMock });

    expect(signEventMock).toHaveBeenCalledTimes(1);
    const unsigned = signEventMock.mock.calls[0][0];
    expect(unsigned.tags).toEqual([
      ['t', 'nutzap-profile'],
      ['relay', 'wss://relay.example', 'extra'],
    ]);
    expect(unsigned.content).toBe('hello');
    expect(unsigned.kind).toBe(10019);
    expect(sendMock).toHaveBeenCalledWith({
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      created_at: expect.any(Number),
      kind: 10019,
      tags: unsigned.tags,
      content: 'hello',
      sig: 'c'.repeat(128),
    });
    expect(result.ack.accepted).toBe(true);
    expect(ndkEventSignSpy).not.toHaveBeenCalled();
  });

  it('falls back to the internal NDK signer when window.nostr is absent', async () => {
    if (originalWindow !== undefined) {
      (globalThis as any).window = { ...originalWindow };
      delete (globalThis as any).window.nostr;
    } else {
      delete (globalThis as any).window;
    }

    const sendMock = vi.fn(async (event: any) => ({
      id: event.id,
      accepted: true,
      via: 'ws' as const,
    }));

    const template = {
      kind: 30019,
      tags: [['d', 'tiers']],
      content: JSON.stringify({ foo: 'bar' }),
    };

    const result = await publishNostrEvent(template, { send: sendMock });

    expect(getNutzapNdkMock).toHaveBeenCalledTimes(1);
    expect(ndkEventSignSpy).toHaveBeenCalledTimes(1);
    const unsigned = ndkEventSignSpy.mock.calls[0][0];
    expect(unsigned.kind).toBe(30019);
    expect(unsigned.tags).toEqual([['d', 'tiers']]);
    expect(sendMock).toHaveBeenCalledWith({
      id: 'd'.repeat(64),
      pubkey: 'e'.repeat(64),
      created_at: unsigned.created_at,
      kind: 30019,
      tags: [['d', 'tiers']],
      content: JSON.stringify({ foo: 'bar' }),
      sig: 'f'.repeat(128),
    });
    expect(result.ack.accepted).toBe(true);
  });

  it('throws when the signer returns an invalid event shape', async () => {
    const sendMock = vi.fn();

    (globalThis as any).window = {
      ...(originalWindow ?? {}),
      nostr: {
        signEvent: async (unsigned: any) => ({ ...unsigned, id: 'broken', sig: 'zzz' }),
      },
    };

    await expect(
      publishNostrEvent({ kind: 1, tags: [], content: '' }, { send: sendMock }),
    ).rejects.toThrow('Signed event is invalid');
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('selectPublishRelays', () => {
  it('deduplicates preferred relays and fills in vetted fallbacks', () => {
    const result = selectPublishRelays(
      ['wss://a.example', 'wss://b.example', 'wss://a.example'],
      ['wss://fallback.example', 'wss://b.example'],
      3,
    );

    expect(result).toEqual({
      targets: ['wss://a.example', 'wss://b.example', 'wss://fallback.example'],
      usedFallback: ['wss://fallback.example'],
    });
  });
});
