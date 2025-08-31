import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => ({
    initSignerIfNotSet: vi.fn(),
    privateKeySignerPrivateKey: "priv",
    pubkey: "pub",
    relays: [] as string[],
    get privKeyHex() {
      return "priv";
    },
  }),
}));

vi.mock("../../../src/composables/useNdk", () => {
  class Event {
    kind = 0;
    content = "";
    tags: any[] = [];
    pubkey = "pub";
    async encrypt() {}
    async publish() {}
    async toNostrEvent() {
      return { id: "1", pubkey: this.pubkey, content: this.content, created_at: 1 } as any;
    }
  }
  return { useNdk: vi.fn(() => ({ ndk: { eventClass: Event } })) };
});

vi.mock("../../../src/js/nostr-runtime", () => {
  return {
    stickyDmSubscription: vi.fn(async (_p: string, _s: any, cb: any) => {
      const ev = {
        pubkey: "s",
        content: "c",
        toNostrEvent: async () => ({ id: "1", pubkey: "s", content: "c", created_at: 1 }),
      };
      cb && cb(ev as any);
      return vi.fn();
    }),
    RelayWatchdog: class {},
  };
});

vi.mock("nostr-tools", () => ({
  nip44: { v2: { decrypt: vi.fn(async () => "msg"), utils: { getConversationKey: vi.fn(() => "k") } } },
  nip04: { decrypt: vi.fn(async () => "msg") },
  nip19: { decode: vi.fn(), nprofileEncode: vi.fn(), npubEncode: vi.fn() },
}));

var notifySpy: any;
var notifyErrorSpy: any;
vi.mock("../../../src/js/notify", () => {
  notifySpy = vi.fn();
  notifyErrorSpy = vi.fn();
  return { notifySuccess: notifySpy, notifyError: notifyErrorSpy };
});

import { useDmStore } from "../../../src/stores/dm";
import { useNostrStore } from "../../../src/stores/nostr";
import { nip44 } from "nostr-tools";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("messenger store", () => {
  it("logs outgoing message when sending DMs", async () => {
    const messenger = useDmStore();
    await messenger.sendDm("r", "m");
    expect(messenger.eventLog.length).toBe(1);
  });

  it("decrypts incoming messages with global key", async () => {
    const messenger = useDmStore();
    await messenger.addIncomingMessage({
      id: "1",
      pubkey: "s",
      content: "c",
      created_at: 1,
    } as any);
    expect(messenger.eventLog[0].content).toBe("msg");
  });

  it("subscribes using global key on start", async () => {
    const messenger = useDmStore();
    await messenger.start();
    // stickyDmSubscription mock called in module scope
    expect((require("../../../src/js/nostr-runtime") as any).stickyDmSubscription).toHaveBeenCalled();
  });

  it("notifies when starting without privkey", async () => {
    const messenger = useDmStore();
    const nostr = useNostrStore() as any;
    nostr.privateKeySignerPrivateKey = "";
    await messenger.start();
    expect(notifyErrorSpy).toHaveBeenCalled();
  });

  it("handles multi-line JSON messages", async () => {
    (nip44.v2.decrypt as any).mockResolvedValue('{"a":1}\n{"b":2}');
    const messenger = useDmStore();
    await messenger.addIncomingMessage({
      id: "1",
      pubkey: "s",
      content: "c",
      created_at: 1,
    } as any);
    expect(messenger.eventLog[0].content).toBe('{"a":1}\n{"b":2}');
  });
});
