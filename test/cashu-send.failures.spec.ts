import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCashuStore } from "../src/stores/cashu";
import { cashuDb } from "../src/stores/dexie";
import { RelayConnectionError } from "../src/stores/nostr";

let fetchNutzapProfile: ReturnType<typeof vi.fn>;
let notifyErrorMock: ReturnType<typeof vi.fn>;

vi.mock("../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchNutzapProfile: (...args: any[]) => fetchNutzapProfile(...args),
  };
});

vi.mock("../src/stores/messenger", () => ({
  useMessengerStore: () => ({
    sendDm: vi.fn(async () => ({ success: true })),
  }),
}));

vi.mock("../src/stores/p2pk", () => ({
  useP2PKStore: () => ({
    sendToLock: vi.fn(),
    get firstKey() {
      return { publicKey: "pub" };
    },
    generateKeypair: vi.fn(),
  }),
}));

vi.mock("../src/stores/wallet", () => ({
  useWalletStore: () => ({
    findSpendableMint: vi.fn(),
  }),
}));

vi.mock("../src/stores/mints", () => ({
  useMintsStore: () => ({
    activeMintUrl: "mint",
  }),
}));

vi.mock("../src/stores/proofs", () => ({
  useProofsStore: () => ({
    updateActiveProofs: vi.fn(),
    serializeProofs: vi.fn(),
  }),
}));

vi.mock("../src/stores/subscriptions", () => ({
  useSubscriptionsStore: () => ({
    addSubscription: vi.fn(),
  }),
}));

vi.mock("../src/js/notify", () => ({
  notifyError: (...args: any[]) => notifyErrorMock(...args),
  notifyWarning: vi.fn(),
  notifySuccess: vi.fn(),
}));

beforeEach(async () => {
  setActivePinia(createPinia());
  localStorage.clear();
  await cashuDb.close();
  await cashuDb.delete();
  await cashuDb.open();

  fetchNutzapProfile = vi.fn();
  notifyErrorMock = vi.fn();
});

describe("useCashuStore.send failure handling", () => {
  it("notifies and resets loading when relays are unreachable", async () => {
    fetchNutzapProfile.mockRejectedValue(new RelayConnectionError("relays down"));

    const store = useCashuStore();

    await expect(
      store.send({ npub: "npub1", amount: 1, periods: 1, startDate: 0 }),
    ).resolves.toBeUndefined();

    expect(fetchNutzapProfile).toHaveBeenCalledWith("npub1");
    expect(notifyErrorMock).toHaveBeenCalledWith("Unable to connect to Nostr relays");
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.sendQueue.length).toBe(0);

    expect(await cashuDb.lockedTokens.count()).toBe(0);
    expect(await cashuDb.subscriptions.count()).toBe(0);
  });

  it("propagates non-relay errors without side effects", async () => {
    const boom = new Error("boom");
    fetchNutzapProfile.mockRejectedValue(boom);

    const store = useCashuStore();
    const initialQueue = [...store.sendQueue];
    const initialIncoming = [...store.incoming];

    await expect(
      store.send({ npub: "npub1", amount: 1, periods: 1, startDate: 0 }),
    ).rejects.toThrow("boom");

    expect(notifyErrorMock).not.toHaveBeenCalled();
    expect(store.loading).toBe(false);
    expect(store.sendQueue).toEqual(initialQueue);
    expect(store.incoming).toEqual(initialIncoming);

    expect(await cashuDb.lockedTokens.count()).toBe(0);
    expect(await cashuDb.subscriptions.count()).toBe(0);
  });

  it("throws when the profile lacks a P2PK pubkey", async () => {
    fetchNutzapProfile.mockResolvedValue({
      p2pkPubkey: undefined,
      trustedMints: [],
    });

    const store = useCashuStore();

    await expect(
      store.send({ npub: "npub1", amount: 1, periods: 1, startDate: 0 }),
    ).rejects.toThrow(
      "Creator's Nutzap profile is missing or does not contain a P2PK key.",
    );

    expect(notifyErrorMock).not.toHaveBeenCalled();
    expect(store.loading).toBe(false);

    expect(await cashuDb.lockedTokens.count()).toBe(0);
    expect(await cashuDb.subscriptions.count()).toBe(0);
  });
});
