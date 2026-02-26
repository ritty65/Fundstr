import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const bootStub = (fn: any) => fn;

describe("boot/cashu", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("notifies when the active mint is unsupported", async () => {
    vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));
    const notifyCreate = vi.fn();
    vi.doMock("quasar", () => ({ Notify: { create: notifyCreate } }));

    const initKeys = vi.fn();
    const useWalletStore = vi.fn(() => ({ wallet: { initKeys } }));
    vi.doMock("src/stores/wallet", () => ({ useWalletStore }));

    const useMintsStore = vi.fn(() => ({ activeMintUrl: "https://mint.example" }));
    vi.doMock("src/stores/mints", () => ({ useMintsStore }));

    const verifyMint = vi.fn().mockResolvedValue(false);
    vi.doMock("src/boot/mint-info", () => ({ verifyMint }));

    const module = await import("src/boot/cashu.js");

    await expect(module.default()).rejects.toThrow("Unsupported mint");
    expect(verifyMint).toHaveBeenCalledWith("https://mint.example");
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "negative",
        message: expect.stringContaining("NUT"),
      }),
    );
    expect(initKeys).not.toHaveBeenCalled();
  });

  it("warns but continues when mint verification fails due to network", async () => {
    vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));
    const notifyCreate = vi.fn();
    vi.doMock("quasar", () => ({ Notify: { create: notifyCreate } }));

    const initKeys = vi.fn().mockResolvedValue(undefined);
    const useWalletStore = vi.fn(() => ({ wallet: { initKeys } }));
    vi.doMock("src/stores/wallet", () => ({ useWalletStore }));

    const useMintsStore = vi.fn(() => ({ activeMintUrl: "https://mint.example" }));
    vi.doMock("src/stores/mints", () => ({ useMintsStore }));

    const verifyMint = vi.fn().mockResolvedValue(null);
    vi.doMock("src/boot/mint-info", () => ({ verifyMint }));

    const module = await import("src/boot/cashu.js");

    await expect(module.default()).resolves.toBeUndefined();
    expect(verifyMint).toHaveBeenCalledWith("https://mint.example");
    expect(notifyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
      }),
    );
    expect(initKeys).toHaveBeenCalledTimes(1);
  });

  it("initializes wallet keys when the mint is valid", async () => {
    vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));
    const notifyCreate = vi.fn();
    vi.doMock("quasar", () => ({ Notify: { create: notifyCreate } }));

    const initKeys = vi.fn().mockResolvedValue(undefined);
    const useWalletStore = vi.fn(() => ({ wallet: { initKeys } }));
    vi.doMock("src/stores/wallet", () => ({ useWalletStore }));

    const useMintsStore = vi.fn(() => ({ activeMintUrl: "https://mint.example" }));
    vi.doMock("src/stores/mints", () => ({ useMintsStore }));

    const verifyMint = vi.fn().mockResolvedValue(true);
    vi.doMock("src/boot/mint-info", () => ({ verifyMint }));

    const module = await import("src/boot/cashu.js");

    await expect(module.default()).resolves.toBeUndefined();
    expect(verifyMint).toHaveBeenCalledWith("https://mint.example");
    expect(initKeys).toHaveBeenCalledTimes(1);
    expect(notifyCreate).not.toHaveBeenCalled();
  });
});
