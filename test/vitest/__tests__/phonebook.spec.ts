import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();

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
  });

  afterEach(() => {
    setEnvUrl();
  });

  it("uses env URL when provided and trims the query", async () => {
    const customUrl = "https://example.com/find_profiles.php";
    setEnvUrl(customUrl);

    mockFetch.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({ query: "jack", results: [], count: 0 }),
        ),
    } as any);

    const { findProfiles } = await loadPhonebook();

    const response = await findProfiles(" jack ");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(`${customUrl}?q=jack`);
    expect(response.query).toBe("jack");
  });

  it("falls back to the default URL when misconfigured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    setEnvUrl("https://api.fundstr.me/find_profiles");

    mockFetch.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({ query: "jack", results: [], count: 0 }),
        ),
    } as any);

    const { findProfiles } = await loadPhonebook();

    await findProfiles("jack");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://fundstr.me/find_profiles.php?q=jack",
      expect.any(Object),
    );
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it("normalizes valid payloads", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
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
        ),
    } as any);

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

  it("handles non-OK responses and malformed payloads gracefully", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('{"error":"Not Found"}'),
      } as any)
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("") } as any)
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve("{") } as any);

    const { findProfiles } = await loadPhonebook();

    await expect(findProfiles("abc")).resolves.toEqual({
      query: "abc",
      results: [],
      count: 0,
    });
    await expect(findProfiles("abc")).resolves.toEqual({
      query: "abc",
      results: [],
      count: 0,
    });
    await expect(findProfiles("abc")).resolves.toEqual({
      query: "abc",
      results: [],
      count: 0,
    });
  });

  it("treats aborts as empty responses", async () => {
    const controller = new AbortController();
    mockFetch.mockImplementation(() =>
      new Promise((_resolve, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    );

    const { findProfiles } = await loadPhonebook();

    const promise = findProfiles("abc", controller.signal);
    controller.abort();

    await expect(promise).resolves.toEqual({ query: "abc", results: [], count: 0 });
  });
});
