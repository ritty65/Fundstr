import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue');
  return {
    ...actual,
    onMounted: (fn: () => void) => fn(),
  };
});

const actualVue = await vi.importActual<typeof import('vue')>('vue');
const { ref } = actualVue;

const publishTierDefinitionsMock = vi.fn(async (_tiers: any, opts?: { kind?: number }) => ({
  ok: true,
  accepted: true,
  via: 'http' as const,
  opts,
}));

const publishNutzapProfileMock = vi.fn(async () => ({
  ok: true,
  accepted: true,
  via: 'http' as const,
}));

vi.mock('@/nutzap/publish', () => ({
  publishTierDefinitions: publishTierDefinitionsMock,
  publishNutzapProfile: publishNutzapProfileMock,
}));

vi.mock('@/js/notify', () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

const queryNutzapProfileMock = vi.fn(async () => null);
const queryNutzapTiersMock = vi.fn(async () => null);

vi.mock('@/nostr/relayClient', () => ({
  queryNutzapProfile: queryNutzapProfileMock,
  queryNutzapTiers: queryNutzapTiersMock,
}));

const getNutzapNdkMock = vi.fn(() => ({}));

vi.mock('@/nutzap/ndkInstance', () => ({
  getNutzapNdk: getNutzapNdkMock,
}));

const signerRef = ref({});
const pubkeyRef = ref('f'.repeat(64));

vi.mock('@/nutzap/signer', () => ({
  useActiveNutzapSigner: () => ({
    pubkey: pubkeyRef,
    signer: signerRef,
  }),
}));

const { useNutzapProfile } = await import('@/nutzap/useNutzapProfile');
const { NUTZAP_TIERS_KIND } = await import('@/nutzap/relayConfig');

const PUBKEY = 'f'.repeat(64);
const P2PK = 'a'.repeat(64);

describe('useNutzapProfile tier address', () => {
  beforeEach(() => {
    publishTierDefinitionsMock.mockClear();
    publishNutzapProfileMock.mockClear();
    queryNutzapProfileMock.mockClear();
    queryNutzapTiersMock.mockClear();
    getNutzapNdkMock.mockClear();
    signerRef.value = {};
    pubkeyRef.value = PUBKEY;
  });

  function setupProfile() {
    const profile = useNutzapProfile();
    profile.p2pkPub.value = P2PK;
    profile.mintsText.value = 'https://mint.example';
    profile.tiers.value = [
      {
        id: 'tier-1',
        title: 'Supporter',
        price: 1000,
        frequency: 'monthly',
      },
    ];
    return profile;
  }

  it('publishes tier address using configured kind', async () => {
    const profile = setupProfile();

    await profile.publishAll();

    expect(publishTierDefinitionsMock).toHaveBeenCalledTimes(1);
    expect(publishTierDefinitionsMock.mock.calls[0][1]).toEqual({ kind: NUTZAP_TIERS_KIND });
    expect(publishNutzapProfileMock).toHaveBeenCalledTimes(1);
    expect(publishNutzapProfileMock.mock.calls[0][0]).toMatchObject({
      tierAddr: `${NUTZAP_TIERS_KIND}:${PUBKEY}:tiers`,
    });
  });

  it('allows switching to legacy kind', async () => {
    const profile = setupProfile();
    profile.tierKind.value = 30000;

    await profile.publishAll();

    expect(publishTierDefinitionsMock.mock.calls[0][1]).toEqual({ kind: 30000 });
    expect(publishNutzapProfileMock.mock.calls[0][0]).toMatchObject({
      tierAddr: `30000:${PUBKEY}:tiers`,
    });
  });
});

