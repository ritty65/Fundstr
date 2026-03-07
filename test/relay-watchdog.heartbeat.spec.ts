import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { EventEmitter } from "events";
import NDK, { NDKRelay } from '@nostr-dev-kit/ndk';
import { RelayWatchdog } from "../src/js/nostr-runtime";

vi.mock("@noble/ciphers/aes.js", () => ({}), { virtual: true });
vi.mock("../src/composables/useNdk", () => ({
  useNdk: vi.fn(),
  rebuildNdk: vi.fn(),
}));
vi.mock('@nostr-dev-kit/ndk');


describe("RelayWatchdog heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("disconnects and reconnects stalled relays", async () => {
    const relayUrl = "wss://stall";
    const relay = new NDKRelay(relayUrl);
    const ndk = new NDK();

    // Mock the subscribe method to simulate a stalled relay
    (ndk as any).subscribe = vi.fn(() => {
        const sub = new EventEmitter();
        setTimeout(() => {
            // Never emit 'eose' to simulate a stall
        }, 10);
        return sub;
    });
    (ndk as any).pool.relays.set(relayUrl, relay);

    const watchdog = new RelayWatchdog(ndk as any, {
      heartbeatIntervalMs: 50,
      heartbeatAckTimeoutMs: 100,
      reconnectDelayMs: 150,
    });

    watchdog.start(1, []);

    await vi.runOnlyPendingTimersAsync();

    vi.advanceTimersByTime(50);
    await vi.runOnlyPendingTimersAsync();

    vi.advanceTimersByTime(100);
    expect(relay.disconnect).toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(relay.connect).toHaveBeenCalled();

    watchdog.stop();
  });

  it("keeps responsive relays connected", async () => {
    const relayUrl = "wss://alive";
    const relay = new NDKRelay(relayUrl);
    const ndk = new NDK();
    // Mock the subscribe method to simulate a responsive relay
    (ndk as any).subscribe = vi.fn(() => {
        const sub = new EventEmitter();
        setTimeout(() => {
            sub.emit('eose');
        }, 30);
        return sub;
    });
    (ndk as any).pool.relays.set(relayUrl, relay);

    const watchdog = new RelayWatchdog(ndk as any, {
      heartbeatIntervalMs: 40,
      heartbeatAckTimeoutMs: 100,
      reconnectDelayMs: 120,
    });

    watchdog.start(1, []);

    await vi.runOnlyPendingTimersAsync();
    vi.advanceTimersByTime(40);
    await vi.runOnlyPendingTimersAsync();
    vi.advanceTimersByTime(30);
    await vi.runOnlyPendingTimersAsync();

    vi.advanceTimersByTime(120);

    expect(relay.disconnect).not.toHaveBeenCalled();
    // The connect method on the mock is called once on instantiation
    expect(relay.connect).toHaveBeenCalledTimes(1);

    watchdog.stop();
  });
});