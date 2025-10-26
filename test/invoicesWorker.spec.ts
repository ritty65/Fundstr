import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useInvoicesWorkerStore } from "stores/invoicesWorker";

const walletStoreMock: any = {};
const invoiceHistoryStoreMock: any = {};
const settingsStoreMock: any = {};
const localStorageMap = new Map<string, any>();

vi.mock("stores/wallet", () => ({
  useWalletStore: () => walletStoreMock,
}));

vi.mock("stores/invoiceHistory", () => ({
  useInvoiceHistoryStore: () => invoiceHistoryStoreMock,
}));

vi.mock("stores/settings", () => ({
  useSettingsStore: () => settingsStoreMock,
}));

vi.mock("@vueuse/core", () => ({
  useLocalStorage: vi.fn((key: string, initial: any) => {
    if (!localStorageMap.has(key)) {
      if (Array.isArray(initial)) {
        localStorageMap.set(key, [...initial]);
      } else if (typeof initial === "object" && initial !== null) {
        localStorageMap.set(key, { ...initial });
      } else {
        localStorageMap.set(key, initial);
      }
    }
    return localStorageMap.get(key);
  }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  localStorageMap.clear();
  walletStoreMock.checkInvoice = vi.fn(async () => {});
  walletStoreMock.mintOnPaid = vi.fn(async () => {});
  invoiceHistoryStoreMock.invoiceHistory = [];
  settingsStoreMock.periodicallyCheckIncomingInvoices = true;
  settingsStoreMock.checkInvoicesOnStartup = true;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("invoicesWorker", () => {
  it("starts and stops the invoice checker interval", async () => {
    const store = useInvoicesWorkerStore();
    const processSpy = vi
      .spyOn(store, "processQuotes")
      .mockImplementation(async () => {});

    store.startInvoiceCheckerWorker();

    expect(store.invoiceCheckListener).not.toBeNull();
    expect(store.invoiceWorkerRunning).toBe(true);

    await vi.runOnlyPendingTimersAsync();
    expect(processSpy).toHaveBeenCalledTimes(1);

    store.stopInvoiceCheckerWorker();
    expect(store.invoiceCheckListener).toBeNull();
    expect(store.invoiceWorkerRunning).toBe(false);
  });

  it("does not process quotes when within the global interval", async () => {
    const store = useInvoicesWorkerStore();
    const now = Date.now();
    store.quotes.push({
      quote: "quote-1",
      addedAt: now - 1000,
      lastChecked: 0,
      checkCount: 0,
    });
    store.lastInvoiceCheckTime = now - store.checkInterval + 100;

    await store.processQuotes();

    expect(walletStoreMock.checkInvoice).not.toHaveBeenCalled();
  });

  it("checks the next due quote when the interval has passed", async () => {
    const store = useInvoicesWorkerStore();
    const now = Date.now();
    store.quotes.push({
      quote: "quote-2",
      addedAt: now - 1000,
      lastChecked: 0,
      checkCount: 0,
    });
    store.lastInvoiceCheckTime = 0;

    await store.processQuotes();

    expect(walletStoreMock.checkInvoice).toHaveBeenCalledWith("quote-2", false);
    expect(store.quotes.length).toBe(0);
    expect(store.lastInvoiceCheckTime).toBe(now);
  });
});
