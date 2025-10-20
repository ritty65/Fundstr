import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from 'pinia';
import { flushPromises, shallowMount } from "@vue/test-utils";
import { Ref, ref } from "vue";
import { Quasar } from "quasar";
import { nip19 } from "nostr-tools";

import NutzapProfilePage from "../../../src/pages/NutzapProfilePage.vue";

const routerResolveMock = vi.fn((location?: any) => ({
  href: `/creator/${location?.params?.npubOrHex ?? "missing"}/profile`,
}));
const routerPushMock = vi.fn();
let clipboardWriteTextMock: ReturnType<typeof vi.fn>;

vi.mock("vue-router", async () => {
  const actual = await vi.importActual<any>("vue-router");
  return {
    ...actual,
    useRouter: () => ({
      resolve: routerResolveMock,
      push: routerPushMock,
    }),
  };
});

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
  createI18n: () => ({
    global: {
      t: (key: string) => key,
    },
  }),
}));

type StatusHandler = (status: "connected" | "connecting" | "reconnecting" | "disconnected" | "idle") => void;

type SharedState = {
  relayUrlRef: Ref<string>;
  relayStatusRef: Ref<"connected" | "connecting" | "reconnecting" | "disconnected" | "idle">;
  relayAutoReconnectRef: Ref<boolean>;
  relayActivityRef: Ref<any[]>;
  relayReconnectAttemptsRef: Ref<number>;
  relayIsConnectedRef: Ref<boolean>;
  publishEventToRelayMock: ReturnType<typeof vi.fn>;
  connectRelayMock: ReturnType<typeof vi.fn>;
  disconnectRelayMock: ReturnType<typeof vi.fn>;
  clearRelayActivityMock: ReturnType<typeof vi.fn>;
  logActivityMock: ReturnType<typeof vi.fn>;
  pubkeyRef: Ref<string>;
  signerRef: Ref<any>;
  nostrStoreMock: {
    npub: string;
    privKeyHex: string;
    activePrivateKeyNsec: string;
    initSignerIfNotSet: ReturnType<typeof vi.fn>;
    signer: any;
  };
  relayStatusHandler: StatusHandler | null;
  relayClientMock: {
    isSupported: boolean;
    requestOnce: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    onStatusChange: ReturnType<typeof vi.fn>;
  };
  ndkInstanceMock: { signer?: any };
  publishTiersToRelayMock: ReturnType<typeof vi.fn>;
  publishNostrEventMock: ReturnType<typeof vi.fn>;
  RelayPublishErrorCtor: new (ack: { id: string; message?: string }) => Error & {
    ack: { id: string; message?: string };
  };
  lastRelayClientInstance?: {
    isSupported: boolean;
    requestOnce: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    onStatusChange: ReturnType<typeof vi.fn>;
  };
};

var shared: SharedState | null = null;

function ensureShared(): SharedState {
  if (!shared) {
    shared = {
      relayUrlRef: ref("wss://relay.primal.net"),
      relayStatusRef: ref("connected"),
      relayAutoReconnectRef: ref(false),
      relayActivityRef: ref([]),
      relayReconnectAttemptsRef: ref(0),
      relayIsConnectedRef: ref(false),
      publishEventToRelayMock: vi.fn(),
      connectRelayMock: vi.fn(),
      disconnectRelayMock: vi.fn(),
      clearRelayActivityMock: vi.fn(),
      logActivityMock: vi.fn(),
      pubkeyRef: ref(""),
      signerRef: ref(null),
      nostrStoreMock: {
        npub: "",
        privKeyHex: "",
        activePrivateKeyNsec: "",
        initSignerIfNotSet: vi.fn(),
        signer: null,
      },
      relayStatusHandler: null,
      relayClientMock: {
        isSupported: true,
        requestOnce: vi.fn(async () => [] as any[]),
        subscribe: vi.fn(() => "mock-sub"),
        unsubscribe: vi.fn(),
        onStatusChange: vi.fn((handler: StatusHandler) => {
          const state = ensureShared();
          state.relayStatusHandler = handler;
          return () => {
            if (state.relayStatusHandler === handler) {
              state.relayStatusHandler = null;
            }
          };
        }),
      },
      ndkInstanceMock: {},
      publishTiersToRelayMock: vi.fn(),
      publishNostrEventMock: vi.fn(),
      RelayPublishErrorCtor: class RelayPublishError extends Error {
        ack: { id: string; message?: string };
        constructor(ack: { id: string; message?: string }) {
          super("Relay publish failed");
          this.ack = ack;
        }
      },
    };
  }

  return shared;
}

const notifySuccessMock = vi.fn();
const notifyErrorMock = vi.fn();
const notifyWarningMock = vi.fn();
const notifyCreateMock = vi.fn();

vi.mock("../../../src/js/notify", () => ({
  notifySuccess: (...args: any[]) => notifySuccessMock(...args),
  notifyError: (...args: any[]) => notifyErrorMock(...args),
  notifyWarning: (...args: any[]) => notifyWarningMock(...args),
}));

vi.mock("quasar", async () => {
  const actual = await vi.importActual<any>("quasar");
  return {
    ...actual,
    Notify: {
      create: (...args: any[]) => notifyCreateMock(...args),
    },
    useQuasar: () => ({
      screen: {
        lt: {
          lg: false,
        },
      },
    }),
  };
});

vi.mock("../../../src/nutzap/onepage/useRelayConnection", () => ({
  useRelayConnection: () => ({
    relayUrl: ensureShared().relayUrlRef,
    status: ensureShared().relayStatusRef,
    autoReconnect: ensureShared().relayAutoReconnectRef,
    activityLog: ensureShared().relayActivityRef,
    reconnectAttempts: ensureShared().relayReconnectAttemptsRef,
    connect: ensureShared().connectRelayMock,
    disconnect: ensureShared().disconnectRelayMock,
    publishEvent: ensureShared().publishEventToRelayMock,
    clearActivity: ensureShared().clearRelayActivityMock,
    logActivity: ensureShared().logActivityMock,
    isSupported: true,
    isConnected: ensureShared().relayIsConnectedRef,
  }),
}));

vi.mock("src/nutzap/useNutzapSignerWorkspace", () => ({
  useNutzapSignerWorkspace: () => ({
    pubkey: ensureShared().pubkeyRef,
    signer: ensureShared().signerRef,
    keySecretHex: ref(''),
    keyNsec: ref(''),
    keyPublicHex: ref(''),
    keyNpub: ref(''),
    keyImportValue: ref(''),
    advancedKeyManagementOpen: ref(false),
    usingStoreIdentity: ref(false),
    connectedIdentitySummary: ref(''),
    ensureSharedSignerInitialized: vi.fn(),
  }),
}));

vi.mock("../../../src/nutzap/ndkInstance", () => ({
  getNutzapNdk: () => ensureShared().ndkInstanceMock,
}));

vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => ensureShared().nostrStoreMock,
}));

const creatorsStoreMock = {
  getCreatorCache: vi.fn(),
  fetchCreator: vi.fn(),
  applyBundleToCache: vi.fn(),
  prefillCacheEntries: [],
};

vi.mock("src/stores/creators", () => ({
  useCreatorsStore: () => creatorsStoreMock,
}));

vi.mock("../../../src/utils/relay", () => ({
  sanitizeRelayUrls: (urls: string[]) => urls.map(url => (url.startsWith("ws") ? url : "")),
}));

const pickLatestReplaceableMock = vi.fn(() => null);
const pickLatestParamReplaceableMock = vi.fn(() => null);

vi.mock("../../../src/pages/nutzap-profile/nostrHelpers", () => ({
  FUNDSTR_WS_URL: "wss://relay.primal.net",
  FUNDSTR_REQ_URL: "https://relay.primal.net/req",
  WS_FIRST_TIMEOUT_MS: 5000,
  HTTP_FALLBACK_TIMEOUT_MS: 8000,
  publishTiers: (...args: any[]) => ensureShared().publishTiersToRelayMock(...args),
  publishNostrEvent: (...args: any[]) => ensureShared().publishNostrEventMock(...args),
  ensureFundstrRelayClient: async () => ensureShared().relayClientMock,
}));

vi.mock("src/nutzap/profileShared", () => ({
  normalizeAuthor: (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error("Author is required.");
    }
    if (!/^[0-9a-f]{64}$/i.test(trimmed)) {
      throw new Error("Author must be a 64-character hex pubkey or npub.");
    }
    return trimmed.toLowerCase();
  },
  pickLatestReplaceable: (...args: any[]) => pickLatestReplaceableMock(...args),
  pickLatestParamReplaceable: (...args: any[]) => pickLatestParamReplaceableMock(...args),
  parseTiersContent: (json?: string | null) => {
    if (!json) {
      return [];
    }
    const parsed = JSON.parse(json);
    const rawTiers = Array.isArray(parsed) ? parsed : parsed?.tiers || [];
    return (rawTiers as any[]).map((tier, index) => ({
      id: tier?.id ?? `tier-${index}`,
      title: tier?.title ?? "",
      price: Number(tier?.price ?? tier?.price_sats ?? 0) || 0,
      frequency: tier?.frequency ?? "monthly",
      description: tier?.description,
      media: tier?.media,
    }));
  },
}));

vi.mock("../../../src/nutzap/relayClient", () => {
  const state = ensureShared();
  const client = {
    get isSupported() {
      return state.relayClientMock.isSupported;
    },
    set isSupported(value: boolean) {
      state.relayClientMock.isSupported = value;
    },
    requestOnce: state.relayClientMock.requestOnce,
    subscribe: state.relayClientMock.subscribe,
    unsubscribe: state.relayClientMock.unsubscribe,
    onStatusChange: state.relayClientMock.onStatusChange,
  };
  state.lastRelayClientInstance = client;
  return {
    fundstrRelayClient: client,
    RelayPublishError: state.RelayPublishErrorCtor,
  };
});

const VALID_HEX = "a".repeat(64);
const OTHER_HEX = "b".repeat(64);

async function mountPage() {
  const wrapper = shallowMount(NutzapProfilePage, {
    global: {
      plugins: [Quasar],
      stubs: {
        'q-card': { template: '<div><slot /></div>' },
        'q-input': { template: '<div><slot /><slot name="append" /></div>' },
        'q-btn': { template: '<button><slot /></button>' },
        'q-chip': { template: '<div><slot /></div>' },
        RelayStatusIndicator: true,
        NutzapExplorerSearch: true,
        NutzapLegacyExplorer: true,
        NutzapSelfTests: true,
        'router-link': true,
        ConnectionPanel: true,
        AuthorMetadataPanel: true,
        TierComposerCard: true,
        ReviewPublishCard: true,
        RelayExplorer: true,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  routerResolveMock.mockClear();
  routerPushMock.mockClear();
  notifyCreateMock.mockReset();

  clipboardWriteTextMock = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: clipboardWriteTextMock },
  });

  const state = ensureShared();
  notifySuccessMock.mockReset();
  notifyErrorMock.mockReset();
  notifyWarningMock.mockReset();
  state.publishTiersToRelayMock = vi.fn();
  state.publishNostrEventMock = vi.fn();
  state.publishEventToRelayMock.mockReset();
  state.connectRelayMock.mockReset();
  state.disconnectRelayMock.mockReset();
  state.clearRelayActivityMock.mockReset();
  state.logActivityMock.mockReset();
  state.relayUrlRef.value = "wss://relay.primal.net";
  state.relayStatusRef.value = "connected";
  state.relayAutoReconnectRef.value = false;
  state.relayActivityRef.value = [];
  state.relayIsConnectedRef.value = false;
  state.pubkeyRef.value = "";
  state.signerRef.value = null;
  state.nostrStoreMock.npub = "";
  state.nostrStoreMock.privKeyHex = "";
  state.nostrStoreMock.activePrivateKeyNsec = "";
  state.nostrStoreMock.initSignerIfNotSet = vi.fn();
  state.nostrStoreMock.signer = null;
  state.ndkInstanceMock.signer = undefined;
  state.relayClientMock.requestOnce.mockReset();
  state.relayClientMock.requestOnce.mockResolvedValue([]);
  state.relayClientMock.subscribe.mockReset();
  state.relayClientMock.subscribe.mockImplementation(() => "mock-sub");
  state.relayClientMock.unsubscribe.mockReset();
  state.relayClientMock.onStatusChange.mockReset();
  state.relayClientMock.onStatusChange.mockImplementation((handler: StatusHandler) => {
    state.relayStatusHandler = handler;
    return () => {
      if (state.relayStatusHandler === handler) {
        state.relayStatusHandler = null;
      }
    };
  });
  state.relayStatusHandler = null;
  state.lastRelayClientInstance = undefined;
  localStorage.clear();

  creatorsStoreMock.getCreatorCache.mockReset();
  creatorsStoreMock.fetchCreator.mockReset();
  creatorsStoreMock.applyBundleToCache.mockReset();
  creatorsStoreMock.prefillCacheEntries = [];
  pickLatestReplaceableMock.mockReset();
  pickLatestParamReplaceableMock.mockReset();
});

describe("NutzapProfilePage explore summary", () => {
  it("renders profile, mint, relay, and tier summaries", async () => {
    const state = ensureShared();
    const profileEvent = {
      kind: 0,
      pubkey: VALID_HEX,
      content: JSON.stringify({
        name: "Fundstr Hero",
        p2pk_pubkey: "ff".repeat(32),
        mints: ["https://mint.one", "https://mint.two"],
        relays: ["wss://relay.alt"],
      }),
      id: 'profile-event', created_at: 1, sig: 'sig', tags: []
    };
    const tiersEvent = {
      kind: 30019,
      pubkey: VALID_HEX,
      content: JSON.stringify([
        { id: "tier-1", title: "Tier One", price: 100, frequency: "monthly", description: "Monthly support", media: [] },
        { id: "tier-2", title: "Tier Two", price: 500, frequency: "yearly", description: "", media: [] },
      ]),
      id: 'tiers-event', created_at: 2, sig: 'sig', tags: [['d', 'tiers']]
    };
    state.relayClientMock.requestOnce.mockResolvedValue([profileEvent, tiersEvent]);
    pickLatestReplaceableMock.mockReturnValue(profileEvent);
    pickLatestParamReplaceableMock.mockReturnValue(tiersEvent);

    const wrapper = await mountPage();
    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).authorInput = VALID_HEX;
    await (wrapper.vm as any).refreshSubscriptions(true);
    await flushPromises();
    await (wrapper.vm as any).loadAll();
    await flushPromises();

    (wrapper.vm as any).activeProfileStep = "explore";
    await wrapper.vm.$nextTick();

    const summaryCard = wrapper.find('[data-testid="explore-summary"]');
    expect(summaryCard.exists()).toBe(true);
    expect(summaryCard.text()).toContain("Fundstr Hero");
    expect(summaryCard.text()).toContain("Author:");
    expect(summaryCard.text()).toContain("P2PK pointer:");

    const mintChips = summaryCard.findAll('[data-testid="explore-mint-chip"]');
    expect(mintChips).toHaveLength(2);
    expect(mintChips.map(node => node.text())).toEqual(
      expect.arrayContaining(["https://mint.one", "https://mint.two"])
    );

    const relayChips = summaryCard.findAll('[data-testid="explore-relay-chip"]');
    expect(relayChips.length).toBeGreaterThanOrEqual(2);
    expect(relayChips.map(node => node.text())).toEqual(
      expect.arrayContaining(["wss://relay.alt", "wss://relay.primal.net"])
    );

    const tierItems = summaryCard.findAll('[data-testid="explore-tier-item"]');
    expect(tierItems).toHaveLength(2);
    expect(tierItems[0].text()).toContain("Tier One");
    expect(tierItems[0].text()).toContain("100 sats");
    expect(tierItems[0].text()).toContain("Monthly");
  });
});

describe("NutzapProfilePage share link", () => {
  it("renders a shareable profile URL and copies it to the clipboard", async () => {
    const state = ensureShared();
    const profileEvent = {
      kind: 0,
      pubkey: VALID_HEX,
      content: JSON.stringify({ name: "Test User" }),
      id: 'profile-event', created_at: 1, sig: 'sig', tags: []
    };
    state.relayClientMock.requestOnce.mockResolvedValue([profileEvent]);
    pickLatestReplaceableMock.mockReturnValue(profileEvent);
    pickLatestParamReplaceableMock.mockReturnValue(null);

    const wrapper = await mountPage();
    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).authorInput = VALID_HEX;
    await (wrapper.vm as any).refreshSubscriptions(true);
    await flushPromises();
    await (wrapper.vm as any).loadAll();
    await flushPromises();

    (wrapper.vm as any).activeProfileStep = "explore";
    await wrapper.vm.$nextTick();

    const expectedNpub = (wrapper.vm as any).authorNpubForShare;
    expect(expectedNpub).toBeTruthy();

    const expectedUrl = new URL(`/creator/${expectedNpub}/profile`, window.location.origin).href;

    expect(routerResolveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "PublicCreatorProfile",
        params: { npubOrHex: expectedNpub },
      })
    );

    const summaryShare = wrapper.find('[data-testid="explore-summary-share"]');
    expect(summaryShare.exists()).toBe(true);
    expect(summaryShare.find('[data-testid="public-profile-url"]').exists()).toBe(true);

    expect(summaryShare.html()).toContain(expectedUrl);

    const copyButton = wrapper.find('[data-testid="copy-public-profile-url"]');
    expect(copyButton.exists()).toBe(true);

    await copyButton.trigger("click");
    await flushPromises();

    expect(clipboardWriteTextMock).toHaveBeenCalledWith(expectedUrl);
  });
});

describe("NutzapProfilePage publishing", () => {
  it("publishes profile and tiers together, rewriting author input", async () => {
    const wrapper = await mountPage();

    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).p2pkPub = "ff".repeat(32);
    (wrapper.vm as any).mintsText = "https://mint.example";
    (wrapper.vm as any).tiers = [
      { id: "tier", title: "Tier", price: 100, frequency: "monthly", media: [] },
    ];
    (wrapper.vm as any).tiersJsonError = null;

    const state = ensureShared();
    state.signerRef.value = { sign: vi.fn() };
    state.publishTiersToRelayMock.mockResolvedValue({
      ack: { id: "tier-id", message: "tiers-ack" },
      event: { pubkey: OTHER_HEX },
    });
    state.publishNostrEventMock.mockResolvedValue({
      ack: { id: "profile-id", message: "profile-ack" },
      event: { pubkey: OTHER_HEX },
    });

    notifySuccessMock.mockClear();
    notifyErrorMock.mockClear();

    await (wrapper.vm as any).publishAll();
    await flushPromises();
    expect(state.publishTiersToRelayMock).toHaveBeenCalledTimes(1);
    expect(state.publishNostrEventMock).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as any).lastPublishInfo).toContain("Tiers published");
    expect((wrapper.vm as any).lastPublishInfo).toContain("Profile published");
    expect((wrapper.vm as any).authorInput).toBe(OTHER_HEX);
    expect(notifySuccessMock).toHaveBeenCalledWith(
      "Nutzap profile published (profile profile-ack, tiers tiers-ack)."
    );
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  it("stops the workflow when tier publishing fails", async () => {
    const wrapper = await mountPage();

    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).p2pkPub = "ff".repeat(32);
    (wrapper.vm as any).mintsText = "https://mint.example";
    (wrapper.vm as any).tiers = [
      { id: "tier", title: "Tier", price: 100, frequency: "monthly", media: [] },
    ];
    (wrapper.vm as any).tiersJsonError = null;

    const state = ensureShared();
    state.signerRef.value = { sign: vi.fn() };
    const RelayPublishError = state.RelayPublishErrorCtor;
    state.publishTiersToRelayMock.mockRejectedValue(
      new RelayPublishError({ id: "tier", message: "Relay rejected event." })
    );

    notifySuccessMock.mockClear();
    notifyErrorMock.mockClear();

    await (wrapper.vm as any).publishAll();
    await flushPromises();
    expect(state.publishTiersToRelayMock).toHaveBeenCalledTimes(1);
    expect(state.publishNostrEventMock).not.toHaveBeenCalled();
    expect((wrapper.vm as any).lastPublishInfo).toContain("Publish rejected — id tier");
    expect(notifyErrorMock).toHaveBeenCalledWith("Relay rejected event.");
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });

  it("surfaces profile publishing failures after tier success", async () => {
    const wrapper = await mountPage();

    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).p2pkPub = "ff".repeat(32);
    (wrapper.vm as any).mintsText = "https://mint.example";
    (wrapper.vm as any).tiers = [
      { id: "tier", title: "Tier", price: 100, frequency: "monthly", media: [] },
    ];
    (wrapper.vm as any).tiersJsonError = null;

    const state = ensureShared();
    state.signerRef.value = { sign: vi.fn() };
    const RelayPublishError = state.RelayPublishErrorCtor;
    state.publishTiersToRelayMock.mockResolvedValue({
      ack: { id: "tier-id", message: "tiers-ack" },
      event: { pubkey: OTHER_HEX },
    });
    state.publishNostrEventMock.mockRejectedValue(
      new RelayPublishError({ id: "profile", message: "Relay rejected event." })
    );

    notifySuccessMock.mockClear();
    notifyErrorMock.mockClear();

    await (wrapper.vm as any).publishAll();
    await flushPromises();

    expect(state.publishTiersToRelayMock).toHaveBeenCalledTimes(1);
    expect(state.publishNostrEventMock).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as any).lastPublishInfo).toContain("Tiers published");
    expect((wrapper.vm as any).lastPublishInfo).toContain("Publish rejected — id profile");
    expect(notifyErrorMock).toHaveBeenCalledWith("Relay rejected event.");
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });
});

describe("NutzapProfilePage edge cases", () => {
  it("initializes Fundstr signer identity on mount", async () => {
    const state = ensureShared();
    state.pubkeyRef.value = VALID_HEX;

    const wrapper = await mountPage();
    await flushPromises();

    expect((wrapper.vm as any).authorInput).toBe(VALID_HEX);
  });

  it("reloads data after relay reconnects", async () => {
    const wrapper = await mountPage();
    (wrapper.vm as any).authorInput = VALID_HEX;
    await (wrapper.vm as any).refreshSubscriptions(true);
    await flushPromises();

    const state = ensureShared();
    const handler = state.relayStatusHandler ?? state.relayClientMock.onStatusChange.mock.calls.at(-1)?.[0];
    expect(typeof handler).toBe("function");

    handler?.("connected");
    handler?.("disconnected");
    handler?.("connected");

    await flushPromises();
  });

});
