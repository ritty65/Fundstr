import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { ref, nextTick } from "vue";
import { FUNDSTR_EVT_URL } from "../../../src/nutzap/relayEndpoints";
import { DM_POLL_INTERVAL_MS } from "../../../src/config/dm";

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
var publishWithAcksMock: any;
var publishEventViaHttpMock: any;
var requestEventsViaHttpMock: any;
var useNdkMock: any;
var ndkInstance: any;

const relayStatusRef = ref<
  "connecting" | "connected" | "reconnecting" | "disconnected"
>("connecting");

vi.mock("../../../src/nutzap/relayClient", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useFundstrRelayStatus: () => relayStatusRef,
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
vi.mock("../../../src/nutzap/relayPublishing", () => {
  const ensureFundstrRelayClient = vi.fn(async (relayUrl: string) => {
    return {
      setAuthOptions: vi.fn(),
      publishSigned: vi.fn(async (event: any) => {
        const ackMap = await publishWithAcksMock(event, [relayUrl]);
        const relayAck = ackMap?.[relayUrl] || { ok: false, reason: undefined };
        return {
          ack: {
            id: event.id,
            accepted: relayAck.ok === true,
            message: relayAck.reason,
            via: "ws" as const,
          },
        };
      }),
    };
  });
  return { ensureFundstrRelayClient };
});
vi.mock("../../../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  decryptDm = vi.fn(async () => "msg");
  resolvePubkey = vi.fn((pk: string) => pk);
  publishWithAcksMock = vi.fn(async () => ({}));
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
    publishWithAcks: publishWithAcksMock,
  };
});

vi.mock("../../../src/composables/useNdk", () => {
  subscribeMock = vi.fn(() => ({ on: vi.fn(), stop: vi.fn() }));
  ndkInstance = {
    subscribe: subscribeMock,
    pool: { relays: new Map<string, any>() },
    fetchEvent: vi.fn(async () => null),
  };
  useNdkMock = vi.fn(async () => ndkInstance);
  return { useNdk: useNdkMock };
});

vi.mock("../../../src/js/message-utils", () => ({
  sanitizeMessage: vi.fn((s: string) => s),
}));

var notifySpy: any;
var notifyErrorSpy: any;
var notifyWarningSpy: any;
vi.mock("../../../src/js/notify", () => {
  notifySpy = vi.fn();
  notifyErrorSpy = vi.fn();
  notifyWarningSpy = vi.fn();
  return {
    notifySuccess: notifySpy,
    notifyError: notifyErrorSpy,
    notifyWarning: notifyWarningSpy,
  };
});

import { useMessengerStore } from "../../../src/stores/messenger";
import { useNostrStore } from "../../../src/stores/nostr";
import * as dmSigner from "../../../src/nostr/dmSigner";

beforeEach(() => {
  setActivePinia(createPinia());
  for (const k in lsStore) delete lsStore[k];
  relayStatusRef.value = "connecting";
  const m = useMessengerStore();
  const eventLogTarget = (m as any).eventLog?.value ?? (m as any).eventLog;
  if (Array.isArray(eventLogTarget)) {
    eventLogTarget.length = 0;
  } else {
    (m as any).eventLog = [];
  }
  const convoTarget = (m as any).conversations?.value ?? (m as any).conversations;
  if (convoTarget && typeof convoTarget === "object") {
    for (const key of Object.keys(convoTarget)) delete convoTarget[key];
  } else {
    (m as any).conversations = {};
  }
  const nostr = useNostrStore() as any;
  nostr.initSignerIfNotSet.mockClear();
  publishWithAcksMock.mockClear();
  publishEventViaHttpMock.mockClear();
  requestEventsViaHttpMock.mockClear();
  subscribeMock.mockClear();
  useNdkMock.mockClear();
  notifySpy.mockClear();
  notifyErrorSpy.mockClear();
  notifyWarningSpy.mockClear();
  resolvePubkey.mockImplementation((pk: string) => pk);
  publishWithAcksMock.mockResolvedValue({
    "wss://a": { ok: true },
    "wss://b": { ok: true },
  });
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
      getPublicKey: vi.fn(async () => "f".repeat(64)),
    };
    messenger.relays = ["wss://a", "wss://b"] as any;
    publishWithAcksMock
      .mockImplementationOnce(async (_, relaysArg) => {
        expect(relaysArg).toEqual(["wss://a"]);
        return { "wss://a": { ok: false, reason: "down" } };
      })
      .mockImplementationOnce(async (_, relaysArg) => {
        expect(relaysArg).toEqual(["wss://b"]);
        return { "wss://b": { ok: true } };
      });

    await messenger.sendDm("r", "m");
    expect(publishWithAcksMock).toHaveBeenCalledTimes(2);
    expect(publishEventViaHttpMock).not.toHaveBeenCalled();
  });

  it("decrypts incoming messages with extension", async () => {
    const messenger = useMessengerStore();
    const decryptFn = vi.fn(async () => "msg");
    (globalThis as any).nostr = {
      nip04: { decrypt: decryptFn, encrypt: vi.fn() },
      signEvent: vi.fn(),
      getPublicKey: vi.fn(async () => "f".repeat(64)),
    };
    await messenger.addIncomingMessage({
      id: "1",
      pubkey: "s",
      content: "c?iv=1",
      created_at: 1,
    } as any);
    expect(decryptFn).toHaveBeenCalledWith("s", "c?iv=1");
  });

  it("caches failed signer initialization for incoming messages", async () => {
    const messenger = useMessengerStore();
    const nostr = useNostrStore() as any;
    nostr.signer = undefined;
    nostr.initSignerIfNotSet.mockResolvedValue(undefined);

    await messenger.start();
    expect(nostr.initSignerIfNotSet).toHaveBeenCalledTimes(1);

    await messenger.addIncomingMessage({
      id: "msg-1",
      pubkey: "sender",
      content: "cipher",
      created_at: 1,
    } as any);

    expect(nostr.initSignerIfNotSet).toHaveBeenCalledTimes(1);

    await messenger.addIncomingMessage({
      id: "msg-2",
      pubkey: "sender",
      content: "cipher2",
      created_at: 2,
    } as any);

    expect(nostr.initSignerIfNotSet).toHaveBeenCalledTimes(1);
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
      getPublicKey: vi.fn(async () => "f".repeat(64)),
    };
    const addSpy = vi.spyOn(messenger, "addOutgoingMessage");

    await messenger.sendDm("r", { bad: "obj" } as any);
    expect(publishWithAcksMock).toHaveBeenCalled();
    expect(addSpy).toHaveBeenCalled();
    const added = addSpy.mock.results[0]?.value as any;
    expect(added?.content).toBe("");
    addSpy.mockRestore();
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
      getPublicKey: vi.fn(async () => "f".repeat(64)),
    };
    messenger.relays = ["wss://a"] as any;
    publishWithAcksMock.mockResolvedValue({ "wss://a": { ok: false, reason: "down" } });
    const addSpy = vi.spyOn(messenger, "addOutgoingMessage");

    await messenger.sendDm("npub1alice", "hello");

    expect(publishEventViaHttpMock).toHaveBeenCalled();
    const httpKey = FUNDSTR_EVT_URL || "http";
    expect(addSpy).toHaveBeenCalled();
    const added = addSpy.mock.results[0]?.value as any;
    expect(added?.status).toBe("sent_unconfirmed");
    expect(added?.relayResults?.["wss://a"]).toEqual({ ok: false, reason: "down" });
    expect(added?.relayResults?.[httpKey]).toEqual({ ok: true });
    addSpy.mockRestore();
  });

  it("reports HTTP fallback error when publish fails over HTTP", async () => {
    const messenger = useMessengerStore();
    (globalThis as any).nostr = {
      nip04: { encrypt: vi.fn(async () => "enc"), decrypt: vi.fn() },
      signEvent: vi.fn(async (e) => ({ ...e, id: "id", sig: "sig" })),
      getPublicKey: vi.fn(async () => "f".repeat(64)),
    };
    messenger.relays = ["wss://a"] as any;
    publishWithAcksMock.mockResolvedValue({ "wss://a": { ok: false, reason: "down" } });
    publishEventViaHttpMock.mockRejectedValue(new Error("offline"));
    const addSpy = vi.spyOn(messenger, "addOutgoingMessage");

    await messenger.sendDm("npub1bob", "hello");

    expect(publishEventViaHttpMock).toHaveBeenCalled();
    expect(notifyErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("offline"),
    );
    const httpKey = FUNDSTR_EVT_URL || "http";
    expect(addSpy).toHaveBeenCalled();
    const added = addSpy.mock.results[0]?.value as any;
    expect(added?.status).toBe("failed");
    expect(added?.relayResults?.[httpKey]?.ok).toBe(false);
    addSpy.mockRestore();
  });

  it("keeps HTTP fallback rejections awaiting confirmation", async () => {
    const messenger = useMessengerStore();
    (globalThis as any).nostr = {
      nip04: { encrypt: vi.fn(async () => "enc"), decrypt: vi.fn() },
      signEvent: vi.fn(async (e) => ({ ...e, id: "id", sig: "sig" })),
      getPublicKey: vi.fn(async () => "f".repeat(64)),
    };
    messenger.relays = ["wss://a"] as any;
    publishWithAcksMock.mockResolvedValue({ "wss://a": { ok: false, reason: "down" } });
    publishEventViaHttpMock.mockResolvedValue({
      id: "http",
      accepted: false,
      message: "Pending confirmation",
      via: "http",
    });

    const confirmSpy = vi
      .spyOn(messenger, "confirmMessageDelivery")
      .mockResolvedValue(undefined);
    const addSpy = vi.spyOn(messenger, "addOutgoingMessage");
    const loadSpy = vi.spyOn(messenger, "loadIdentity").mockResolvedValue();
    const refreshSpy = vi
      .spyOn(messenger, "refreshSignerMode")
      .mockResolvedValue();
    const signerSpy = vi
      .spyOn(dmSigner, "getActiveDmSigner")
      .mockResolvedValue({
        mode: "extension",
        signer: {
          getPubkeyHex: vi.fn(async () => "f".repeat(64)),
          nip04Encrypt: vi.fn(async () => "enc"),
          nip04Decrypt: vi.fn(async () => "dec"),
          signEvent: vi.fn(async (event) => ({
            ...event,
            id: "id",
            sig: "sig",
          })),
        },
      } as any);

    const result = await messenger.sendDm("npub1dave", "hello");
    expect(result.success).toBe(false);
    expect(result.confirmationPending).toBe(true);
    expect(result.event?.id).toBe("id");
    expect(result.httpAck).toEqual({
      id: "http",
      accepted: false,
      message: "Pending confirmation",
      via: "http",
    });
    const httpKey = FUNDSTR_EVT_URL || "http";
    expect(confirmSpy).toHaveBeenCalledWith("id", "id");
    expect(notifyErrorSpy).not.toHaveBeenCalled();
    expect(notifyWarningSpy).toHaveBeenCalledWith(
      "DM delivery pending confirmation",
      expect.stringContaining("Pending confirmation"),
      7000,
    );
    expect(addSpy).toHaveBeenCalled();
    const added = addSpy.mock.results[0]?.value as any;
    expect(added).toBeTruthy();
    expect(added.status).toBe("sent_unconfirmed");
    expect(added.id).toBe("id");
    expect(added.relayResults?.[httpKey]).toEqual({
      ok: false,
      reason: "Pending confirmation",
    });

    confirmSpy.mockRestore();
    loadSpy.mockRestore();
    refreshSpy.mockRestore();
    signerSpy.mockRestore();
    addSpy.mockRestore();
  });

  it("hydrates messages via HTTP fallback when no relays connect", async () => {
    const messenger = useMessengerStore();
    ndkInstance.pool.relays = new Map();
    requestEventsViaHttpMock.mockResolvedValue([
      { id: "1", pubkey: "f".repeat(64), content: "cipher", created_at: 1 },
    ]);
    (globalThis as any).nostr = {
      nip04: { decrypt: vi.fn(async () => "msg"), encrypt: vi.fn() },
      signEvent: vi.fn(),
      getPublicKey: vi.fn(async () => "f".repeat(64)),
    };

    await messenger.start();

    expect(requestEventsViaHttpMock).toHaveBeenCalledTimes(1);
    const log = Array.isArray((messenger as any).eventLog)
      ? ((messenger as any).eventLog as any[])
      : ((messenger as any).eventLog?.value as any[]);
    expect(log?.some((msg) => msg?.id === "1")).toBe(true);
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

  it("only enables HTTP polling when the relay is disconnected", () => {
    const messenger = useMessengerStore();
    const startSpy = vi
      .spyOn(messenger, "startHttpPolling")
      .mockImplementation(() => {});
    messenger.httpFallbackEnabled = false;
    relayStatusRef.value = "connecting";

    messenger.setHttpFallbackEnabled(true);

    expect(startSpy).not.toHaveBeenCalled();

    relayStatusRef.value = "disconnected";
    messenger.setHttpFallbackEnabled(true);

    expect(startSpy).toHaveBeenCalledTimes(1);
    startSpy.mockRestore();
  });

  it("starts HTTP polling only after the relay disconnects", async () => {
    const messenger = useMessengerStore();
    const startSpy = vi
      .spyOn(messenger, "startHttpPolling")
      .mockImplementation(() => {});

    relayStatusRef.value = "connecting";
    messenger.setupTransportWatcher();
    await nextTick();

    expect(startSpy).not.toHaveBeenCalled();

    relayStatusRef.value = "disconnected";
    await nextTick();

    expect(startSpy).toHaveBeenCalledTimes(1);

    relayStatusRef.value = "connected";
    await nextTick();

    expect(messenger.transportMode).toBe("ws");
    startSpy.mockRestore();
    messenger.relayStatusStop?.();
  });

  it("stops HTTP polling once the relay reconnects", async () => {
    const messenger = useMessengerStore();
    const syncSpy = vi
      .spyOn(messenger, "performHttpSync")
      .mockResolvedValue(undefined);

    relayStatusRef.value = "disconnected";
    vi.useFakeTimers();

    try {
      messenger.startHttpPolling();
      await vi.runAllTicks();

      expect(syncSpy).toHaveBeenCalledTimes(1);

      relayStatusRef.value = "connected";
      await nextTick();

      vi.advanceTimersByTime(Math.max(5000, DM_POLL_INTERVAL_MS));
      await vi.runAllTicks();

      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(messenger.httpPollTimer).toBeNull();
      expect(messenger.httpFallbackActive).toBe(false);
    } finally {
      vi.useRealTimers();
      syncSpy.mockRestore();
      messenger.stopHttpPolling();
      messenger.relayStatusStop?.();
    }
  });
});
