import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/js/notify", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock("../../../src/stores/storage", () => ({
  useStorageStore: () => ({
    exportWalletState: vi.fn(),
  }),
}));

vi.mock("../../../src/stores/proofs", () => ({
  useProofsStore: () => ({
    getProofs: vi.fn(async () => []),
    sumProofs: vi.fn(() => 0),
  }),
}));

import { notifyError } from "../../../src/js/notify";
import { useDexieStore, cashuDb } from "../../../src/stores/dexie";

beforeEach(async () => {
  localStorage.clear();
  await cashuDb.close(); // close() is safe under fake-indexeddb
  await cashuDb.open();
});

describe("Dexie store", () => {
  it("marks migrated when there is nothing to migrate", async () => {
    const store = useDexieStore();
    await store.migrateToDexie();
    expect(store.migratedToDexie).toBe(true);
  });

  it("migrates proofs from localStorage", async () => {
    const proofs = [
      { id: "1", secret: "s", C: "c", amount: 1, reserved: false },
    ];
    localStorage.setItem("cashu.proofs", JSON.stringify(proofs));
    const store = useDexieStore();
    await store.migrateToDexie();
    // wait for Dexie writes
    const stored = await cashuDb.proofs.toArray();
    expect(stored.length).toBe(1);
    expect(store.migratedToDexie).toBe(true);
    expect(localStorage.getItem("cashu.proofs")).toBeNull();
  });

  it("keeps legacy proofs when migration insert fails", async () => {
    const proofs = [
      { id: "1", secret: "s", C: "c", amount: 1, reserved: false },
    ];
    const legacyProofs = JSON.stringify(proofs);
    localStorage.setItem("cashu.proofs", legacyProofs);
    const store = useDexieStore();
    const bulkAddSpy = vi
      .spyOn(cashuDb.proofs, "bulkAdd")
      .mockRejectedValue(new Error("insert failed"));

    await store.migrateToDexie();

    const stored = await cashuDb.proofs.toArray();
    expect(stored.length).toBe(0);
    expect(store.migratedToDexie).toBe(false);
    expect(localStorage.getItem("cashu.proofs")).toBe(legacyProofs);
    expect(notifyError).toHaveBeenCalled();

    bulkAddSpy.mockRestore();
  });

  it("deletes all tables", async () => {
    await cashuDb.proofs.add({
      id: "1",
      secret: "s",
      C: "c",
      amount: 1,
      reserved: false,
    });
    const store = useDexieStore();
    store.deleteAllTables();
    const stored = await cashuDb.proofs.toArray();
    expect(stored.length).toBe(0);
  });
});
