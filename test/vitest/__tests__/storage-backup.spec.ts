import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useStorageStore } from "../../../src/stores/storage";
import { cashuDb } from "../../../src/stores/dexie";
import type { WalletProof } from "../../../src/types/proofs";

const hoisted = vi.hoisted(() => {
  const notifySuccess = vi.fn();
  const notifyError = vi.fn();
  const bucketsStoreMock = { buckets: [] as unknown[] };
  const mintsStoreMock = {
    mints: [] as any[],
    activeMintUrl: undefined as string | undefined,
    activeUnit: "sat",
    activeProofs: [] as any[],
  };
  return { notifySuccess, notifyError, bucketsStoreMock, mintsStoreMock };
});

vi.mock("../../../src/js/notify", () => ({
  notifySuccess: hoisted.notifySuccess,
  notifyError: hoisted.notifyError,
}));

vi.mock("../../../src/stores/buckets", () => ({
  useBucketsStore: () => hoisted.bucketsStoreMock,
}));

vi.mock("../../../src/stores/mints", () => ({
  useMintsStore: () => hoisted.mintsStoreMock,
}));

vi.mock("../../../src/stores/tokens", () => ({
  useTokensStore: () => ({
    archiveOldPaidTokens: vi.fn(),
  }),
}));

vi.mock("../../../src/stores/invoiceHistory", () => ({
  useInvoiceHistoryStore: () => ({ invoiceHistory: [] }),
}));

vi.mock("../../../src/stores/wallet", () => ({
  useWalletStore: () => ({}),
}));

describe("storage backup restore", () => {
  const { notifySuccess, notifyError, bucketsStoreMock, mintsStoreMock } = hoisted;
  const originalLocation = window.location;
  let locationReloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    setActivePinia(createPinia());
    localStorage.clear();
    notifySuccess.mockClear();
    notifyError.mockClear();
    bucketsStoreMock.buckets = [];
    mintsStoreMock.mints = [];
    mintsStoreMock.activeMintUrl = undefined;
    mintsStoreMock.activeUnit = "sat";
    mintsStoreMock.activeProofs = [];
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
    await cashuDb.close();
    await cashuDb.open();
    await cashuDb.proofs.clear();
  });

  afterEach(async () => {
    Object.defineProperty(window, "location", {
      configurable: true,
      enumerable: true,
      value: originalLocation,
    });
    await cashuDb.close();
  });

  it("replaces proofs when restoring a backup", async () => {
    const staleProof: WalletProof = {
      id: "keyset-1",
      secret: "secret-1",
      C: "C1",
      amount: 10,
      reserved: false,
      bucketId: "bucket-stale",
      label: "Stale",
      description: "old",
    };
    await cashuDb.proofs.bulkPut([staleProof]);

    const backupProofs: WalletProof[] = [
      {
        ...staleProof,
        bucketId: "bucket-restored",
        label: "Restored",
        description: "fresh",
      },
      {
        id: "keyset-2",
        secret: "secret-2",
        C: "C2",
        amount: 20,
        reserved: false,
        bucketId: "bucket-new",
        label: "New",
        description: "",
      },
    ];

    const backupPayload = {
      "cashu.dexie.db.proofs": JSON.stringify(backupProofs),
    } as const;

    const storageStore = useStorageStore();
    await storageStore.restoreFromBackup(backupPayload);

    const storedProofs = await cashuDb.proofs.toArray();
    const sortBySecret = (a: WalletProof, b: WalletProof) =>
      a.secret.localeCompare(b.secret);
    expect(storedProofs.sort(sortBySecret)).toEqual(
      [...backupProofs].sort(sortBySecret),
    );
    expect(notifySuccess).toHaveBeenCalledWith("Backup restored");
    expect(notifyError).not.toHaveBeenCalled();
    expect(locationReloadSpy).toHaveBeenCalled();
  });
});
