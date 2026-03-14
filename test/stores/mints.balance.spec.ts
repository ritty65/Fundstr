import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { WalletProof } from "src/types/proofs";
import { useMintsStore } from "stores/mints";

const hoisted = vi.hoisted(() => {
  const workersStore = { clearAllWorkers: vi.fn() };
  const proofsStore: any = { proofs: [] as WalletProof[], updateActiveProofs: vi.fn() };
  const uiStore: any = {
    setTab: vi.fn(),
    lockMutex: vi.fn(async () => {}),
    unlockMutex: vi.fn(async () => {}),
    lastBalanceCached: 0,
  };
  const creatorProfileStore = { mints: [] as string[] };
  const notifySpies = {
    notifySuccess: vi.fn(async () => {}),
    notifyError: vi.fn(async () => {}),
    notifyWarning: vi.fn(async () => {}),
    notifyApiError: vi.fn(async () => {}),
  };
  return {
    workersStore,
    proofsStore,
    uiStore,
    creatorProfileStore,
    notifySpies,
    maybeRepublishNutzapProfile: vi.fn(async () => {}),
    getInfoMock: vi.fn(async () => ({ motd: "motd" })),
    getKeysMock: vi.fn(async () => ({ keysets: [] })),
    getKeySetsMock: vi.fn(async () => ({ keysets: [] })),
  };
});

vi.mock("stores/workers", () => ({
  useWorkersStore: () => hoisted.workersStore,
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => hoisted.proofsStore,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => hoisted.uiStore,
}));

vi.mock("stores/creatorProfile", () => ({
  useCreatorProfileStore: () => hoisted.creatorProfileStore,
}));

vi.mock("src/nutzap/profileRepublish", () => ({
  maybeRepublishNutzapProfile: hoisted.maybeRepublishNutzapProfile,
}));

vi.mock("src/js/notify", () => hoisted.notifySpies);

vi.mock("src/boot/i18n", () => ({
  i18n: { global: { t: (key: string) => key } },
}));

vi.mock("@cashu/cashu-ts", () => ({
  CashuMint: vi.fn(() => ({
    getInfo: hoisted.getInfoMock,
    getKeys: hoisted.getKeysMock,
    getKeySets: hoisted.getKeySetsMock,
  })),
}));

const {
  proofsStore,
  uiStore,
  notifySpies: { notifySuccess, notifyError, notifyWarning, notifyApiError },
} = hoisted;

describe("mints store balances", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    proofsStore.proofs = [];
    proofsStore.updateActiveProofs = vi.fn();
    uiStore.lastBalanceCached = 0;
    setActivePinia(createPinia());
  });

  it("returns zero balances when stores are empty", () => {
    const store = useMintsStore();

    expect(store.totalUnitBalance).toBe(0);
    expect(store.activeBalance).toBe(0);
    expect(uiStore.lastBalanceCached).toBe(0);
    expect(uiStore.setTab).toHaveBeenCalledWith("mints");
  });

  it("sums only unreserved proofs for the active unit and updates the cached balance", () => {
    const store = useMintsStore();

    store.mints = [
      {
        url: "https://mint-a.example",
        keys: [],
        keysets: [
          { id: "mintA-sat-1", unit: "sat", active: true },
          { id: "mintA-usd-1", unit: "usd", active: true },
        ],
      },
      {
        url: "https://mint-b.example",
        keys: [],
        keysets: [{ id: "mintB-sat-1", unit: "sat", active: true }],
      },
    ] as any;

    const proofs: WalletProof[] = [
      { amount: 5, id: "mintA-sat-1", reserved: false, secret: "a1" },
      { amount: 11, id: "mintA-sat-1", reserved: false, secret: "a4" },
      { amount: 7, id: "mintA-sat-1", reserved: true, secret: "a2" },
      { amount: 13, id: "mintB-sat-1", reserved: false, secret: "b1" },
      { amount: 17, id: "mintA-usd-1", reserved: false, secret: "a3" },
      { amount: 19, id: "other", reserved: false, secret: "x" },
      { amount: 23, id: "mintB-sat-1", reserved: true, secret: "b2" },
    ];
    proofsStore.proofs = proofs;

    store.activeUnit = "sat";
    expect(store.totalUnitBalance).toBe(29);
    expect(uiStore.lastBalanceCached).toBe(29);

    store.activeUnit = "usd";
    expect(store.totalUnitBalance).toBe(17);
    expect(uiStore.lastBalanceCached).toBe(17);

    expect(notifySuccess).not.toHaveBeenCalled();
    expect(notifyError).not.toHaveBeenCalled();
    expect(notifyWarning).not.toHaveBeenCalled();
    expect(notifyApiError).not.toHaveBeenCalled();
  });

  it("derives the active balance from active mint proofs only", () => {
    const store = useMintsStore();

    store.mints = [
      {
        url: "https://mint-a.example",
        keys: [],
        keysets: [
          { id: "mintA-sat-1", unit: "sat", active: true },
          { id: "mintA-usd-1", unit: "usd", active: true },
        ],
      },
      {
        url: "https://mint-b.example",
        keys: [],
        keysets: [{ id: "mintB-sat-1", unit: "sat", active: true }],
      },
    ] as any;

    const proofs: WalletProof[] = [
      { amount: 5, id: "mintA-sat-1", reserved: false, secret: "a1" },
      { amount: 11, id: "mintA-sat-1", reserved: false, secret: "a4" },
      { amount: 7, id: "mintA-sat-1", reserved: true, secret: "a2" },
      { amount: 13, id: "mintB-sat-1", reserved: false, secret: "b1" },
      { amount: 17, id: "mintA-usd-1", reserved: false, secret: "a3" },
    ];
    proofsStore.proofs = proofs;

    store.activeMintUrl = "https://mint-a.example";
    store.activeUnit = "sat";
    const activeMintKeysetIds = store.mints[0].keysets
      .filter((k: any) => k.unit === "sat")
      .map((k: any) => k.id);
    store.activeProofs = proofs.filter(
      (p) => activeMintKeysetIds.includes(p.id) && !p.reserved,
    );

    expect(store.activeBalance).toBe(16);
    const allUnreserved = proofs.filter((p) => !p.reserved).reduce((s, p) => s + p.amount, 0);
    expect(store.activeBalance).toBeLessThan(allUnreserved);
    expect(store.activeBalance).toBe(
      proofs
        .filter((p) => activeMintKeysetIds.includes(p.id) && !p.reserved)
        .reduce((s, p) => s + p.amount, 0),
    );
  });
});
