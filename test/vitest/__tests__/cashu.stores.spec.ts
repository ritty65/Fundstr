import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { createPinia, setActivePinia } from "pinia";

const paymentRequestConstructorCalls: Array<{
  transport: any;
  id: string;
  amount?: number;
  unit?: string;
  mints?: string[] | undefined;
  memo?: string;
}> = [];

vi.mock("uuid", () => ({
  v4: () => "mock-uuid-1234",
}));

vi.mock("@nostr-dev-kit/ndk", () => {
  class NDKEventMock {
    kind = 0;
    content = "";
    tags: string[][] = [];
    constructor(public ndk: unknown) {}
    async sign() {
      return "signature";
    }
    rawEvent() {
      return { kind: this.kind, content: this.content, tags: this.tags };
    }
  }
  return {
    __esModule: true,
    default: class {},
    NDKEvent: NDKEventMock,
    NDKPrivateKeySigner: class {},
  };
});

vi.mock("nostr-tools", () => ({
  nip19: {
    npubEncode: (hex: string) => `npub_${hex}`,
  },
  generateSecretKey: vi.fn(),
  getPublicKey: vi.fn(),
}));

vi.mock("@cashu/cashu-ts", () => {
  class PaymentRequestStub {
    transport: any;
    id: string;
    amount?: number;
    unit?: string;
    mints?: string[];
    memo?: string;
    constructor(
      transport: any,
      id: string,
      amount?: number,
      unit?: string,
      mints?: string[],
      memo?: string,
    ) {
      this.transport = transport;
      this.id = id;
      this.amount = amount;
      this.unit = unit;
      this.mints = mints;
      this.memo = memo;
      paymentRequestConstructorCalls.push({
        transport,
        id,
        amount,
        unit,
        mints,
        memo,
      });
    }
    toEncodedRequest() {
      return `encoded-${this.id}`;
    }
  }

  const decodePaymentRequest = vi.fn((encoded: string) =>
    new PaymentRequestStub(
      [],
      "decoded",
      400,
      "sat",
      ["https://known-mint.com"],
      `memo:${encoded}`,
    ),
  );

  return {
    __esModule: true,
    PaymentRequest: PaymentRequestStub,
    PaymentRequestTransportType: {
      NOSTR: "nostr",
      POST: "post",
    },
    decodePaymentRequest,
  };
});

vi.mock("src/js/notify", () => ({
  notify: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
  notifyApiError: vi.fn(),
}));

let walletStoreMock: any;
vi.mock("src/stores/wallet", () => ({
  useWalletStore: () => walletStoreMock,
}));

let receiveStoreMock: any;
vi.mock("src/stores/receiveTokensStore", () => ({
  useReceiveTokensStore: () => receiveStoreMock,
}));

let tokensStoreMock: any;
vi.mock("src/stores/tokens", () => ({
  useTokensStore: () => tokensStoreMock,
}));

let nostrStoreMock: any;
vi.mock("src/stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
}));

let mintsStoreMock: any;
vi.mock("src/stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

let proofsStoreMock: any;
vi.mock("src/stores/proofs", () => ({
  useProofsStore: () => proofsStoreMock,
}));

vi.mock("src/composables/useNdk", () => ({
  useNdk: vi.fn(async () => ({})),
}));

vi.mock("src/boot/i18n", () => ({
  i18n: {
    global: {
      t: (key: string) => key,
    },
  },
}));

const tokenDecodeMock = vi.fn();
const tokenGetProofsMock = vi.fn();
const tokenGetMintMock = vi.fn();
const tokenGetUnitMock = vi.fn();

vi.mock("src/js/token", () => ({
  __esModule: true,
  default: {
    decode: (...args: any[]) => tokenDecodeMock(...args),
    getProofs: (...args: any[]) => tokenGetProofsMock(...args),
    getMint: (...args: any[]) => tokenGetMintMock(...args),
    getUnit: (...args: any[]) => tokenGetUnitMock(...args),
  },
}));

import * as notifyModule from "src/js/notify";
import { useSendTokensStore } from "src/stores/sendTokensStore";
import { useNPCStore } from "src/stores/npubcash";
import {
  PaymentRequestTransportType,
  decodePaymentRequest as decodePaymentRequestMock,
  PaymentRequest,
} from "@cashu/cashu-ts";
import { usePRStore } from "src/stores/payment-request";
import { useSwapStore } from "src/stores/swap";

describe("cashu stores", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    paymentRequestConstructorCalls.length = 0;
    decodePaymentRequestMock.mockClear();
    Object.values(notifyMock).forEach((fn) => fn.mockReset());
    walletStoreMock = {
      redeem: vi.fn().mockResolvedValue(undefined),
      mintWallet: vi.fn((url: string, unit: string) => ({
        url,
        unit,
        getFeesForProofs: vi.fn().mockReturnValue(1),
      })),
      requestMint: vi.fn().mockResolvedValue({
        request: { invoice: "invoice" },
        quote: "quote-id",
      }),
      meltQuote: vi.fn().mockResolvedValue("melt-quote"),
      melt: vi.fn().mockResolvedValue(undefined),
      checkInvoice: vi.fn().mockResolvedValue(undefined),
    };
    receiveStoreMock = {
      receiveData: {
        tokensBase64: "",
        description: "",
      },
      enqueue: vi.fn(async (fn: () => Promise<any>) => await fn()),
      showReceiveTokens: false,
    };
    tokensStoreMock = {
      historyTokens: [],
      addPendingToken: vi.fn(),
    };
    nostrStoreMock = {
      pubkey: "deadbeef",
      nprofile: "nprofile-target",
      signer: {},
      initSignerIfNotSet: vi.fn().mockResolvedValue(undefined),
      sendNip17DirectMessageToNprofile: vi
        .fn()
        .mockResolvedValue(undefined),
    };
    mintsStoreMock = {
      activeUnit: "sat",
      activeUnitCurrencyMultiplyer: 2,
      activeMintUrl: "https://active.mint",
      mints: [{ url: "https://from.mint", units: ["sat", "usd"] }],
      activeMint: vi.fn(() => ({ units: ["sat", "usd"] })),
      mintUnitProofs: vi.fn(() => [{ bucketId: "bucket-1" }]),
    };
    proofsStoreMock = {
      sumProofs: vi.fn(() => 100),
    };
    tokenDecodeMock.mockImplementation((tokenStr: string) => ({
      token: tokenStr,
      proofs: [
        { amount: 60, bucketId: DEFAULT_BUCKET_ID },
        { amount: 40, bucketId: DEFAULT_BUCKET_ID },
      ],
    }));
    tokenGetProofsMock.mockImplementation((decoded: any) => decoded.proofs);
    tokenGetMintMock.mockReturnValue("https://mint.test");
    tokenGetUnitMock.mockReturnValue("sat");
    global.fetch = vi.fn();
    localStorage.clear();
  });

  describe("useSendTokensStore", () => {
    it("clearSendData resets fields and anonymous flag", () => {
      const store = useSendTokensStore();
      store.sendData.amount = 123;
      store.sendData.memo = "memo";
      store.sendData.tokens = "token";
      store.sendData.tokensBase64 = "base64";
      store.sendData.p2pkPubkey = "pub";
      store.sendData.locktime = 10;
      store.sendData.paymentRequest = {} as any;
      store.sendData.historyToken = {} as any;
      store.sendData.bucketId = "custom";
      store.sendData.anonymous = true;
      store.recipientPubkey = "recipient";
      store.sendViaNostr = true;

      store.clearSendData();

      expect(store.sendData.amount).toBeNull();
      expect(store.sendData.historyAmount).toBeNull();
      expect(store.sendData.memo).toBe("");
      expect(store.sendData.tokens).toBe("");
      expect(store.sendData.tokensBase64).toBe("");
      expect(store.sendData.p2pkPubkey).toBe("");
      expect(store.sendData.locktime).toBeNull();
      expect(store.sendData.paymentRequest).toBeUndefined();
      expect(store.sendData.historyToken).toBeUndefined();
      expect(store.sendData.bucketId).toBe(DEFAULT_BUCKET_ID);
      expect(store.sendData.anonymous).toBe(false);
      expect(store.recipientPubkey).toBe("");
      expect(store.sendViaNostr).toBe(false);
    });
  });

  describe("useNPCStore", () => {
    it("updates lightning address info and local storage", async () => {
      const store = useNPCStore();
      store.npcEnabled = true;
      store.npcDomain = "npub.cash";
      const getInfoSpy = vi
        .spyOn(store, "getInfo")
        .mockResolvedValue({
          error: "",
          mintUrl: "",
          npub: "",
          username: "alice",
        });
      store.generateNip98Event = vi.fn().mockResolvedValue("auth");

      const promise = store.generateNPCConnection();
      expect(store.npcLoading).toBe(true);
      await promise;

      expect(store.npcLoading).toBe(false);
      expect(getInfoSpy).toHaveBeenCalled();
      expect(store.npcAddress).toBe("alice@npub.cash");
      expect(store.baseURL).toBe("https://npub.cash");
      expect(localStorage.getItem("cashu.npc.address")).toBe("alice@npub.cash");
      expect(localStorage.getItem("cashu.npc.baseURL")).toBe(
        "https://npub.cash",
      );
      expect(notifyMock.notifySuccess).toHaveBeenCalledWith("Logged in as alice");
    });

    it("claims all tokens via redemption queue when enabled", async () => {
      const store = useNPCStore();
      store.npcEnabled = true;
      store.automaticClaim = true;
      vi.spyOn(store, "getBalance").mockResolvedValue(50);
      vi.spyOn(store, "getClaim").mockResolvedValue("token-123");
      const addPendingSpy = vi.spyOn(store, "addPendingTokenToHistory");

      await store.claimAllTokens();

      expect(store.getBalance).toHaveBeenCalled();
      expect(addPendingSpy).toHaveBeenCalledWith("token-123");
      expect(receiveStoreMock.receiveData.tokensBase64).toBe("token-123");
      expect(receiveStoreMock.enqueue).toHaveBeenCalledTimes(1);
      expect(walletStoreMock.redeem).toHaveBeenCalledWith("token-123");
      expect(receiveStoreMock.showReceiveTokens).toBe(false);
      expect(notifyMock.notifySuccess).toHaveBeenCalledWith(
        "You have 50 sats on npub.cash",
      );
    });

    it("avoids adding duplicate history tokens", () => {
      const store = useNPCStore();
      tokensStoreMock.historyTokens = [{ token: "duplicate" }];
      receiveStoreMock.showReceiveTokens = true;

      store.addPendingTokenToHistory("duplicate");

      expect(notifyMock.notifySuccess).toHaveBeenCalledWith(
        "Ecash already in history",
      );
      expect(tokensStoreMock.addPendingToken).not.toHaveBeenCalled();
      expect(receiveStoreMock.showReceiveTokens).toBe(false);
    });

    it("adds pending token metadata for new claims", () => {
      const store = useNPCStore();
      receiveStoreMock.receiveData.description = "pending description";

      store.addPendingTokenToHistory("new-token");

      expect(tokensStoreMock.addPendingToken).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100,
          tokenStr: "new-token",
          mint: "https://mint.test",
          unit: "sat",
          description: "pending description",
          bucketId: DEFAULT_BUCKET_ID,
        }),
      );
      expect(receiveStoreMock.showReceiveTokens).toBe(false);
      expect(notifyMock.notifySuccess).not.toHaveBeenCalled();
    });
  });

  describe("usePRStore", () => {
    it("creates payment requests with nostr transport fallback", () => {
      const store = usePRStore();
      const encoded = store.createPaymentRequest(
        500,
        "memo text",
        "https://provided.mint",
      );

      expect(encoded).toBe("encoded-mock");
      expect(paymentRequestConstructorCalls).toHaveLength(1);
      const call = paymentRequestConstructorCalls[0];
      expect(call.transport).toEqual([
        {
          type: PaymentRequestTransportType.NOSTR,
          target: nostrStoreMock.nprofile,
          tags: [["n", "17"]],
        },
      ]);
      expect(call.id).toBe("mock");
      expect(call.amount).toBe(500);
      expect(call.unit).toBe("sat");
      expect(call.mints).toEqual(["https://active.mint"]);
      expect(call.memo).toBe("memo text");
    });

    it("decodes payment requests and primes send dialog", async () => {
      const sendStore = useSendTokensStore();
      sendStore.showSendTokens = false;
      const clearSpy = vi.spyOn(sendStore, "clearSendData");
      mintsStoreMock.mints = [
        { url: "https://from.mint", units: ["sat", "usd"] },
        { url: "https://known-mint.com", units: ["usd"] },
      ];
      mintsStoreMock.activeMint = vi.fn(() => ({ units: ["usd", "sat"] }));
      decodePaymentRequestMock.mockImplementationOnce(() =>
        new PaymentRequest(
          [],
          "decoded-id",
          400,
          "usd",
          ["https://known-mint.com"],
          undefined,
        ),
      );

      const store = usePRStore();
      await store.decodePaymentRequest("encoded-request");

      expect(decodePaymentRequestMock).toHaveBeenCalledWith("encoded-request");
      expect(clearSpy).toHaveBeenCalled();
      expect(sendStore.sendData.paymentRequest?.id).toBe("decoded-id");
      expect(sendStore.sendData.amount).toBe(200);
      expect(sendStore.showSendTokens).toBe(true);
      expect(mintsStoreMock.activeMintUrl).toBe("https://known-mint.com");
      expect(mintsStoreMock.activeUnit).toBe("usd");
      expect(notifyMock.notifyError).not.toHaveBeenCalled();
    });

    it("falls back to POST transport when NOSTR is unavailable", async () => {
      const store = usePRStore();
      const postTransport = {
        type: PaymentRequestTransportType.POST,
        target: "https://endpoint",
      };
      const request = {
        id: "req-1",
        transport: [{ type: "unsupported", target: "" }, postTransport],
      } as any;
      const payPostSpy = vi.spyOn(store, "payPostPaymentRequest");
      const payNostrSpy = vi.spyOn(store, "payNostrPaymentRequest");
      (global.fetch as any) = vi.fn().mockResolvedValue({ ok: true, statusText: "OK" });

      await store.parseAndPayPaymentRequest(request, "token-str");

      expect(payNostrSpy).not.toHaveBeenCalled();
      expect(payPostSpy).toHaveBeenCalledWith(
        request,
        postTransport,
        "token-str",
      );
      expect(global.fetch).toHaveBeenCalledWith("https://endpoint", expect.any(Object));
      expect(notifyMock.notifySuccess).toHaveBeenCalledWith("Payment sent");
    });

    it("notifies when POST transport fails", async () => {
      const store = usePRStore();
      (global.fetch as any) = vi
        .fn()
        .mockResolvedValue({ ok: false, statusText: "Bad", json: vi.fn() });

      await store.payPostPaymentRequest(
        { id: "req", unit: "sat" } as any,
        { type: PaymentRequestTransportType.POST, target: "https://endpoint" },
        "token-str",
      );

      expect(notifyMock.notifyError).toHaveBeenCalledWith(
        "Could not pay request",
      );
    });

    it("surfaces nostr errors while still notifying success", async () => {
      const store = usePRStore();
      nostrStoreMock.sendNip17DirectMessageToNprofile = vi
        .fn()
        .mockRejectedValue(new Error("fail"));

      await store.payNostrPaymentRequest(
        { id: "req", unit: "sat" } as any,
        { type: PaymentRequestTransportType.NOSTR, target: "nostr-target" },
        "token-str",
      );

      expect(notifyMock.notifyError).toHaveBeenCalledWith(
        "Could not pay request",
      );
      expect(notifyMock.notifySuccess).toHaveBeenCalledWith("Payment sent");
    });
  });

  describe("useSwapStore", () => {
    it("prevents concurrent swaps and warns user", async () => {
      const store = useSwapStore();
      store.swapBlocking = true;

      await store.mintAmountSwap({
        fromUrl: "from-url",
        toUrl: "to-url",
        amount: 1,
      });

      expect(notifyMock.notifyWarning).toHaveBeenCalledWith(
        "swap.in_progress_warning_text",
      );
      expect(walletStoreMock.requestMint).not.toHaveBeenCalled();
    });

    it("validates swap data before starting", async () => {
      const store = useSwapStore();

      await store.mintAmountSwap({
        fromUrl: undefined as any,
        toUrl: "to-url",
        amount: 1,
      });

      expect(notifyMock.notifyError).toHaveBeenCalledWith(
        "swap.invalid_swap_data_error_text",
      );
      expect(store.swapBlocking).toBe(false);
    });

    it("executes swap workflow and resets blocking flag", async () => {
      const store = useSwapStore();
      const fromWallet = {
        unit: "sat",
        getFeesForProofs: vi.fn().mockReturnValue(1),
      };
      const toWallet = {
        unit: "sat",
        getFeesForProofs: vi.fn().mockReturnValue(0),
      };
      walletStoreMock.mintWallet = vi.fn((url: string) =>
        url === "from-url" ? fromWallet : toWallet,
      );
      mintsStoreMock.mints = [
        { url: "from-url", units: ["sat"] },
        { url: "other", units: ["sat"] },
      ];
      mintsStoreMock.mintUnitProofs = vi.fn(() => [{ bucketId: "bucket-9" }]);
      walletStoreMock.requestMint = vi.fn(async () => {
        expect(store.swapBlocking).toBe(true);
        return { request: { invoice: "invoice" }, quote: "quote-id" };
      });

      await store.mintAmountSwap({
        fromUrl: "from-url",
        toUrl: "to-url",
        amount: 25,
      });

      expect(walletStoreMock.requestMint).toHaveBeenCalledWith(
        25,
        toWallet,
      );
      expect(walletStoreMock.meltQuote).toHaveBeenCalledWith(
        fromWallet,
        { invoice: "invoice" },
      );
      expect(walletStoreMock.melt).toHaveBeenCalledWith(
        [{ bucketId: "bucket-9" }],
        "melt-quote",
        fromWallet,
      );
      expect(walletStoreMock.checkInvoice).toHaveBeenCalledWith(
        "quote-id",
        true,
        true,
        "bucket-9",
      );
      expect(store.swapBlocking).toBe(false);
      expect(notifyMock.notifyError).not.toHaveBeenCalledWith(
        "swap.swap_error_text",
      );
    });

    it("handles swap errors and clears blocking state", async () => {
      const store = useSwapStore();
      walletStoreMock.requestMint = vi.fn().mockRejectedValue(new Error("fail"));

      await store.mintAmountSwap({
        fromUrl: "from-url",
        toUrl: "to-url",
        amount: 5,
      });

      expect(notifyMock.notifyError).toHaveBeenCalledWith(
        "swap.swap_error_text",
      );
      expect(store.swapBlocking).toBe(false);
    });

    it("warns when melting proofs while swap is blocking", async () => {
      const store = useSwapStore();
      store.swapBlocking = true;

      await store.meltProofsToMint({} as any, { url: "mint" } as any);

      expect(notifyMock.notifyWarning).toHaveBeenCalledWith(
        "swap.in_progress_warning_text",
      );
    });

    it("melts proofs to mint and resets blocking flag", async () => {
      const store = useSwapStore();
      notifyMock.notifyWarning.mockClear();
      const fromWallet = {
        unit: "sat",
        getFeesForProofs: vi.fn().mockReturnValue(5),
      };
      const toWallet = {
        unit: "sat",
        getFeesForProofs: vi.fn().mockReturnValue(0),
      };
      walletStoreMock.mintWallet = vi.fn((url: string) =>
        url === "from-url" ? fromWallet : toWallet,
      );
      tokenGetMintMock.mockReturnValueOnce("from-url");
      tokenGetUnitMock.mockReturnValueOnce("sat");
      const proofs = [{ amount: 80, bucketId: "bucket-2" }];
      tokenGetProofsMock.mockImplementationOnce(() => proofs);
      tokenGetProofsMock.mockImplementationOnce(() => proofs);
      proofsStoreMock.sumProofs = vi.fn(() => 80);
      walletStoreMock.requestMint = vi.fn().mockResolvedValue({
        request: { invoice: "invoice" },
        quote: "quote-id",
      });

      await store.meltProofsToMint({} as any, { url: "mint-b" } as any);

      expect(walletStoreMock.requestMint).toHaveBeenCalled();
      expect(walletStoreMock.meltQuote).toHaveBeenCalled();
      expect(walletStoreMock.melt).toHaveBeenCalledWith(
        [{ amount: 80, bucketId: "bucket-2" }],
        "melt-quote",
        fromWallet,
      );
      expect(walletStoreMock.checkInvoice).toHaveBeenCalledWith(
        "quote-id",
        true,
        true,
        "bucket-2",
      );
      expect(store.swapBlocking).toBe(false);
      expect(notifyMock.notifyError).not.toHaveBeenCalledWith(
        "swap.swap_error_text",
      );
    });

    it("reports errors when melting proofs fails", async () => {
      const store = useSwapStore();
      walletStoreMock.requestMint = vi
        .fn()
        .mockRejectedValue(new Error("fail"));
      tokenGetMintMock.mockReturnValueOnce("from-url");

      await store.meltProofsToMint({} as any, { url: "mint-b" } as any);

      expect(notifyMock.notifyError).toHaveBeenCalledWith(
        "swap.swap_error_text",
      );
      expect(store.swapBlocking).toBe(false);
    });
  });
});
const notifyMock = notifyModule as {
  notify: ReturnType<typeof vi.fn>;
  notifyError: ReturnType<typeof vi.fn>;
  notifySuccess: ReturnType<typeof vi.fn>;
  notifyWarning: ReturnType<typeof vi.fn>;
  notifyApiError: ReturnType<typeof vi.fn>;
};

