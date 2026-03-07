import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { fetchRelayInfo } from "../../src/lib/relayInfo";

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

function createJsonResponse(body: unknown, status = 200): Response {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("fetchRelayInfo", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns relay info when the relay supports NIP-11", async () => {
    const info = { supported_nips: [1, 2, 3], name: "Relay" };
    fetchMock.mockResolvedValueOnce(createJsonResponse(info));

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      const result = await fetchRelayInfo("wss://relay.example");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://relay.example");
      expect(init).toEqual(
        expect.objectContaining({
          headers: { Accept: "application/nostr+json" },
          signal: expect.any(Object),
        })
      );

      expect(result.ok).toBe(true);
      expect(result).toHaveProperty("info");
      expect(result.info).toMatchObject({ name: "Relay" });
      expect(result.info.supported_nips).toContain(1);
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });

  it("returns an HTTP error reason for non-success statuses", async () => {
    fetchMock.mockResolvedValueOnce(createJsonResponse(null, 503));

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      const result = await fetchRelayInfo("wss://relay.example");

      expect(result).toEqual({ ok: false, reason: "HTTP 503" });
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });

  it("flags malformed NIP-11 payloads", async () => {
    const malformed = { supported_nips: [2] };
    fetchMock.mockResolvedValueOnce(createJsonResponse(malformed));

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      const result = await fetchRelayInfo("wss://relay.example");

      expect(result).toEqual({ ok: false, reason: "unsupported or malformed NIP-11" });
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });

  it("reports timeouts when the abort signal rejects the request", async () => {
    const abortError = Object.assign(new Error("The operation timed out"), { name: "AbortError" });
    fetchMock.mockImplementationOnce((_input, init) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            reject(abortError);
          },
          { once: true }
        );
      }) as ReturnType<typeof fetch>;
    });

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    try {
      const pending = fetchRelayInfo("wss://slow.example", 5);
      await vi.advanceTimersByTimeAsync(5);
      await expect(pending).resolves.toEqual({ ok: false, reason: "timeout" });
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    } finally {
      clearTimeoutSpy.mockRestore();
    }
  });
});
