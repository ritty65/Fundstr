import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { EventEmitter } from "events";

vi.mock("@noble/ciphers/aes.js", () => ({}), { virtual: true });
vi.mock("../src/composables/useNdk", () => ({
  useNdk: vi.fn(),
  rebuildNdk: vi.fn(),
}));

vi.mock("@nostr-dev-kit/ndk", () => {
  class RelaySet {
    relays: Set<any>;
    constructor(relays: Set<any>) {
      this.relays = relays;
    }
  }
  return {
    __esModule: true,
    default: class {},
    NDKKind: {
      Metadata: 0,
      EncryptedDirectMessage: 4,
    },
    NDKRelaySet: RelaySet,
  };
});

import { RelayWatchdog } from "../src/js/nostr-runtime";

class FakeSubscription extends EventEmitter {
  private readonly onStart?: (sub: FakeSubscription) => void;

  constructor(onStart?: (sub: FakeSubscription) => void) {
    super();
    this.onStart = onStart;
  }

  start() {
    this.onStart?.(this);
  }

  stop() {
    this.removeAllListeners();
  }
}

class FakeRelay {
  url: string;
  connected = true;
  connect = vi.fn(async () => {
    this.connected = true;
  });
  disconnect = vi.fn(() => {
    this.connected = false;
  });
  private heartbeatDelay: number | null = null;

  constructor(url: string) {
    this.url = url;
  }

  setHeartbeatResponse(delay: number | null) {
    this.heartbeatDelay = delay;
  }

  handleHeartbeat(sub: FakeSubscription) {
    if (this.heartbeatDelay == null) return;
    setTimeout(() => {
      sub.emit("eose");
    }, this.heartbeatDelay);
  }
}

class FakePool extends EventEmitter {
  relays: Map<string, FakeRelay>;

  constructor(relays: FakeRelay[]) {
    super();
    this.relays = new Map(relays.map((relay) => [relay.url, relay]));
  }
}

class FakeNdk {
  pool: FakePool;
  connect = vi.fn(async () => {});
  addExplicitRelay = vi.fn();

  constructor(relays: FakeRelay[]) {
    this.pool = new FakePool(relays);
  }

  subscribe(_filters: any, opts: any) {
    const relaySet: { relays: Set<any> } | undefined = opts?.relaySet;
    const relay = relaySet ? Array.from(relaySet.relays)[0] : undefined;
    const sub = new FakeSubscription((subscription) => {
      (relay as FakeRelay | undefined)?.handleHeartbeat(subscription);
    });
    return sub;
  }
}

describe("RelayWatchdog heartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("disconnects and reconnects stalled relays", async () => {
    const relay = new FakeRelay("wss://stall");
    relay.setHeartbeatResponse(null);
    const ndk = new FakeNdk([relay]);

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
    const relay = new FakeRelay("wss://alive");
    relay.setHeartbeatResponse(30);
    const ndk = new FakeNdk([relay]);

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
    expect(relay.connect).not.toHaveBeenCalled();

    watchdog.stop();
  });
});
