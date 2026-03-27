import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { nip19 } from "nostr-tools";

const mockFetch = vi.fn();
const originalLocation = globalThis.location;

const mockJsonResponse = (payload: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? "application/json" : null,
    },
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as any);

const setLocationOrigin = (origin: string) => {
  Object.defineProperty(globalThis, "location", {
    value: { origin },
    configurable: true,
  });
};

const setEnvUrl = (url?: string) => {
  if (url) {
    process.env.VITE_FIND_PROFILES_URL = url;
  } else {
    delete process.env.VITE_FIND_PROFILES_URL;
  }
};

const loadPhonebook = async () => {
  vi.resetModules();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  global.fetch = mockFetch;
  return import("../../../src/api/phonebook");
};

describe("findProfiles", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    setEnvUrl();
    setLocationOrigin("https://fundstr.me");
  });

  afterEach(() => {
    setEnvUrl();
    Object.defineProperty(globalThis, "location", {
      value: originalLocation,
      configurable: true,
    });
  });

  it("uses env URL when provided and trims the query", async () => {
    const customUrl = "https://example.com/find_profiles.php";
    setEnvUrl(customUrl);

    mockFetch.mockResolvedValue(
      mockJsonResponse({ query: "jack", results: [], count: 0 }),
    );

    const { findProfiles } = await loadPhonebook();

    const response = await findProfiles(" jack ");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(`${customUrl}?q=jack`);
    expect(response.query).toBe("jack");
  });

  it("falls back to the default URL when misconfigured", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    setEnvUrl("https://api.fundstr.me/find_profiles");

    mockFetch.mockResolvedValue(
      mockJsonResponse({ query: "jack", results: [], count: 0 }),
    );

    const { findProfiles } = await loadPhonebook();

    await findProfiles("jack");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://fundstr.me/find_profiles.php?q=jack",
      expect.any(Object),
    );
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("uses the same-origin default phonebook on staging hosts", async () => {
    setLocationOrigin("https://staging.fundstr.me");
    mockFetch.mockResolvedValue(
      mockJsonResponse({ query: "jack", results: [], count: 0 }),
    );

    try {
      const { findProfiles } = await loadPhonebook();

      await expect(findProfiles("jack")).resolves.toEqual({
        query: "jack",
        results: [],
        count: 0,
      });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://staging.fundstr.me/find_profiles.php?q=jack",
        expect.any(Object),
      );
    } finally {
      setLocationOrigin("https://fundstr.me");
    }
  });

  it("normalizes valid payloads", async () => {
    mockFetch.mockResolvedValue(
      mockJsonResponse({
        query: "jack",
        results: [
          {
            pubkey:
              "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2",
            name: "jack",
            display_name: "",
            about: "no state is the best state",
            picture: "https://image.nostr.build/...",
            nip05: null,
          },
        ],
        count: 1,
      }),
    );

    const { findProfiles } = await loadPhonebook();

    const result = await findProfiles("jack");

    expect(result.query).toBe("jack");
    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);
    const profile = result.results[0];
    expect(profile.pubkey).toHaveLength(64);
    expect(profile.pubkey).toBe(
      "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2",
    );
    expect(profile.name).toBe("jack");
    expect(profile.display_name).toBeNull();
    expect(profile.about).toBe("no state is the best state");
  });

  it("promotes exact npub matches to the front of the result list", async () => {
    const exactHex =
      "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2";
    const exactNpub = nip19.npubEncode(exactHex);

    mockFetch.mockResolvedValue(
      mockJsonResponse({
        query: exactNpub,
        results: [
          {
            pubkey:
              "805b34f708837dfb3e7f05815ac5760564628b58d5a0ce839ccbb6ef3620fac3",
            name: "wrong-first",
            display_name: null,
            about: null,
            picture: null,
            nip05: null,
          },
          {
            pubkey: exactHex,
            name: "exact-match",
            display_name: "Exact Match",
            about: "Right creator",
            picture: "https://example.com/exact.png",
            nip05: null,
          },
        ],
        count: 2,
      }),
    );

    const { findProfiles } = await loadPhonebook();

    const result = await findProfiles(exactNpub);

    expect(result.results[0]?.pubkey).toBe(exactHex);
    expect(result.results[0]?.display_name).toBe("Exact Match");
    expect(result.results[1]?.name).toBe("wrong-first");
  });

  it("handles non-OK responses and malformed payloads gracefully", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve('{"error":"Not Found"}'),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve(""),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        headers: { get: () => "application/json" },
        text: () => Promise.resolve("{"),
      } as any);

    const { findProfiles } = await loadPhonebook();

    await expect(findProfiles("abc")).resolves.toEqual({
      query: "abc",
      results: [],
      count: 0,
      warning: "Limited results (discovery unavailable)",
    });
    await expect(findProfiles("abc")).resolves.toEqual({
      query: "abc",
      results: [],
      count: 0,
      warning: "Limited results (discovery unavailable)",
    });
    await expect(findProfiles("abc")).resolves.toEqual({
      query: "abc",
      results: [],
      count: 0,
      warning: "Limited results (discovery unavailable)",
    });
  });

  it("treats aborts as empty responses", async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );

    const { findProfiles } = await loadPhonebook();

    const promise = findProfiles("abc", controller.signal);
    controller.abort();

    await expect(promise).resolves.toEqual({
      query: "abc",
      results: [],
      count: 0,
    });
  });
});
