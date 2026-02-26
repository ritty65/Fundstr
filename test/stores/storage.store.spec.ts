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
  const tokensStoreMock: { historyTokens: any[]; archiveOldPaidTokens: ReturnType<typeof vi.fn> } = {
    historyTokens: [],
    archiveOldPaidTokens: vi.fn(async (limit: number) => {
      const paid = tokensStoreMock.historyTokens
        .filter((t) => t.status === "paid" && !t.archived)
        .sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
      if (paid.length <= limit) {
        return 0;
      }
      const toArchive = paid.slice(0, paid.length - limit);
      const archivedAt = new Date().toISOString();
      toArchive.forEach((token) => {
        token.archived = true;
        token.archivedAt = archivedAt;
      });
      return toArchive.length;
    }),
  };
  const walletStoreMock = {};
  const currentDateStr = vi.fn(() => "2024-05-01");
  const proofsTableMock = {
    clear: vi.fn(),
    bulkPut: vi.fn(),
  };
  const transactionMock = vi.fn(async (...args: any[]) => {
    const scope = args.pop();
    if (typeof scope === "function") {
      await scope();
    }
  });
  const lockedTokensTableMock = {
    toArray: vi.fn(),
    bulkPut: vi.fn(),
    clear: vi.fn(),
  };
  const subscriptionsTableMock = {
    toArray: vi.fn(),
    bulkPut: vi.fn(),
    clear: vi.fn(),
  };
  const historyTokensTableMock = {
    toArray: vi.fn(),
    bulkPut: vi.fn(),
    clear: vi.fn(),
  };
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
    proofsTableMock,
    transactionMock,
    lockedTokensTableMock,
    subscriptionsTableMock,
    historyTokensTableMock,
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
    updateActiveProofs: vi.fn(),
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

vi.mock("src/stores/dexie", () => ({
  cashuDb: {
    proofs: hoisted.proofsTableMock,
    lockedTokens: hoisted.lockedTokensTableMock,
    subscriptions: hoisted.subscriptionsTableMock,
    historyTokens: hoisted.historyTokensTableMock,
    transaction: hoisted.transactionMock,
  },
  db: {
    proofs: hoisted.proofsTableMock,
    lockedTokens: hoisted.lockedTokensTableMock,
    subscriptions: hoisted.subscriptionsTableMock,
    historyTokens: hoisted.historyTokensTableMock,
  },
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
  proofsTableMock,
  transactionMock,
  lockedTokensTableMock,
  subscriptionsTableMock,
  historyTokensTableMock,
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

const setupDownloadMocks = () => {
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

  return {
    downloadLink,
    createElementSpy,
    appendChildSpy,
    removeChildSpy,
    createObjectURLMock,
    restore: () => {
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
    },
  };
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
    tokensStoreMock.archiveOldPaidTokens.mockClear();
    proofsTableMock.clear.mockReset();
    proofsTableMock.bulkPut.mockReset();
    transactionMock.mockClear();
    lockedTokensTableMock.toArray.mockReset();
    lockedTokensTableMock.bulkPut.mockReset();
    lockedTokensTableMock.clear.mockReset();
    subscriptionsTableMock.toArray.mockReset();
    subscriptionsTableMock.bulkPut.mockReset();
    subscriptionsTableMock.clear.mockReset();
    historyTokensTableMock.toArray.mockReset();
    historyTokensTableMock.bulkPut.mockReset();
    historyTokensTableMock.clear.mockReset();
    lockedTokensTableMock.toArray.mockResolvedValue([]);
    lockedTokensTableMock.bulkPut.mockResolvedValue(undefined);
    lockedTokensTableMock.clear.mockResolvedValue(undefined);
    subscriptionsTableMock.toArray.mockResolvedValue([]);
    subscriptionsTableMock.bulkPut.mockResolvedValue(undefined);
    subscriptionsTableMock.clear.mockResolvedValue(undefined);
    historyTokensTableMock.toArray.mockResolvedValue([]);
    historyTokensTableMock.bulkPut.mockResolvedValue(undefined);
    historyTokensTableMock.clear.mockResolvedValue(undefined);
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
    const lockedTokens = [{ id: "lt1" }];
    const subscriptions = [{ id: "sub1" }];
    const historyTokens = [{ id: "ht1" }];
    const backup = {
      "cashu.dexie.db.proofs": JSON.stringify(proofs),
      "cashu.dexie.db.lockedTokens": JSON.stringify(lockedTokens),
      "cashu.dexie.db.subscriptions": JSON.stringify(subscriptions),
      "cashu.dexie.db.historyTokens": JSON.stringify(historyTokens),
      "cashu.buckets": JSON.stringify(buckets),
      "cashu.settings": "{\"foo\":true}",
    };

    const store = useStorageStore();
    await store.restoreFromBackup(backup);

    expect(transactionMock).toHaveBeenCalled();
    expect(proofsTableMock.clear).toHaveBeenCalled();
    expect(proofsTableMock.bulkPut).toHaveBeenCalledWith(proofs);
    expect(lockedTokensTableMock.clear).toHaveBeenCalled();
    expect(subscriptionsTableMock.clear).toHaveBeenCalled();
    expect(lockedTokensTableMock.bulkPut).toHaveBeenCalledWith(lockedTokens);
    expect(subscriptionsTableMock.bulkPut).toHaveBeenCalledWith(
      subscriptions,
    );
    expect(historyTokensTableMock.clear).toHaveBeenCalled();
    expect(historyTokensTableMock.bulkPut).toHaveBeenCalledWith(historyTokens);
    expect(bucketsStoreMock.buckets).toEqual(buckets);
    expect(localStorage.getItem("cashu.settings")).toBe("{\"foo\":true}");
    expect(notifySuccess).toHaveBeenCalledWith("Backup restored");
    expect(locationReloadSpy).toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("preserves proof metadata when restoring from backup", async () => {
    const proofs = [
      {
        id: "keyset-1",
        secret: "secret-keep",
        amount: 10,
        reserved: true,
        bucketId: "bucket-keep",
        label: "Keep",
        description: "Do not touch",
      },
    ];
    const backup = {
      "cashu.dexie.db.proofs": JSON.stringify(proofs),
    };

    const store = useStorageStore();
    await store.restoreFromBackup(backup);

    expect(transactionMock).toHaveBeenCalled();
    expect(proofsTableMock.bulkPut).toHaveBeenCalledWith(proofs);
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
    const lockedTokens = [{ id: "lt1" }];
    const subscriptions = [{ id: "sub1" }];
    const historyTokens = [
      {
        id: "ht1",
        token: "token-string",
        status: "paid",
        archived: false,
        bucketId: "unassigned",
        referenceId: null,
        createdAt: 1,
        date: "2024-01-01T00:00:00.000Z",
        mint: "https://mint",
      },
    ];
    lockedTokensTableMock.toArray.mockResolvedValue(lockedTokens);
    subscriptionsTableMock.toArray.mockResolvedValue(subscriptions);
    historyTokensTableMock.toArray.mockResolvedValue(historyTokens);

    const downloadMocks = setupDownloadMocks();
    const { downloadLink, createObjectURLMock } = downloadMocks;

    const store = useStorageStore();
    await store.exportWalletState();

    expect(getProofsMock).toHaveBeenCalled();
    expect(lockedTokensTableMock.toArray).toHaveBeenCalled();
    expect(subscriptionsTableMock.toArray).toHaveBeenCalled();
    expect(downloadMocks.createElementSpy).toHaveBeenCalledWith("a");
    expect(downloadMocks.appendChildSpy).toHaveBeenCalledWith(downloadLink);
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
    expect(serialized["cashu.dexie.db.lockedTokens"]).toBe(
      JSON.stringify(lockedTokens),
    );
    expect(serialized["cashu.dexie.db.subscriptions"]).toBe(
      JSON.stringify(subscriptions),
    );
    expect(serialized["cashu.dexie.db.historyTokens"]).toBe(
      JSON.stringify(historyTokens),
    );

    downloadMocks.restore();
  });

  it("round-trips locked tokens, history tokens, and subscriptions through export/import", async () => {
    const lockedTokens = [{ id: "lt1", tokenString: "abc" }];
    const subscriptions = [{ id: "sub1", intervals: [] }];
    const historyTokens = [
      {
        id: "ht1",
        token: "token-string",
        status: "paid",
        archived: false,
        bucketId: "unassigned",
        referenceId: null,
        createdAt: 1,
        date: "2024-01-01T00:00:00.000Z",
        mint: "https://mint",
      },
    ];
    getProofsMock.mockResolvedValue([]);
    lockedTokensTableMock.toArray.mockResolvedValue(lockedTokens);
    subscriptionsTableMock.toArray.mockResolvedValue(subscriptions);
    historyTokensTableMock.toArray.mockResolvedValue(historyTokens);

    const downloadMocks = setupDownloadMocks();
    const store = useStorageStore();

    await store.exportWalletState();
    const blobArg = downloadMocks.createObjectURLMock.mock.calls[0][0] as any;
    const serialized = JSON.parse(blobArg.parts.join(""));

    downloadMocks.restore();

    lockedTokensTableMock.clear.mockReset();
    lockedTokensTableMock.bulkPut.mockReset();
    subscriptionsTableMock.clear.mockReset();
    subscriptionsTableMock.bulkPut.mockReset();
    historyTokensTableMock.clear.mockReset();
    historyTokensTableMock.bulkPut.mockReset();
    lockedTokensTableMock.clear.mockResolvedValue(undefined);
    lockedTokensTableMock.bulkPut.mockResolvedValue(undefined);
    subscriptionsTableMock.clear.mockResolvedValue(undefined);
    subscriptionsTableMock.bulkPut.mockResolvedValue(undefined);
    historyTokensTableMock.clear.mockResolvedValue(undefined);
    historyTokensTableMock.bulkPut.mockResolvedValue(undefined);

    await store.restoreFromBackup(serialized);

    expect(lockedTokensTableMock.bulkPut).toHaveBeenCalledWith(lockedTokens);
    expect(subscriptionsTableMock.bulkPut).toHaveBeenCalledWith(
      subscriptions,
    );
    expect(historyTokensTableMock.bulkPut).toHaveBeenCalledWith(historyTokens);
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
      token: `token-${i}`,
      archived: false,
      archivedAt: null,
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

    expect(tokensStoreMock.archiveOldPaidTokens).toHaveBeenCalledWith(200);
    const archivedTokens = tokensStoreMock.historyTokens
      .filter((token) => token.archived)
      .slice(0, 5);
    expect(archivedTokens).toHaveLength(5);
    expect(archivedTokens.every((token) => typeof token.token === "string")).toBe(
      true,
    );
    expect(
      tokensStoreMock.historyTokens
        .slice(5)
        .every((token) => token.archived === false),
    ).toBe(true);

    const afterCleanupDate = extractDateValue(store.lastLocalStorageCleanUp);
    expect(afterCleanupDate.getTime()).toBeGreaterThan(
      beforeCleanupDate.getTime(),
    );
    expect(Math.abs(Date.now() - afterCleanupDate.getTime())).toBeLessThan(5000);
    expect(notifySuccess).toHaveBeenCalledWith(expect.stringMatching(/Cleaned up/));
  });
});
