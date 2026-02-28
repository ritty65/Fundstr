import { beforeEach, describe, expect, it, vi } from "vitest";
import { FundstrRelayClient } from "../../../src/nutzap/relayClient";

const originalWebSocket = globalThis.WebSocket;

const poolStub = {
  on: vi.fn(),
  relays: new Map(),
};

vi.mock("../../../src/nutzap/ndkInstance", () => ({
  getNutzapNdk: () => ({ pool: poolStub }),
}));

vi.mock("../../../src/nutzap/relayConfig", () => ({
  NUTZAP_ALLOW_WSS_WRITES: true,
  NUTZAP_RELAY_WSS: "wss://relay.fundstr.network",
}));

vi.mock("../../../src/nutzap/relayEndpoints", () => ({
  FUNDSTR_EVT_URL: "https://relay.fundstr.network/event",
  HTTP_FALLBACK_TIMEOUT_MS: 1000,
  WS_FIRST_TIMEOUT_MS: 1000,
}));

beforeEach(() => {
  poolStub.on.mockClear();
  poolStub.relays = new Map();
  if (originalWebSocket) {
    (globalThis as any).WebSocket = originalWebSocket;
  } else {
    delete (globalThis as any).WebSocket;
  }
});

describe("FundstrRelayClient basics", () => {
  it("reports disconnected status when WebSocket unsupported", () => {
    delete (globalThis as any).WebSocket;
    const client = new FundstrRelayClient("wss://relay.fundstr.network");
    const status = client.useStatus();
    expect(status.value).toBe("disconnected");
    client.connect();
    expect(status.value).toBe("disconnected");
  });

  it("logs socket creation failures and schedules reconnect", () => {
    vi.useFakeTimers();
    const failing = vi.fn(() => {
      throw new Error("boom");
    });
    (globalThis as any).WebSocket = failing as any;
    const client = new FundstrRelayClient("wss://relay.fundstr.network");
    const logFeed = client.useLogFeed();
    const status = client.useStatus();

    client.connect();

    expect(failing).toHaveBeenCalledTimes(1);
    expect(logFeed.value.some((entry) => entry.level === "error")).toBe(true);
    expect(status.value).toBe("reconnecting");

    client.clearForTests();
    vi.useRealTimers();
  });
});

describe("FundstrRelayClient HTTP fallback", () => {
  it("treats plain-text OK responses as accepted", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async () => new Response("OK", { status: 200 }));
    (globalThis as any).fetch = fetchMock as any;

    try {
      const client = new FundstrRelayClient("wss://relay.fundstr.network");
      const event = {
        id: "abc123",
        pubkey: "pk",
        created_at: 1,
        kind: 9735,
        tags: [],
        content: "",
        sig: "sig",
      };

      const ack = await (client as any).publishViaHttp(event);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(ack.id).toBe(event.id);
      expect(ack.accepted).toBe(true);
      expect(ack.via).toBe("http");
    } finally {
      if (originalFetch) {
        (globalThis as any).fetch = originalFetch;
      } else {
        delete (globalThis as any).fetch;
      }
    }
  });
});
