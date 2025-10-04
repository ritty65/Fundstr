import { beforeEach, describe, expect, it, vi } from "vitest";

const relayWatchdogInstances: Array<{
  start: ReturnType<typeof vi.fn>;
  updateNdk: ReturnType<typeof vi.fn>;
}> = [];

vi.mock("src/js/nostr-runtime", () => ({
  RelayWatchdog: vi.fn().mockImplementation(() => {
    const instance = {
      start: vi.fn(),
      updateNdk: vi.fn(),
    };
    relayWatchdogInstances.push(instance);
    return instance;
  }),
}));

vi.mock("src/utils/relayHealth", () => ({
  filterHealthyRelays: vi.fn(async () => []),
}));

vi.mock("src/nostr/freeRelayFallback", () => ({
  getFreeRelayFallbackStatus: vi.fn(),
  onFreeRelayFallbackStatusChange: vi.fn(),
  hasFallbackAttempt: vi.fn(() => false),
  isFallbackUnreachable: vi.fn(() => false),
  markFallbackUnreachable: vi.fn(),
  recordFallbackAttempt: vi.fn(),
  resetFallbackState: vi.fn(),
}));

const settingsStoreMock = {
  defaultNostrRelays: [] as string[],
  relayBootstrapMode: undefined as string | undefined,
};

vi.mock("src/stores/settings", () => ({
  useSettingsStore: () => settingsStoreMock,
}));

vi.mock("@nostr-dev-kit/ndk", () => {
  class FakeNDK {
    pool: {
      relays: Map<string, any>;
      on: ReturnType<typeof vi.fn>;
      off: ReturnType<typeof vi.fn>;
    };
    signer: any;

    constructor(opts: { explicitRelayUrls?: string[] } = {}) {
      this.pool = {
        relays: new Map<string, any>(),
        on: vi.fn(),
        off: vi.fn(),
      };
      for (const url of opts.explicitRelayUrls ?? []) {
        this.addExplicitRelay(url);
      }
    }

    addExplicitRelay(url: string) {
      if (!this.pool.relays.has(url)) {
        this.pool.relays.set(url, {
          url,
          connected: false,
          disconnect: vi.fn(),
        });
      }
    }

    addOrConnect(url: string) {
      this.addExplicitRelay(url);
    }

    async connect() {
      for (const relay of this.pool.relays.values()) {
        relay.connected = true;
      }
    }

    subscribe() {
      return { stop: vi.fn() };
    }
  }

  return {
    __esModule: true,
    default: FakeNDK,
    NDKEvent: class {},
    NDKFilter: class {},
  };
});

describe("createReadOnlyNdk", () => {
  beforeEach(() => {
    settingsStoreMock.defaultNostrRelays = [];
    settingsStoreMock.relayBootstrapMode = undefined;
    relayWatchdogInstances.length = 0;
  });

  it("registers only the Fundstr relay when fundstrOnly is true", async () => {
    const { __testing } = await import("../../../src/boot/ndk");
    const { FUNDSTR_PRIMARY_RELAY } = await import("../../../src/config/relays");
    const ndk = await __testing.createReadOnlyNdk({ fundstrOnly: true });

    expect([...ndk.pool.relays.keys()]).toEqual([FUNDSTR_PRIMARY_RELAY]);
    expect(relayWatchdogInstances).toHaveLength(1);
    expect(relayWatchdogInstances[0].start).toHaveBeenCalledWith(1, [
      FUNDSTR_PRIMARY_RELAY,
    ]);
  });
});
