import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dedup,
  normalizeEvents,
  pickLatestAddrReplaceable,
  pickLatestReplaceable,
  publishNostr,
  queryNostr,
  type NostrEvent,
} from "@/nostr/relayClient";
import { publishNutzapProfile } from "@/nutzap/publish";
import type { NutzapProfileContent } from "@/nutzap/types";

vi.mock("@/nutzap/ndkInstance", () => ({
  getNutzapNdk: vi.fn(() => ({})),
}));

let mockIdCounter = 0;

vi.mock("@nostr-dev-kit/ndk", () => {
  class MockNDKEvent {
    kind = 0;
    content = "";
    tags: string[][] = [];
    id = "";
    pubkey = "f".repeat(64);
    created_at = 0;
    sig = "";

    constructor(public ndk: unknown) {
      void ndk;
    }

    async sign() {
      mockIdCounter += 1;
      this.id = `mock-id-${mockIdCounter}`;
      this.created_at = 1_700_000_000 + mockIdCounter;
      this.sig = `sig-${mockIdCounter}`;
    }

    async toNostrEvent() {
      return {
        id: this.id || `mock-id-${mockIdCounter}`,
        pubkey: this.pubkey,
        created_at: this.created_at || 1_700_000_000,
        kind: this.kind,
        tags: Array.isArray(this.tags) ? this.tags : [],
        content: typeof this.content === "string" ? this.content : "",
        sig: this.sig || `sig-${mockIdCounter}`,
      } satisfies NostrEvent;
    }
  }

  return { NDKEvent: MockNDKEvent };
});

const originalFetch = globalThis.fetch;
const originalWebSocket = (globalThis as any).WebSocket;

beforeEach(() => {
  mockIdCounter = 0;
  globalThis.fetch = originalFetch;
  (globalThis as any).WebSocket = originalWebSocket;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  (globalThis as any).WebSocket = originalWebSocket;
});

function makeEvent(partial: Partial<NostrEvent>): NostrEvent {
  return {
    id: "evt" + Math.random().toString(36).slice(2),
    pubkey: "p".repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: "",
    sig: "sig",
    ...partial,
  };
}

describe("publish safeguards", () => {
  it("rejects malformed events before posting", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await publishNostr({} as any);

    expect(result).toEqual({
      ok: true,
      accepted: false,
      message: "client: bad event (missing fields)",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces relay errors when publish is rejected", async () => {
    const ack = { ok: true, accepted: false, message: "AUTH required" };
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(ack), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const content: NutzapProfileContent = {
      v: 1,
      p2pk: "p".repeat(64),
      mints: [],
      relays: [],
      tierAddr: "30000:mock:tiers",
    };

    await expect(publishNutzapProfile(content, [])).rejects.toThrow("AUTH required");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("transport fallbacks", () => {
  it("falls back to HTTP when Fundstr websocket cannot connect", async () => {
    const pubkeyHex = "a".repeat(64);
    const responseEvents = [
      makeEvent({ id: "http-event", kind: 10019, pubkey: pubkeyHex }),
    ];

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, events: responseEvents }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    class ThrowingWebSocket {
      constructor() {
        throw new Error("connect failed");
      }
    }

    (globalThis as any).WebSocket = ThrowingWebSocket as any;

    const filters = [{ kinds: [10019], authors: [pubkeyHex] }];
    const events = await queryNostr(filters, { preferFundstr: true, wsTimeoutMs: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("http-event");
  });
});

describe("replaceable semantics", () => {
  it("keeps only the latest profile and tier definitions", () => {
    const duplicate = makeEvent({ id: "dup", created_at: 100, kind: 1 });
    const profileOld = makeEvent({
      id: "profile-old",
      kind: 10019,
      pubkey: "alice",
      created_at: 50,
    });
    const profileNew = makeEvent({
      id: "profile-new",
      kind: 10019,
      pubkey: "alice",
      created_at: 60,
    });
    const tiersOld = makeEvent({
      id: "tiers-old",
      kind: 30019,
      pubkey: "alice",
      created_at: 70,
      tags: [["d", "tiers"]],
    });
    const tiersNew = makeEvent({
      id: "tiers-new",
      kind: 30019,
      pubkey: "alice",
      created_at: 80,
      tags: [["d", "tiers"]],
    });

    const events: NostrEvent[] = [
      duplicate,
      { ...duplicate },
      profileOld,
      profileNew,
      tiersOld,
      tiersNew,
    ];

    const deduped = dedup(events);
    expect(deduped.filter((ev) => ev.id === "dup")).toHaveLength(1);

    const normalized = normalizeEvents(events);
    const latestProfile = pickLatestReplaceable(normalized, {
      kind: 10019,
      pubkey: "alice",
    });
    const latestTiers = pickLatestAddrReplaceable(normalized, {
      kind: 30019,
      pubkey: "alice",
      d: "tiers",
    });

    expect(latestProfile?.id).toBe("profile-new");
    expect(latestTiers?.id).toBe("tiers-new");
  });
});
