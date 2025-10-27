import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const bootStub = (fn: any) => fn;

describe("boot/prefetch-featured-creators", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs errors when featured creator loading fails", async () => {
    vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));

    const loadError = new Error("failed to load");
    const loadFeaturedCreators = vi.fn(() => Promise.reject(loadError));
    const creatorsStore = { loadFeaturedCreators };
    const useCreatorsStore = vi.fn(() => creatorsStore);
    vi.doMock("stores/creators", () => ({ useCreatorsStore }));

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const module = await import("src/boot/prefetch-featured-creators.ts");

    const store = Symbol("pinia-store");
    module.default({ store });

    expect(useCreatorsStore).toHaveBeenCalledWith(store);

    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalledWith(
      "Failed to pre-fetch featured creators:",
      loadError,
    );
  });
});
