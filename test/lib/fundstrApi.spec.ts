import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { nip19 } from "nostr-tools";
import {
  fetchCreator,
  fetchCreators,
  formatMsatToSats,
  withPrefix,
} from "../../src/lib/fundstrApi";

const fetchMock = vi.fn<Parameters<typeof fetch>, ReturnType<typeof fetch>>();

function createJsonResponse(body: unknown, status = 200): Response {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

describe("fundstr API helpers", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    fetchMock.mockReset();
  });

  describe("withPrefix", () => {
    it("returns the default API base when no path is provided", () => {
      expect(withPrefix()).toBe("/api/v1");
    });

    it("appends trimmed paths to the API base", () => {
      expect(withPrefix("/creators")).toBe("/api/v1/creators");
    });
  });

  describe("fetchCreators", () => {
    it("builds URLs with defaults and wildcard query expansion", async () => {
      const secondPubkey = "e".repeat(64);
      const body = {
        data: [
          {
            pubkey: "a".repeat(64),
            profile: { display_name: "Alice", picture: "https://img" },
            followers: "12",
            joined: "1700000000",
            tier_summary: { count: "3", cheapest: { price_msat: "5000" } },
            metrics: {
              supporters: "8",
              total_support_msat: "7000",
              monthly_support_msat: "",
              last_support_at: "2024-01-01T00:00:00Z",
            },
            tiers: [
              {
                identifier: "tier-basic",
                name: "Basic",
                amount_msat: "1500",
                cadence: "monthly",
                description: "Supporter",
              },
              {
                id: "tier-plus",
                name: "Plus",
                amountMsat: 2500,
                frequency: "weekly",
                details: "Extra",
                media: [{ url: "https://cdn/image" }],
              },
              {
                name: "missing-id",
              },
            ],
          },
          {
            pubkey: nip19.npubEncode(secondPubkey),
            profile: { displayName: "Eve", username: "eve", cover: "https://banner" },
            following: "5",
            tierSummary: { count: "", cheapest_price_msat: "2000" },
            tiers: [
              {
                id: "alt-tier",
                name: "Alt",
                amount_msat: null,
                interval: "yearly",
                description: null,
              },
            ],
          },
        ],
      };

      fetchMock.mockResolvedValueOnce(createJsonResponse(body));

      const creators = await fetchCreators("satoshi", 0 as unknown as number, Number.NaN);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl, init] = fetchMock.mock.calls[0];
      expect(init).toEqual({
        method: "GET",
        headers: { Accept: "application/json" },
        signal: undefined,
      });
      const parsed = new URL(requestUrl as string);
      expect(parsed.pathname).toBe("/api/v1/creators");
      expect(parsed.searchParams.get("limit")).toBe("24");
      expect(parsed.searchParams.get("q")).toBe("satoshi*");

      expect(creators).toHaveLength(2);
      const [creator, second] = creators;
      expect(creator.pubkey).toBe("a".repeat(64));
      expect(creator.displayName).toBe("Alice");
      expect(creator.picture).toBe("https://img");
      expect(creator.followers).toBe(12);
      expect(creator.metrics).toEqual({
        supporters: 8,
        totalSupportMsat: 7000,
        monthlySupportMsat: null,
        lastSupportAt: "2024-01-01T00:00:00Z",
      });
      expect(creator.tiers).toEqual([
        {
          id: "tier-basic",
          name: "Basic",
          amountMsat: 1500,
          cadence: "monthly",
          description: "Supporter",
          media: [],
        },
        {
          id: "tier-plus",
          name: "Plus",
          amountMsat: 2500,
          cadence: "weekly",
          description: "Extra",
          media: [{ url: "https://cdn/image" }],
        },
      ]);
      expect(creator.tierSummary).toEqual({ count: 3, cheapestPriceMsat: 5000 });

      expect(second.pubkey).toBe(secondPubkey);
      expect(second.displayName).toBe("Eve");
      expect(second.name).toBe("eve");
      expect(second.banner).toBe("https://banner");
      expect(second.tierSummary).toEqual({ count: 0, cheapestPriceMsat: 2000 });
      expect(second.tiers).toEqual([
        {
          id: "alt-tier",
          name: "Alt",
          amountMsat: null,
          cadence: "yearly",
          description: null,
          media: [],
        },
      ]);
    });

    it("throws using buildResponseError on non-success statuses", async () => {
      fetchMock.mockResolvedValueOnce(createJsonResponse({ error: "nope" }, 502));

      await expect(fetchCreators("", 10, 0)).rejects.toMatchObject({
        message: "Request failed with status 502",
        status: 502,
      });
    });
  });

  describe("fetchCreator", () => {
    it("translates npub identifiers to hex paths", async () => {
      const pubkey = "b".repeat(64);
      const npub = nip19.npubEncode(pubkey);
      fetchMock.mockResolvedValueOnce(createJsonResponse({
        pubkey,
        profile: null,
      }));

      const creator = await fetchCreator(npub);

      expect(fetchMock).toHaveBeenCalledWith(`/api/v1/creators/${pubkey}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: undefined,
      });
      expect(creator.pubkey).toBe(pubkey);
    });

    it("accepts raw hex identifiers", async () => {
      const pubkey = "c".repeat(64);
      fetchMock.mockResolvedValueOnce(createJsonResponse({ pubkey, profile: null }));

      const creator = await fetchCreator(pubkey);

      expect(fetchMock).toHaveBeenCalledWith(`/api/v1/creators/${pubkey}`, expect.any(Object));
      expect(creator.pubkey).toBe(pubkey);
    });

    it("rejects missing identifiers", async () => {
      await expect(fetchCreator("")).rejects.toThrow("Missing or invalid creator identifier");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("propagates non-ok responses with buildResponseError", async () => {
      const pubkey = "d".repeat(64);
      fetchMock.mockResolvedValueOnce(createJsonResponse({ message: "bad" }, 404));

      await expect(fetchCreator(pubkey)).rejects.toMatchObject({
        message: "Request failed with status 404",
        status: 404,
      });
    });
  });

  describe("formatMsatToSats", () => {
    it("handles falsy inputs and formatting options", () => {
      expect(formatMsatToSats(null)).toBe("0");
      expect(formatMsatToSats(undefined)).toBe("0");
      expect(formatMsatToSats("", { maximumFractionDigits: 4 })).toBe("0");
      expect(formatMsatToSats("500")).toBe("0.5");
      expect(formatMsatToSats(1500)).toBe("2");
      expect(formatMsatToSats("2500", { maximumFractionDigits: 2 })).toBe("2.5");
      expect(formatMsatToSats("abc")).toBe("0");
    });
  });
});
