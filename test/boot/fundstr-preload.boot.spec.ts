import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bootStub = (fn: any) => fn;

describe("boot/fundstr-preload", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    (window as any).requestIdleCallback = vi.fn((callback: () => void) => {
      callback();
      return 1;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as any).requestIdleCallback;
  });

  it("does not eagerly preload featured creators on boot", async () => {
    vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));

    const ensureCreatorCacheFromDexie = vi.fn();
    const saveProfileCache = vi.fn();
    const updateTierCacheState = vi.fn();
    const creatorsStore = {
      favoriteHexPubkeys: [],
      ensureCreatorCacheFromDexie,
      saveProfileCache,
      updateTierCacheState,
    };

    const fetchFundstrProfileBundle = vi.fn();

    vi.doMock("stores/creators", () => ({
      useCreatorsStore: vi.fn(() => creatorsStore),
      fetchFundstrProfileBundle,
    }));

    vi.doMock("@/nostr/relayClient", () => ({
      toHex: vi.fn((value: string) => value),
    }));

    const module = await import("src/boot/fundstr-preload");
    module.default({} as any);

    await Promise.resolve();
    await Promise.resolve();

    expect(ensureCreatorCacheFromDexie).not.toHaveBeenCalled();
    expect(fetchFundstrProfileBundle).not.toHaveBeenCalled();
    expect(saveProfileCache).not.toHaveBeenCalled();
    expect(updateTierCacheState).not.toHaveBeenCalled();
  });

  it("still preloads favorite creators after user interaction", async () => {
    vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));

    const ensureCreatorCacheFromDexie = vi.fn().mockResolvedValue(undefined);
    const saveProfileCache = vi.fn().mockResolvedValue(undefined);
    const updateTierCacheState = vi.fn();
    const creatorsStore = {
      favoriteHexPubkeys: ["f".repeat(64)],
      ensureCreatorCacheFromDexie,
      saveProfileCache,
      updateTierCacheState,
    };

    const bundle = {
      joined: 123,
      profileEvent: { id: "evt" },
      profileDetails: { display_name: "Favorite" },
      tiers: [{ id: "tier-1" }],
      tierDataFresh: true,
      tierSecurityBlocked: false,
      tierFetchFailed: false,
    };

    const fetchFundstrProfileBundle = vi.fn().mockResolvedValue(bundle);

    vi.doMock("stores/creators", () => ({
      useCreatorsStore: vi.fn(() => creatorsStore),
      fetchFundstrProfileBundle,
    }));

    vi.doMock("@/nostr/relayClient", () => ({
      toHex: vi.fn((value: string) => value),
    }));

    const module = await import("src/boot/fundstr-preload");
    module.default({} as any);

    window.dispatchEvent(new Event("pointerdown"));
    await vi.waitFor(() => {
      expect(saveProfileCache).toHaveBeenCalledTimes(1);
    });

    expect(ensureCreatorCacheFromDexie).toHaveBeenCalledWith("f".repeat(64));
    expect(fetchFundstrProfileBundle).toHaveBeenCalledWith("f".repeat(64));
    expect(saveProfileCache).toHaveBeenCalledWith(
      "f".repeat(64),
      bundle.profileEvent,
      bundle.profileDetails,
      { updatedAt: 123 },
    );
    expect(updateTierCacheState).toHaveBeenCalledWith(
      "f".repeat(64),
      bundle.tiers,
      null,
      {
        updatedAt: 123,
        fresh: true,
        securityBlocked: false,
        fetchFailed: false,
      },
    );
  });
});
