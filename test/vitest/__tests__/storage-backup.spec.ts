import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useStorageStore } from "../../../src/stores/storage";
import { cashuDb } from "../../../src/stores/dexie";
import type {
  HistoryTokenRow,
  LockedToken,
  Subscription,
} from "../../../src/stores/dexie";
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

  it("exports and restores large histories without losing entries", async () => {
    const storageStore = useStorageStore();

    const proofs: WalletProof[] = Array.from({ length: 180 }, (_, idx) => ({
      id: `keyset-${idx % 8}`,
      secret: `secret-${idx}`,
      C: `C-${idx}`,
      amount: (idx % 20) + 1,
      reserved: idx % 3 === 0,
      bucketId: `bucket-${idx % 5}`,
      label: `label-${idx % 7}`,
      description: `proof-${idx}`,
    }));

    const subscriptions: Subscription[] = Array.from({ length: 8 }, (_, idx) => {
      const intervals = Array.from({ length: 3 }, (_, intervalIdx) => ({
        intervalKey: `interval-${idx}-${intervalIdx}`,
        lockedTokenId: `locked-${idx}-${intervalIdx}`,
        unlockTs: 1_700_000_000 + idx * 1000 + intervalIdx,
        status: "pending",
        tokenString: `token-${idx}-${intervalIdx}`,
        subscriptionId: `subscription-${idx}`,
        tierId: `tier-${idx}`,
        monthIndex: intervalIdx,
        totalPeriods: 3,
        redeemed: intervalIdx % 2 === 0,
        frequency: "monthly",
        intervalDays: 30,
      }));

      return {
        id: `subscription-${idx}`,
        creatorNpub: `npub-${idx}`,
        tierId: `tier-${idx}`,
        creatorP2PK: `p2pk-${idx}`,
        mintUrl: "https://mint.example",
        amountPerInterval: 1_000 + idx,
        frequency: "monthly",
        intervalDays: 30,
        startDate: 1_700_000_000,
        commitmentLength: 3,
        intervals,
        status: "active",
        createdAt: 1_700_000_000,
        updatedAt: 1_700_000_000,
        totalPeriods: 3,
        receivedPeriods: 1,
        tierName: `Tier ${idx}`,
        benefits: ["benefit"],
        creatorName: `Creator ${idx}`,
        creatorAvatar: `https://avatar/${idx}`,
      } satisfies Subscription;
    });

    const lockedTokens: LockedToken[] = subscriptions.flatMap((subscription) =>
      subscription.intervals.map((interval) => ({
        id: interval.lockedTokenId,
        tokenString: interval.tokenString,
        amount: 1_000 + (interval.monthIndex ?? 0),
        owner: "subscriber",
        tierId: subscription.tierId,
        intervalKey: interval.intervalKey,
        unlockTs: interval.unlockTs,
        status: interval.status,
        subscriptionEventId: `event-${interval.intervalKey}`,
        subscriptionId: subscription.id,
        monthIndex: interval.monthIndex,
        totalPeriods: interval.totalPeriods,
        autoRedeem: interval.redeemed,
        creatorP2PK: subscription.creatorP2PK,
        htlcHash: null,
        htlcSecret: null,
        frequency: subscription.frequency,
        intervalDays: subscription.intervalDays,
        redeemed: interval.redeemed,
      })),
    );

    const historyTokens: HistoryTokenRow[] = Array.from(
      { length: 120 },
      (_, idx) => ({
        id: `history-${idx}`,
        status: idx % 2 === 0 ? "paid" : "pending",
        amount: 500 + idx,
        date: `2024-01-${(idx % 28) + 1}`,
        token: `encoded-${idx}`,
        mint: `https://mint-${idx % 4}.example`,
        unit: "sat",
        label: `label-${idx % 6}`,
        description: `history-${idx}`,
        bucketId: `bucket-${idx % 5}`,
        referenceId: idx % 3 === 0 ? `ref-${idx}` : undefined,
        archived: idx % 10 === 0,
        archivedAt: idx % 10 === 0 ? `2024-02-${(idx % 28) + 1}` : null,
        createdAt: 1_700_000_000 + idx,
      }),
    );

    await cashuDb.transaction(
      "rw",
      cashuDb.proofs,
      cashuDb.lockedTokens,
      cashuDb.subscriptions,
      cashuDb.historyTokens,
      async () => {
        await cashuDb.proofs.clear();
        await cashuDb.lockedTokens.clear();
        await cashuDb.subscriptions.clear();
        await cashuDb.historyTokens.clear();
        await cashuDb.proofs.bulkPut(proofs);
        await cashuDb.lockedTokens.bulkPut(lockedTokens as any);
        await cashuDb.subscriptions.bulkPut(subscriptions as any);
        await cashuDb.historyTokens.bulkPut(historyTokens as any);
      },
    );

    localStorage.setItem("cashu.custom.flag", "true");

    const blobs: Blob[] = [];
    const blobPayloads: string[] = [];
    const OriginalBlob = Blob;
    (globalThis as any).Blob = class TestingBlob extends Blob {
      constructor(parts: any[], options?: BlobPropertyBag) {
        super(parts as any[], options);
        const merged = parts
          .map((part) => {
            if (typeof part === "string") return part;
            if (part instanceof ArrayBuffer) return new TextDecoder().decode(part);
            if (ArrayBuffer.isView(part)) return new TextDecoder().decode(part as any);
            return String(part);
          })
          .join("");
        blobPayloads.push(merged);
      }
    } as any;
    if (typeof URL.createObjectURL !== "function") {
      (URL as any).createObjectURL = vi.fn();
    }
    const createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob: Blob) => {
        blobs.push(blob);
        return "blob:testing";
      });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    if (typeof URL.revokeObjectURL !== "function") {
      (URL as any).revokeObjectURL = vi.fn();
    }
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    await storageStore.exportWalletState();

    (globalThis as any).Blob = OriginalBlob;

    expect(blobPayloads.length).toBeGreaterThan(0);
    const exportedPayload = JSON.parse(blobPayloads[0]);

    await cashuDb.transaction(
      "rw",
      cashuDb.proofs,
      cashuDb.lockedTokens,
      cashuDb.subscriptions,
      cashuDb.historyTokens,
      async () => {
        await cashuDb.proofs.clear();
        await cashuDb.lockedTokens.clear();
        await cashuDb.subscriptions.clear();
        await cashuDb.historyTokens.clear();
      },
    );
    localStorage.clear();

    await storageStore.restoreFromBackup(exportedPayload);

    const sortById = <T extends { id?: string }>(items: T[]) =>
      [...items].sort((a, b) => String(a.id).localeCompare(String(b.id)));

    const restoredProofs = await cashuDb.proofs.toArray();
    const sortBySecret = (list: WalletProof[]) =>
      [...list].sort((a, b) => a.secret.localeCompare(b.secret));
    expect(sortBySecret(restoredProofs)).toEqual(sortBySecret(proofs));

    const restoredLocked = await cashuDb.lockedTokens.toArray();
    expect(sortById(restoredLocked)).toEqual(sortById(lockedTokens));

    const restoredSubscriptions = await cashuDb.subscriptions.toArray();
    expect(sortById(restoredSubscriptions)).toEqual(sortById(subscriptions));

    const restoredHistory = await cashuDb.historyTokens.toArray();
    expect(sortById(restoredHistory)).toEqual(sortById(historyTokens));

    expect(localStorage.getItem("cashu.custom.flag")).toBe("true");

    createObjectURLSpy.mockRestore();
    clickSpy.mockRestore();
    revokeSpy.mockRestore();
  });
});
