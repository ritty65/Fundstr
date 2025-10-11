import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishNostrEvent } from '../nostrHelpers';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

const ndkRef = vi.hoisted(() => ({ current: { signer: null as any } }));

vi.mock('src/nutzap/ndkInstance', () => ({
  getNutzapNdk: () => ndkRef.current,
}));

vi.mock('@nostr-dev-kit/ndk', () => {
  class MockNDKEvent {
    private ndk: { signer: { signEvent?: (event: any) => Promise<any> } | null };
    private template: any;
    private signed: any = null;

    constructor(ndk: { signer: { signEvent?: (event: any) => Promise<any> } | null }, template: any) {
      this.ndk = ndk;
      this.template = template;
    }

    async sign() {
      if (!this.ndk.signer?.signEvent) {
        throw new Error('Missing signer');
      }
      this.signed = await this.ndk.signer.signEvent({ ...this.template });
    }

    async toNostrEvent() {
      if (!this.signed) {
        throw new Error('Event not signed');
      }
      return this.signed;
    }
  }

  return { NDKEvent: MockNDKEvent };
});

describe('publishNostrEvent shared signer integration', () => {
  const globalAny = globalThis as Mutable<typeof globalThis> & { window?: any };
  let originalWindow: typeof globalAny.window;

  beforeEach(() => {
    originalWindow = globalAny.window;
    globalAny.window = {};
    ndkRef.current = { signer: null };
  });

  afterEach(() => {
    globalAny.window = originalWindow;
  });

  it('uses the shared NDK signer when window.nostr is unavailable', async () => {
    const signedEvent = {
      id: 'a'.repeat(64),
      pubkey: 'b'.repeat(64),
      created_at: 1700000000,
      kind: 1,
      tags: [],
      content: 'hello',
      sig: 'c'.repeat(128),
    };

    const signEvent = vi.fn().mockResolvedValue(signedEvent);
    ndkRef.current = { signer: { signEvent } };

    const ack = { id: 'ack1', accepted: true, via: 'websocket' as const };
    const send = vi.fn().mockResolvedValue(ack);

    const result = await publishNostrEvent({ kind: 1, tags: [], content: 'hello world' }, { send });

    expect(signEvent).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledWith(signedEvent);
    expect(result).toEqual({ ack, event: signedEvent });
  });
});
