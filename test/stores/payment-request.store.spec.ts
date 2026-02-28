import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import {
  PaymentRequest,
  PaymentRequestTransportType,
  decodePaymentRequest as decodeCashuPaymentRequest,
} from "@cashu/cashu-ts";

vi.mock("@vueuse/core", () => ({
  __esModule: true,
  useLocalStorage: vi.fn((_key: string, value: any) => ref(value)),
}));

vi.mock("uuid", () => ({
  __esModule: true,
  v4: vi.fn(() => "test-uuid-value"),
}));

vi.mock("src/js/logger", () => ({
  __esModule: true,
  debug: vi.fn(),
}));

const notifyModule = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("src/js/notify", () => ({
  __esModule: true,
  ...notifyModule,
}));

const tokenModule = vi.hoisted(() => ({
  decode: vi.fn(),
  getProofs: vi.fn(),
  getMint: vi.fn(),
  getUnit: vi.fn(),
}));

vi.mock("src/js/token", () => ({
  __esModule: true,
  default: tokenModule,
}));

const { notifySuccess, notifyError, notifyWarning, notify } = notifyModule;
const { decode: decodeTokenMock, getProofs: getProofsMock, getMint: getMintMock, getUnit: getUnitMock } =
  tokenModule;

let mintsStoreMock: any;
let sendTokensStoreMock: any;
let walletStoreMock: any;
let nostrStoreMock: any;

const createSendData = () => ({
  amount: null as number | null,
  historyAmount: null as number | null,
  memo: "",
  tokens: "",
  tokensBase64: "",
  p2pkPubkey: "",
  locktime: null as number | null,
  paymentRequest: undefined as PaymentRequest | undefined,
  historyToken: undefined,
  bucketId: "default-bucket-id",
  anonymous: false,
});

vi.mock("src/stores/mints", () => ({
  __esModule: true,
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("src/stores/sendTokensStore", () => ({
  __esModule: true,
  useSendTokensStore: () => sendTokensStoreMock,
}));

vi.mock("src/stores/wallet", () => ({
  __esModule: true,
  useWalletStore: () => walletStoreMock,
}));

vi.mock("src/stores/nostr", () => ({
  __esModule: true,
  useNostrStore: () => nostrStoreMock,
}));

import { usePRStore } from "src/stores/payment-request";

describe("payment-request store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());

    mintsStoreMock = {
      mints: [],
      activeUnit: "usd",
      activeMintUrl: "https://known.mint",
      activeMint: vi.fn(() => ({ units: ["sat", "usd"] })),
      activeUnitCurrencyMultiplyer: 1,
    };

    const sendData = createSendData();
    sendTokensStoreMock = {
      showSendTokens: false,
      recipientPubkey: "",
      sendViaNostr: false,
      sendData,
      clearSendData: vi.fn(() => {
        Object.assign(sendTokensStoreMock.sendData, createSendData());
        sendTokensStoreMock.recipientPubkey = "";
        sendTokensStoreMock.sendViaNostr = false;
      }),
    };

    walletStoreMock = {};

    nostrStoreMock = {
      nprofile: "nprofile123",
      sendNip17DirectMessageToNprofile: vi.fn(),
    };

    decodeTokenMock.mockReset();
    getProofsMock.mockReset();
    getMintMock.mockReset();
    getUnitMock.mockReset();

    notifySuccess.mockClear();
    notifyError.mockClear();
    notifyWarning.mockClear();
    notify.mockClear();

    global.fetch = vi.fn();
  });

  it("creates encoded requests and stores them via newPaymentRequest", () => {
    const prStore = usePRStore();

    const encoded = prStore.createPaymentRequest(250, "hello", "https://known.mint");
    const request = decodeCashuPaymentRequest(encoded);

    expect(request.id).toBe("test-uuid-value".split("-")[0]);
    expect(request.amount).toBe(250);
    expect(request.description).toBe("hello");
    expect(request.unit).toBe("usd");
    expect(request.transport?.[0].type).toBe(PaymentRequestTransportType.NOSTR);
    expect(request.transport?.[0].target).toBe("nprofile123");
    expect(request.mints).toEqual(["https://known.mint"]);

    prStore.showPRKData = "";
    prStore.newPaymentRequest(100, "another", "https://known.mint");
    expect(prStore.showPRKData).not.toBe("");
    const decodedFromNew = decodeCashuPaymentRequest(prStore.showPRKData);
    expect(decodedFromNew.amount).toBe(100);
  });

  it("decodes requests, activates mint/unit, and prepares send dialog", async () => {
    const prStore = usePRStore();
    mintsStoreMock.mints = [{ url: "https://known.mint" }];
    mintsStoreMock.activeUnitCurrencyMultiplyer = 100;

    const request = new PaymentRequest(
      [
        {
          type: PaymentRequestTransportType.POST,
          target: "https://endpoint",
        },
      ],
      "req-123",
      500,
      "sat",
      ["https://known.mint"],
      "memo",
    ).toEncodedRequest();

    await prStore.decodePaymentRequest(request);

    expect(mintsStoreMock.activeMintUrl).toBe("https://known.mint");
    expect(mintsStoreMock.activeUnit).toBe("sat");
    expect(sendTokensStoreMock.clearSendData).toHaveBeenCalledTimes(1);
    expect(sendTokensStoreMock.sendData.amount).toBe(5);
    expect(sendTokensStoreMock.sendData.paymentRequest?.id).toBe("req-123");
    expect(sendTokensStoreMock.showSendTokens).toBe(true);
    expect(notifyWarning).not.toHaveBeenCalled();
  });

  it("warns when unit unsupported and keeps the existing unit", async () => {
    const prStore = usePRStore();
    mintsStoreMock.mints = [{ url: "https://known.mint" }];
    mintsStoreMock.activeMint = vi.fn(() => ({ units: ["usd"] }));
    mintsStoreMock.activeUnit = "usd";

    const request = new PaymentRequest(
      [],
      "req-456",
      undefined,
      "sat",
      ["https://known.mint"],
      undefined,
    ).toEncodedRequest();

    await prStore.decodePaymentRequest(request);

    expect(mintsStoreMock.activeUnit).toBe("usd");
    expect(notifyWarning).toHaveBeenCalledWith(
      "The mint does not support the unit in the payment request: sat",
    );
  });

  it("rejects unknown mints and notifies the user", async () => {
    const prStore = usePRStore();
    mintsStoreMock.mints = [];

    const request = new PaymentRequest(
      [],
      "req-789",
      undefined,
      "sat",
      ["https://unknown.mint"],
      undefined,
    ).toEncodedRequest();

    await expect(prStore.decodePaymentRequest(request)).rejects.toThrow(
      "We do not know the mint in the payment request: https://unknown.mint",
    );
    expect(notifyError).toHaveBeenCalledWith(
      "We do not know the mint in the payment request",
    );
  });

  it("sends payment payloads over Nostr and reports success", async () => {
    const prStore = usePRStore();

    const request = new PaymentRequest(
      [
        {
          type: PaymentRequestTransportType.NOSTR,
          target: "nostr-target",
        },
      ],
      "nostr-id",
      100,
      "sat",
      ["https://known.mint"],
      undefined,
    );

    decodeTokenMock.mockReturnValue({});
    getProofsMock.mockReturnValue(["proof" as any]);
    getMintMock.mockReturnValue("https://known.mint");

    await prStore.parseAndPayPaymentRequest(request, "token-string");

    expect(nostrStoreMock.sendNip17DirectMessageToNprofile).toHaveBeenCalledWith(
      "nostr-target",
      JSON.stringify({
        id: "nostr-id",
        mint: "https://known.mint",
        unit: "sat",
        proofs: ["proof"],
      }),
    );
    expect(notifySuccess).toHaveBeenCalledWith("Payment sent");
  });

  it("notifies on Nostr messaging failures", async () => {
    const prStore = usePRStore();

    const request = new PaymentRequest(
      [
        {
          type: PaymentRequestTransportType.NOSTR,
          target: "nostr-target",
        },
      ],
      "nostr-id",
      100,
      "sat",
      ["https://known.mint"],
      undefined,
    );

    nostrStoreMock.sendNip17DirectMessageToNprofile.mockRejectedValueOnce(
      new Error("boom"),
    );
    decodeTokenMock.mockReturnValue({});
    getProofsMock.mockReturnValue(["proof" as any]);
    getMintMock.mockReturnValue("https://known.mint");

    await prStore.parseAndPayPaymentRequest(request, "token-string");

    expect(notifyError).toHaveBeenCalledWith("Could not pay request");
    expect(notifySuccess).toHaveBeenCalledWith("Payment sent");
  });

  it("posts payment payloads and handles server responses", async () => {
    const prStore = usePRStore();

    const request = new PaymentRequest(
      [
        {
          type: PaymentRequestTransportType.POST,
          target: "https://callback",
        },
      ],
      "post-id",
      undefined,
      "usd",
      ["https://known.mint"],
      undefined,
    );

    decodeTokenMock.mockReturnValue({});
    getProofsMock.mockReturnValue(["proof" as any]);
    getUnitMock.mockReturnValue("usd");
    getMintMock.mockReturnValue("https://known.mint");

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true });

    await prStore.parseAndPayPaymentRequest(request, "token-string");

    expect(global.fetch).toHaveBeenCalledWith("https://callback", {
      headers: { "Content-Type": "application/json" },
      method: "POST",
      body: JSON.stringify({
        id: "post-id",
        mint: "https://known.mint",
        unit: "usd",
        proofs: ["proof"],
      }),
    });
    expect(notifySuccess).toHaveBeenCalledWith("Payment sent");

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      statusText: "Bad Request",
    });

    await prStore.parseAndPayPaymentRequest(request, "token-string");

    expect(notifyError).toHaveBeenCalledWith("Could not pay request");
  });
});
