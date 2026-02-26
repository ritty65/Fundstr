import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWalletStore } from "stores/wallet";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { MeltQuoteState } from "@cashu/cashu-ts";

const {
  proofsStoreMock,
  invoiceHistoryStoreMock,
  tokenStoreMock,
  uiStoreMock,
  signerStoreMock,
  notifySuccessMock,
  notifyApiErrorMock,
  notifyWarningMock,
  notifyMock,
} = vi.hoisted(() => ({
  proofsStoreMock: {
    setReserved: vi.fn(),
    addProofs: vi.fn(),
    removeProofs: vi.fn(),
    sumProofs: vi.fn(),
    serializeProofs: vi.fn(),
  },
  invoiceHistoryStoreMock: {
    invoiceHistory: [] as any[],
    addOutgoingPendingInvoiceToHistory: vi.fn(),
    removeOutgoingInvoiceFromHistory: vi.fn(),
    updateOutgoingInvoiceInHistory: vi.fn(),
  },
  tokenStoreMock: {
    addPaidToken: vi.fn(),
  },
  uiStoreMock: {
    lockMutex: vi.fn(),
    unlockMutex: vi.fn(),
    triggerActivityOrb: vi.fn(),
    vibrate: vi.fn(),
    formatCurrency: vi.fn(),
  },
  signerStoreMock: {
    reset: vi.fn(),
  },
  notifySuccessMock: vi.fn(),
  notifyApiErrorMock: vi.fn(),
  notifyWarningMock: vi.fn(),
  notifyMock: vi.fn(),
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => proofsStoreMock,
}));

vi.mock("stores/invoiceHistory", () => ({
  useInvoiceHistoryStore: () => invoiceHistoryStoreMock,
}));

vi.mock("stores/tokens", () => ({
  useTokensStore: () => tokenStoreMock,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => uiStoreMock,
}));

vi.mock("stores/signer", () => ({
  useSignerStore: () => signerStoreMock,
}));

vi.mock("src/js/notify", () => ({
  notifySuccess: (...args: any[]) => notifySuccessMock(...args),
  notifyApiError: (...args: any[]) => notifyApiErrorMock(...args),
  notifyWarning: (...args: any[]) => notifyWarningMock(...args),
  notifyError: vi.fn(),
  notify: (...args: any[]) => notifyMock(...args),
}));

describe("wallet-store melt", () => {
  beforeEach(() => {
    setActivePinia(createPinia());

    proofsStoreMock.setReserved.mockReset();
    proofsStoreMock.addProofs.mockReset();
    proofsStoreMock.removeProofs.mockReset();
    proofsStoreMock.sumProofs.mockReset();
    proofsStoreMock.serializeProofs.mockReset();

    invoiceHistoryStoreMock.invoiceHistory = [];
    invoiceHistoryStoreMock.addOutgoingPendingInvoiceToHistory.mockReset();
    invoiceHistoryStoreMock.removeOutgoingInvoiceFromHistory.mockReset();
    invoiceHistoryStoreMock.updateOutgoingInvoiceInHistory.mockReset();

    tokenStoreMock.addPaidToken.mockReset();

    uiStoreMock.lockMutex.mockReset();
    uiStoreMock.unlockMutex.mockReset();
    uiStoreMock.triggerActivityOrb.mockReset();
    uiStoreMock.vibrate.mockReset();
    uiStoreMock.formatCurrency.mockReset();

    signerStoreMock.reset.mockReset();

    notifySuccessMock.mockReset();
    notifyApiErrorMock.mockReset();
    notifyWarningMock.mockReset();
    notifyMock.mockReset();

    proofsStoreMock.setReserved.mockImplementation(async () => {});
    proofsStoreMock.addProofs.mockImplementation(async () => {});
    proofsStoreMock.removeProofs.mockImplementation(async () => {});
    proofsStoreMock.sumProofs.mockImplementation((proofs?: any[]) =>
      Array.isArray(proofs)
        ? proofs.reduce((sum, proof) => sum + (proof.amount ?? 0), 0)
        : 0,
    );
    proofsStoreMock.serializeProofs.mockImplementation(() => "serialized-proof");

    uiStoreMock.lockMutex.mockImplementation(async () => {});
    uiStoreMock.unlockMutex.mockImplementation(() => {});
    uiStoreMock.triggerActivityOrb.mockImplementation(() => {});
    uiStoreMock.vibrate.mockImplementation(() => {});
    uiStoreMock.formatCurrency.mockImplementation(
      (value: number, unit: string) => `${value} ${unit}`,
    );

    invoiceHistoryStoreMock.addOutgoingPendingInvoiceToHistory.mockImplementation(
      async () => {},
    );
    invoiceHistoryStoreMock.removeOutgoingInvoiceFromHistory.mockImplementation(
      () => {},
    );
    invoiceHistoryStoreMock.updateOutgoingInvoiceInHistory.mockImplementation(
      () => {},
    );

    tokenStoreMock.addPaidToken.mockImplementation(() => {});
    signerStoreMock.reset.mockImplementation(() => {});
  });

  it("processes a successful melt and reconciles proofs, history, and balances", async () => {
    const wallet = useWalletStore();
    wallet.t = ((key: string) => key) as typeof wallet.t;
    wallet.payInvoiceData.invoice = { description: "Test invoice" } as any;

    const sendProofs = [
      {
        amount: 60,
        secret: "s1",
        id: "id-1",
        C: "C1",
        bucketId: DEFAULT_BUCKET_ID,
      },
      {
        amount: 40,
        secret: "s2",
        id: "id-2",
        C: "C2",
        bucketId: DEFAULT_BUCKET_ID,
      },
    ] as any[];

    wallet.send = vi.fn(async () => ({ keepProofs: [], sendProofs }));
    wallet.signP2PKIfNeeded = vi.fn((proofs: any[]) => proofs);
    wallet.getKeyset = vi.fn(() => "keyset-1");
    wallet.keysetCounter = vi.fn(() => 12);
    wallet.increaseKeysetCounter = vi.fn();

    const addPendingSpy = vi
      .spyOn(wallet, "addOutgoingPendingInvoiceToHistory")
      .mockResolvedValue();
    const updateInvoiceSpy = vi
      .spyOn(wallet, "updateOutgoingInvoiceInHistory")
      .mockImplementation(() => {});
    vi.spyOn(wallet, "removeOutgoingInvoiceFromHistory").mockImplementation(
      () => {},
    );

    const changeProofs = [
      {
        amount: 10,
        secret: "c1",
        id: "cid-1",
        C: "CC1",
        bucketId: DEFAULT_BUCKET_ID,
      },
    ] as any[];

    const meltResponse = {
      quote: { state: MeltQuoteState.PAID },
      change: changeProofs,
    };

    const mintWallet = {
      unit: "sat",
      mint: { mintUrl: "https://mint.example" },
      meltProofs: vi.fn().mockResolvedValue(meltResponse),
    } as any;

    const quote = { quote: "quote-123", amount: 100, fee_reserve: 8 } as any;
    const totalChange = changeProofs.reduce((sum, proof) => sum + proof.amount, 0);
    const expectedNet = quote.amount + quote.fee_reserve - totalChange;

    const result = await wallet.melt(sendProofs, quote, mintWallet);

    expect(result).toBe(meltResponse);
    expect(wallet.send).toHaveBeenCalledWith(
      sendProofs,
      mintWallet,
      quote.amount + quote.fee_reserve,
      false,
      true,
      DEFAULT_BUCKET_ID,
    );
    expect(addPendingSpy).toHaveBeenCalledWith(quote);
    expect(proofsStoreMock.setReserved).toHaveBeenCalledWith(
      sendProofs,
      true,
      quote.quote,
    );
    expect(wallet.increaseKeysetCounter).toHaveBeenNthCalledWith(
      1,
      "keyset-1",
      sendProofs.length,
    );
    expect(wallet.increaseKeysetCounter).toHaveBeenNthCalledWith(
      2,
      "keyset-1",
      3,
    );
    expect(uiStoreMock.lockMutex).toHaveBeenCalledTimes(1);
    expect(uiStoreMock.unlockMutex).toHaveBeenCalledTimes(1);
    expect(uiStoreMock.triggerActivityOrb).toHaveBeenCalled();
    expect(mintWallet.meltProofs).toHaveBeenCalledWith(quote, sendProofs, {
      keysetId: "keyset-1",
      counter: 12,
    });
    expect(proofsStoreMock.addProofs).toHaveBeenCalledWith(
      changeProofs,
      undefined,
      DEFAULT_BUCKET_ID,
      "",
    );
    expect(proofsStoreMock.removeProofs).toHaveBeenCalledWith(sendProofs);
    expect(tokenStoreMock.addPaidToken).toHaveBeenCalledWith({
      amount: -expectedNet,
      token: "serialized-proof",
      unit: "sat",
      mint: "https://mint.example",
      label: "",
      description: "Test invoice",
      bucketId: DEFAULT_BUCKET_ID,
    });
    expect(updateInvoiceSpy).toHaveBeenCalledWith(quote, {
      status: "paid",
      amount: -expectedNet,
    });
    expect(signerStoreMock.reset).toHaveBeenCalledTimes(1);
  });

  it("rolls back when melt fails and quote remains unpaid", async () => {
    const wallet = useWalletStore();
    wallet.t = ((key: string) => key) as typeof wallet.t;
    wallet.payInvoiceData.invoice = { description: "Test invoice" } as any;

    const sendProofs = [
      {
        amount: 50,
        secret: "s1",
        id: "id-1",
        C: "C1",
        bucketId: DEFAULT_BUCKET_ID,
      },
    ] as any[];

    wallet.send = vi.fn(async () => ({ keepProofs: [], sendProofs }));
    wallet.signP2PKIfNeeded = vi.fn((proofs: any[]) => proofs);
    wallet.getKeyset = vi.fn(() => "keyset-rollback");
    wallet.keysetCounter = vi.fn(() => 5);
    wallet.increaseKeysetCounter = vi.fn();
    wallet.handleOutputsHaveAlreadyBeenSignedError = vi.fn();

    const addPendingSpy = vi
      .spyOn(wallet, "addOutgoingPendingInvoiceToHistory")
      .mockResolvedValue();
    const updateInvoiceSpy = vi
      .spyOn(wallet, "updateOutgoingInvoiceInHistory")
      .mockImplementation(() => {});
    const removeInvoiceSpy = vi
      .spyOn(wallet, "removeOutgoingInvoiceFromHistory")
      .mockImplementation(() => {});

    const quote = { quote: "quote-rollback", amount: 64, fee_reserve: 4 } as any;
    const meltError = new Error("melt failed");

    const mintWallet = {
      unit: "sat",
      mint: {
        mintUrl: "https://mint.example",
        checkMeltQuote: vi
          .fn()
          .mockResolvedValue({ state: MeltQuoteState.UNPAID }),
      },
      meltProofs: vi.fn().mockRejectedValue(meltError),
    } as any;

    await expect(wallet.melt(sendProofs, quote, mintWallet)).rejects.toThrow(
      meltError,
    );

    expect(addPendingSpy).toHaveBeenCalledWith(quote);
    expect(proofsStoreMock.setReserved).toHaveBeenNthCalledWith(
      1,
      sendProofs,
      true,
      quote.quote,
    );
    expect(proofsStoreMock.setReserved).toHaveBeenNthCalledWith(2, sendProofs, false);
    expect(wallet.increaseKeysetCounter).toHaveBeenNthCalledWith(
      1,
      "keyset-rollback",
      sendProofs.length,
    );
    expect(wallet.increaseKeysetCounter).toHaveBeenNthCalledWith(
      2,
      "keyset-rollback",
      2,
    );
    expect(wallet.increaseKeysetCounter).toHaveBeenNthCalledWith(
      3,
      "keyset-rollback",
      -2,
    );
    expect(mintWallet.mint.checkMeltQuote).toHaveBeenCalledWith(quote.quote);
    expect(removeInvoiceSpy).toHaveBeenCalledWith(quote.quote);
    expect(updateInvoiceSpy).not.toHaveBeenCalled();
    expect(tokenStoreMock.addPaidToken).not.toHaveBeenCalled();
    expect(proofsStoreMock.addProofs).not.toHaveBeenCalled();
    expect(proofsStoreMock.removeProofs).not.toHaveBeenCalled();
    expect(wallet.handleOutputsHaveAlreadyBeenSignedError).toHaveBeenCalledWith(
      "keyset-rollback",
      meltError,
    );
    expect(notifyApiErrorMock).toHaveBeenCalledWith(meltError, "Payment failed");
    expect(uiStoreMock.lockMutex).toHaveBeenCalledTimes(1);
    expect(uiStoreMock.unlockMutex).toHaveBeenCalledTimes(1);
  });
});
