import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dedup,
  normalizeEvents,
  pickLatestAddrReplaceable,
  pickLatestReplaceable,
  queryNostr,
  type NostrEvent,
} from "@/nostr/relayClient";

function makeEvent(partial: Partial<NostrEvent>): NostrEvent {
  return {
    id: "evt" + Math.random().toString(36).slice(2),
    pubkey: "pk",
    created_at: Math.floor(Date.now() / 1000),
    kind: 1,
    tags: [],
    content: "",
    sig: "sig",
    ...partial,
  };
}

describe("relayClient dedup & replaceable handling", () => {
  it("deduplicates events and keeps the latest replaceable versions", () => {
    const duplicate = makeEvent({ id: "dup", created_at: 100, kind: 1 });
    const events: NostrEvent[] = [
      duplicate,
      { ...duplicate },
      makeEvent({
        id: "profile-old",
        kind: 0,
        pubkey: "alice",
        created_at: 50,
      }),
      makeEvent({
        id: "profile-new",
        kind: 0,
        pubkey: "alice",
        created_at: 60,
      }),
      makeEvent({
        id: "tiers-old",
        kind: 30019,
        pubkey: "alice",
        created_at: 70,
        tags: [["d", "tiers"]],
      }),
      makeEvent({
        id: "tiers-new",
        kind: 30019,
        pubkey: "alice",
        created_at: 80,
        tags: [["d", "tiers"]],
      }),
    ];

    const deduped = dedup(events);
    expect(deduped.filter((ev) => ev.id === "dup")).toHaveLength(1);

    const normalized = normalizeEvents(events);

    expect(normalized.find((ev) => ev.id === "profile-new")).toBeTruthy();
    expect(normalized.find((ev) => ev.id === "profile-old")).toBeUndefined();

    expect(normalized.find((ev) => ev.id === "tiers-new")).toBeTruthy();
    expect(normalized.find((ev) => ev.id === "tiers-old")).toBeUndefined();

    const latestProfile = pickLatestReplaceable(normalized, {
      kind: 0,
      pubkey: "alice",
    });
    expect(latestProfile?.id).toBe("profile-new");

    const latestTiers = pickLatestAddrReplaceable(normalized, {
      kind: 30019,
      pubkey: "alice",
      d: "tiers",
    });
    expect(latestTiers?.id).toBe("tiers-new");
  });
});

describe("relayClient transport", () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = (globalThis as any).WebSocket;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    (globalThis as any).WebSocket = originalWebSocket;
  });

  it("falls back to HTTP when websocket connection fails", async () => {
    const responseEvents = [
      makeEvent({ id: "http-event", kind: 10019, pubkey: "alice" }),
    ];

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(responseEvents), {
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

    const filters = [{ kinds: [10019], authors: ["alice"] }];
    const events = await queryNostr(filters, { preferFundstr: true, wsTimeoutMs: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("http-event");
  });
});
