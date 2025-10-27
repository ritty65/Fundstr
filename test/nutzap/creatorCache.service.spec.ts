import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const applyBundleToCache = vi.fn();
  const creatorsStore = { applyBundleToCache };
  const useCreatorsStore = vi.fn(() => creatorsStore);
  const fetchFundstrProfileBundle = vi.fn();
  const FEATURED_CREATORS: string[] = [];
  const toHex = vi.fn((value: string) => value);
  const notifyCreate = vi.fn();

  return {
    applyBundleToCache,
    creatorsStore,
    useCreatorsStore,
    fetchFundstrProfileBundle,
    FEATURED_CREATORS,
    toHex,
    notifyCreate,
  };
});

vi.mock("stores/creators", () => ({
  useCreatorsStore: hoisted.useCreatorsStore,
  fetchFundstrProfileBundle: hoisted.fetchFundstrProfileBundle,
  FEATURED_CREATORS: hoisted.FEATURED_CREATORS,
}));

vi.mock("@/nostr/relayClient", () => ({
  toHex: hoisted.toHex,
}));

vi.mock("quasar", () => ({
  Notify: { create: hoisted.notifyCreate },
}));

const {
  applyBundleToCache,
  creatorsStore,
  useCreatorsStore,
  fetchFundstrProfileBundle,
  FEATURED_CREATORS,
  toHex,
  notifyCreate,
} = hoisted;

async function loadService() {
  const module = await import("src/nutzap/creatorCache");
  return module.creatorCacheService;
}

describe("creatorCacheService", () => {
  beforeEach(() => {
    applyBundleToCache.mockReset();
    fetchFundstrProfileBundle.mockReset();
    useCreatorsStore.mockReset();
    toHex.mockReset();
    notifyCreate.mockReset();
    FEATURED_CREATORS.splice(0, FEATURED_CREATORS.length);
    useCreatorsStore.mockReturnValue(creatorsStore);
    (window as any).creatorCacheService = undefined;
    vi.resetModules();
  });

  it("updateCreator converts inputs, fetches bundles, and applies them to the cache", async () => {
    toHex.mockImplementation((value: string) => `hex:${value}`);
    const bundle = { id: "bundle" };
    fetchFundstrProfileBundle.mockResolvedValueOnce(bundle);
    const service = await loadService();

    await service.updateCreator("npub123");

    expect(toHex).toHaveBeenCalledWith("npub123");
    expect(fetchFundstrProfileBundle).toHaveBeenCalledWith("hex:npub123");
    expect(applyBundleToCache).toHaveBeenCalledWith("hex:npub123", bundle, {
      cacheHit: false,
      featured: false,
    });
  });

  it("start updates all featured creators and shows a success notification", async () => {
    FEATURED_CREATORS.push("npub1", "npub2", "npub3");
    const service = await loadService();
    const updateSpy = vi
      .spyOn(service, "updateCreator")
      .mockImplementation(async () => {});

    await service.start();

    expect(updateSpy).toHaveBeenCalledTimes(3);
    expect(updateSpy).toHaveBeenNthCalledWith(1, "npub1");
    expect(updateSpy).toHaveBeenNthCalledWith(2, "npub2");
    expect(updateSpy).toHaveBeenNthCalledWith(3, "npub3");
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Creator cache has been updated.",
        color: "positive",
      }),
    );
  });

  it("notifies errors and allows a subsequent start after failures", async () => {
    FEATURED_CREATORS.push("npubA");
    const service = await loadService();
    const updateSpy = vi.spyOn(service, "updateCreator");
    updateSpy.mockRejectedValueOnce(new Error("boom"));
    updateSpy.mockResolvedValueOnce();

    await service.start();

    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Failed to update creator cache.",
        color: "negative",
      }),
    );

    await service.start();

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(notifyCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: "Creator cache has been updated.",
        color: "positive",
      }),
    );
  });

  it("guards against concurrent start calls while an update is in progress", async () => {
    FEATURED_CREATORS.push("npubX");
    const service = await loadService();
    const updateSpy = vi.spyOn(service, "updateCreator");

    let resolveUpdate: () => void;
    const pendingUpdate = new Promise<void>((resolve) => {
      resolveUpdate = resolve;
    });
    updateSpy.mockReturnValueOnce(pendingUpdate);

    const firstStart = service.start();
    const secondStartPromise = service.start();
    let secondStartResolved = false;
    void secondStartPromise.then(() => {
      secondStartResolved = true;
    });

    await Promise.resolve();

    expect(secondStartResolved).toBe(true);
    expect(updateSpy).toHaveBeenCalledTimes(1);

    await secondStartPromise;

    resolveUpdate!();
    await firstStart;

    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Creator cache has been updated.",
        color: "positive",
      }),
    );
  });
});
