import "fake-indexeddb/auto";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useRestoreStore } from "stores/restore";

const hoisted = vi.hoisted(() => {
  const mintStore = { activateMintUrl: vi.fn(async () => {}) };
  const walletStore = {};
  const mnemonicStore = {
    mnemonicToSeedSync: vi.fn(() => new Uint8Array([1, 2])),
  };
  const proofsStore: any = { proofs: [], addProofs: vi.fn(async () => {}) };
  const uiStore = { formatCurrency: vi.fn(() => "2 SAT") };
  const notifySpies = {
    notify: vi.fn(),
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  };
  return {
    mintStore,
    walletStore,
    mnemonicStore,
    proofsStore,
    uiStore,
    notifySpies,
    getKeySetsMock: vi.fn(),
    walletRestoreMock: vi.fn(),
    checkProofsStatesMock: vi.fn(),
  };
});

vi.mock("stores/mints", () => ({
  useMintsStore: () => hoisted.mintStore,
}));

vi.mock("stores/wallet", () => ({
  useWalletStore: () => hoisted.walletStore,
}));

vi.mock("stores/mnemonic", () => ({
  useMnemonicStore: () => hoisted.mnemonicStore,
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => hoisted.proofsStore,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => hoisted.uiStore,
}));

vi.mock("src/js/notify", () => hoisted.notifySpies);

vi.mock("src/boot/i18n", () => ({
  i18n: { global: { t: (key: string) => key } },
}));

vi.mock("@cashu/cashu-ts", () => ({
  CashuMint: vi.fn(() => ({
    getKeySets: hoisted.getKeySetsMock,
  })),
  CashuWallet: vi.fn(() => ({
    restore: hoisted.walletRestoreMock,
    checkProofsStates: hoisted.checkProofsStatesMock,
  })),
  CheckStateEnum: { SPENT: "SPENT" },
}));

const {
  mintStore,
  walletStore,
  mnemonicStore,
  proofsStore,
  uiStore,
  notifySpies,
  getKeySetsMock,
  walletRestoreMock,
  checkProofsStatesMock,
} = hoisted;

const { notify, notifyError, notifySuccess } = notifySpies;

describe("restore store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    mintStore.activateMintUrl.mockClear();
    mnemonicStore.mnemonicToSeedSync.mockClear();
    proofsStore.proofs = [];
    proofsStore.addProofs = vi.fn(async () => {});
    uiStore.formatCurrency.mockClear();
    notify.mockReset();
    notifyError.mockReset();
    notifySuccess.mockReset();
    getKeySetsMock.mockReset();
    walletRestoreMock.mockReset();
    checkProofsStatesMock.mockReset();
  });

  it("aborts when no mnemonic is provided", async () => {
    const store = useRestoreStore();
    store.mnemonicToRestore = "";

    await store._restoreMint("https://mint");

    expect(notifyError).toHaveBeenCalledWith("restore.mnemonic_error_text");
    expect(mintStore.activateMintUrl).not.toHaveBeenCalled();
    expect(getKeySetsMock).not.toHaveBeenCalled();
  });

  it("restores proofs, filters spent ones, and notifies success", async () => {
    const store = useRestoreStore();
    store.mnemonicToRestore = "mnemonic";

    const keyset = { id: "keyset", unit: "sat" } as any;
    getKeySetsMock.mockResolvedValueOnce({ keysets: [keyset] });
    walletRestoreMock
      .mockResolvedValueOnce({
        proofs: [
          { secret: "spent", amount: 1, id: "a" },
          { secret: "active", amount: 2, id: "b" },
        ],
      })
      .mockResolvedValueOnce({ proofs: [] })
      .mockResolvedValueOnce({ proofs: [] });
    checkProofsStatesMock.mockResolvedValue([
      { state: "SPENT" },
      { state: "UNSPENT" },
    ]);

    await store._restoreMint("https://mint");

    expect(mintStore.activateMintUrl).toHaveBeenCalledWith("https://mint");
    expect(mnemonicStore.mnemonicToSeedSync).toHaveBeenCalledWith("mnemonic");
    expect(proofsStore.addProofs).toHaveBeenCalledWith([
      { secret: "active", amount: 2, id: "b" },
    ]);
    expect(store.restoreCounter).toBe(2);
    expect(store.restoreProgress).toBeGreaterThan(0);
    expect(notifySuccess).toHaveBeenCalledWith(
      "restore.restored_amount_success_text",
    );
    expect(notify).not.toHaveBeenCalled();
  });

  it("notifies when no proofs are recovered", async () => {
    const store = useRestoreStore();
    store.mnemonicToRestore = "mnemonic";

    getKeySetsMock.mockResolvedValueOnce({ keysets: [{ id: "keyset", unit: "sat" }] });
    walletRestoreMock.mockResolvedValue({ proofs: [] });

    await store._restoreMint("https://mint");

    expect(notify).toHaveBeenCalledWith("restore.no_proofs_info_text");
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
