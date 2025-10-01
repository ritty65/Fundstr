import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, shallowMount } from '@vue/test-utils';
import { computed, defineComponent, reactive, ref } from 'vue';
import { bytesToHex } from '@noble/hashes/utils';
import { getPublicKey } from '@noble/secp256k1';

import CreatorStudioPage from '../../../src/pages/CreatorStudioPage.vue';

const VALID_HEX = 'a'.repeat(64);

const routerResolveMock = vi.fn((location?: any) => ({
  href: `/creator/${location?.params?.npubOrHex ?? 'missing'}`,
}));
const routerPushMock = vi.fn();

const notifySuccessMock = vi.fn();
const notifyErrorMock = vi.fn();
const notifyWarningMock = vi.fn();

const copyMock = vi.fn();

const creatorStudioStubs = {
  'q-page': { template: '<div><slot /></div>' },
  'q-avatar': { template: '<div><slot /></div>' },
  'q-icon': { template: '<div><slot /></div>' },
  'q-chip': { template: '<div><slot /></div>' },
  'q-btn': { template: '<button><slot /></button>' },
  'q-toggle': { template: '<input />' },
  'q-input': { template: '<input />' },
  'q-card': { template: '<div><slot /></div>' },
  'q-tabs': { template: '<div><slot /></div>' },
  'q-tab': { template: '<div><slot /></div>' },
  'q-tab-panels': { template: '<div><slot /></div>' },
  'q-tab-panel': { template: '<div><slot /></div>' },
  'q-dialog': { template: '<div><slot /></div>' },
  'q-banner': { template: '<div><slot /></div>' },
  'q-separator': { template: '<hr />' },
  'q-form': { template: '<form><slot /></form>' },
  'q-space': { template: '<span />' },
  'q-spinner': { template: '<div />' },
  'q-item': { template: '<div><slot /></div>' },
  'q-item-section': { template: '<div><slot /></div>' },
  'q-item-label': { template: '<div><slot /></div>' },
  'q-tooltip': { template: '<div><slot /></div>' },
  'q-btn-toggle': { template: '<div><slot /></div>' },
  'q-expansion-item': { template: '<div><slot /></div>' },
  TierComposer: { template: '<div />' },
  NutzapExplorerPanel: { template: '<div />' },
};

function createEventBus<T>() {
  const listeners = new Set<(event: T) => void>();
  return {
    emit(event: T) {
      for (const listener of listeners) {
        listener(event);
      }
    },
    on(handler: (event: T) => void) {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
  };
}

type SharedMocks = {
  relayConnectionUrl: ReturnType<typeof ref<string>>;
  relayConnectionStatus: ReturnType<typeof ref<'connected'>>;
  relayAutoReconnect: ReturnType<typeof ref<boolean>>;
  relayActivity: ReturnType<typeof ref<any[]>>;
  relayReconnectAttempts: ReturnType<typeof ref<number>>;
  relayIsConnected: ReturnType<typeof ref<boolean>>;
  relayNeedsAttention: ReturnType<typeof ref<boolean>>;
  relayUrlInput: ReturnType<typeof ref<string>>;
  relayUrlInputValid: ReturnType<typeof ref<boolean>>;
  relayUrlInputState: ReturnType<typeof ref<'warning' | 'error' | null>>;
  relayUrlInputMessage: ReturnType<typeof ref<string>>;
  relayStatusLabel: ReturnType<typeof ref<string>>;
  relayStatusColor: ReturnType<typeof ref<string>>;
  relayStatusDotClass: ReturnType<typeof ref<string>>;
  latestRelayActivity: ReturnType<typeof ref<any>>;
  latestRelayAlertLabel: ReturnType<typeof ref<string>>;
  relayActivityTimeline: ReturnType<typeof ref<any[]>>;
  publishEventToRelayMock: ReturnType<typeof vi.fn>;
  connectRelayMock: ReturnType<typeof vi.fn>;
  disconnectRelayMock: ReturnType<typeof vi.fn>;
  clearRelayActivityMock: ReturnType<typeof vi.fn>;
  logRelayActivityMock: ReturnType<typeof vi.fn>;
  publishTiersToRelayMock: ReturnType<typeof vi.fn>;
  publishNostrEventMock: ReturnType<typeof vi.fn>;
  ensureRelayClientMock: ReturnType<typeof vi.fn>;
  clientPublishMock: ReturnType<typeof vi.fn>;
  clientRequestOnceMock: ReturnType<typeof vi.fn>;
  relayClientInstance: any;
  signerRef: ReturnType<typeof ref<any>>;
  p2pkStoreMock: any;
  walletStoreMock: {
    setActiveP2pk: ReturnType<typeof vi.fn>;
  };
};

let shared: SharedMocks | null = null;

function ensureShared(): SharedMocks {
  if (!shared) {
    const relayConnectionStatus = ref<'connected'>('connected');
    const relayNeedsAttention = ref(false);
    const publishEventToRelayMock = vi.fn();
    const publishTiersToRelayMock = vi.fn();
    const publishNostrEventMock = vi.fn();
    const clientPublishMock = vi.fn();
    const clientRequestOnceMock = vi.fn(async () => [] as any[]);

    const relayClientInstance = {
      isSupported: true,
      publish: clientPublishMock,
      requestOnce: clientRequestOnceMock,
      subscribe: vi.fn(() => 'mock-sub'),
      unsubscribe: vi.fn(),
      onStatusChange: vi.fn(() => () => {}),
    };

    const p2pkStoreMock = reactive({
      firstKey: null as any,
      p2pkKeys: [] as any[],
      isValidPubkey: vi.fn(() => true),
      haveThisKey: vi.fn(() => false),
      getPrivateKeyForP2PKEncodedToken: vi.fn(() => ''),
    });

    const walletStoreMock = {
      setActiveP2pk: vi.fn(),
    };

    shared = {
      relayConnectionUrl: ref('wss://relay.fundstr.me'),
      relayConnectionStatus,
      relayAutoReconnect: ref(false),
      relayActivity: ref([]),
      relayReconnectAttempts: ref(0),
      relayIsConnected: ref(true),
      relayNeedsAttention,
      relayUrlInput: ref('wss://relay.fundstr.me'),
      relayUrlInputValid: ref(true),
      relayUrlInputState: ref(null),
      relayUrlInputMessage: ref(''),
      relayStatusLabel: ref('Connected'),
      relayStatusColor: ref('positive'),
      relayStatusDotClass: ref('status-dot--positive'),
      latestRelayActivity: ref({ message: '', time: Date.now() }),
      latestRelayAlertLabel: ref(''),
      relayActivityTimeline: ref([]),
      publishEventToRelayMock,
      connectRelayMock: vi.fn(),
      disconnectRelayMock: vi.fn(),
      clearRelayActivityMock: vi.fn(),
      logRelayActivityMock: vi.fn(),
      publishTiersToRelayMock,
      publishNostrEventMock,
      ensureRelayClientMock: vi.fn(async () => relayClientInstance),
      clientPublishMock,
      clientRequestOnceMock,
      relayClientInstance,
      signerRef: ref({}),
      p2pkStoreMock,
      walletStoreMock,
    };
  }

  return shared;
}

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<any>('vue-router');
  return {
    ...actual,
    useRouter: () => ({
      resolve: routerResolveMock,
      push: routerPushMock,
    }),
    useRoute: () => ({
      query: { npub: VALID_HEX },
      params: {},
      name: undefined,
      fullPath: '',
      path: '',
      matched: [],
      meta: {},
    }),
  };
});

it('syncs wallet pointer with composer selection', async () => {
  const state = ensureShared();
  const priv = '1'.repeat(64);
  const pub = bytesToHex(getPublicKey(priv, true));
  state.signerRef.value = null;
  state.p2pkStoreMock.p2pkKeys = [
    { publicKey: pub, privateKey: priv, used: false, usedCount: 0 },
  ];
  state.p2pkStoreMock.firstKey = state.p2pkStoreMock.p2pkKeys[0];

  const TestHarness = defineComponent({
    name: 'CreatorStudioPageWalletHarness',
    setup(props, ctx) {
      const component = CreatorStudioPage as any;
      return component.setup ? component.setup(props, ctx) : {};
    },
    template: '<div />',
  });

  shallowMount(TestHarness as any, {
    global: {
      stubs: creatorStudioStubs,
    },
  });

  await flushPromises();

  expect(
    state.walletStoreMock.setActiveP2pk.mock.calls.some(
      ([calledPub, calledPriv]) => calledPub === pub && calledPriv === priv,
    ),
  ).toBe(true);
});

vi.mock('@vueuse/core', () => ({
  useEventBus: <T>() => createEventBus<T>(),
  useLocalStorage: <T>(_key: string, initial: T) => ref(initial),
}));

vi.mock('pinia', async () => {
  const actual = await vi.importActual<any>('pinia');
  return {
    ...actual,
    storeToRefs: (store: any) => {
      const refs: Record<string, { value: any }> = {};
      Object.keys(store).forEach(key => {
        refs[key] = {
          get value() {
            return store[key];
          },
          set value(v) {
            store[key] = v;
          },
          __v_isRef: true,
        };
      });
      return refs;
    },
  };
});

vi.mock('src/js/notify', () => ({
  notifySuccess: (...args: any[]) => notifySuccessMock(...args),
  notifyError: (...args: any[]) => notifyErrorMock(...args),
  notifyWarning: (...args: any[]) => notifyWarningMock(...args),
}));

vi.mock('quasar', async () => {
  const actual = await vi.importActual<any>('quasar');
  return {
    ...actual,
    useQuasar: () => ({
      screen: { lt: { md: false } },
    }),
  };
});

vi.mock('src/composables/useClipboard', () => ({
  useClipboard: () => ({ copy: (...args: any[]) => copyMock(...args) }),
}));

vi.mock('src/nutzap/useNutzapRelayTelemetry', () => ({
  useNutzapRelayTelemetry: () => {
    const state = ensureShared();
    return {
      relayConnectionUrl: state.relayConnectionUrl,
      relayConnectionStatus: state.relayConnectionStatus,
      relayAutoReconnect: state.relayAutoReconnect,
      relayActivity: state.relayActivity,
      connectRelay: state.connectRelayMock,
      disconnectRelay: state.disconnectRelayMock,
      publishEventToRelay: (...args: any[]) => state.publishEventToRelayMock(...args),
      clearRelayActivity: state.clearRelayActivityMock,
      relaySupported: true,
      relayIsConnected: state.relayIsConnected,
      relayUrlInput: state.relayUrlInput,
      relayUrlInputValid: state.relayUrlInputValid,
      relayUrlInputState: state.relayUrlInputState,
      relayUrlInputMessage: state.relayUrlInputMessage,
      relayStatusLabel: state.relayStatusLabel,
      relayStatusColor: state.relayStatusColor,
      relayStatusDotClass: state.relayStatusDotClass,
      latestRelayActivity: state.latestRelayActivity,
      latestRelayAlert: ref(null),
      latestRelayAlertLabel: state.latestRelayAlertLabel,
      relayNeedsAttention: state.relayNeedsAttention,
      relayActivityTimeline: state.relayActivityTimeline,
      formatActivityTime: (timestamp: number) => String(timestamp),
      activityLevelColor: () => 'primary',
      applyRelayUrlInput: vi.fn(),
      logRelayActivity: state.logRelayActivityMock,
    };
  },
}));

vi.mock('src/nutzap/useNutzapSignerWorkspace', () => ({
  useNutzapSignerWorkspace: () => {
    const state = ensureShared();
    return {
      pubkey: ref(''),
      signer: state.signerRef,
      keySecretHex: ref(''),
      keyNsec: ref(''),
      keyPublicHex: ref(''),
      keyNpub: ref(''),
      keyImportValue: ref(''),
      advancedKeyManagementOpen: ref(true),
      usingStoreIdentity: computed(() => false),
      connectedIdentitySummary: computed(() => ''),
      ensureSharedSignerInitialized: vi.fn(async () => {}),
    };
  },
}));

vi.mock('src/stores/p2pk', () => ({
  useP2PKStore: () => ensureShared().p2pkStoreMock,
}));

vi.mock('src/stores/wallet', () => ({
  useWalletStore: () => ensureShared().walletStoreMock,
}));

vi.mock('src/stores/mints', () => ({
  useMintsStore: () => ({
    activeMintUrl: ref(''),
    mints: ref([]),
  }),
}));

vi.mock('src/stores/creatorHub', () => ({
  maybeRepublishNutzapProfile: vi.fn(async () => {}),
}));

vi.mock('src/nutzap/ndkInstance', () => ({
  getNutzapNdk: () => ({ signer: undefined }),
}));

vi.mock('../../../src/pages/nutzap-profile/nostrHelpers', async () => {
  const actual = await vi.importActual<any>(
    '../../../src/pages/nutzap-profile/nostrHelpers',
  );
  return {
    ...actual,
    publishTiers: (...args: any[]) => ensureShared().publishTiersToRelayMock(...args),
    publishNostrEvent: (...args: any[]) => ensureShared().publishNostrEventMock(...args),
    ensureFundstrRelayClient: (...args: any[]) => ensureShared().ensureRelayClientMock(...args),
  };
});

beforeEach(() => {
  shared = null;
  routerResolveMock.mockClear();
  routerPushMock.mockClear();
  notifySuccessMock.mockReset();
  notifyErrorMock.mockReset();
  notifyWarningMock.mockReset();
  copyMock.mockReset();
});

describe('CreatorStudioPage publishAll fallback', () => {
  it('falls back to HTTP when relay publisher rejects', async () => {
    const state = ensureShared();
    state.signerRef.value = null;

    const tierEvent = {
      id: 'tier-event',
      pubkey: 'tier-pub',
      created_at: Date.now(),
      kind: 30019,
      tags: [],
      content: '{}',
      sig: 'tier-sig',
    };
    const profileEvent = {
      id: 'profile-event',
      pubkey: 'profile-pub',
      created_at: Date.now(),
      kind: 10019,
      tags: [],
      content: '{}',
      sig: 'profile-sig',
    };

    state.publishEventToRelayMock.mockRejectedValue(new Error('Relay socket unavailable'));

    state.publishTiersToRelayMock.mockImplementation(async (_tiers, _kind, options) => {
      if (options?.send) {
        const ack = await options.send(tierEvent);
        return { ack, event: tierEvent };
      }
      return {
        ack: { id: 'tier-http', accepted: true, via: 'http' as const, message: 'accepted' },
        event: tierEvent,
      };
    });

    state.publishNostrEventMock.mockImplementation(async (_template, options) => {
      if (options?.send) {
        const ack = await options.send(profileEvent);
        return { ack, event: profileEvent };
      }
      return {
        ack: { id: 'profile-http', accepted: true, via: 'http' as const, message: 'accepted' },
        event: profileEvent,
      };
    });

    state.clientPublishMock.mockResolvedValue({
      ack: { id: 'profile-http', accepted: true, via: 'http' as const, message: 'accepted' },
      event: profileEvent,
    });

    const TestHarness = defineComponent({
      name: 'CreatorStudioPageHarness',
      setup(props, ctx) {
        const component = CreatorStudioPage as any;
        return component.setup ? component.setup(props, ctx) : {};
      },
      template: '<div />',
    });

    const wrapper = shallowMount(TestHarness as any, {
      global: {
        stubs: creatorStudioStubs,
      },
    });

    state.signerRef.value = {};

    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).displayName = 'Creator';
    (wrapper.vm as any).p2pkPub = 'f'.repeat(64);
    (wrapper.vm as any).mintsText = 'https://mint.example';
    (wrapper.vm as any).tiers = [
      { id: 'tier-1', title: 'Tier 1', price: 1000, frequency: 'monthly', description: '' },
    ];

    await wrapper.vm.$nextTick();

    const vmAny = wrapper.vm as any;
    const publishAll =
      vmAny.publishAll ??
      vmAny.$?.setupState?.publishAll ??
      vmAny.$?.ctx?.publishAll ??
      vmAny.$?.exposed?.publishAll;
    expect(typeof publishAll).toBe('function');
    await publishAll.call(wrapper.vm);
    await flushPromises();

    expect(state.publishTiersToRelayMock).toHaveBeenCalledTimes(2);
    expect(state.publishTiersToRelayMock.mock.calls[1][2]).toBeUndefined();
    expect(state.publishEventToRelayMock).toHaveBeenCalledTimes(2);
    expect(state.clientPublishMock).toHaveBeenCalledTimes(1);
    expect(state.logRelayActivityMock).toHaveBeenCalledWith(
      'warning',
      'Publish used HTTP fallback',
      expect.stringContaining('HTTP fallback'),
    );
    expect((wrapper.vm as any).lastPublishInfo).toContain('via HTTP fallback');
    expect((wrapper.vm as any).diagnosticsAttention.detail).toContain('HTTP fallback');
    expect(notifySuccessMock).toHaveBeenCalledTimes(1);
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });
});
