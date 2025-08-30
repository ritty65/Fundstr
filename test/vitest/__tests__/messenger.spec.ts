import { beforeEach, describe, expect, it, vi } from "vitest";

var sendNip17: any;
var sendDmLegacy: any;
var decryptDm: any;
var stickySub: any;
var walletGen: any;

vi.mock("../../../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  sendNip17 = vi.fn(async () => ({ id: "1", created_at: 0 }));
  sendDmLegacy = vi.fn(async () => ({
    success: true,
    event: { id: "1", created_at: 0 },
  }));
  decryptDm = vi.fn(async () => "msg");
  walletGen = vi.fn();
  const store = {
    sendNip17DirectMessage: sendNip17,
    sendDirectMessageUnified: sendDmLegacy,
    decryptNip04: decryptDm,
    walletSeedGenerateKeyPair: walletGen,
    initSignerIfNotSet: vi.fn(),
    privateKeySignerPrivateKey: "priv",
    seedSignerPrivateKey: "",
    pubkey: "pub",
    connected: true,
    lastError: null,
    relays: [] as string[],
  };
  Object.defineProperty(store, "privKeyHex", {
    get() {
      return store.privateKeySignerPrivateKey;
    },
  });
  return { ...actual, useNostrStore: () => store };
});

vi.mock("../../../src/js/nostr-runtime", () => {
  stickySub = vi.fn(async (_pub: string, _getSince: any, cb: any) => {
    const ev = {
      pubkey: "s",
      content: "c",
      toNostrEvent: async () => ({ id: "1", pubkey: "s", content: "c", created_at: 1 }),
    };
    cb && cb(ev as any);
    return vi.fn();
  });
  return { stickyDmSubscription: stickySub, RelayWatchdog: class {} };
});

vi.mock("../../../src/js/message-utils", () => ({
  sanitizeMessage: vi.fn((s: string) => s),
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
  localStorage.clear();
  vi.clearAllMocks();
});

describe("messenger store", () => {
  it("uses NIP-17 when sending DMs", async () => {
    const messenger = useMessengerStore();
    await messenger.sendDm("r", "m");
    expect(sendNip17).toHaveBeenCalledWith("r", "m", undefined);
    expect(sendDmLegacy).not.toHaveBeenCalled();
  });

  it("decrypts incoming messages with global key", async () => {
    const messenger = useMessengerStore();
    await messenger.addIncomingMessage({
      id: "1",
      pubkey: "s",
      content: "c",
      created_at: 1,
    } as any);
    expect(decryptDm).toHaveBeenCalledWith("priv", "s", "c");
  });

  it("subscribes using global key on start", async () => {
    const messenger = useMessengerStore();
    await messenger.start();
    expect(stickySub).toHaveBeenCalled();
    const args = stickySub.mock.calls[0];
    expect(args[0]).toBe("pub");
    const sinceFn = args[1];
    expect(typeof sinceFn).toBe("function");
    expect(sinceFn()).toBe(0);
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
    expect(messenger.eventLog.length).toBe(1);
    expect(messenger.eventLog[0].content).toBe('{"a":1}\n{"b":2}');
  });
});
