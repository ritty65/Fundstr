import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useNdkBootStore } from "@/stores/ndkBoot";
import { NdkBootError } from "boot/ndk";

const hoisted = vi.hoisted(() => ({
  getNdkMock: vi.fn(),
}));

vi.mock("boot/ndk", async () => {
  const actual = await vi.importActual<typeof import("@/boot/ndk")>("boot/ndk");
  return {
    ...actual,
    getNdk: hoisted.getNdkMock,
  };
});

describe("ndkBoot store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    hoisted.getNdkMock.mockReset();
  });

  it("clears errors after a successful retry", async () => {
    const store = useNdkBootStore();
    store.error = new NdkBootError("connect-failed", "offline");
    hoisted.getNdkMock.mockResolvedValueOnce(undefined);

    await store.retry();

    expect(hoisted.getNdkMock).toHaveBeenCalledTimes(1);
    expect(store.error).toBeNull();
  });

  it("propagates existing NdkBootError instances", async () => {
    const store = useNdkBootStore();
    const error = new NdkBootError("no-signer", "missing");
    hoisted.getNdkMock.mockRejectedValueOnce(error);

    await expect(store.retry()).rejects.toBe(error);
    expect(store.error).toBe(error);
  });

  it("wraps unknown errors in an NdkBootError", async () => {
    const store = useNdkBootStore();
    const genericError = new Error("boom");
    hoisted.getNdkMock.mockRejectedValueOnce(genericError);

    await expect(store.retry()).rejects.toBe(genericError);
    expect(store.error).toBeInstanceOf(NdkBootError);
    expect(store.error?.reason).toBe("unknown");
    expect(store.error?.message).toBe("boom");
  });
});
