import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";

import { useNWCStore } from "@/stores/nwc";

const hoisted = vi.hoisted(() => {
  class MockNDK {
    connect = vi.fn();
    fetchEvents = vi.fn(async () => new Set());
    subscribe = vi.fn(() => ({ on: vi.fn(), stop: vi.fn() }));
    pool = { relays: new Map(), on: vi.fn() };
  }

  class MockNDKEvent {
    kind = 0;
    content = "";
    tags: string[][] = [];
    author = { pubkey: "event-pub" };
    id = "event-id";
    created_at = 0;
    constructor(public ndk: any) {}
    publish = vi.fn(async () => undefined);
    tagValue = vi.fn();
  }

  const mintsStore = {
    totalUnitBalance: 0,
    activeUnit: "sat",
  };

  const createPayInvoiceData = () => ({
    meltQuote: {
      response: {
        amount: 0,
        fee_reserve: 0,
      },
      error: "",
    },
  });

  const walletStore = {
    decodeRequest: vi.fn(),
    payInvoiceData: createPayInvoiceData(),
    meltInvoiceData: vi.fn(),
    requestMint: vi.fn(),
    mintOnPaid: vi.fn(),
    wallet: {},
  };

  const proofsStore = {
    sumProofs: vi.fn(() => 0),
  };

  const invoiceHistoryStore = {
    invoiceHistory: [] as any[],
  };

  const settingsStore = {
    defaultNostrRelays: ["wss://relay.example"],
  };

  const nostrStore = {
    relays: ["wss://relay.example"],
    pubkey: "nostr-pub",
    privKeyHex: "aa",
    initSignerIfNotSet: vi.fn(),
    signer: {},
  };

  const notify = {
    notify: vi.fn(),
    notifyError: vi.fn(),
    notifyWarning: vi.fn(),
    notifySuccess: vi.fn(),
  };

  const nip44 = {
    encrypt: vi.fn((content: string) => `encrypted:${content}`),
    decrypt: vi.fn((content: string) => content),
    utils: {
      getConversationKey: vi.fn(() => "conversation-key"),
    },
  };

  const decodeBolt11 = vi.fn(() => ({ sections: [] }));

  const ndkSubscribe = vi.fn(() => ({
    on: vi.fn(),
    stop: vi.fn(),
  }));

  const ndkInstance = {
    connect: vi.fn(),
    fetchEvents: vi.fn(async () => new Set()),
    subscribe: ndkSubscribe,
    pool: { relays: new Map(), on: vi.fn() },
  };

  const useNdkMock = vi.fn(async () => ndkInstance);

  return {
    MockNDK,
    MockNDKEvent,
    mintsStore,
    walletStore,
    proofsStore,
    invoiceHistoryStore,
    settingsStore,
    nostrStore,
    notify,
    nip44,
    decodeBolt11,
    ndkInstance,
    ndkSubscribe,
    useNdkMock,
    createPayInvoiceData,
  };
});

vi.mock("@vueuse/core", () => ({
  __esModule: true,
  useLocalStorage: vi.fn((_key: string, initial: any) => ref(initial)),
}));

vi.mock("@nostr-dev-kit/ndk", () => ({
  __esModule: true,
  default: hoisted.MockNDK,
  NDKEvent: hoisted.MockNDKEvent,
  NDKNip07Signer: vi.fn(),
  NDKNip46Signer: vi.fn(),
  NDKFilter: class {},
  NDKPrivateKeySigner: vi.fn(),
  NDKKind: {},
  NDKSubscription: class {
    stop = vi.fn();
    on = vi.fn();
  },
}));

vi.mock("stores/mints", () => ({
  __esModule: true,
  useMintsStore: () => hoisted.mintsStore,
}));

vi.mock("stores/wallet", () => ({
  __esModule: true,
  useWalletStore: () => hoisted.walletStore,
}));

vi.mock("stores/proofs", () => ({
  __esModule: true,
  useProofsStore: () => hoisted.proofsStore,
}));

vi.mock("stores/invoiceHistory", () => ({
  __esModule: true,
  useInvoiceHistoryStore: () => hoisted.invoiceHistoryStore,
}));

vi.mock("stores/settings", () => ({
  __esModule: true,
  useSettingsStore: () => hoisted.settingsStore,
}));

vi.mock("stores/nostr", () => ({
  __esModule: true,
  useNostrStore: () => hoisted.nostrStore,
}));

vi.mock("src/js/notify", () => ({
  __esModule: true,
  notify: hoisted.notify.notify,
  notifyError: hoisted.notify.notifyError,
  notifyWarning: hoisted.notify.notifyWarning,
  notifySuccess: hoisted.notify.notifySuccess,
}));

vi.mock("src/composables/useNdk", () => ({
  __esModule: true,
  useNdk: hoisted.useNdkMock,
}));

vi.mock("light-bolt11-decoder", () => ({
  __esModule: true,
  decode: hoisted.decodeBolt11,
}));

vi.mock("nostr-tools/nip44", () => ({
  __esModule: true,
  v2: hoisted.nip44,
}));

vi.mock("nostr-tools", () => ({
  __esModule: true,
  generateSecretKey: vi.fn(() => new Uint8Array([1, 2, 3])),
  getPublicKey: vi.fn(() => "connection-pub"),
}));

vi.mock("@noble/hashes/utils", () => ({
  __esModule: true,
  bytesToHex: vi.fn((bytes: Uint8Array) => Array.from(bytes).join("")),
  hexToBytes: vi.fn(() => new Uint8Array()),
}));

describe("nwc store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());

    hoisted.walletStore.decodeRequest.mockReset();
    hoisted.walletStore.meltInvoiceData.mockReset();
    hoisted.walletStore.requestMint.mockReset();
    hoisted.walletStore.mintOnPaid.mockReset();
    hoisted.proofsStore.sumProofs.mockReset();
    hoisted.notify.notifyWarning.mockReset();
    hoisted.decodeBolt11.mockReset();
    hoisted.useNdkMock.mockResolvedValue(hoisted.ndkInstance);

    hoisted.walletStore.payInvoiceData = hoisted.createPayInvoiceData();
    hoisted.mintsStore.totalUnitBalance = 0;
    hoisted.mintsStore.activeUnit = "sat";
    hoisted.invoiceHistoryStore.invoiceHistory = [];
  });

  const createStore = () => {
    const store = useNWCStore();
    store.connections = [
      {
        walletPublicKey: "wallet-pub",
        connectionSecret: "secret",
        connectionPublicKey: "connection",
        allowanceLeft: 1000,
      },
    ] as any;
    return store;
  };

  it("returns wallet metadata via get_info", async () => {
    const store = createStore();

    const result = await store.handleGetInfo({ method: "get_info", params: {} });

    expect(result).toEqual({
      result_type: "get_info",
      result: expect.objectContaining({
        alias: "Fundstr",
        pubkey: "wallet-pub",
        methods: store.supportedMethods,
      }),
    });
  });

  it("reports total balance in msats", async () => {
    const store = createStore();
    hoisted.mintsStore.totalUnitBalance = 42;

    const result = await store.handleGetBalance({ method: "get_balance", params: {} });

    expect(result.result.balance).toBe(42000);
  });

  it("normalizes decode errors when paying invoices", async () => {
    const store = createStore();
    hoisted.walletStore.decodeRequest.mockRejectedValueOnce(new Error("bad invoice"));

    const result = await store.handlePayInvoice({
      method: "pay_invoice",
      params: { invoice: "bolt", amount: 0 },
    });

    expect(result.error).toMatchObject({ code: "INTERNAL", message: "Invalid invoice" });
  });

  it("returns an error when melt quotes are unavailable", async () => {
    const store = createStore();
    hoisted.walletStore.decodeRequest.mockResolvedValueOnce(undefined);
    hoisted.walletStore.payInvoiceData.meltQuote.response.amount = 0;

    const result = await store.handlePayInvoice({
      method: "pay_invoice",
      params: { invoice: "bolt", amount: 1000 },
    });

    expect(result.error).toMatchObject({
      code: "INTERNAL",
      message: "Error requesting melt quote",
    });
    expect(hoisted.notify.notifyWarning).toHaveBeenCalledWith(
      "NWC: Error requesting melt quote",
    );
  });

  it("requires the active unit to be sats", async () => {
    const store = createStore();
    hoisted.walletStore.decodeRequest.mockResolvedValueOnce(undefined);
    hoisted.walletStore.payInvoiceData.meltQuote.response.amount = 10;
    hoisted.walletStore.payInvoiceData.meltQuote.response.fee_reserve = 2;
    hoisted.mintsStore.activeUnit = "usd";

    const result = await store.handlePayInvoice({
      method: "pay_invoice",
      params: { invoice: "bolt", amount: 12_000 },
    });

    expect(result.error).toMatchObject({
      code: "INTERNAL",
      message: "Your active must be sats",
    });
    expect(hoisted.notify.notifyWarning).toHaveBeenCalledWith(
      "NWC: Active unit must be sats",
    );
  });

  it("rejects payments that exceed the allowance", async () => {
    const store = createStore();
    hoisted.walletStore.decodeRequest.mockResolvedValueOnce(undefined);
    hoisted.walletStore.payInvoiceData.meltQuote.response.amount = 40;
    hoisted.walletStore.payInvoiceData.meltQuote.response.fee_reserve = 15;
    store.connections[0].allowanceLeft = 50;

    const result = await store.handlePayInvoice({
      method: "pay_invoice",
      params: { invoice: "bolt", amount: 55_000 },
    });

    expect(result.error).toMatchObject({
      code: "QUOTA_EXCEEDED",
      message: "Your quota has exceeded",
    });
    expect(hoisted.notify.notifyWarning).toHaveBeenCalledWith(
      "NWC: Allowance exceeded",
    );
  });

  it("deducts paid amounts from the allowance", async () => {
    const store = createStore();
    hoisted.walletStore.decodeRequest.mockResolvedValueOnce(undefined);
    hoisted.walletStore.payInvoiceData.meltQuote.response.amount = 500;
    hoisted.walletStore.payInvoiceData.meltQuote.response.fee_reserve = 50;
    hoisted.proofsStore.sumProofs.mockReturnValueOnce(100);
    hoisted.walletStore.meltInvoiceData.mockResolvedValueOnce({ change: [{ amount: 100 }] });

    const result = await store.handlePayInvoice({
      method: "pay_invoice",
      params: { invoice: "bolt", amount: 550_000 },
    });

    expect(result).toEqual({ result_type: "pay_invoice", result: {} });
    expect(store.connections[0].allowanceLeft).toBe(550);
    expect(hoisted.walletStore.meltInvoiceData).toHaveBeenCalledTimes(1);
  });

  it("normalizes parse failures", async () => {
    const store = createStore();
    const replySpy = vi.fn();
    store.replyNWC = replySpy as any;

    const event = { id: "evt", author: { pubkey: "pub" } } as any;

    await store.parseNWCCommand("not-json", event, store.connections[0] as any);

    expect(replySpy).toHaveBeenCalledWith(
      {
        result_type: "parse_error",
        error: { code: "OTHER", message: "Failed to parse command" },
      },
      event,
      store.connections[0],
    );
  });
});
