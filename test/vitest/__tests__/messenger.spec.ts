import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

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
var publishEventViaHttpMock: any;
var requestEventsViaHttpMock: any;
var useNdkMock: any;
var ndkInstance: any;
var relayInitMock: any;
var relayExpectations: Record<string, { ok: boolean; error?: string }>;

vi.mock("nostr-tools", async (importOriginal) => {
  const actual = await importOriginal();
  relayExpectations = {};
  relayInitMock = vi.fn((url: string) => {
    const relay = {
      url,
      challenge: "",
      connect: vi.fn(async () => {}),
      close: vi.fn(() => {}),
      auth: vi.fn(async () => {}),
      publish: vi.fn((event: any) => {
        const okHandlers: ((id?: string) => void)[] = [];
        const failHandlers: ((reason: any) => void)[] = [];
        setTimeout(() => {
          const expectation = relayExpectations[url] ?? { ok: true };
          if (expectation.ok) {
            okHandlers.forEach((handler) => handler(event.id));
          } else {
            failHandlers.forEach((handler) => handler(expectation.error ?? "error"));
          }
        }, 0);
        return {
          on: (eventName: string, handler: any) => {
            if (eventName === "ok") okHandlers.push(handler);
            if (eventName === "failed") failHandlers.push(handler);
          },
        };
      }),
    };
    return relay;
  });
  return {
    ...actual,
    relayInit: relayInitMock,
  };
});

vi.mock("../../../src/utils/fundstrRelayHttp", () => {
  publishEventViaHttpMock = vi.fn(async () => ({
    id: "http",
    accepted: true,
    via: "http" as const,
  }));
  requestEventsViaHttpMock = vi.fn(async () => []);
  return {
    publishEventViaHttp: publishEventViaHttpMock,
    requestEventsViaHttp: requestEventsViaHttpMock,
    buildRequestUrl: (base: string, filters: any[]) =>
      `${base}?filters=${encodeURIComponent(JSON.stringify(filters))}`,
    DEFAULT_HTTP_ACCEPT: "application/json",
  };
});
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
  return {
    ...actual,
    useNostrStore: () => store,
  };
});

vi.mock("../../../src/composables/useNdk", () => {
  subscribeMock = vi.fn(() => ({ on: vi.fn(), stop: vi.fn() }));
  ndkInstance = {
    subscribe: subscribeMock,
    pool: { relays: new Map<string, any>() },
  };
  useNdkMock = vi.fn(async () => ndkInstance);
  return { useNdk: useNdkMock };
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
  publishEventViaHttpMock.mockClear();
  requestEventsViaHttpMock.mockClear();
  subscribeMock.mockClear();
  useNdkMock.mockClear();
  notifySpy.mockClear();
  notifyErrorSpy.mockClear();
  resolvePubkey.mockImplementation((pk: string) => pk);
  relayExpectations = {};
  publishEventViaHttpMock.mockResolvedValue({
    id: "http",
    accepted: true,
    via: "http",
  });
  requestEventsViaHttpMock.mockResolvedValue([]);
  ndkInstance.pool.relays = new Map([["wss://relay", { url: "wss://relay", connected: true }]]);
});

describe("messenger store", () => {
  it("broadcasts DM to all relays", async () => {
    const messenger = useMessengerStore();
    (globalThis as any).nostr = {
      nip04: { encrypt: vi.fn(async () => "enc"), decrypt: vi.fn() },
      signEvent: vi.fn(async (e) => ({ ...e, id: "id", sig: "sig" })),
    };
    messenger.relays = ["wss://a", "wss://b"] as any;
    relayExpectations["wss://a"] = { ok: true };
    relayExpectations["wss://b"] = { ok: true };
    await messenger.sendDm("r", "m", ["wss://a", "wss://b"]);
    expect(relayInitMock).toHaveBeenCalledWith("wss://a");
    expect(relayInitMock).toHaveBeenCalledWith("wss://b");
    expect(publishEventViaHttpMock).not.toHaveBeenCalled();
    const convo = messenger.conversations.r;
    expect(convo?.[0].status).toBe("sent");
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
    expect(subscribeMock).toHaveBeenCalledTimes(2);
    const incomingFilter = subscribeMock.mock.calls[0][0];
    const outgoingFilter = subscribeMock.mock.calls[1][0];
    expect(incomingFilter.kinds).toEqual([4]);
    expect(incomingFilter["#p"]).toEqual(["pub"]);
    expect(outgoingFilter.kinds).toEqual([4]);
    expect(outgoingFilter.authors).toEqual(["pub"]);
    expect(requestEventsViaHttpMock).not.toHaveBeenCalled();
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
    relayExpectations["wss://relay"] = { ok: true };
    await messenger.sendDm("r", { bad: "obj" } as any, ["wss://relay"]);
    expect(relayInitMock).toHaveBeenCalled();
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

  it("falls back to HTTP when all relays fail to publish", async () => {
    const messenger = useMessengerStore();
    (globalThis as any).nostr = {
      nip04: { encrypt: vi.fn(async () => "enc"), decrypt: vi.fn() },
      signEvent: vi.fn(async (e) => ({ ...e, id: "id", sig: "sig" })),
    };
    relayExpectations["wss://a"] = { ok: false, error: "down" };

    await messenger.sendDm("npub1alice", "hello", ["wss://a"]);

    expect(publishEventViaHttpMock).toHaveBeenCalled();
    const convo = messenger.conversations.npub1alice;
    expect(convo?.[0].status).toBe("sent");
    expect(convo?.[0].relayResults?.["wss://a"]).toEqual({
      ok: false,
      error: "down",
      via: "ws",
    });
    const httpEntry = Object.entries(convo?.[0].relayResults ?? {}).find(
      ([, ack]) => ack?.via === "http",
    );
    expect(httpEntry?.[1].ok).toBe(true);
  });

  it("reports HTTP fallback error when publish fails over HTTP", async () => {
    const messenger = useMessengerStore();
    (globalThis as any).nostr = {
      nip04: { encrypt: vi.fn(async () => "enc"), decrypt: vi.fn() },
      signEvent: vi.fn(async (e) => ({ ...e, id: "id", sig: "sig" })),
    };
    relayExpectations["wss://a"] = { ok: false, error: "down" };
    publishEventViaHttpMock.mockRejectedValue(new Error("offline"));

    await messenger.sendDm("npub1bob", "hello", ["wss://a"]);

    expect(publishEventViaHttpMock).toHaveBeenCalled();
    expect(notifyErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("offline"),
    );
    const convo = messenger.conversations.npub1bob;
    expect(convo?.[0].status).toBe("failed");
    const httpEntry = Object.entries(convo?.[0].relayResults ?? {}).find(
      ([, ack]) => ack?.via === "http",
    );
    expect(httpEntry?.[1]?.ok).toBe(false);
  });

  it("hydrates messages via HTTP fallback when no relays connect", async () => {
    const messenger = useMessengerStore();
    ndkInstance.pool.relays = new Map();
    requestEventsViaHttpMock.mockResolvedValue([
      { id: "1", pubkey: "npub1charlie", content: "cipher", created_at: 1 },
    ]);

    await messenger.start();

    expect(requestEventsViaHttpMock).toHaveBeenCalledTimes(1);
    expect(messenger.conversations.npub1charlie?.length).toBeGreaterThan(0);
  });

  it("notifies when HTTP fallback sync fails", async () => {
    const messenger = useMessengerStore();
    ndkInstance.pool.relays = new Map();
    requestEventsViaHttpMock.mockRejectedValue(new Error("http offline"));

    await messenger.start();

    expect(requestEventsViaHttpMock).toHaveBeenCalled();
    expect(notifyErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("http offline"),
    );
  });
});
