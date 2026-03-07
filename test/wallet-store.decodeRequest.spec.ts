import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWalletStore } from "stores/wallet";

const uiStoreMock = { closeDialogs: vi.fn() };
const receiveStoreMock = {
  receiveData: {
    tokensBase64: "",
    p2pkPrivateKey: "",
    bucketId: "bucket-id",
    label: "",
    description: "",
  },
  showReceiveTokens: false,
};
const p2pkStoreMock = {
  isValidPubkey: vi.fn(() => false),
};
const mintsStoreMock: { addMintData?: { url: string; nickname: string } } = {};
const prStoreMock = {
  decodePaymentRequest: vi.fn(),
};
const sendTokensStoreMock = {
  sendData: { p2pkPubkey: "" },
  showSendTokens: false,
  showLockInput: false,
};

vi.mock("stores/ui", () => ({
  useUiStore: () => uiStoreMock,
}));

vi.mock("stores/receiveTokensStore", () => ({
  useReceiveTokensStore: () => receiveStoreMock,
}));

vi.mock("stores/p2pk", () => ({
  useP2PKStore: () => p2pkStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("stores/payment-request", () => ({
  usePRStore: () => prStoreMock,
}));

vi.mock("stores/sendTokensStore", () => ({
  useSendTokensStore: () => sendTokensStoreMock,
}));

describe("wallet-store decodeRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());

    receiveStoreMock.receiveData = {
      tokensBase64: "",
      p2pkPrivateKey: "",
      bucketId: "bucket-id",
      label: "",
      description: "",
    };
    receiveStoreMock.showReceiveTokens = false;

    p2pkStoreMock.isValidPubkey.mockReset();
    p2pkStoreMock.isValidPubkey.mockReturnValue(false);

    sendTokensStoreMock.sendData = { p2pkPubkey: "" };
    sendTokensStoreMock.showSendTokens = false;
    sendTokensStoreMock.showLockInput = false;

    mintsStoreMock.addMintData = undefined;
    prStoreMock.decodePaymentRequest.mockReset();
    uiStoreMock.closeDialogs.mockClear();
  });

  it("routes bolt11 strings to handleBolt11Invoice", async () => {
    const wallet = useWalletStore();
    const boltSpy = vi
      .spyOn(wallet, "handleBolt11Invoice")
      .mockResolvedValue(undefined);

    await wallet.decodeRequest("  lnbc123  ");

    expect(wallet.payInvoiceData.input.request).toBe("lnbc123");
    expect(boltSpy).toHaveBeenCalledTimes(1);
    expect(uiStoreMock.closeDialogs).toHaveBeenCalledTimes(1);
  });

  it("strips lightning prefix before handling bolt11 invoices", async () => {
    const wallet = useWalletStore();
    const boltSpy = vi
      .spyOn(wallet, "handleBolt11Invoice")
      .mockResolvedValue(undefined);

    await wallet.decodeRequest("lightning:lnbc321");

    expect(wallet.payInvoiceData.input.request).toBe("lnbc321");
    expect(boltSpy).toHaveBeenCalledTimes(1);
    expect(uiStoreMock.closeDialogs).toHaveBeenCalledTimes(1);
  });

  it("delegates lnurl bech32 strings to lnurlPayFirst", async () => {
    const wallet = useWalletStore();
    const lnurlSpy = vi
      .spyOn(wallet, "lnurlPayFirst")
      .mockResolvedValue(undefined);

    await wallet.decodeRequest("lnurl1examplevalue");

    expect(wallet.payInvoiceData.input.request).toBe("lnurl1examplevalue");
    expect(lnurlSpy).toHaveBeenCalledWith("lnurl1examplevalue");
    expect(uiStoreMock.closeDialogs).toHaveBeenCalledTimes(1);
  });

  it("delegates lightning addresses to lnurlPayFirst", async () => {
    const wallet = useWalletStore();
    const lnurlSpy = vi
      .spyOn(wallet, "lnurlPayFirst")
      .mockResolvedValue(undefined);

    await wallet.decodeRequest("alice@example.com");

    expect(wallet.payInvoiceData.input.request).toBe("alice@example.com");
    expect(lnurlSpy).toHaveBeenCalledWith("alice@example.com");
    expect(uiStoreMock.closeDialogs).toHaveBeenCalledTimes(1);
  });

  it("handles pasted cashu tokens", async () => {
    const wallet = useWalletStore();
    const cashuSpy = vi.spyOn(wallet, "handleCashuToken");

    await wallet.decodeRequest("cashuA1B2");

    expect(cashuSpy).toHaveBeenCalledTimes(1);
    expect(receiveStoreMock.receiveData.tokensBase64).toBe("cashuA1B2");
    expect(receiveStoreMock.showReceiveTokens).toBe(true);
    expect(wallet.payInvoiceData.show).toBe(false);
    expect(uiStoreMock.closeDialogs).toHaveBeenCalledTimes(1);
  });

  it("extracts cashu tokens from URLs", async () => {
    const wallet = useWalletStore();
    const cashuSpy = vi.spyOn(wallet, "handleCashuToken");

    await wallet.decodeRequest("https://example.com#token=cashuXYZ");

    expect(cashuSpy).toHaveBeenCalledTimes(1);
    expect(receiveStoreMock.receiveData.tokensBase64).toBe("cashuXYZ");
    expect(receiveStoreMock.showReceiveTokens).toBe(true);
    expect(uiStoreMock.closeDialogs).toHaveBeenCalledTimes(1);
  });

  it("opens the send dialog for valid P2PK pubkeys", async () => {
    const wallet = useWalletStore();
    p2pkStoreMock.isValidPubkey.mockReturnValueOnce(true);
    const p2pkSpy = vi.spyOn(wallet, "handleP2PK");

    await wallet.decodeRequest("02abcdef");

    expect(p2pkSpy).toHaveBeenCalledWith("02abcdef");
    expect(sendTokensStoreMock.sendData.p2pkPubkey).toBe("02abcdef");
    expect(sendTokensStoreMock.showSendTokens).toBe(true);
    expect(sendTokensStoreMock.showLockInput).toBe(true);
    expect(uiStoreMock.closeDialogs).toHaveBeenCalledTimes(1);
  });

  it("stores http URLs as mint candidates", async () => {
    const wallet = useWalletStore();

    await wallet.decodeRequest("https://mint.fundstr.me");

    expect(mintsStoreMock.addMintData).toEqual({
      url: "https://mint.fundstr.me",
      nickname: "",
    });
    expect(uiStoreMock.closeDialogs).toHaveBeenCalledTimes(1);
  });

  it("decodes cashu payment requests", async () => {
    const wallet = useWalletStore();
    const paymentSpy = vi.spyOn(wallet, "handlePaymentRequest");
    prStoreMock.decodePaymentRequest.mockResolvedValue(undefined);

    await wallet.decodeRequest("creqA123");

    expect(paymentSpy).toHaveBeenCalledWith("creqA123");
    expect(prStoreMock.decodePaymentRequest).toHaveBeenCalledWith("creqA123");
    expect(uiStoreMock.closeDialogs).toHaveBeenCalledTimes(1);
  });
});
