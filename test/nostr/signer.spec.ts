import { beforeEach, describe, expect, it, vi } from 'vitest';

const storeState: any = {
  initSignerIfNotSet: vi.fn(),
  signer: undefined,
  signerType: undefined,
};

vi.mock('../../src/stores/nostr', async () => {
  const actual = await vi.importActual<typeof import('../../src/stores/nostr')>(
    '../../src/stores/nostr',
  );
  return {
    ...actual,
    useNostrStore: () => storeState,
  };
});

import { getNormalizedSigner } from '../../src/nostr/signer';
import { SignerType } from '../../src/stores/nostr';

describe('getNormalizedSigner', () => {
  beforeEach(() => {
    storeState.initSignerIfNotSet = vi.fn();
    storeState.signer = undefined;
    storeState.signerType = undefined;
  });

  it('returns null when no signer is available', async () => {
    const result = await getNormalizedSigner();

    expect(storeState.initSignerIfNotSet).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('maps NIP-07 signers to the nip07 kind and lowercases pubkeys', async () => {
    const userMock = vi.fn(async () => ({ pubkey: 'ABC123' }));
    storeState.signer = { user: userMock };
    storeState.signerType = SignerType.NIP07;

    const result = await getNormalizedSigner();

    expect(userMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      kind: 'nip07',
      ndkSigner: storeState.signer,
      pubkeyHex: 'abc123',
    });
  });

  it('falls back to local kind when signer type is unknown', async () => {
    const userMock = vi.fn(async () => ({ pubkey: 'f'.repeat(64) }));
    storeState.initSignerIfNotSet = vi.fn(async () => {
      throw new Error('not configured');
    });
    storeState.signer = { user: userMock };
    storeState.signerType = 'UNEXPECTED';

    const result = await getNormalizedSigner();

    expect(storeState.initSignerIfNotSet).toHaveBeenCalledTimes(1);
    expect(result?.kind).toBe('local');
    expect(result?.pubkeyHex).toBe('f'.repeat(64));
  });

  it('returns null when signer user lookup fails', async () => {
    storeState.signer = { user: async () => undefined };
    storeState.signerType = SignerType.NIP46;

    await expect(getNormalizedSigner()).resolves.toBeNull();
  });
});
