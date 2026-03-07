import "fake-indexeddb/auto";
import { describe, it, beforeEach, expect, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useMintsStore } from "stores/mints";

const hoisted = vi.hoisted(() => {
  const workersStore = { clearAllWorkers: vi.fn() };
  const proofsStore: any = { proofs: [], updateActiveProofs: vi.fn() };
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
    maybeRepublishNutzapProfile: vi.fn(async () => {}),
    notifySpies,
    getInfoMock: vi.fn(async () => { throw new Error('Info Failed') }),
    getKeysMock: vi.fn(async () => { throw new Error('Keys Failed') }),
    getKeySetsMock: vi.fn(async () => { throw new Error('Keysets Failed') }),
  };
});

vi.mock("stores/workers", () => ({ useWorkersStore: () => hoisted.workersStore }));
vi.mock("stores/proofs", () => ({ useProofsStore: () => hoisted.proofsStore }));
vi.mock("stores/ui", () => ({ useUiStore: () => hoisted.uiStore }));
vi.mock("stores/creatorProfile", () => ({ useCreatorProfileStore: () => hoisted.creatorProfileStore }));
vi.mock("src/nutzap/profileRepublish", () => ({ maybeRepublishNutzapProfile: hoisted.maybeRepublishNutzapProfile }));
vi.mock("src/js/notify", () => hoisted.notifySpies);
vi.mock("src/boot/i18n", () => ({ i18n: { global: { t: (key: string) => key } } }));
vi.mock("@cashu/cashu-ts", () => ({
  CashuMint: vi.fn(() => ({
    getInfo: hoisted.getInfoMock,
    getKeys: hoisted.getKeysMock,
    getKeySets: hoisted.getKeySetsMock,
  })),
}));

const { notifySpies } = hoisted;
const { notifyApiError } = notifySpies;

describe("mints store sad path", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    notifyApiError.mockClear();
    hoisted.getInfoMock.mockRejectedValue(new Error('Info Failed'));
    hoisted.getKeysMock.mockRejectedValue(new Error('Keys Failed'));
    hoisted.getKeySetsMock.mockRejectedValue(new Error('Keysets Failed'));
  });

  it("fetchMintInfo notifies on error", async () => {
    const store = useMintsStore();
    const mint = { url: "https://bad.mint", keys: [], keysets: [] } as any;

    await expect(store.fetchMintInfo(mint)).rejects.toThrow('Info Failed');
    expect(notifyApiError).toHaveBeenCalledWith(expect.any(Error), "wallet.mint.notifications.could_not_get_info");
  });

   it("fetchMintKeysets notifies on error", async () => {
    const store = useMintsStore();
    const mint = { url: "https://bad.mint", keys: [], keysets: [] } as any;

    await expect(store.fetchMintKeysets(mint)).rejects.toThrow('Keysets Failed');
    expect(notifyApiError).toHaveBeenCalledWith(expect.any(Error), "wallet.mint.notifications.could_not_get_keysets");
  });

  it("fetchMintKeys notifies on error when getKeys fails", async () => {
    // Make keysets succeed so we can reach getKeys
    hoisted.getKeySetsMock.mockResolvedValue({ keysets: [] });

    const store = useMintsStore();
    const mint = { url: "https://bad.mint", keys: [], keysets: [] } as any;

    await expect(store.fetchMintKeys(mint)).rejects.toThrow('Keys Failed');
    expect(notifyApiError).toHaveBeenCalledWith(expect.any(Error), "wallet.mint.notifications.could_not_get_keys");
  });

  it("fetchMintKeysets rejects malformed keyset payloads", async () => {
    hoisted.getKeySetsMock.mockResolvedValueOnce({ keysets: null });
    const store = useMintsStore();
    const mint = { url: "https://bad.mint", keys: [], keysets: [] } as any;

    await expect(store.fetchMintKeysets(mint)).rejects.toThrow(
      "Mint returned malformed keysets response",
    );
    expect(notifyApiError).toHaveBeenCalledWith(
      expect.any(Error),
      "wallet.mint.notifications.could_not_get_keysets",
    );
  });

  it("reports network timeouts when fetching mint info", async () => {
    const timeoutError = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    hoisted.getInfoMock.mockRejectedValueOnce(timeoutError);
    const store = useMintsStore();
    const mint = { url: "https://timeout.mint", keys: [], keysets: [] } as any;

    await expect(store.fetchMintInfo(mint)).rejects.toThrow("timeout");
    expect(notifyApiError).toHaveBeenCalledWith(
      timeoutError,
      "wallet.mint.notifications.could_not_get_info",
    );
  });
});
