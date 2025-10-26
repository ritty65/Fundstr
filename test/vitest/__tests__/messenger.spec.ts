import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

var publishMock: any;
vi.mock("nostr-tools", async (orig) => {
  const actual = await orig();
  publishMock = vi.fn(async () => {});
  return { ...actual, SimplePool: class { publish = publishMock } };
});

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

var decryptDm: any;
var subscribeMock: any;
var resolvePubkey: any;
vi.mock("../../../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  decryptDm = vi.fn(async () => "msg");
  resolvePubkey = vi.fn((pk: string) => pk);
  const store = {
    decryptDmContent: decryptDm,
    initSignerIfNotSet: vi.fn(),
    fetchUserRelays: vi.fn(async () => []),
    privKeyHex: "priv",
    pubkey: "pub",
    connected: true,
    signerType: "NIP07",
    resolvePubkey,
  } as any;
  return { ...actual, useNostrStore: () => store };
});

vi.mock("../../../src/composables/useNdk", () => {
  subscribeMock = vi.fn(() => ({ on: vi.fn(), stop: vi.fn() }));
  const ndk = { subscribe: subscribeMock };
  return { useNdk: vi.fn(async () => ndk) };
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

beforeEach(() => {
  setActivePinia(createPinia());
  for (const k in lsStore) delete lsStore[k];
  const m = useMessengerStore();
  (m as any).eventLog = [];
  (m as any).conversations = {};
  publishMock.mockClear();
  notifySpy.mockClear();
  notifyErrorSpy.mockClear();
  resolvePubkey.mockImplementation((pk: string) => pk);
});

describe("messenger store", () => {
  it("broadcasts DM to all relays", async () => {
    const messenger = useMessengerStore();
    (globalThis as any).nostr = {
      nip04: { encrypt: vi.fn(async () => "enc"), decrypt: vi.fn() },
      signEvent: vi.fn(async (e) => ({ ...e, id: "id", sig: "sig" })),
    };
    messenger.relays = ["wss://a", "wss://b"] as any;
    await messenger.sendDm("r", "m");
    expect(publishMock).toHaveBeenCalledTimes(2);
  });

  it("decrypts incoming messages with extension", async () => {
    const messenger = useMessengerStore();
    (globalThis as any).nostr = {
      nip04: { decrypt: vi.fn(async () => "msg"), encrypt: vi.fn() },
      signEvent: vi.fn(),
    };
    await messenger.addIncomingMessage({
      id: "1",
      pubkey: "s",
      content: "c?iv=1",
      created_at: 1,
    } as any);
    expect(decryptDm).toHaveBeenCalledWith(undefined, "s", "c?iv=1");
  });

  it("subscribes to kind 4 on start", async () => {
    const messenger = useMessengerStore();
    await messenger.start();
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    const call = subscribeMock.mock.calls[0][0];
    expect(call.kinds).toEqual([4]);
    expect(call["#p"]).toEqual(["pub"]);
  });

  it("handles multi-line JSON messages", async () => {
    const messenger = useMessengerStore();
    decryptDm.mockResolvedValue('{"a":1}\n{"b":2}');
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
    (globalThis as any).nostr = {
      nip04: { encrypt: vi.fn(async () => "enc"), decrypt: vi.fn() },
      signEvent: vi.fn(async (e) => ({ ...e, id: "id", sig: "sig" })),
    };
    await messenger.sendDm("r", { bad: "obj" } as any);
    expect(publishMock).toHaveBeenCalled();
    expect(messenger.conversations.r[0].content).toBe("");
  });

  it("recovers from corrupted event log in localStorage", () => {
    lsStore["cashu.messenger.pub.eventLog"] = "{\"bad\":1}";
    setActivePinia(createPinia());
    const messenger = useMessengerStore();
    expect(Array.isArray(messenger.eventLog)).toBe(true);
    expect(messenger.eventLog.length).toBe(0);
    (messenger as any).eventLog = { bad: true } as any;
    expect(messenger.sendQueue.length).toBe(0);
    expect(Array.isArray(messenger.eventLog)).toBe(true);
  });

  it("normalizes unknown pubkeys to empty string", () => {
    const messenger = useMessengerStore();
    resolvePubkey.mockReturnValueOnce("");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(messenger.normalizeKey("npub1bad" as any)).toBe("");
    expect(warn).toHaveBeenCalledWith("[messenger] invalid pubkey", "npub1bad");
    warn.mockRestore();
  });

  it("notifies when retrying without browser signer", async () => {
    const messenger = useMessengerStore();
    (globalThis as any).nostr = undefined;
    await messenger.retryMessage({
      id: "1",
      pubkey: "alice",
      content: "hi",
      created_at: 1,
      outgoing: true,
      status: "failed",
    } as any);
    expect(notifyErrorSpy).toHaveBeenCalledWith(
      "Cannot retry – no Nostr extension",
    );
  });

  it("retries each failed message in the queue", async () => {
    const messenger = useMessengerStore();
    const retrySpy = vi
      .spyOn(messenger, "retryMessage")
      .mockResolvedValueOnce(undefined as any);
    messenger.eventLog.push(
      {
        id: "1",
        pubkey: "bob",
        content: "pending",
        created_at: 1,
        outgoing: true,
        status: "failed",
      } as any,
      {
        id: "2",
        pubkey: "carol",
        content: "pending",
        created_at: 2,
        outgoing: true,
        status: "failed",
      } as any,
    );

    await messenger.retryFailedMessages();

    expect(retrySpy).toHaveBeenCalledTimes(2);
    retrySpy.mockRestore();
  });
});
