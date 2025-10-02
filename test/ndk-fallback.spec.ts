import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FREE_RELAYS } from "../src/config/relays";

class FakePool {
  relays = new Map<string, any>();
  on = vi.fn();
  off = vi.fn();
}

class FakeNdk {
  pool = new FakePool();
  addExplicitRelay = vi.fn((url: string) => {
    this.pool.relays.set(url, { url, connected: false });
  });
  connect = vi.fn(async () => {});
}

describe("free relay fallback", () => {
  beforeEach(async () => {
    const fallbackModule = await import("../src/nostr/freeRelayFallback");
    fallbackModule.__testing.clearTelemetry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("only appends free relays once per failure cycle", async () => {
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    const ndkModule = await import("../src/boot/ndk");
    const safeConnectSpy = vi
      .spyOn(ndkModule, "safeConnect")
      .mockResolvedValue(new Error("connect failed"));

    const ndk = new FakeNdk();
    ndk.pool.relays.set("wss://primary", { url: "wss://primary", connected: false });

    await ndkModule.__testing.ensureFreeRelayFallback(ndk as any, "bootstrap");

    expect(ndk.addExplicitRelay).toHaveBeenCalledTimes(FREE_RELAYS.length);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(ndkModule.getFreeRelayFallbackStatus().unreachable).toBe(true);

    ndk.addExplicitRelay.mockClear();
    consoleWarn.mockClear();
    safeConnectSpy.mockClear();

    await ndkModule.__testing.ensureFreeRelayFallback(ndk as any, "bootstrap");

    expect(ndk.addExplicitRelay).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();

    const fallbackModule = await import("../src/nostr/freeRelayFallback");
    fallbackModule.resetFallbackState(ndk as any);
    fallbackModule.__testing.clearTelemetry();

    ndk.pool.relays.clear();

    await ndkModule.__testing.ensureFreeRelayFallback(ndk as any, "bootstrap");

    expect(ndk.addExplicitRelay).toHaveBeenCalledTimes(FREE_RELAYS.length);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
  });

  it("relay watchdog avoids repeated fallback bursts", async () => {
    vi.useFakeTimers();
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const consoleDebug = vi
      .spyOn(console, "debug")
      .mockImplementation(() => undefined);

    const fallbackModule = await import("../src/nostr/freeRelayFallback");
    fallbackModule.__testing.clearTelemetry();

    const ndk = new FakeNdk();
    ndk.pool.relays.set("wss://primary", { url: "wss://primary", connected: false });
    ndk.connect.mockImplementation(async () => {
      throw new Error("connect failed");
    });

    const { RelayWatchdog } = await import("../src/js/nostr-runtime");
    const watchdog = new RelayWatchdog(ndk as any, {
      heartbeatIntervalMs: 50,
      heartbeatAckTimeoutMs: 100,
      reconnectDelayMs: 100,
    });

    try {
      watchdog.start(1, FREE_RELAYS);

      await Promise.resolve();
      await vi.runOnlyPendingTimersAsync();

      expect(ndk.addExplicitRelay).toHaveBeenCalledTimes(FREE_RELAYS.length);
      expect(consoleWarn).toHaveBeenCalledTimes(1);

      ndk.addExplicitRelay.mockClear();
      consoleWarn.mockClear();

      vi.advanceTimersByTime(5000);
      await vi.runOnlyPendingTimersAsync();

      expect(ndk.addExplicitRelay).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();
    } finally {
      watchdog.stop();
      consoleDebug.mockRestore();
      vi.useRealTimers();
    }
  });
});
