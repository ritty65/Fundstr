import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const hoisted = vi.hoisted(() => {
  const notifySuccess = vi.fn();
  const notifyError = vi.fn();
  const addProofsMock = vi.fn();
  const getProofsMock = vi.fn();
  const bucketsStoreMock: { buckets: unknown } = { buckets: undefined };
  const invoiceHistoryStoreMock: { invoiceHistory: any[] } = {
    invoiceHistory: [],
  };
  const tokensStoreMock: { historyTokens: any[] } = {
    historyTokens: [],
  };
  const walletStoreMock = {};
  const currentDateStr = vi.fn(() => "2024-05-01");
  return {
    notifySuccess,
    notifyError,
    addProofsMock,
    getProofsMock,
    bucketsStoreMock,
    invoiceHistoryStoreMock,
    tokensStoreMock,
    walletStoreMock,
    currentDateStr,
  };
});

vi.mock("src/js/notify", () => ({
  notifySuccess: hoisted.notifySuccess,
  notifyError: hoisted.notifyError,
}));

vi.mock("src/js/utils", () => ({
  currentDateStr: hoisted.currentDateStr,
}));

vi.mock("src/stores/proofs", () => ({
  useProofsStore: vi.fn(() => ({
    addProofs: hoisted.addProofsMock,
    getProofs: hoisted.getProofsMock,
  })),
}));

vi.mock("src/stores/buckets", () => ({
  useBucketsStore: vi.fn(() => hoisted.bucketsStoreMock),
}));

vi.mock("src/stores/invoiceHistory", () => ({
  useInvoiceHistoryStore: vi.fn(() => hoisted.invoiceHistoryStoreMock),
}));

vi.mock("src/stores/tokens", () => ({
  useTokensStore: vi.fn(() => hoisted.tokensStoreMock),
}));

vi.mock("src/stores/wallet", () => ({
  useWalletStore: vi.fn(() => hoisted.walletStoreMock),
}));

import { useStorageStore } from "stores/storage";

const {
  notifySuccess,
  notifyError,
  addProofsMock,
  getProofsMock,
  bucketsStoreMock,
  invoiceHistoryStoreMock,
  tokensStoreMock,
} = hoisted;

const originalLocation = window.location;
let locationReloadSpy: ReturnType<typeof vi.fn>;

const extractDateValue = (value: any): Date => {
  const raw =
    value instanceof Date
      ? value
      : value && typeof value === "object" && "value" in value
        ? (value as any).value
        : value;
  return raw instanceof Date ? raw : new Date(raw);
};

describe("storage store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    notifySuccess.mockReset();
    notifyError.mockReset();
    addProofsMock.mockReset();
    getProofsMock.mockReset();
    bucketsStoreMock.buckets = [];
    invoiceHistoryStoreMock.invoiceHistory = [];
    tokensStoreMock.historyTokens = [];
    locationReloadSpy = vi.fn();
    const locationStub = {
      href: originalLocation.href,
      origin: originalLocation.origin,
      pathname: originalLocation.pathname,
      assign: vi.fn(),
      replace: vi.fn(),
      reload: locationReloadSpy,
      toString: () => originalLocation.toString(),
    } as unknown as Location;
    Object.defineProperty(window, "location", {
      configurable: true,
      enumerable: true,
      value: locationStub,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      enumerable: true,
      value: originalLocation,
    });
  });

  it("restores backup data into stores and reloads", async () => {
    const proofs = [{ id: "p1", amount: 1 }];
    const buckets = [{ id: "b1", name: "Primary" }];
    const backup = {
      "cashu.dexie.db.proofs": JSON.stringify(proofs),
      "cashu.buckets": JSON.stringify(buckets),
      "cashu.settings": "{\"foo\":true}",
    };

    const store = useStorageStore();
    await store.restoreFromBackup(backup);

    expect(addProofsMock).toHaveBeenCalledWith(proofs);
    expect(bucketsStoreMock.buckets).toEqual(buckets);
    expect(localStorage.getItem("cashu.settings")).toBe("{\"foo\":true}");
    expect(notifySuccess).toHaveBeenCalledWith("Backup restored");
    expect(locationReloadSpy).toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("notifies error when backup payload is missing", async () => {
    const store = useStorageStore();
    await store.restoreFromBackup(null);

    expect(notifyError).toHaveBeenCalledWith("Unrecognized Backup Format!");
    expect(notifySuccess).not.toHaveBeenCalled();
    expect(locationReloadSpy).not.toHaveBeenCalled();
  });

  it("exports wallet state with seeded local storage and proofs", async () => {
    localStorage.setItem("cashu.settings.theme", "dark");
    getProofsMock.mockResolvedValue([{ id: "proof-1" }]);

    const downloadLink: any = {
      download: "",
      textContent: "",
      href: "",
      style: {},
      click: vi.fn(),
    };

    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockReturnValue(downloadLink);
    const appendChildSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation(() => downloadLink as unknown as Node);
    const removeChildSpy = vi
      .spyOn(document.body, "removeChild")
      .mockImplementation(() => downloadLink as unknown as Node);
    const originalCreateObjectURL = window.URL.createObjectURL;
    const createObjectURLMock = vi.fn(() => "blob:url");
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    const originalBlob = globalThis.Blob;
    class MockBlob {
      parts: any[];
      options?: BlobPropertyBag;
      constructor(parts: any[], options?: BlobPropertyBag) {
        this.parts = parts;
        this.options = options;
      }
    }
    Object.defineProperty(globalThis, "Blob", {
      configurable: true,
      writable: true,
      value: MockBlob as unknown as typeof Blob,
    });

    const store = useStorageStore();
    await store.exportWalletState();

    expect(getProofsMock).toHaveBeenCalled();
    expect(createElementSpy).toHaveBeenCalledWith("a");
    expect(appendChildSpy).toHaveBeenCalledWith(downloadLink);
    expect(downloadLink.download).toBe("cashu_me_backup_2024-05-01.json");
    expect(downloadLink.href).toBe("blob:url");
    expect(downloadLink.click).toHaveBeenCalled();
    expect(notifySuccess).toHaveBeenCalledWith("Wallet backup exported");

    const blobArg = createObjectURLMock.mock.calls[0][0] as any;
    const serialized = JSON.parse(blobArg.parts.join(""));
    expect(serialized["cashu.settings.theme"]).toBe("dark");
    expect(serialized["cashu.dexie.db.proofs"]).toBe(
      JSON.stringify([{ id: "proof-1" }]),
    );

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    Object.defineProperty(window.URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL,
    });
    Object.defineProperty(globalThis, "Blob", {
      configurable: true,
      writable: true,
      value: originalBlob,
    });
  });

  it("handles local storage quota overflow and cleans up history", async () => {
    const store = useStorageStore();
    const failingSetItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("Quota exceeded");
      });

    const needsCleanup = store.checkLocalStorageQuota();
    expect(needsCleanup).toBe(true);
    expect(failingSetItem).toHaveBeenCalledWith(
      "cashu.test",
      expect.any(String),
    );
    expect(notifyError).toHaveBeenCalledWith(
      "Local storage quota exceeded. Clean up your local storage.",
    );

    failingSetItem.mockRestore();

    localStorage.setItem("cashu.spentProofs", "data");

    invoiceHistoryStoreMock.invoiceHistory = Array.from({ length: 205 }, (_, i) => ({
      id: `invoice-${i}`,
      status: "paid",
      date: new Date(2020, 0, i + 1).toISOString(),
    }));

    tokensStoreMock.historyTokens = Array.from({ length: 205 }, (_, i) => ({
      id: `token-${i}`,
      status: "paid",
      date: new Date(2020, 0, i + 1).toISOString(),
      token: { secret: `token-${i}` },
    }));

    const beforeCleanupDate = extractDateValue(store.lastLocalStorageCleanUp);

    await store.cleanUpLocalStorage(true);

    expect(localStorage.getItem("cashu.spentProofs")).toBeNull();
    expect(invoiceHistoryStoreMock.invoiceHistory.length).toBe(200);
    expect(
      invoiceHistoryStoreMock.invoiceHistory.some((inv) => inv.id === "invoice-0"),
    ).toBe(false);
    expect(
      invoiceHistoryStoreMock.invoiceHistory.some((inv) => inv.id === "invoice-204"),
    ).toBe(true);

    const clearedTokens = tokensStoreMock.historyTokens.slice(0, 5);
    expect(clearedTokens.every((token) => token.token === undefined)).toBe(true);
    expect(
      tokensStoreMock.historyTokens
        .slice(5)
        .every((token) => token.token && token.token.secret),
    ).toBe(true);

    const afterCleanupDate = extractDateValue(store.lastLocalStorageCleanUp);
    expect(afterCleanupDate.getTime()).toBeGreaterThan(
      beforeCleanupDate.getTime(),
    );
    expect(Math.abs(Date.now() - afterCleanupDate.getTime())).toBeLessThan(5000);
    expect(notifySuccess).toHaveBeenCalledWith(expect.stringMatching(/Cleaned up/));
  });
});
