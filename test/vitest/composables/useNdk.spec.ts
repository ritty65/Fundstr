import { beforeEach, describe, expect, it, vi } from "vitest";

const createNdkMock = vi.fn<any, Promise<any>>();
const createSignedNdkMock = vi.fn<any, Promise<any>>();
const rebuildNdkBootMock = vi.fn<any, Promise<any>>();
const setFundstrOnlyMock = vi.fn<(enabled: boolean) => void>();

const nostrStoreMock: { signer?: unknown } = {};

vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
}));

vi.mock("../../../src/boot/ndk", () => ({
  createNdk: (...args: any[]) => createNdkMock(...args),
  createSignedNdk: (...args: any[]) => createSignedNdkMock(...args),
  rebuildNdk: (...args: any[]) => rebuildNdkBootMock(...args),
  setFundstrOnlyRuntimeOverride: (...args: any[]) => setFundstrOnlyMock(...args),
}));

describe("useNdk", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete nostrStoreMock.signer;
  });

  it("caches the default instance between calls", async () => {
    const instance = { id: "default", signer: undefined };
    createNdkMock.mockResolvedValue(instance);

    const { useNdk } = await import("../../../src/composables/useNdk");
    const first = await useNdk({ requireSigner: false });
    const second = await useNdk({ requireSigner: false });

    expect(first).toBe(instance);
    expect(second).toBe(instance);
    expect(createNdkMock).toHaveBeenCalledTimes(1);
    expect(setFundstrOnlyMock).toHaveBeenCalledWith(false);
  });

  it("promotes to a signed instance when a signer is required and available", async () => {
    const unsigned = { id: "unsigned", signer: undefined };
    const signed = { id: "signed", signer: {} };
    createNdkMock.mockResolvedValue(unsigned);
    createSignedNdkMock.mockResolvedValue(signed);
    nostrStoreMock.signer = { type: "nip07" };

    const { useNdk } = await import("../../../src/composables/useNdk");
    const ndk = await useNdk();

    expect(createSignedNdkMock).toHaveBeenCalledWith(nostrStoreMock.signer);
    expect(ndk).toBe(signed);
  });

  it("separates cached fundstr-only instances from the default pool", async () => {
    const fundstr = { id: "fundstr", signer: undefined };
    const defaultInstance = { id: "default", signer: undefined };
    createNdkMock.mockImplementation((opts?: any) =>
      Promise.resolve(opts?.fundstrOnly ? fundstr : defaultInstance),
    );

    const { useNdk } = await import("../../../src/composables/useNdk");
    const fundstrA = await useNdk({ fundstrOnly: true, requireSigner: false });
    const fundstrB = await useNdk({ fundstrOnly: true, requireSigner: false });
    const fallback = await useNdk({ fundstrOnly: false, requireSigner: false });

    expect(fundstrA).toBe(fundstr);
    expect(fundstrB).toBe(fundstr);
    expect(fallback).toBe(defaultInstance);
    expect(createNdkMock).toHaveBeenCalledTimes(2);
    expect(setFundstrOnlyMock).toHaveBeenCalledWith(true);
    expect(setFundstrOnlyMock).toHaveBeenLastCalledWith(false);
  });

  it("rebuilds the cached instance via the boot helper", async () => {
    const rebuilt = { id: "rebuilt", signer: undefined };
    const relays = ["wss://relay.example"];
    const signer = { type: "private-key" };
    rebuildNdkBootMock.mockResolvedValue(rebuilt);

    const { rebuildNdk, useNdk } = await import("../../../src/composables/useNdk");

    await rebuildNdk(relays, signer as any);

    expect(rebuildNdkBootMock).toHaveBeenCalledWith(relays, signer);
    expect(setFundstrOnlyMock).toHaveBeenLastCalledWith(false);

    const ndk = await useNdk({ requireSigner: false });
    expect(ndk).toBe(rebuilt);
    expect(createNdkMock).not.toHaveBeenCalled();
  });

  it("propagates createNdk failures and allows retrying", async () => {
    createNdkMock.mockRejectedValueOnce(new Error("boom"));
    createNdkMock.mockResolvedValueOnce({ id: "fundstr", signer: undefined });

    const { useNdk } = await import("../../../src/composables/useNdk");

    await expect(useNdk({ fundstrOnly: true, requireSigner: false })).rejects.toThrow("boom");

    const ndk = await useNdk({ fundstrOnly: true, requireSigner: false });

    expect(ndk.id).toBe("fundstr");
    expect(createNdkMock).toHaveBeenCalledTimes(2);
    expect(setFundstrOnlyMock).toHaveBeenCalledWith(true);
  });
});
