import { NDKNip07Signer } from '@nostr-dev-kit/ndk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('attachNip07SignerIfAvailable', () => {
  beforeEach(() => {
    vi.resetModules();
    (window as any).nostr = undefined;
  });

  const createNip07Mock = (options: { includeNip04?: boolean } = {}) => {
    const nostr = {
      enable: vi.fn().mockResolvedValue(undefined),
      getPublicKey: vi.fn().mockResolvedValue('f'.repeat(64)),
      signEvent: vi.fn().mockResolvedValue({}),
      nip04: {
        encrypt: vi.fn().mockResolvedValue(''),
        decrypt: vi.fn().mockResolvedValue(''),
      },
    } as const;

    if (options.includeNip04 === false) {
      return { ...nostr, nip04: undefined } as any;
    }

    return nostr as any;
  };

  it('returns false when no nip07 provider exists', async () => {
    const module = await import('src/nostr/ndk');

    expect(module.attachNip07SignerIfAvailable()).toBe(false);
    expect(module.ndkWrite.signer).toBeUndefined();
  });

  it('returns false and detaches when required methods are missing', async () => {
    const module = await import('src/nostr/ndk');
    (window as any).nostr = createNip07Mock();
    module.ndkWrite.signer = new NDKNip07Signer();
    (window as any).nostr = createNip07Mock({ includeNip04: false });

    expect(module.attachNip07SignerIfAvailable()).toBe(false);
    expect(module.ndkWrite.signer).toBeUndefined();
  });

  it('attaches when all required nip07 apis exist', async () => {
    (window as any).nostr = createNip07Mock();

    const module = await import('src/nostr/ndk');

    expect(module.attachNip07SignerIfAvailable()).toBe(true);
    expect(module.ndkWrite.signer).toBeInstanceOf(NDKNip07Signer);
  });
});
