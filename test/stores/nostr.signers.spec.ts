import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

vi.mock("src/js/logger", () => ({
  debug: vi.fn(),
}));

vi.mock("src/js/notify", () => ({
  notifyWarning: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyApiError: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("src/utils/relay", () => ({
  sanitizeRelayUrls: (urls: string[]) => urls.map((url) => url.trim().toLowerCase()),
}));

vi.mock("src/utils/ecash", () => ({
  ensureCompressed: (key: string) => key,
}));

vi.mock("src/stores/settings", () => {
  const store = {
    defaultNostrRelays: [] as string[] | null,
  };
  return {
    useSettingsStore: () => store,
    __mockSettingsStore: store,
    __resetSettingsStore: () => {
      store.defaultNostrRelays = [];
    },
  };
});

vi.mock("src/stores/wallet", () => {
  const initialSeed = () =>
    new Uint8Array(Array.from({ length: 64 }, (_, index) => (index + 1) % 256));
  const store = {
    seed: initialSeed(),
    $reset: vi.fn(),
  };
  return {
    useWalletStore: () => store,
    __mockWalletStore: store,
    __resetWalletStore: () => {
      store.seed = initialSeed();
      store.$reset.mockClear();
    },
  };
});

vi.mock("src/stores/messenger", () => {
  const store = {
    start: vi.fn(),
  };
  return {
    useMessengerStore: () => store,
    __mockMessengerStore: store,
    __resetMessengerStore: () => {
      store.start.mockClear();
    },
  };
});

vi.mock("src/nutzap/relayClient", async () => {
  const { ref } = await vi.importActual<typeof import("vue")>("vue");
  return {
    useFundstrRelayStatus: () => ref("disconnected"),
  };
});

vi.mock("src/stores/p2pk", () => {
  const store = {
    p2pkKeys: [] as Array<{ publicKey: string; privateKey: string; used: boolean; usedCount: number }>,
    haveThisKey: vi.fn((key: string) => store.p2pkKeys.some((entry) => entry.publicKey === key)),
  };
  return {
    useP2PKStore: () => store,
    __mockP2PKStore: store,
    __resetP2PKStore: () => {
      store.p2pkKeys = [];
      store.haveThisKey.mockClear();
    },
  };
});

vi.mock("@vueuse/core", async () => {
  const { ref } = await vi.importActual<typeof import("vue")>("vue");
  const storage = new Map<string, ReturnType<typeof ref>>();
  return {
    useLocalStorage: vi.fn(<T>(key: string, initial: T) => {
      if (!storage.has(key)) {
        storage.set(key, ref(initial));
      }
      return storage.get(key)!;
    }),
    __resetUseLocalStorage: () => {
      storage.clear();
    },
  };
});

vi.mock("src/composables/useNdk", () => {
  const makePool = () => ({
    relays: new Map<string, { disconnect: () => void; url: string }>(),
    on: vi.fn(),
    off: vi.fn(),
  });
  let current = {
    pool: makePool(),
    connect: vi.fn(),
    getUser: vi.fn(() => ({ fetchProfile: vi.fn(), profile: null })),
    addExplicitRelay: vi.fn(),
  };
  return {
    useNdk: vi.fn(async () => current),
    rebuildNdk: vi.fn(async () => current),
    __setMockNdkInstance: (ndk: typeof current) => {
      current = ndk;
    },
    __resetMockNdkInstance: () => {
      current = {
        pool: makePool(),
        connect: vi.fn(),
        getUser: vi.fn(() => ({ fetchProfile: vi.fn(), profile: null })),
        addExplicitRelay: vi.fn(),
      };
    },
  };
});

vi.mock("@nostr-dev-kit/ndk", () => {
  const nip07Queue: Array<Partial<MockNip07Signer>> = [];
  const nip07Instances: MockNip07Signer[] = [];
  const nip46Queue: Array<Partial<MockNip46Signer>> = [];
  const nip46Instances: MockNip46Signer[] = [];

  class MockNDK {
    pool = {
      relays: new Map<string, any>(),
      on: vi.fn(),
      off: vi.fn(),
    };
    addExplicitRelay = vi.fn();
  }

  class MockNip07Signer {
    blockUntilReady = vi.fn(async () => undefined);
    user = vi.fn(async () => ({ npub: "npub-default", pubkey: "pubkey-default" }));
    getRelays = vi.fn(async () => null as Record<string, any> | null);
    on = vi.fn();
    constructor() {
      Object.assign(this, nip07Queue.shift() ?? {});
      nip07Instances.push(this);
    }
  }

  class MockNip46Signer {
    listeners = new Map<string, (payload: any) => void>();
    blockUntilReady = vi.fn(async () => ({ npub: "npub-nip46", pubkey: "pubkey-nip46" }));
    on = vi.fn((event: string, handler: (payload: any) => void) => {
      this.listeners.set(event, handler);
    });
    emit(event: string, payload: any) {
      this.listeners.get(event)?.(payload);
    }
    constructor(public ndk: MockNDK, public token: string) {
      Object.assign(this, nip46Queue.shift() ?? {});
      nip46Instances.push(this);
    }
  }

  class MockNDKEvent {
    kind = 0;
    content = "";
    tags: any[] = [];
    created_at?: number;
    constructor() {}
    sign = vi.fn(async () => "signature");
    rawEvent = vi.fn(() => ({}));
  }

  class MockNDKPrivateKeySigner {
    constructor(public privateKey: string) {}
  }

  class MockNDKSigner {}
  class MockNDKRelay {}
  class MockNDKRelaySet {}
  class MockNDKFilter {}
  class MockNDKTag {}
  class MockNDKSubscription {}
  class MockNDKPublishError extends Error {}

  const reset = () => {
    nip07Queue.length = 0;
    nip07Instances.length = 0;
    nip46Queue.length = 0;
    nip46Instances.length = 0;
  };

  return {
    default: MockNDK,
    NDKEvent: MockNDKEvent,
    NDKSigner: MockNDKSigner,
    NDKNip07Signer: MockNip07Signer,
    NDKNip46Signer: MockNip46Signer,
    NDKPrivateKeySigner: MockNDKPrivateKeySigner,
    NDKRelay: MockNDKRelay,
    NDKRelaySet: MockNDKRelaySet,
    NDKRelayStatus: { OPEN: 1 },
    NDKFilter: MockNDKFilter,
    NDKKind: {},
    NDKTag: MockNDKTag,
    NDKSubscription: MockNDKSubscription,
    NDKPublishError: MockNDKPublishError,
    mockNip07Instances: nip07Instances,
    queueNip07Instance: (overrides: Partial<MockNip07Signer>) => {
      nip07Queue.push(overrides);
    },
    mockNip46Instances: nip46Instances,
    queueNip46Instance: (overrides: Partial<MockNip46Signer>) => {
      nip46Queue.push(overrides);
    },
    resetNdkMocks: reset,
  };
});

import { nip19, getPublicKey } from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";

import { useNostrStore, SignerType } from "src/stores/nostr";
import { queueNip07Instance, mockNip07Instances, resetNdkMocks, queueNip46Instance, mockNip46Instances, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";
import { __mockSettingsStore, __resetSettingsStore } from "src/stores/settings";
import { __mockWalletStore, __resetWalletStore } from "src/stores/wallet";
import { __resetMessengerStore } from "src/stores/messenger";
import { __resetP2PKStore } from "src/stores/p2pk";
import { __resetUseLocalStorage } from "@vueuse/core";
import { notifyWarning } from "src/js/notify";
import { __setMockNdkInstance, __resetMockNdkInstance } from "src/composables/useNdk";

if (!(globalThis as any).localStorage) {
  (globalThis as any).localStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  } as any;
}

const seedSecret = () => __mockWalletStore.seed.slice(0, 32);

describe("useNostrStore signer initialisation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    resetNdkMocks();
    __resetUseLocalStorage();
    __resetSettingsStore();
    __resetWalletStore();
    __resetMessengerStore();
    __resetP2PKStore();
    __resetMockNdkInstance();
    localStorage.clear();

    setActivePinia(createPinia());
    const nostr = useNostrStore();
    currentStore = nostr;
    connectSpy = vi.spyOn(nostr, "connect").mockResolvedValue();
    window.alert = vi.fn();
    window.open = vi.fn();
    (window as any).nostr = { enable: vi.fn() };
  });

  let currentStore: ReturnType<typeof useNostrStore>;
  let connectSpy: ReturnType<typeof vi.spyOn>;

  it("warns once when NIP-07 signer is unavailable", async () => {
    vi.spyOn(currentStore, "checkNip07Signer").mockResolvedValue(false);

    await currentStore.initNip07Signer();

    expect(notifyWarning).toHaveBeenCalledWith(
      "Nostr extension locked or unavailable",
      "Unlock your NIP-07 extension to enable signing",
    );
    expect(currentStore.nip07Warned).toBe(true);
    expect(currentStore.initialized).toBe(true);
    expect(currentStore.signerType).toBe(SignerType.SEED);
  });

  it("initialises NIP-07 signer, assigns pubkey, and caches relays", async () => {
    const pubkey = "abcdef".padEnd(64, "0");
    queueNip07Instance({
      user: vi.fn().mockResolvedValue({ npub: "npub123", pubkey }),
      getRelays: vi
        .fn()
        .mockResolvedValue({ "wss://Relay.ONE ": {}, "wss://relay.two": {} }),
    });
    vi.spyOn(currentStore, "checkNip07Signer").mockResolvedValue(true);

    await currentStore.initNip07Signer({ skipRelayConnect: true });

    expect(currentStore.signerType).toBe(SignerType.NIP07);
    expect(currentStore.pubkey).toBe(pubkey);
    expect(currentStore.cachedNip07Relays).toEqual([
      "wss://relay.one",
      "wss://relay.two",
    ]);
    expect(currentStore.relays).toEqual(["wss://relay.one", "wss://relay.two"]);
    expect(__mockSettingsStore.defaultNostrRelays).toEqual([
      "wss://relay.one",
      "wss://relay.two",
    ]);

    const [firstSigner] = mockNip07Instances.slice(-1);
    expect(firstSigner.getRelays).toHaveBeenCalledTimes(1);

    queueNip07Instance({
      user: vi.fn().mockResolvedValue({ npub: "npub123", pubkey }),
      getRelays: vi.fn(),
    });
    currentStore.cachedNip07Relays = ["wss://cached" ];

    await currentStore.initNip07Signer({ skipRelayConnect: true });

    const [secondSigner] = mockNip07Instances.slice(-1);
    expect(secondSigner.getRelays).not.toHaveBeenCalled();
    expect(currentStore.relays).toEqual(["wss://cached"]);
  });

  it("derives keys for private key signer and preserves state on errors", async () => {
    const privateKey = new Uint8Array(32).fill(1);
    const nsec = nip19.nsecEncode(privateKey);
    const expectedPubkey = getPublicKey(privateKey);
    const expectedHex = bytesToHex(privateKey);

    await currentStore.initPrivateKeySigner(nsec, { skipRelayConnect: true });

    expect(currentStore.signerType).toBe(SignerType.PRIVATEKEY);
    expect(currentStore.pubkey).toBe(expectedPubkey);
    expect(currentStore.privateKeySignerPrivateKey).toBe(expectedHex);
    expect(currentStore.signer).toBeInstanceOf(NDKPrivateKeySigner);

    const snapshot = {
      pubkey: currentStore.pubkey,
      hex: currentStore.privateKeySignerPrivateKey,
      signer: currentStore.signer,
    };

    await expect(
      currentStore.initPrivateKeySigner("invalid", { skipRelayConnect: true }),
    ).rejects.toThrow();

    expect(currentStore.pubkey).toBe(snapshot.pubkey);
    expect(currentStore.privateKeySignerPrivateKey).toBe(snapshot.hex);
    expect(currentStore.signer).toBe(snapshot.signer);
  });

  it("initialises NIP-46 signer, persists token, and reacts to auth URL", async () => {
    const ndkPoolRelay = { disconnect: vi.fn(), url: "wss://example" };
    const mockNdk = {
      pool: {
        relays: new Map([["relay", ndkPoolRelay]]),
        on: vi.fn(),
        off: vi.fn(),
      },
      connect: vi.fn(),
      addExplicitRelay: vi.fn(),
    };
    __setMockNdkInstance(mockNdk);

    queueNip46Instance({
      blockUntilReady: vi.fn().mockResolvedValue({ npub: "npub-46", pubkey: "pubkey-46" }),
    });

    await currentStore.initNip46Signer("token-123");

    expect(currentStore.nip46Token).toBe("token-123");
    expect(currentStore.signerType).toBe(SignerType.NIP46);
    expect(currentStore.pubkey).toBe("pubkey-46");
    expect(window.alert).toHaveBeenCalledWith("You are now logged in as npub-46");
    expect(connectSpy).toHaveBeenCalled();

    const signer = mockNip46Instances[mockNip46Instances.length - 1];
    signer.emit("authUrl", "https://auth.example");
    expect(window.open).toHaveBeenCalledWith("https://auth.example", "auth", "width=600,height=600");
  });

  it("connects when enable() is missing but core NIP-07 methods exist", async () => {
    (window as any).nostr = {
      getPublicKey: vi.fn().mockResolvedValue("pubkey-core"),
      signEvent: vi.fn(),
      nip04: { encrypt: vi.fn(), decrypt: vi.fn() },
      nip44: { encrypt: vi.fn(), decrypt: vi.fn() },
      getSharedSecret: vi.fn(),
    };

    queueNip07Instance({
      user: vi.fn().mockResolvedValue({ npub: "npub-core", pubkey: "pubkey-core" }),
    });

    await expect(currentStore.connectBrowserSigner()).resolves.not.toThrow();

    expect(currentStore.signerType).toBe(SignerType.NIP07);
    expect(currentStore.pubkey).toBe("pubkey-core");
  });

  it("reports gracefully when enable() and core methods are missing", async () => {
    (window as any).nostr = {};

    const available = await currentStore.checkNip07Signer(true);

    expect(available).toBe(false);
    expect(currentStore.nip07LastFailureCause).toBe("core-methods-missing");
  });

  it("teardown helpers reset signers and restore seed signer", async () => {
    const relay = { disconnect: vi.fn(), url: "wss://relay" };
    const mockNdk = {
      pool: {
        relays: new Map([["relay", relay]]),
        on: vi.fn(),
        off: vi.fn(),
      },
      connect: vi.fn(),
      addExplicitRelay: vi.fn(),
    };
    __setMockNdkInstance(mockNdk);

    currentStore.signer = {} as any;
    currentStore.connected = true;
    currentStore.connectedRelays.add("relay");

    await currentStore.disconnect();

    expect(relay.disconnect).toHaveBeenCalled();
    expect(currentStore.signer).toBeUndefined();
    expect(currentStore.connected).toBe(false);
    expect(currentStore.connectedRelays.size).toBe(0);

    const seedBytes = seedSecret();
    const seedPubkey = getPublicKey(seedBytes);
    const seedHex = bytesToHex(seedBytes);

    currentStore.signerType = SignerType.NIP46;
    currentStore.pubkey = "another";
    currentStore.nip46Token = "nip46-token";

    await currentStore.resetNip46Signer();

    expect(currentStore.nip46Token).toBe("");
    expect(currentStore.signerType).toBe(SignerType.SEED);
    expect(currentStore.pubkey).toBe(seedPubkey);
    expect(currentStore.seedSignerPrivateKey).toBe(seedHex);

    currentStore.signerType = SignerType.PRIVATEKEY;
    currentStore.privateKeySignerPrivateKey = "deadbeef";
    currentStore.pubkey = "something";

    await currentStore.resetPrivateKeySigner();

    expect(currentStore.privateKeySignerPrivateKey).toBe("");
    expect(currentStore.signerType).toBe(SignerType.SEED);
    expect(currentStore.pubkey).toBe(seedPubkey);

    currentStore.signer = undefined;
    await currentStore.initWalletSeedPrivateKeySigner({ skipRelayConnect: true });

    expect(currentStore.signerType).toBe(SignerType.SEED);
    expect(currentStore.pubkey).toBe(seedPubkey);
    expect(currentStore.seedSignerPrivateKey).toBe(seedHex);
    expect(currentStore.signer).toBeInstanceOf(NDKPrivateKeySigner);
  });

  it.each([
    { signerType: SignerType.NIP07, initMethod: "initNip07Signer" as const },
    {
      signerType: SignerType.PRIVATEKEY,
      initMethod: "initPrivateKeySigner" as const,
    },
  ])(
    "reload keeps pending %s identity without falling back to seed",
    async ({ signerType, initMethod }) => {
      const pendingPubkey = `${signerType}-pending`.padEnd(64, "0");

      localStorage.setItem("cashu.ndk.pubkey.pending", pendingPubkey);
      localStorage.setItem("cashu.ndk.signerType.pending", signerType);
      localStorage.setItem("cashu.ndk.signerPubkey.pending", pendingPubkey);

      setActivePinia(createPinia());
      const reloadedStore = useNostrStore();

      const initSpy = vi
        .spyOn(reloadedStore, initMethod)
        .mockImplementation(async () => {
          reloadedStore.signerType = signerType;
          reloadedStore.pubkey = pendingPubkey;
        });
      const seedSpy = vi
        .spyOn(reloadedStore, "initWalletSeedPrivateKeySigner")
        .mockResolvedValue();

      vi.spyOn(reloadedStore, "onIdentityChange").mockResolvedValue();
      vi.spyOn(reloadedStore, "getProfile").mockResolvedValue(null);

      if (signerType === SignerType.NIP07) {
        vi.spyOn(reloadedStore, "checkNip07Signer").mockResolvedValue(true);
      }

      await reloadedStore.initSignerIfNotSet({ skipRelayConnect: true });

      expect(reloadedStore.signerType).toBe(signerType);
      expect(reloadedStore.pubkey).toBe(pendingPubkey);
      expect(initSpy).toHaveBeenCalled();
      expect(seedSpy).not.toHaveBeenCalled();
    },
  );
});
