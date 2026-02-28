import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nip19 } from "nostr-tools";
import {
  clearRelayFailureCache,
  dedup,
  normalizeEvents,
  pickLatestAddrReplaceable,
  pickLatestReplaceable,
  queryNostr,
  queryNutzapProfile,
  toHex,
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

function toUrlString(input: any): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input && typeof input === "object" && "url" in input) {
    return (input as { url: string }).url;
  }
  throw new Error("Unsupported fetch input");
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
        id: "profile-10019-old",
        kind: 10019,
        pubkey: "alice",
        created_at: 55,
      }),
      makeEvent({
        id: "profile-new",
        kind: 0,
        pubkey: "alice",
        created_at: 60,
      }),
      makeEvent({
        id: "profile-10019-new",
        kind: 10019,
        pubkey: "alice",
        created_at: 65,
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
      makeEvent({
        id: "tiers-legacy",
        kind: 30000,
        pubkey: "alice",
        created_at: 85,
        tags: [["d", "tiers"]],
      }),
    ];

    const deduped = dedup(events);
    expect(deduped.filter((ev) => ev.id === "dup")).toHaveLength(1);

    const normalized = normalizeEvents(events);

    expect(normalized.find((ev) => ev.id === "profile-new")).toBeTruthy();
    expect(normalized.find((ev) => ev.id === "profile-old")).toBeUndefined();
    expect(normalized.find((ev) => ev.id === "profile-10019-new")).toBeTruthy();
    expect(normalized.find((ev) => ev.id === "profile-10019-old")).toBeUndefined();

    expect(normalized.find((ev) => ev.id === "tiers-new")).toBeTruthy();
    expect(normalized.find((ev) => ev.id === "tiers-old")).toBeUndefined();

    const latestProfile = pickLatestReplaceable(normalized, {
      kind: 0,
      pubkey: "alice",
    });
    expect(latestProfile?.id).toBe("profile-new");

    const latestTiers = pickLatestAddrReplaceable(normalized, {
      kind: [30019, 30000],
      pubkey: "alice",
      d: "tiers",
    });
    expect(latestTiers?.id).toBe("tiers-legacy");
  });
});

describe("relayClient pubkey coercion", () => {
  it("accepts raw hex keys and normalizes case", () => {
    const key = "ABCDEF".repeat(10) + "AB";
    expect(toHex(key)).toBe(key.toLowerCase());
  });

  it("throws on malformed identifiers", () => {
    expect(() => toHex("npub1invalid"))
      .toThrowErrorMatchingInlineSnapshot("\"Invalid npub or hex pubkey\"");
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
    clearRelayFailureCache();
  });

  it("falls back to HTTP when websocket connection fails", async () => {
    const pubkeyHex = "c".repeat(64);
    const responseEvents = [
      makeEvent({ id: "http-event", kind: 10019, pubkey: pubkeyHex }),
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

    const filters = [{ kinds: [10019], authors: [pubkeyHex] }];
    const events = await queryNostr(filters, { preferFundstr: true, wsTimeoutMs: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("http-event");
  });

  it("avoids repeated websocket dials for Fundstr relay after failures", async () => {
    const pubkeyHex = "b".repeat(64);
    const responseEvents = [
      makeEvent({ id: "http-event-retry", kind: 10019, pubkey: pubkeyHex }),
    ];

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(responseEvents), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ThrowingWebSocket = vi.fn(() => {
      throw new Error("connect failed");
    });

    (globalThis as any).WebSocket = ThrowingWebSocket as any;

    const filters = [{ kinds: [10019], authors: [pubkeyHex] }];

    await queryNostr(filters, { preferFundstr: true, wsTimeoutMs: 10 });

    expect(ThrowingWebSocket).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();

    await queryNostr(filters, { preferFundstr: true, wsTimeoutMs: 10 });

    expect(ThrowingWebSocket).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clearRelayFailureCache("wss://relay.fundstr.network");

    await queryNostr(filters, { preferFundstr: true, wsTimeoutMs: 10 });

    expect(ThrowingWebSocket).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("normalises npub authors to hex when querying profiles", async () => {
    const pubkeyHex = "f".repeat(64);
    const npub = nip19.npubEncode(pubkeyHex);
    const responseEvents = [
      makeEvent({ id: "profile", kind: 10019, pubkey: pubkeyHex }),
    ];

    const fetchMock = vi.fn(async (input: any) => {
      const url = new URL(toUrlString(input));
      const filtersParam = url.searchParams.get("filters");
      expect(filtersParam).toBeTruthy();
      const parsed = JSON.parse(decodeURIComponent(filtersParam!));
      expect(parsed[0].authors[0]).toBe(pubkeyHex);
      return new Response(JSON.stringify(responseEvents), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    class ThrowingWebSocket {
      constructor() {
        throw new Error("connect failed");
      }
    }

    (globalThis as any).WebSocket = ThrowingWebSocket as any;

    const npubResult = await queryNutzapProfile(npub);
    expect(npubResult?.pubkey).toBe(pubkeyHex);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    const hexResult = await queryNutzapProfile(pubkeyHex);
    expect(hexResult?.id).toBe("profile");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const lastUrl = new URL(toUrlString(fetchMock.mock.calls[0][0]));
    const filtersParam = lastUrl.searchParams.get("filters");
    expect(filtersParam).toBeTruthy();
    const parsed = JSON.parse(decodeURIComponent(filtersParam!));
    expect(parsed[0].authors[0]).toBe(pubkeyHex);
  });

  it("falls back to HTTP when websocket returns no events", async () => {
    const pubkeyHex = "a".repeat(64);
    const responseEvents = [
      makeEvent({ id: "http-event-empty", kind: 10019, pubkey: pubkeyHex }),
    ];

    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(responseEvents), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    class EmptyWebSocket {
      CONNECTING = 0;
      OPEN = 1;
      CLOSING = 2;
      CLOSED = 3;
      readyState = this.CONNECTING;
      onopen?: () => void;
      onmessage?: (event: { data: string }) => void;
      onerror?: () => void;
      onclose?: () => void;

      constructor() {
        setTimeout(() => {
          this.readyState = this.OPEN;
          this.onopen?.();
        }, 0);
      }

      send() {
        setTimeout(() => {
          this.onmessage?.({ data: JSON.stringify(["EOSE", "sub"]) });
          this.readyState = this.CLOSED;
          this.onclose?.();
        }, 0);
      }

      close() {
        this.readyState = this.CLOSED;
      }
    }

    (globalThis as any).WebSocket = EmptyWebSocket as any;

    const filters = [{ kinds: [10019], authors: [pubkeyHex] }];
    const events = await queryNostr(filters, {
      preferFundstr: true,
      wsTimeoutMs: 50,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("http-event-empty");
  });
});
