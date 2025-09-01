import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

var publishWithAcksMock: any;
var decryptDm: any;
var walletGen: any;
var subscribeMock: any;

const lsStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in lsStore ? lsStore[k] : null),
  setItem: (k: string, v: string) => {
    lsStore[k] = String(v);
  },
  removeItem: (k: string) => {
    delete lsStore[k];
  },
  clear: () => {
    for (const k in lsStore) delete lsStore[k];
  },
  key: (i: number) => Object.keys(lsStore)[i] ?? null,
  get length() {
    return Object.keys(lsStore).length;
  },
};

vi.mock("../../../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  publishWithAcksMock = vi.fn(async () => ({
    "wss://relay.example": { ok: true },
  }));
  decryptDm = vi.fn(async () => "msg");
  walletGen = vi.fn();
  const signer = { sign: vi.fn(async () => {}), user: vi.fn(async () => ({})) };
  const store = {
    decryptDmContent: decryptDm,
    encryptDmContent: vi.fn(async (_k, _r, m) => m),
    fetchUserRelays: vi.fn(async () => ["wss://relay.example"]),
    walletSeedGenerateKeyPair: walletGen,
    initSignerIfNotSet: vi.fn(),
    privKeyHex: "priv",
    pubkey: "pub",
    connected: true,
    lastError: null,
    relays: [] as string[],
    signerType: "seed",
    signerCaps: { nip44Encrypt: true, nip44Decrypt: true },
    signer,
  };
  return {
    ...actual,
    publishWithAcks: publishWithAcksMock,
    useNostrStore: () => store,
  };
});

vi.mock("../../../src/js/nostr-runtime", () => ({
  RelayWatchdog: class {},
}));

vi.mock("../../../src/composables/useNdk", () => {
  subscribeMock = vi.fn(() => ({ on: vi.fn(), stop: vi.fn() }));
  const ndk = { subscribe: subscribeMock };
  return { useNdk: vi.fn(async () => ndk) };
});

vi.mock("../../../src/js/message-utils", () => ({
  sanitizeMessage: vi.fn((s: string) => s),
}));

vi.mock("../../../src/utils/relayHealth", () => ({
  filterHealthyRelays: vi.fn(async (relays: string[]) => relays),
}));

var notifySpy: any;
var notifyErrorSpy: any;
vi.mock("../../../src/js/notify", () => {
  notifySpy = vi.fn();
  notifyErrorSpy = vi.fn();
  return { notifySuccess: notifySpy, notifyError: notifyErrorSpy };
});

import { useMessengerStore } from "../../../src/stores/messenger";
import { useNostrStore } from "../../../src/stores/nostr";

beforeEach(() => {
  setActivePinia(createPinia());
  for (const k in lsStore) delete lsStore[k];
  const m = useMessengerStore();
  (m as any).eventLog = [];
  (m as any).conversations = {};
  vi.clearAllMocks();
});

describe("messenger store", () => {
  it("publishes DM with relay acknowledgements", async () => {
    const messenger = useMessengerStore();
    await messenger.sendDm("r", "m");
    expect(publishWithAcksMock).toHaveBeenCalled();
  });

  it("decrypts incoming messages with global key", async () => {
    const messenger = useMessengerStore();
    await messenger.addIncomingMessage({
      id: "1",
      pubkey: "s",
      content: "c?iv=1",
      created_at: 1,
    } as any);
    expect(decryptDm).toHaveBeenCalledWith("priv", "s", "c?iv=1");
  });

  it("subscribes using global key on start", async () => {
    const messenger = useMessengerStore();
    await messenger.start();
    expect(subscribeMock).toHaveBeenCalledTimes(2);
    const call1 = subscribeMock.mock.calls[0][0];
    expect(call1.kinds).toEqual([4]);
    expect(call1["#p"]).toEqual(["pub"]);
    const call2 = subscribeMock.mock.calls[1][0];
    expect(call2.kinds).toEqual([1059]);
    expect(call2["#p"]).toEqual(["pub"]);
  });

  it("notifies when starting without privkey", async () => {
    const messenger = useMessengerStore();
    const nostr = useNostrStore();
    nostr.privateKeySignerPrivateKey = "";
    await messenger.start();
    expect(notifyErrorSpy).toHaveBeenCalled();
  });

  it("handles multi-line JSON messages", async () => {
    const messenger = useMessengerStore();
    (decryptDm as any).mockResolvedValue('{"a":1}\n{"b":2}');
    await messenger.addIncomingMessage({
      id: "1",
      pubkey: "s",
      content: "c",
      created_at: 1,
    } as any);
    expect(Array.isArray(messenger.eventLog)).toBe(true);
  });

  it("handles malformed content when sending", async () => {
    const messenger = useMessengerStore();
    await messenger.sendDm("r", { bad: "obj" } as any);
    expect(publishWithAcksMock).toHaveBeenCalled();
    expect(messenger.conversations.r[0].content).toBe("");
  });
});
