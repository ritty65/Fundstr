import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useP2pkDiagnostics } from 'src/composables/useP2pkDiagnostics';

type MintInfo = { [key: string]: unknown } | undefined;

const hoisted = vi.hoisted(() => {
  const ensureCompressedMock = vi.fn<(input: string) => string>();
  const walletGetKeysMock = vi.fn();
  const walletGetInfoMock = vi.fn();

  const walletStoreMock = {
    wallet: {
      getKeys: walletGetKeysMock,
      mint: {
        getInfo: walletGetInfoMock,
      },
    },
  };

  const mintsStoreMock: { activeMintUrl: string; activeInfo: MintInfo } = {
    activeMintUrl: '',
    activeInfo: undefined,
  };

  return {
    ensureCompressedMock,
    walletGetKeysMock,
    walletGetInfoMock,
    walletStoreMock,
    mintsStoreMock,
  };
});

vi.mock('src/utils/ecash', () => ({
  ensureCompressed: hoisted.ensureCompressedMock,
}));

vi.mock('src/stores/wallet', () => ({
  useWalletStore: () => hoisted.walletStoreMock,
}));

vi.mock('src/stores/mints', () => ({
  useMintsStore: () => hoisted.mintsStoreMock,
}));

const { ensureCompressedMock, walletGetKeysMock, walletGetInfoMock, mintsStoreMock } = hoisted;

describe('useP2pkDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mintsStoreMock.activeMintUrl = 'https://mint.example';
    mintsStoreMock.activeInfo = { nut_supports: [11] };

    ensureCompressedMock.mockImplementation((key: string) => `normalized:${key}`);
    walletGetKeysMock.mockResolvedValue(undefined);
    walletGetInfoMock.mockResolvedValue({ nut_supports: [11] });
  });

  it('rejects blank keys', async () => {
    const { verifyPointer } = useP2pkDiagnostics();

    await expect(verifyPointer('   ')).rejects.toThrow(
      'Enter a P2PK public key to verify.'
    );

    expect(ensureCompressedMock).not.toHaveBeenCalled();
    expect(walletGetKeysMock).not.toHaveBeenCalled();
  });

  it('rejects invalid keys', async () => {
    ensureCompressedMock.mockImplementationOnce(() => {
      throw new Error('invalid');
    });

    const { verifyPointer } = useP2pkDiagnostics();

    await expect(verifyPointer('invalid-key')).rejects.toThrow(
      'Enter a valid Cashu P2PK public key.'
    );

    expect(ensureCompressedMock).toHaveBeenCalledWith('invalid-key');
    expect(walletGetKeysMock).not.toHaveBeenCalled();
  });

  it('rejects when no active mint is selected', async () => {
    mintsStoreMock.activeMintUrl = '  ';

    const { verifyPointer } = useP2pkDiagnostics();

    await expect(verifyPointer('pubkey')).rejects.toThrow(
      'Select an active mint in your wallet before verifying.'
    );

    expect(walletGetKeysMock).not.toHaveBeenCalled();
  });

  it('rejects when active mint does not advertise NUT-11 support', async () => {
    mintsStoreMock.activeInfo = { nut_supports: [1, 2] };

    const { verifyPointer } = useP2pkDiagnostics();

    await expect(verifyPointer('pubkey')).rejects.toThrow(
      'Active mint does not advertise NUT-11 (P2PK) support.'
    );

    expect(walletGetKeysMock).not.toHaveBeenCalled();
    expect(walletGetInfoMock).not.toHaveBeenCalled();
  });

  it('returns metadata when validation passes', async () => {
    const timestamp = 1_700_000_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(timestamp);
    mintsStoreMock.activeInfo = { nuts: { 11: { available: true } } };

    const { verifyPointer } = useP2pkDiagnostics();
    const result = await verifyPointer('  normalized-key  ');

    expect(ensureCompressedMock).toHaveBeenCalledWith('normalized-key');
    expect(walletGetKeysMock).toHaveBeenCalledWith(undefined, true);
    expect(walletGetInfoMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      mintUrl: 'https://mint.example',
      timestamp,
      normalizedPubkey: 'normalized:normalized-key',
    });

    nowSpy.mockRestore();
  });
});
