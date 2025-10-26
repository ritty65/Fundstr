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
  workersStore,
  proofsStore,
  uiStore,
  creatorProfileStore,
  maybeRepublishNutzapProfile,
  notifySpies,
  getInfoMock,
  getKeysMock,
  getKeySetsMock,
} = hoisted;

const { notifySuccess, notifyError, notifyWarning, notifyApiError } = notifySpies;

describe("mints store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    proofsStore.proofs = [];
    proofsStore.updateActiveProofs = vi.fn(async () => {});
    creatorProfileStore.mints = [];
    maybeRepublishNutzapProfile.mockReset();
    notifySuccess.mockReset();
    notifyError.mockReset();
    notifyWarning.mockReset();
    notifyApiError.mockReset();
    setActivePinia(createPinia());
  });

  it("adds sanitized mints, activates them, and persists to storage", async () => {
    const store = useMintsStore();
    const activateSpy = vi
      .spyOn(store, "activateMint")
      .mockResolvedValue(undefined as any);

    const inputUrl = "cashu.example/API?foo=bar#baz";
    const mint = await store.addMint({ url: inputUrl, nickname: "Cashu" }, true);

    expect(mint.url).toBe("https://cashu.example/API");
    expect(store.mints).toHaveLength(1);
    expect(store.mints[0].url).toBe("https://cashu.example/API");
    expect(store.mints[0].nickname).toBe("Cashu");
    expect(activateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://cashu.example/API" }),
      false,
      true,
    );
    expect(notifyWarning).toHaveBeenCalledWith("Unexpected mint path: /API");
    expect(notifySuccess).toHaveBeenCalledWith(
      "wallet.mint.notifications.added",
    );
    expect(maybeRepublishNutzapProfile).toHaveBeenCalled();
    expect(creatorProfileStore.mints).toEqual(["https://cashu.example/API"]);

    const persisted = JSON.parse(localStorage.getItem("cashu.mints") || "[]");
    expect(persisted).toHaveLength(1);
    expect(persisted[0].url).toBe("https://cashu.example/API");
    expect(store.addMintBlocking).toBe(false);
  });

  it("rejects invalid mint URLs and surfaces the error", async () => {
    const store = useMintsStore();

    await expect(store.addMint({ url: "http://invalid" })).rejects.toThrow(
      "invalid mint url",
    );

    expect(notifyError).toHaveBeenCalledWith(
      "MintSettings.add.actions.add_mint.error_invalid_url",
    );
    expect(store.mints).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("cashu.mints") || "[]")).toEqual(
      [],
    );
  });

  it("avoids adding duplicate mints but still informs the user when verbose", async () => {
    const store = useMintsStore();
    vi.spyOn(store, "activateMint").mockResolvedValue(undefined as any);

    await store.addMint({ url: "https://mint.instance" });
    vi.clearAllMocks();

    const result = await store.addMint(
      { url: "https://mint.instance" },
      true,
    );

    expect(result.url).toBe("https://mint.instance");
    expect(store.mints).toHaveLength(1);
    expect(notifySuccess).toHaveBeenCalledWith(
      "wallet.mint.notifications.already_added",
    );
    expect(maybeRepublishNutzapProfile).not.toHaveBeenCalled();
  });

  it("activates mints through activateMintUrl when present", async () => {
    const store = useMintsStore();
    store.mints = [
      { url: "https://mint.instance", keys: [], keysets: [] },
    ] as any;
    const activateMint = vi
      .spyOn(store, "activateMint")
      .mockResolvedValue(undefined as any);
    const activateUnit = vi
      .spyOn(store, "activateUnit")
      .mockResolvedValue(undefined as any);

    await store.activateMintUrl("https://mint.instance", true, false, "sat");

    expect(activateMint).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://mint.instance" }),
      true,
      false,
    );
    expect(activateUnit).toHaveBeenCalledWith("sat", true);
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("notifies when attempting to activate an unknown mint", async () => {
    const store = useMintsStore();

    await store.activateMintUrl("https://missing.instance");

    expect(notifyError).toHaveBeenCalledWith(
      "wallet.mint.notifications.not_found",
      "wallet.mint.notifications.activation_failed",
    );
  });
});
