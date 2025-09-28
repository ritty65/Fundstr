import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { Ref, ref } from "vue";

import NutzapProfilePage from "../../../src/pages/NutzapProfilePage.vue";

type StatusHandler = (status: "connected" | "connecting" | "reconnecting" | "disconnected" | "idle") => void;

type SharedState = {
  relayUrlRef: Ref<string>;
  relayStatusRef: Ref<"connected" | "connecting" | "reconnecting" | "disconnected" | "idle">;
  relayAutoReconnectRef: Ref<boolean>;
  relayActivityRef: Ref<any[]>;
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
      relayUrlRef: ref("wss://relay.fundstr.me"),
      relayStatusRef: ref("connected"),
      relayAutoReconnectRef: ref(false),
      relayActivityRef: ref([]),
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

vi.mock("../../../src/js/notify", () => ({
  notifySuccess: (...args: any[]) => notifySuccessMock(...args),
  notifyError: (...args: any[]) => notifyErrorMock(...args),
  notifyWarning: (...args: any[]) => notifyWarningMock(...args),
}));

vi.mock("quasar", async () => {
  const actual = await vi.importActual<any>("quasar");
  return {
    ...actual,
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
    connect: ensureShared().connectRelayMock,
    disconnect: ensureShared().disconnectRelayMock,
    publishEvent: ensureShared().publishEventToRelayMock,
    clearActivity: ensureShared().clearRelayActivityMock,
    logActivity: ensureShared().logActivityMock,
    isSupported: true,
    isConnected: ensureShared().relayIsConnectedRef,
  }),
}));

vi.mock("../../../src/nutzap/signer", () => ({
  useActiveNutzapSigner: () => ({
    pubkey: ensureShared().pubkeyRef,
    signer: ensureShared().signerRef,
  }),
}));

vi.mock("../../../src/nutzap/ndkInstance", () => ({
  getNutzapNdk: () => ensureShared().ndkInstanceMock,
}));

vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => ensureShared().nostrStoreMock,
}));

vi.mock("../../../src/utils/relay", () => ({
  sanitizeRelayUrls: (urls: string[]) => urls.map(url => (url.startsWith("ws") ? url : "")),
}));

const pickLatestReplaceableMock = vi.fn(() => null);
const pickLatestParamReplaceableMock = vi.fn(() => null);

vi.mock("../../../src/pages/nutzap-profile/nostrHelpers", () => ({
  FUNDSTR_WS_URL: "wss://relay.fundstr.me",
  FUNDSTR_REQ_URL: "https://relay.fundstr.me/req",
  WS_FIRST_TIMEOUT_MS: 5000,
  HTTP_FALLBACK_TIMEOUT_MS: 5000,
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
  publishTiers: (...args: any[]) => ensureShared().publishTiersToRelayMock(...args),
  publishNostrEvent: (...args: any[]) => ensureShared().publishNostrEventMock(...args),
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
      stubs: {
        RelayStatusIndicator: true,
        NutzapExplorerSearch: true,
        NutzapLegacyExplorer: true,
        NutzapSelfTests: true,
        'router-link': true,
        transition: false,
        teleport: false,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
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
  state.relayUrlRef.value = "wss://relay.fundstr.me";
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
});

describe("NutzapProfilePage publishing", () => {
  it("publishing tiers shows success, refreshes subscriptions, and rewrites author input", async () => {
    const wrapper = await mountPage();

    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).tiers = [
      { id: "tier", title: "Tier", price: 100, frequency: "monthly", media: [] },
    ];
    (wrapper.vm as any).tiersJsonError = null;

    await (wrapper.vm as any).refreshSubscriptions(true);
    await flushPromises();
    const state = ensureShared();
    state.publishTiersToRelayMock.mockResolvedValue({
      ack: { id: "event-id", message: "ack" },
      event: { pubkey: OTHER_HEX },
    });

    notifySuccessMock.mockClear();
    notifyErrorMock.mockClear();

    await (wrapper.vm as any).publishTiers();
    await flushPromises();

    expect(state.publishTiersToRelayMock).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as any).lastTiersPublishInfo).toContain("Tiers published");
    expect((wrapper.vm as any).authorInput).toBe(OTHER_HEX);
    expect(notifySuccessMock).toHaveBeenCalledWith("Relay accepted tiers — ack");
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  it("publishing tiers reports relay failures", async () => {
    const wrapper = await mountPage();
    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).tiers = [
      { id: "tier", title: "Tier", price: 100, frequency: "monthly", media: [] },
    ];
    (wrapper.vm as any).tiersJsonError = null;

    await (wrapper.vm as any).refreshSubscriptions(true);
    await flushPromises();

    const state = ensureShared();
    const client = state.lastRelayClientInstance ?? state.relayClientMock;
    const RelayPublishError = state.RelayPublishErrorCtor;
    state.publishTiersToRelayMock.mockRejectedValue(
      new RelayPublishError({ id: "123", message: "Relay rejected event." })
    );

    notifySuccessMock.mockClear();
    notifyErrorMock.mockClear();

    await (wrapper.vm as any).publishTiers();
    await flushPromises();

    expect(notifyErrorMock).toHaveBeenCalledWith("Relay publish failed");
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });

  it("publishing profile refreshes data and handles signer rewrites", async () => {
    const wrapper = await mountPage();

    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).p2pkPub = "ff".repeat(32);
    (wrapper.vm as any).mintsText = "https://mint.example";
    (wrapper.vm as any).tiers = [
      { id: "tier", title: "Tier", price: 100, frequency: "monthly", media: [] },
    ];
    (wrapper.vm as any).tiersJsonError = null;

    await (wrapper.vm as any).refreshSubscriptions(true);
    await flushPromises();

    const state = ensureShared();
    state.publishNostrEventMock.mockResolvedValue({
      ack: { id: "profile-id", message: "accepted" },
      event: { pubkey: OTHER_HEX },
    });

    notifySuccessMock.mockClear();
    notifyErrorMock.mockClear();

    await (wrapper.vm as any).publishProfile();
    await flushPromises();

    expect(state.publishNostrEventMock).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as any).lastProfilePublishInfo).toContain("Profile published");
    expect((wrapper.vm as any).authorInput).toBe(OTHER_HEX);
    expect(notifySuccessMock).toHaveBeenCalledWith("Relay accepted profile — accepted");
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  it("publishing profile surfaces relay rejection", async () => {
    const wrapper = await mountPage();
    (wrapper.vm as any).authorInput = VALID_HEX;
    (wrapper.vm as any).p2pkPub = "ff".repeat(32);
    (wrapper.vm as any).mintsText = "https://mint.example";
    (wrapper.vm as any).tiers = [
      { id: "tier", title: "Tier", price: 100, frequency: "monthly", media: [] },
    ];
    (wrapper.vm as any).tiersJsonError = null;

    await (wrapper.vm as any).refreshSubscriptions(true);
    await flushPromises();

    const state = ensureShared();
    const RelayPublishError = state.RelayPublishErrorCtor;
    state.publishNostrEventMock.mockRejectedValue(
      new RelayPublishError({ id: "profile", message: "Relay rejected event." })
    );

    notifySuccessMock.mockClear();
    notifyErrorMock.mockClear();

    await (wrapper.vm as any).publishProfile();
    await flushPromises();

    expect(notifyErrorMock).toHaveBeenCalledWith("Relay publish failed");
    expect(notifySuccessMock).not.toHaveBeenCalled();
  });
});

describe("NutzapProfilePage edge cases", () => {
  it("initializes Fundstr signer identity on mount", async () => {
    const state = ensureShared();
    state.nostrStoreMock.npub = "npub1fundstridentity";
    state.pubkeyRef.value = "";

    const wrapper = await mountPage();

    expect(state.nostrStoreMock.initSignerIfNotSet).toHaveBeenCalled();

    state.pubkeyRef.value = VALID_HEX;
    await flushPromises();

    expect((wrapper.vm as any).authorInput).toBe(VALID_HEX);
    expect((wrapper.vm as any).keyPublicHex).toBe(VALID_HEX);
    expect((wrapper.vm as any).keyNpub).toBe("npub1fundstridentity");
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
