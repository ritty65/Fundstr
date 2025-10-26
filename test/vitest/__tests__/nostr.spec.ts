import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  useNostrStore,
  SignerType,
  publishDmNip04,
  PublishTimeoutError,
  ensureWriteConnectivity,
  normalizeWsUrls,
  publishWithTimeout,
} from "../../../src/stores/nostr";
import { useP2PKStore } from "../../../src/stores/p2pk";
import { NDKKind, NDKPublishError } from "@nostr-dev-kit/ndk";

var ndkStub: any;
vi.mock("../../../src/composables/useNdk", () => {
  ndkStub = {
    pool: { getRelay: (u: string) => ({ url: u }) },
    debug: { extend: () => () => {} },
  };
  return { useNdk: vi.fn().mockResolvedValue(ndkStub) };
});

var encryptMock: any;
let publishSuccess = true;
vi.mock("nostr-tools", () => {
  encryptMock = vi.fn((content: string) => content);
  return {
    nip04: { encrypt: encryptMock },
    nip19: { decode: vi.fn(), nsecEncode: vi.fn(), nprofileEncode: vi.fn() },
    nip44: {
      v2: {
        encrypt: encryptMock,
        utils: { getConversationKey: vi.fn(() => "k") },
      },
    },
    generateSecretKey: () => new Uint8Array(32).fill(1),
    getPublicKey: () => "b".repeat(64),
    SimplePool: class {
      publish() {
        if (publishSuccess) {
          return [];
        }
        throw new Error("fail");
      }
    },
  };
});

const getNdkMock = vi.fn();
vi.mock("../../../src/config/relays", () => ({
  DEFAULT_RELAYS: [],
  FREE_RELAYS: ["wss://free.one"],
  VETTED_OPEN_WRITE_RELAYS: [],
}));

vi.mock("../../../src/boot/ndk", () => ({
  getNdk: () => getNdkMock(),
  NdkBootError: class NdkBootError extends Error {},
}));

vi.mock("@noble/hashes/utils", () => ({
  bytesToHex: (b: Uint8Array) => Buffer.from(b).toString("hex"),
  hexToBytes: (h: string) => Uint8Array.from(Buffer.from(h, "hex")),
}));

vi.mock("../../../src/stores/wallet", () => ({
  useWalletStore: () => ({ seed: new Uint8Array(32).fill(2) }),
}));

var notifySuccess: any;
var notifyError: any;
vi.mock("../../../src/js/notify", () => {
  notifySuccess = vi.fn();
  notifyError = vi.fn();
  return { notifySuccess, notifyError };
});

let filterHealthyRelaysFn: any;
vi.mock("../../../src/utils/relayHealth", () => ({
  filterHealthyRelays: (...args: any[]) => filterHealthyRelaysFn(...args),
}));

beforeEach(() => {
  encryptMock.mockClear();
  localStorage.clear();
  notifySuccess.mockClear();
  notifyError.mockClear();
  vi.useFakeTimers();
  filterHealthyRelaysFn = vi.fn(async (r: string[]) =>
    r.length ? r : ["wss://relay.test"],
  );
  getNdkMock.mockReset();
  getNdkMock.mockResolvedValue(createNdkStub() as any);
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

describe.skip("sendDirectMessageUnified", () => {
  it("returns signed event when published", async () => {
    const store = useNostrStore();
    const promise = store.sendDirectMessageUnified("r", "m");
    vi.runAllTimers();
    const res = await promise;
    expect(res.success).toBe(true);
    expect(res.event).not.toBeNull();
    expect(res.event!.sig).toBeDefined();
    const used = encryptMock.mock.calls[0][0];
    const parsed = JSON.parse(used);
    expect(parsed.sig).toBeDefined();
  });

  it("constructs event with correct kind and tags", async () => {
    const store = useNostrStore();
    const res = await store.sendDirectMessageUnified("receiver", "msg");
    vi.runAllTimers();
    expect(res.event!.kind).toBe(NDKKind.EncryptedDirectMessage);
    expect(res.event!.tags).toContainEqual(["p", "receiver"]);
    expect(res.event!.tags).toContainEqual(["p", store.seedSignerPublicKey]);
  });

  it("generates keypair if not set", async () => {
    const store = useNostrStore();
    expect(store.seedSignerPrivateKey).toBe("");
    const res = await store.sendDirectMessageUnified("receiver", "msg");
    vi.runAllTimers();
    expect(res.success).toBe(true);
    expect(res.event).not.toBeNull();
    expect(store.seedSignerPrivateKey).not.toBe("");
  });

  it("returns null when publish fails", async () => {
    const store = useNostrStore();
    publishSuccess = false;
    const promise = store.sendDirectMessageUnified("r", "m");
    vi.runAllTimers();
    const res = await promise;
    expect(res.success).toBe(false);
    expect(res.event).toBeNull();
    expect(notifyError).toHaveBeenCalled();
    publishSuccess = true;
  });
});

function createNdkStub(relays: Array<{ url: string; status: number }> = []) {
  const listenerMap = new Map<string, Set<(...args: any[]) => void>>();
  const addExplicitRelay = vi.fn();
  const pool = {
    relays: new Map(relays.map((r) => [r.url, r])),
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      if (!listenerMap.has(event)) {
        listenerMap.set(event, new Set());
      }
      listenerMap.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: (...args: any[]) => void) => {
      listenerMap.get(event)?.delete(cb);
    }),
  };
  return { addExplicitRelay, pool, listenerMap };
}

describe("ensureWriteConnectivity", () => {
  it("returns existing open relays without waiting for events", async () => {
    const stub = createNdkStub([
      { url: "wss://relay.one/", status: 1 },
      { url: "wss://relay.two/", status: 1 },
    ]);
    getNdkMock.mockResolvedValue(stub as any);

    const result = await ensureWriteConnectivity(
      ["wss://relay.one/", "wss://relay.two/", "wss://relay.one/"],
      { minConnected: 2, timeoutMs: 50 },
    );

    expect(result.urlsTried).toEqual([
      "wss://relay.one",
      "wss://relay.two",
      "wss://free.one",
    ]);
    expect(result.urlsConnected).toEqual([
      "wss://relay.one",
      "wss://relay.two",
    ]);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(stub.pool.on).toHaveBeenCalledWith(
      "relay:connect",
      expect.any(Function),
    );
    expect(stub.pool.off).toHaveBeenCalledWith(
      "relay:connect",
      expect.any(Function),
    );
    expect(stub.addExplicitRelay).toHaveBeenCalledWith("wss://relay.one");
    expect(stub.addExplicitRelay).toHaveBeenCalledWith("wss://relay.two");
    expect(stub.addExplicitRelay).toHaveBeenCalledWith("wss://free.one");
  });

  it("waits for relay:connect events up to minConnected", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
    const stub = createNdkStub();
    getNdkMock.mockResolvedValue(stub as any);

    const promise = ensureWriteConnectivity(["ws://new-relay"], {
      minConnected: 1,
      timeoutMs: 1000,
    });

    const onConnect = Array.from(
      stub.listenerMap.get("relay:connect") ?? [],
    )[0] as (relay: { url: string }) => void;
    expect(onConnect).toBeTypeOf("function");

    vi.advanceTimersByTime(500);
    vi.setSystemTime(new Date(500));
    onConnect({ url: "wss://connected.one/" } as any);

    const result = await promise;
    expect(result.urlsConnected).toEqual(["wss://connected.one"]);
    expect(result.urlsTried).toEqual(["wss://new-relay", "wss://free.one"]);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(500);

    expect(stub.pool.off).toHaveBeenCalledWith("relay:connect", onConnect);
    expect(stub.addExplicitRelay).toHaveBeenCalledWith("wss://new-relay");
    expect(stub.addExplicitRelay).toHaveBeenCalledWith("wss://free.one");
  });
});

describe("normalizeWsUrls", () => {
  it("deduplicates and trims invalid relay URLs", () => {
    const normalized = normalizeWsUrls([
      " wss://relay.one/ ",
      "wss://relay.one",
      "ftp://ignored", // should be dropped
      "wss://relay.two///",
      "", // should be filtered out
    ] as any);

    expect(normalized).toEqual(["wss://relay.one", "wss://relay.two"]);
  });
});

describe("publishWithTimeout", () => {
  it("resolves when publish completes before timeout", async () => {
    const ev = { publish: vi.fn(() => Promise.resolve()) } as any;
    await expect(publishWithTimeout(ev, undefined, 10)).resolves.toBeUndefined();
    expect(ev.publish).toHaveBeenCalled();
  });

  it("rejects with PublishTimeoutError when publish takes too long", async () => {
    vi.useFakeTimers();
    const ev = {
      publish: vi.fn(
        () =>
          new Promise<void>(() => {
            /* never resolves */
          }),
      ),
    } as any;

    const promise = publishWithTimeout(ev, undefined, 5);
    await vi.advanceTimersByTimeAsync(6);
    await expect(promise).rejects.toBeInstanceOf(PublishTimeoutError);
  });
});

describe.skip("lastNip04EventTimestamp", () => {
  it("clamps future timestamps on init", () => {
    const future = Math.floor(Date.now() / 1000) + 1000;
    localStorage.setItem(
      "cashu.ndk.nip04.lastEventTimestamp",
      JSON.stringify(future),
    );
    const store = useNostrStore();
    const now = Math.floor(Date.now() / 1000);
    expect(store.lastNip04EventTimestamp).toBeLessThanOrEqual(now);
  });
});

describe.skip("setPubkey", () => {
  it("preserves existing P2PK first key", () => {
    const p2pk = useP2PKStore();
    p2pk.p2pkKeys = [
      { publicKey: "aa", privateKey: "aa", used: false, usedCount: 0 },
    ];
    const first = p2pk.firstKey;

    const store = useNostrStore();
    store.signerType = SignerType.SEED;
    store.seedSignerPrivateKey = "11".repeat(32);
    store.setPubkey("a".repeat(64));

    expect(p2pk.firstKey).toBe(first);
    expect(p2pk.p2pkKeys.length).toBe(1);
  });
});

describe("publishDmNip04", () => {
  const relays = ["wss://relay.one"];

  it("includes relay URLs in notification on NDKPublishError", async () => {
    const error = new NDKPublishError("fail", new Map(), new Set());
    const ev = { publish: () => Promise.reject(error) } as any;
    const success = await publishDmNip04(ev, relays, 1);
    expect(success).toBe(false);
    expect(notifyError).toHaveBeenCalledWith(
      expect.stringContaining(relays[0]),
    );
  });

  it("advises checking network on timeout", async () => {
    const ev = { publish: () => new Promise(() => {}) } as any;
    const promise = publishDmNip04(ev, relays, 10);
    vi.runAllTimers();
    const success = await promise;
    expect(success).toBe(false);
    expect(notifyError).toHaveBeenCalledWith(
      expect.stringContaining("network"),
    );
  });
});
