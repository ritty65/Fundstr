import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useWalletStore } from "stores/wallet";
import type { MintQuoteResponse } from "@cashu/cashu-ts";

const {
  settingsStoreMock,
  invoicesWorkerStoreMock,
  workersStoreMock,
  invoiceHistoryStoreMock,
  mintsStoreMock,
  uiStoreMock,
  notifySuccessMock,
  notifyApiErrorMock,
} = vi.hoisted(() => ({
  settingsStoreMock: {
    checkIncomingInvoices: true,
    periodicallyCheckIncomingInvoices: false,
    useWebsockets: true,
  },
  invoicesWorkerStoreMock: {
    addInvoiceToChecker: vi.fn(),
  },
  workersStoreMock: {
    invoiceCheckWorker: vi.fn(),
  },
  invoiceHistoryStoreMock: {
    invoiceHistory: [] as any[],
  },
  mintsStoreMock: {
    mints: [] as any[],
  },
  uiStoreMock: {
    triggerActivityOrb: vi.fn(),
    vibrate: vi.fn(),
    formatCurrency: vi.fn(),
    showInvoiceDetails: true,
  },
  notifySuccessMock: vi.fn(),
  notifyApiErrorMock: vi.fn(),
}));

vi.mock("stores/settings", () => ({
  useSettingsStore: () => settingsStoreMock,
}));

vi.mock("stores/invoicesWorker", () => ({
  useInvoicesWorkerStore: () => invoicesWorkerStoreMock,
}));

vi.mock("stores/workers", () => ({
  useWorkersStore: () => workersStoreMock,
}));

vi.mock("stores/invoiceHistory", () => ({
  useInvoiceHistoryStore: () => invoiceHistoryStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => uiStoreMock,
}));

vi.mock("src/js/notify", () => ({
  notifySuccess: (...args: any[]) => notifySuccessMock(...args),
  notifyApiError: (...args: any[]) => notifyApiErrorMock(...args),
  notifyWarning: vi.fn(),
  notifyError: vi.fn(),
  notify: vi.fn(),
}));

describe("wallet-store mintOnPaid", () => {
  const quote = "quote-123";
  const invoice = {
    quote,
    amount: 42,
    mint: "https://mint.example",
    unit: "sat",
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());

    settingsStoreMock.checkIncomingInvoices = true;
    settingsStoreMock.periodicallyCheckIncomingInvoices = false;
    settingsStoreMock.useWebsockets = true;

    invoicesWorkerStoreMock.addInvoiceToChecker.mockReset();
    workersStoreMock.invoiceCheckWorker.mockReset();

    invoiceHistoryStoreMock.invoiceHistory = [{ ...invoice }];

    mintsStoreMock.mints = [
      {
        url: invoice.mint,
        info: {
          nuts: {
            17: {
              supported: [],
            },
          },
        },
      },
    ];

    uiStoreMock.triggerActivityOrb.mockReset();
    uiStoreMock.vibrate.mockReset();
    uiStoreMock.formatCurrency.mockReset();
    uiStoreMock.showInvoiceDetails = true;
    uiStoreMock.formatCurrency.mockImplementation((value: number, unit: string) => `${value} ${unit}`);

    notifySuccessMock.mockReset();
    notifyApiErrorMock.mockReset();
  });

  it("returns early when incoming invoice checks are disabled", async () => {
    settingsStoreMock.checkIncomingInvoices = false;
    const wallet = useWalletStore();
    wallet.t = ((key: string) => key) as typeof wallet.t;

    const mintWalletSpy = vi.spyOn(wallet, "mintWallet").mockReturnValue({
      onMintQuotePaid: vi.fn(),
    } as any);

    await wallet.mintOnPaid(quote);

    expect(invoicesWorkerStoreMock.addInvoiceToChecker).not.toHaveBeenCalled();
    expect(workersStoreMock.invoiceCheckWorker).not.toHaveBeenCalled();
    expect(mintWalletSpy).not.toHaveBeenCalled();
  });

  it("adds the invoice to the periodic checker before establishing websockets", async () => {
    settingsStoreMock.periodicallyCheckIncomingInvoices = true;
    const wallet = useWalletStore();
    wallet.t = ((key: string) => key) as typeof wallet.t;

    const unsubMock = vi.fn();
    const mintWalletOnMintQuotePaidMock = vi.fn().mockResolvedValue(unsubMock);

    const mintWalletSpy = vi
      .spyOn(wallet, "mintWallet")
      .mockReturnValue({ onMintQuotePaid: mintWalletOnMintQuotePaidMock } as any);

    mintsStoreMock.mints[0].info.nuts[17].supported = [
      {
        method: "bolt11",
        unit: invoice.unit,
        commands: ["bolt11_mint_quote"],
      },
    ];

    await wallet.mintOnPaid(quote);

    expect(invoicesWorkerStoreMock.addInvoiceToChecker).toHaveBeenCalledWith(quote);
    expect(mintWalletOnMintQuotePaidMock).toHaveBeenCalledTimes(1);
    const checkerOrder = invoicesWorkerStoreMock.addInvoiceToChecker.mock.invocationCallOrder[0];
    const websocketOrder = mintWalletOnMintQuotePaidMock.mock.invocationCallOrder[0];
    expect(checkerOrder).toBeLessThan(websocketOrder);
    expect(workersStoreMock.invoiceCheckWorker).not.toHaveBeenCalled();
    expect(mintWalletSpy).toHaveBeenCalledWith(invoice.mint, invoice.unit);
  });

  it.each([
    {
      description: "disabled via settings",
      configure: () => {
        settingsStoreMock.useWebsockets = false;
        mintsStoreMock.mints[0].info.nuts[17].supported = [
          {
            method: "bolt11",
            unit: invoice.unit,
            commands: ["bolt11_mint_quote"],
          },
        ];
      },
    },
    {
      description: "missing NUT-17 support",
      configure: () => {
        settingsStoreMock.useWebsockets = true;
        mintsStoreMock.mints[0].info.nuts[17].supported = [
          {
            method: "bolt11",
            unit: invoice.unit,
            commands: ["proof_state"],
          },
        ];
      },
    },
  ])("schedules worker checks when websockets are unsupported (%s)", async ({ configure }) => {
    configure();
    const wallet = useWalletStore();
    wallet.t = ((key: string) => key) as typeof wallet.t;

    const mintWalletOnMintQuotePaidMock = vi.fn();
    vi
      .spyOn(wallet, "mintWallet")
      .mockReturnValue({ onMintQuotePaid: mintWalletOnMintQuotePaidMock } as any);

    await wallet.mintOnPaid(quote);

    expect(workersStoreMock.invoiceCheckWorker).toHaveBeenCalledWith(quote);
    expect(invoicesWorkerStoreMock.addInvoiceToChecker).not.toHaveBeenCalled();
    expect(mintWalletOnMintQuotePaidMock).not.toHaveBeenCalled();
    expect(wallet.activeWebsocketConnections).toBe(0);
  });

  it("tracks websocket connections and handles successful payments", async () => {
    const wallet = useWalletStore();
    wallet.t = ((key: string, params?: Record<string, any>) => `${key}:${params?.amount}`) as typeof wallet.t;

    const proofs = [{ secret: "p1" }];
    const walletMintMock = vi.fn().mockResolvedValue(proofs);
    wallet.mint = walletMintMock as any;

    const unsubMock = vi.fn();
    let connectionCountDuringSubscription = 0;

    let successHandler: ((response: MintQuoteResponse) => Promise<any>) | undefined;
    let errorHandler: ((error: any) => Promise<any>) | undefined;

    const mintWalletOnMintQuotePaidMock = vi.fn().mockImplementation(
      async (
        quoteArg: string,
        onSuccess: (response: MintQuoteResponse) => Promise<any>,
        onError: (error: any) => Promise<any>,
      ) => {
        expect(quoteArg).toBe(quote);
        connectionCountDuringSubscription = wallet.activeWebsocketConnections;
        successHandler = onSuccess;
        errorHandler = onError;
        queueMicrotask(async () => {
          await successHandler?.({} as MintQuoteResponse);
        });
        return unsubMock;
      },
    );

    vi.spyOn(wallet, "mintWallet").mockReturnValue({
      onMintQuotePaid: mintWalletOnMintQuotePaidMock,
    } as any);

    mintsStoreMock.mints[0].info.nuts[17].supported = [
      {
        method: "bolt11",
        unit: invoice.unit,
        commands: ["bolt11_mint_quote"],
      },
    ];

    await wallet.mintOnPaid(quote);
    await Promise.resolve();
    await Promise.resolve();

    expect(connectionCountDuringSubscription).toBe(1);
    expect(wallet.activeWebsocketConnections).toBe(0);
    expect(workersStoreMock.invoiceCheckWorker).toHaveBeenCalledWith(quote);
    expect(uiStoreMock.triggerActivityOrb).toHaveBeenCalledTimes(1);
    expect(walletMintMock).toHaveBeenCalledWith(invoice, false);
    expect(uiStoreMock.showInvoiceDetails).toBe(false);
    expect(uiStoreMock.vibrate).toHaveBeenCalledTimes(1);
    expect(notifySuccessMock).toHaveBeenCalledWith(
      "wallet.notifications.received_lightning:42 sat",
    );
    expect(unsubMock).toHaveBeenCalledTimes(1);
    expect(errorHandler).toBeDefined();
  });

  it("surfaces websocket errors when verbose", async () => {
    const wallet = useWalletStore();
    wallet.t = ((key: string) => key) as typeof wallet.t;

    const unsubMock = vi.fn();
    let capturedErrorHandler: ((error: any) => Promise<any>) | undefined;

    const mintWalletOnMintQuotePaidMock = vi.fn().mockImplementation(
      async (
        quoteArg: string,
        _onSuccess: (response: MintQuoteResponse) => Promise<any>,
        onError: (error: any) => Promise<any>,
      ) => {
        expect(quoteArg).toBe(quote);
        capturedErrorHandler = onError;
        return unsubMock;
      },
    );

    vi.spyOn(wallet, "mintWallet").mockReturnValue({
      onMintQuotePaid: mintWalletOnMintQuotePaidMock,
    } as any);

    mintsStoreMock.mints[0].info.nuts[17].supported = [
      {
        method: "bolt11",
        unit: invoice.unit,
        commands: ["bolt11_mint_quote"],
      },
    ];

    await wallet.mintOnPaid(quote, true);

    const error = new Error("ws-failure");
    await expect(capturedErrorHandler?.(error)).rejects.toBe(error);
    expect(notifyApiErrorMock).toHaveBeenCalledWith(error);
    expect(wallet.activeWebsocketConnections).toBe(0);
  });
});
