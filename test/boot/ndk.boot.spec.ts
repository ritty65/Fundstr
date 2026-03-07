import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const bootStub = (fn: any) => fn;

type SetupOptions = {
  relayBootstrapMode?: string;
  relayDebugLogsEnabled?: any;
  defaultRelays?: string[];
};

type SetupResult = {
  module: typeof import("src/boot/ndk");
  MockNDK: any;
  settings: any;
  resetFallbackState: ReturnType<typeof vi.fn>;
  clearRelayFailureCache: ReturnType<typeof vi.fn>;
};

async function setupNdkModule(
  options: SetupOptions = {},
): Promise<SetupResult> {
  const settings = {
    relayBootstrapMode: options.relayBootstrapMode ?? "auto",
    relayDebugLogsEnabled: options.relayDebugLogsEnabled ?? { value: true },
    defaultNostrRelays: options.defaultRelays ?? [],
  };

  const resetFallbackState = vi.fn();
  const clearRelayFailureCache = vi.fn();
  const filterHealthyRelays = vi.fn(() => Promise.resolve<string[]>([]));
  const mustConnectRequiredRelays = vi.fn();

  vi.doMock("quasar/wrappers", () => ({ boot: bootStub }));
  vi.doMock("stores/bootError", () => ({ useBootErrorStore: vi.fn(() => ({ set: vi.fn() })) }));

  const nostrStore = {
    initSignerIfNotSet: vi.fn(() => Promise.resolve()),
    loadKeysFromStorage: vi.fn(() => Promise.resolve()),
    signer: null,
    sendDirectMessageUnified: vi.fn(() => Promise.resolve({ success: true })),
  };
  vi.doMock("stores/nostr", () => ({ useNostrStore: vi.fn(() => nostrStore) }));

  vi.doMock("src/stores/settings", () => ({
    useSettingsStore: vi.fn(() => settings),
    DEFAULT_RELAY_DEBUG_LOGS_ENABLED: true,
  }));

  vi.doMock("src/config/relays", () => ({
    DEFAULT_RELAYS: options.defaultRelays ?? ["wss://relay.default", "wss://relay.backup"],
    FREE_RELAYS: ["wss://relay.free"],
    FUNDSTR_PRIMARY_RELAY: "wss://relay.primary",
  }));

  vi.doMock("src/nostr/relayClient", () => ({ clearRelayFailureCache }));
  vi.doMock("src/utils/relayHealth", () => ({ filterHealthyRelays }));

  const relayWatchdogStart = vi.fn();
  const relayWatchdogStop = vi.fn();
  const relayWatchdogUpdate = vi.fn();
  class RelayWatchdogMock {
    start = relayWatchdogStart;
    stop = relayWatchdogStop;
    updateNdk = relayWatchdogUpdate;
  }
  vi.doMock("src/js/nostr-runtime", () => ({ RelayWatchdog: RelayWatchdogMock }));

  vi.doMock("src/nostr/freeRelayFallback", () => ({
    getFreeRelayFallbackStatus: vi.fn(),
    hasFallbackAttempt: vi.fn(() => false),
    isFallbackUnreachable: vi.fn(() => false),
    markFallbackUnreachable: vi.fn(),
    onFreeRelayFallbackStatusChange: vi.fn(),
    recordFallbackAttempt: vi.fn(),
    resetFallbackState,
  }));

  vi.doMock("src/nostr/relays", () => ({ mustConnectRequiredRelays }));

  vi.doMock("@nostr-dev-kit/ndk", () => {
    const handlersKey = Symbol("handlers");
    class MockNDK {
      pool: any;
      signer: any;
      constructor(opts: any = {}) {
        const handlers = new Map<string, Set<Function>>();
        const relays = new Map<string, any>();
        this.pool = {
          relays,
          [handlersKey]: handlers,
          handlers,
          on: (event: string, handler: Function) => {
            if (!handlers.has(event)) {
              handlers.set(event, new Set());
            }
            handlers.get(event)!.add(handler);
          },
          off: (event: string, handler: Function) => {
            handlers.get(event)?.delete(handler);
          },
        };
        this.explicitRelayUrls = opts.explicitRelayUrls ?? [];
        for (const url of this.explicitRelayUrls) {
          this.addExplicitRelay(url);
        }
      }

      explicitRelayUrls: string[];

      addExplicitRelay(url: string) {
        this.pool.relays.set(url, { url, connected: false, disconnect: vi.fn() });
      }

      async connect() {
        for (const relay of this.pool.relays.values()) {
          relay.connected = true;
        }
      }
    }

    class NDKSigner {}
    class NDKEvent {}

    return { default: MockNDK, NDKSigner, NDKEvent };
  });

  const module = await import("src/boot/ndk");
  const MockNDK = (await import("@nostr-dev-kit/ndk")).default;

  return {
    module,
    MockNDK,
    settings,
    resetFallbackState,
    clearRelayFailureCache,
  };
}

describe("boot/ndk", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("merges default relays when fundstr-only override is active", async () => {
    const { module, MockNDK, settings } = await setupNdkModule({
      relayBootstrapMode: "auto",
    });

    const ndk = new MockNDK({ explicitRelayUrls: [] });
    module.setFundstrOnlyRuntimeOverride(true);
    module.mergeDefaultRelays(ndk as any);

    const relays = Array.from(ndk.pool.relays.keys());
    expect(relays).toContain("wss://relay.default");
    expect(relays).toContain("wss://relay.backup");

    module.setFundstrOnlyRuntimeOverride(false);
    settings.defaultNostrRelays = ["wss://relay.user"];
    const ndkWithoutOverride = new MockNDK({ explicitRelayUrls: [] });
    module.mergeDefaultRelays(ndkWithoutOverride as any);
    expect(Array.from(ndkWithoutOverride.pool.relays.keys())).toEqual([]);
  });

  it("attaches relay handlers that respect the debug logging toggle", async () => {
    const { module } = await setupNdkModule({
      relayBootstrapMode: "auto",
      relayDebugLogsEnabled: { value: true },
    });

    const ndk = await module.createNdk();
    const handlers: Map<string, Set<Function>> = (ndk.pool as any).handlers;

    expect(handlers.has("relay:disconnect")).toBe(true);
    expect(handlers.has("relay:connect")).toBe(true);
    expect(handlers.has("notice")).toBe(true);

    const disconnectHandler = Array.from(handlers.get("relay:disconnect") ?? [])[0]!;

    const consoleDebug = vi.spyOn(console, "debug").mockImplementation(() => {});
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    disconnectHandler({ url: "wss://relay.one" });
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1000);

    await vi.runOnlyPendingTimersAsync();

    expect(consoleDebug).toHaveBeenCalledWith(
      "[NDK] relay disconnected: wss://relay.one",
    );
  });

  it("clears fallback state and failure cache on relay connect", async () => {
    const { module, clearRelayFailureCache, resetFallbackState } = await setupNdkModule({
      relayBootstrapMode: "auto",
      relayDebugLogsEnabled: false,
    });

    const ndk = await module.createNdk();
    const handlers: Map<string, Set<Function>> = (ndk.pool as any).handlers;
    const connectHandler = Array.from(handlers.get("relay:connect") ?? [])[0]!;

    const relay = { url: "wss://relay.connected" };
    connectHandler(relay);

    expect(resetFallbackState).toHaveBeenCalledWith(ndk);
    expect(clearRelayFailureCache).toHaveBeenCalledWith("wss://relay.connected");
  });

  it("skips disconnect logging when debug logs are disabled", async () => {
    const { module, settings } = await setupNdkModule({
      relayBootstrapMode: "auto",
      relayDebugLogsEnabled: false,
    });

    const ndk = await module.createNdk();
    const handlers: Map<string, Set<Function>> = (ndk.pool as any).handlers;
    const disconnectHandler = Array.from(handlers.get("relay:disconnect") ?? [])[0]!;

    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const consoleDebug = vi.spyOn(console, "debug").mockImplementation(() => {});

    settings.relayDebugLogsEnabled = false;
    disconnectHandler({ url: "wss://relay.one" });

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(consoleDebug).not.toHaveBeenCalled();
  });
});
