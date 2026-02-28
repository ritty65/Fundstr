import { describe, expect, it, vi, beforeEach } from 'vitest';
import { computed, ref } from 'vue';

const captured = {
  initOptions: [] as any[],
};

let storeSigner: any = null;

const initSignerIfNotSetMock = vi.fn(async (options?: any) => {
  captured.initOptions.push(options);
  nostrStoreMock.signer = { signer: true };
});

const nostrStoreMock = {
  npub: '',
  get signer() {
    return storeSigner;
  },
  set signer(value: any) {
    storeSigner = value;
  },
  initSignerIfNotSet: initSignerIfNotSetMock,
};

vi.mock('src/stores/nostr', () => ({
  useNostrStore: () => nostrStoreMock,
}));

vi.mock('src/nutzap/signer', () => ({
  useActiveNutzapSigner: () => ({
    pubkey: computed(() => ''),
    signer: computed(() => storeSigner),
  }),
}));

const ndkInstance = { signer: undefined as any };

vi.mock('src/nutzap/ndkInstance', () => ({
  getNutzapNdk: () => ndkInstance,
}));

beforeEach(() => {
  captured.initOptions = [];
  storeSigner = null;
  ndkInstance.signer = undefined;
  initSignerIfNotSetMock.mockClear();
});

describe('useNutzapSignerWorkspace', () => {
  it('skips relay fan-out when fundstrOnlySigner is true', async () => {
    const { useNutzapSignerWorkspace } = await import('src/nutzap/useNutzapSignerWorkspace');

    const authorInput = ref('');
    const workspace = useNutzapSignerWorkspace(authorInput, {
      fundstrOnlySigner: true,
    });

    await workspace.ensureSharedSignerInitialized();

    expect(captured.initOptions).toEqual([
      { skipRelayConnect: true },
    ]);
    expect(ndkInstance.signer).toEqual({ signer: true });
  });
});
