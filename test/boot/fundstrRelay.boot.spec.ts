import { describe, it, expect, vi, beforeEach } from "vitest";

const bootStub = (fn: any) => fn;

describe("boot/fundstrRelay", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("does not pre-connect the fundstr relay client during generic boot", async () => {
    vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));
    const connect = vi.fn();
    const ensureFundstrRelayClient = vi.fn(async () => ({ connect }));
    vi.doMock("src/nutzap/relayPublishing", () => ({
      ensureFundstrRelayClient,
    }));
    vi.doMock("src/nutzap/relayConfig", () => ({
      NUTZAP_RELAY_WSS: "wss://relay.fundstr",
    }));

    const module = await import("src/boot/fundstrRelay.ts");

    await module.default();

    expect(ensureFundstrRelayClient).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });
});
