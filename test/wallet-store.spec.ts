import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWalletStore } from "stores/wallet";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { bytesToHex } from "@noble/hashes/utils";
import { getPublicKey } from "@noble/secp256k1";

const axiosGetMock = vi.fn();
vi.mock("axios", () => ({
  default: {
    get: (...args: any[]) => axiosGetMock(...args),
  },
}));

const bech32DecodeMock = vi.fn();
const bech32FromWordsMock = vi.fn();
vi.mock("bech32", () => ({
  bech32: {
    decode: (...args: any[]) => bech32DecodeMock(...args),
    fromWords: (...args: any[]) => bech32FromWordsMock(...args),
  },
}));

const proofsStoreMock: any = {};
const uiStoreMock: any = {};
const receiveStoreMock: any = {};
const prStoreMock: any = {};
const p2pkStoreMock: any = {};
const mintsStoreMock: any = {
  activeUnit: "sat",
  activeMintUrl: "mint",
  mints: [{ url: "mint", keys: [], keysets: [] }],
  activeKeys: [],
  activeKeysets: [],
  mintUnitProofs: () => [],
};
const priceStoreMock: any = { bitcoinPrice: 0 };

const notifyApiErrorMock = vi.fn();
const notifyErrorMock = vi.fn();
const notifyWarningMock = vi.fn();
const notifyMock = vi.fn();

vi.mock("stores/receiveTokensStore", () => ({
  useReceiveTokensStore: () => receiveStoreMock,
}));

vi.mock("stores/payment-request", () => ({
  usePRStore: () => prStoreMock,
}));

vi.mock("stores/p2pk", () => ({
  useP2PKStore: () => p2pkStoreMock,
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => proofsStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => uiStoreMock,
}));

vi.mock("stores/signer", () => ({
  useSignerStore: () => ({ reset: vi.fn(), method: null }),
}));

vi.mock("stores/price", () => ({
  usePriceStore: () => priceStoreMock,
}));

vi.mock("src/js/notify", () => ({
  notifyApiError: (...args: any[]) => notifyApiErrorMock(...args),
  notifyError: (...args: any[]) => notifyErrorMock(...args),
  notifyWarning: (...args: any[]) => notifyWarningMock(...args),
  notify: (...args: any[]) => notifyMock(...args),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  axiosGetMock.mockReset();
  bech32DecodeMock.mockReset();
  bech32FromWordsMock.mockReset();
  notifyApiErrorMock.mockReset();
  notifyErrorMock.mockReset();
  notifyWarningMock.mockReset();
  notifyMock.mockReset();
  setActivePinia(createPinia());
  Object.assign(mintsStoreMock, {
    activeUnit: "sat",
    activeMintUrl: "mint",
    mints: [{ url: "mint", keys: [], keysets: [] }],
    activeKeys: [],
    activeKeysets: [],
    mintUnitProofs: () => [],
  });
  priceStoreMock.bitcoinPrice = 0;
  Object.assign(receiveStoreMock, {
    receiveData: {
      tokensBase64: "",
      p2pkPrivateKey: "",
      bucketId: DEFAULT_BUCKET_ID,
      label: "",
      description: "",
    },
    showReceiveTokens: false,
  });
  Object.assign(prStoreMock, { showPRKData: "" });
  Object.assign(p2pkStoreMock, {
    p2pkKeys: [] as any[],
    isValidPubkey: vi.fn(() => true),
    getPrivateKeyForP2PKEncodedToken: vi.fn(() => "priv"),
    setPrivateKeyUsed: vi.fn(),
  });
  Object.assign(proofsStoreMock, {
    addProofs: vi.fn(),
    removeProofs: vi.fn(),
    setReserved: vi.fn(),
  });
  Object.assign(uiStoreMock, {
    lockMutex: vi.fn(async () => {}),
    unlockMutex: vi.fn(),
  });
  const walletStore = useWalletStore();
  walletStore.$reset?.();
});

describe("wallet store", () => {
  it("calls wallet.send with selected proofs", async () => {
    const walletStore = useWalletStore();
    const proofs = [
      { secret: "s1", amount: 1, id: "a", C: "c1" } as any,
      { secret: "s2", amount: 1, id: "b", C: "c2" } as any,
    ];

    walletStore.spendableProofs = vi.fn(() => proofs);
    walletStore.coinSelect = vi.fn(() => proofs);
    walletStore.signP2PKIfNeeded = vi.fn((p: any) => p);
    walletStore.getKeyset = vi.fn(() => "kid");
    walletStore.keysetCounter = vi.fn(() => 1);
    walletStore.increaseKeysetCounter = vi.fn();

    const wallet = {
      mint: { mintUrl: "mint" },
      unit: "sat",
      getFeesForProofs: vi.fn(() => 0),
      send: vi.fn(async (_a: number, _p: any, _opts: any) => ({
        keep: [],
        send: [],
      })),
    } as any;

    await walletStore.send(proofs, wallet, 1, false, false, DEFAULT_BUCKET_ID);

    expect(wallet.send).toHaveBeenCalledWith(1, proofs, {
      counter: 1,
      keysetId: "kid",
      proofsWeHave: proofs,
    });
    expect(proofsStoreMock.setReserved).toHaveBeenCalled();
  });

  it("retries redeem until attemptRedeem succeeds", async () => {
    const walletStore = useWalletStore();
    const attempt = vi
      .spyOn(walletStore, "attemptRedeem")
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await walletStore.redeem("token");

    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("sets active P2PK pointer and refreshes dependent caches", () => {
    const walletStore = useWalletStore();
    const priv = "1".repeat(64);
    const pub = bytesToHex(getPublicKey(priv, true));

    walletStore.payInvoiceData.bucketId = "custom-bucket" as any;
    walletStore.payInvoiceData.input.request = "pending";
    walletStore.payInvoiceData.meltQuote.payload.request = "old";
    walletStore.payInvoiceData.meltQuote.response.quote = "quoted";
    walletStore.payInvoiceData.meltQuote.response.amount = 42;
    walletStore.payInvoiceData.meltQuote.response.fee_reserve = 2;
    walletStore.payInvoiceData.meltQuote.error = "err";
    walletStore.payInvoiceData.bolt11 = "bolt";
    receiveStoreMock.receiveData.p2pkPrivateKey = "legacy";
    prStoreMock.showPRKData = "encoded";
    p2pkStoreMock.p2pkKeys = [
      { publicKey: pub, privateKey: priv, used: false, usedCount: 0 },
    ];

    walletStore.setActiveP2pk(pub, priv);

    expect(walletStore.activeP2pk.publicKey).toBe(pub);
    expect(walletStore.activeP2pk.privateKey).toBe(priv);
    expect(receiveStoreMock.receiveData.p2pkPrivateKey).toBe(priv);
    expect(walletStore.payInvoiceData.bucketId).toBe("custom-bucket");
    expect(walletStore.payInvoiceData.input.request).toBe("");
    expect(walletStore.payInvoiceData.meltQuote.payload.request).toBe("");
    expect(walletStore.payInvoiceData.meltQuote.response.quote).toBe("");
    expect(walletStore.payInvoiceData.meltQuote.response.amount).toBe(0);
    expect(walletStore.payInvoiceData.meltQuote.response.fee_reserve).toBe(0);
    expect(walletStore.payInvoiceData.meltQuote.error).toBe("");
    expect(walletStore.payInvoiceData.bolt11).toBe("");
    expect(prStoreMock.showPRKData).toBe("");

    walletStore.payInvoiceData.input.request = "again";
    prStoreMock.showPRKData = "again";
    walletStore.setActiveP2pk("", "");

    expect(walletStore.activeP2pk.publicKey).toBe("");
    expect(walletStore.activeP2pk.privateKey).toBe("");
    expect(receiveStoreMock.receiveData.p2pkPrivateKey).toBe("");
    expect(walletStore.payInvoiceData.bucketId).toBe("custom-bucket");
    expect(walletStore.payInvoiceData.input.request).toBe("");
    expect(prStoreMock.showPRKData).toBe("");

    prStoreMock.showPRKData = "again";
    walletStore.setActiveP2pk(pub, "");

    expect(walletStore.activeP2pk.publicKey).toBe(pub);
    expect(walletStore.activeP2pk.privateKey).toBe(priv);
    expect(receiveStoreMock.receiveData.p2pkPrivateKey).toBe(priv);
    expect(prStoreMock.showPRKData).toBe("");
  });

  describe("lnurlPayFirst", () => {
    it("fetches payRequest data for a lightning address", async () => {
      const walletStore = useWalletStore();
      walletStore.t = (key: string) => key;

      const lnurlData = {
        tag: "payRequest",
        callback: "https://lnurl.example/cb",
        minSendable: 1000,
        maxSendable: 2000,
      } as any;
      axiosGetMock.mockResolvedValueOnce({ data: lnurlData });

      await walletStore.lnurlPayFirst("alice@example.com");

      expect(axiosGetMock).toHaveBeenCalledWith(
        "https://example.com/.well-known/lnurlp/alice",
      );
      expect(walletStore.payInvoiceData.lnurlpay).toMatchObject({
        ...lnurlData,
        domain: "example.com",
      });
      expect(walletStore.payInvoiceData.show).toBe(true);
    });

    it("decodes a bech32 LNURL and populates lnurlpay data", async () => {
      const walletStore = useWalletStore();
      walletStore.t = (key: string) => key;

      const host = "https://lnurl.example/.well-known/lnurl";
      const encodedHost = Array.from(new TextEncoder().encode(host));
      bech32DecodeMock.mockReturnValueOnce({ words: [1, 2, 3] });
      bech32FromWordsMock.mockReturnValueOnce(encodedHost);
      const lnurlData = {
        tag: "payRequest",
        callback: "https://lnurl.example/cb",
        minSendable: 2000,
        maxSendable: 4000,
      } as any;
      axiosGetMock.mockResolvedValueOnce({ data: lnurlData });

      await walletStore.lnurlPayFirst("LNURL1EXAMPLE");

      expect(bech32DecodeMock).toHaveBeenCalledWith("LNURL1EXAMPLE", 20000);
      expect(axiosGetMock).toHaveBeenCalledWith(host);
      expect(walletStore.payInvoiceData.lnurlpay).toMatchObject({
        ...lnurlData,
        domain: "lnurl.example",
      });
    });

    it("auto-fills amount when min and max sendable match", async () => {
      const walletStore = useWalletStore();
      walletStore.t = (key: string) => key;

      const lnurlData = {
        tag: "payRequest",
        callback: "https://lnurl.example/cb",
        minSendable: 5000,
        maxSendable: 5000,
      } as any;
      axiosGetMock.mockResolvedValueOnce({ data: lnurlData });

      await walletStore.lnurlPayFirst("bob@example.com");

      expect(walletStore.payInvoiceData.input.amount).toBe(5);
    });

    it("notifies when the host cannot be resolved", async () => {
      const walletStore = useWalletStore();
      walletStore.t = (key: string) => key;

      await walletStore.lnurlPayFirst("not-an-lnurl");

      expect(notifyErrorMock).toHaveBeenCalledWith(
        "wallet.notifications.invalid_lnurl",
        "wallet.notifications.lnurl_error",
      );
    });
  });

  describe("lnurlPaySecond", () => {
    beforeEach(() => {
      const walletStore = useWalletStore();
      walletStore.t = (key: string) => key;
    });

    it("notifies when amount is null", async () => {
      const walletStore = useWalletStore();

      walletStore.payInvoiceData.input.amount = null;

      await walletStore.lnurlPaySecond();

      expect(notifyErrorMock).toHaveBeenCalledWith(
        "wallet.notifications.no_amount",
        "wallet.notifications.lnurl_error",
      );
      expect(axiosGetMock).not.toHaveBeenCalled();
    });

    it("notifies when lnurl data is missing", async () => {
      const walletStore = useWalletStore();

      walletStore.payInvoiceData.input.amount = 1;
      walletStore.payInvoiceData.lnurlpay = null as any;

      await walletStore.lnurlPaySecond();

      expect(notifyErrorMock).toHaveBeenCalledWith(
        "wallet.notifications.no_lnurl_data",
        "wallet.notifications.lnurl_error",
      );
      expect(axiosGetMock).not.toHaveBeenCalled();
    });

    it("converts USD amounts to sats before requesting the invoice", async () => {
      const walletStore = useWalletStore();
      mintsStoreMock.activeUnit = "usd";
      priceStoreMock.bitcoinPrice = 50000;
      walletStore.payInvoiceData.input.amount = 1;
      walletStore.payInvoiceData.lnurlpay = {
        tag: "payRequest",
        minSendable: 1000,
        maxSendable: 1_000_000_000,
        callback: "https://lnurl.example/cb",
      } as any;
      walletStore.decodeRequest = vi.fn();
      axiosGetMock.mockResolvedValueOnce({
        data: { status: "OK", pr: "lnbc1usd" },
      });

      await walletStore.lnurlPaySecond();

      expect(axiosGetMock).toHaveBeenCalledWith(
        "https://lnurl.example/cb?amount=2000000",
      );
      expect(walletStore.decodeRequest).toHaveBeenCalledWith("lnbc1usd");
    });

    it("notifies when the lnurl callback returns an error", async () => {
      const walletStore = useWalletStore();

      walletStore.payInvoiceData.input.amount = 1;
      walletStore.payInvoiceData.lnurlpay = {
        tag: "payRequest",
        minSendable: 1000,
        maxSendable: 2000000,
        callback: "https://lnurl.example/cb",
      } as any;
      axiosGetMock.mockResolvedValueOnce({
        data: { status: "ERROR", reason: "bad" },
      });

      await walletStore.lnurlPaySecond();

      expect(notifyErrorMock).toHaveBeenCalledWith(
        "bad",
        "wallet.notifications.lnurl_error",
      );
      expect(axiosGetMock).toHaveBeenCalledTimes(1);
    });

    it("requests a payment request and decodes it on success", async () => {
      const walletStore = useWalletStore();

      walletStore.payInvoiceData.input.amount = 2;
      walletStore.payInvoiceData.lnurlpay = {
        tag: "payRequest",
        minSendable: 1000,
        maxSendable: 10_000_000,
        callback: "https://lnurl.example/cb",
      } as any;
      walletStore.decodeRequest = vi.fn();
      axiosGetMock.mockResolvedValueOnce({
        data: { status: "OK", pr: "lnbc1invoice" },
      });

      await walletStore.lnurlPaySecond();

      expect(axiosGetMock).toHaveBeenCalledWith(
        "https://lnurl.example/cb?amount=2000",
      );
      expect(walletStore.decodeRequest).toHaveBeenCalledWith("lnbc1invoice");
    });
  });
});
