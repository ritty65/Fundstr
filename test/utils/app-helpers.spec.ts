import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@vueuse/core", () => ({
  useLocalStorage: vi.fn(),
}));

vi.mock("quasar", () => ({
  exportFile: vi.fn(),
}));

vi.mock("src/js/token", () => ({
  default: {
    decode: vi.fn(),
    getProofs: vi.fn(),
    getMint: vi.fn(),
  },
}));

vi.mock("src/stores/creatorSubscribers", () => ({
  useCreatorSubscribersStore: vi.fn(() => ({
    filtered: [],
  })),
}));

import { useLocalStorage } from "@vueuse/core";
import { safeUseLocalStorage } from "src/utils/safeLocalStorage";
import { sanitizeRelayUrls } from "src/utils/relay";
import {
  displayNameFromProfile,
  initialFromName,
  isTrustedUrl,
  normalizeMeta,
  placeholderAvatar,
  ProfileMeta,
  safeImageSrc,
  shortenNpub,
} from "src/utils/profile";
import downloadCsv from "src/utils/subscriberCsv";
import {
  formatTimestamp,
  parseSubscriptionDm,
  saveReceipt,
  subscriptionPayload,
} from "src/utils/receipt-utils";
import { getTrustedTime } from "src/utils/time";
import { exportFile } from "quasar";
import tokenModule from "src/js/token";

const useLocalStorageMock = useLocalStorage as unknown as vi.Mock;
const exportFileMock = exportFile as unknown as vi.Mock;
const tokenMock = tokenModule as unknown as {
  decode: vi.Mock;
  getProofs: vi.Mock;
  getMint: vi.Mock;
};

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

describe("application helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe("safeUseLocalStorage", () => {
    it.each(["legacy", "{malformed"])(
      "wraps legacy string values in JSON for %s",
      (value) => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        localStorage.setItem("legacyKey", value);
        const stored = { value: "from-use" };
        useLocalStorageMock.mockReturnValue(stored);

        const result = safeUseLocalStorage("legacyKey", "default");

        expect(localStorage.getItem("legacyKey")).toBe(JSON.stringify(value));
        expect(useLocalStorageMock).toHaveBeenCalledWith(
          "legacyKey",
          "default",
          expect.objectContaining({
            serializer: expect.objectContaining({
              read: expect.any(Function),
              write: expect.any(Function),
            }),
          }),
        );
        expect(result).toBe(stored);
        expect(warnSpy).toHaveBeenCalledTimes(1);

        const serializer = useLocalStorageMock.mock.calls[0][2].serializer;
        expect(serializer.read(JSON.stringify({ a: 1 }))).toEqual({ a: 1 });
        expect(serializer.read("not json")).toBe("default");
        expect(serializer.write({ a: 1 })).toBe(JSON.stringify({ a: 1 }));
        warnSpy.mockRestore();
      },
    );

    it("preserves valid JSON without migration", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      localStorage.setItem("legacyKey", JSON.stringify({ ok: true }));
      const stored = { value: "from-use" };
      useLocalStorageMock.mockReturnValue(stored);

      safeUseLocalStorage("legacyKey", {});

      expect(localStorage.getItem("legacyKey")).toBe(JSON.stringify({ ok: true }));
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe("sanitizeRelayUrls", () => {
    it.each([
      {
        input: ["https://relay.example", "ws://trim.me/", "  relay.test  "],
        expected: ["wss://relay.example", "wss://trim.me", "wss://relay.test"],
      },
      {
        input: ["wss://relay.example", "wss://relay.example"],
        expected: ["wss://relay.example"],
      },
    ])("normalizes protocols and removes duplicates", ({ input, expected }) => {
      expect(sanitizeRelayUrls(input)).toEqual(expected);
    });

    it("enforces a capacity limit", () => {
      const urls = ["relay.one", "relay.two", "relay.three"].map(
        (r) => `wss://${r}`,
      );
      expect(sanitizeRelayUrls(urls, 2)).toEqual(urls.slice(0, 2));
    });

    it.each([[""], ["   "], ["	"]])(
      "filters unsupported relay %s",
      (bad) => {
        expect(sanitizeRelayUrls([bad])).toEqual([]);
      },
    );

    it.each([
      ["ftp://bad", "wss://ftp://bad"],
      ["javascript:alert(1)", "wss://javascript:alert(1)"],
    ])(
      "coerces unknown protocols for %s",
      (input, expected) => {
        expect(sanitizeRelayUrls([input])).toEqual([expected]);
      },
    );
  });

  describe("profile helpers", () => {
    it.each([
      ["https://trusted.example", true],
      ["http://also-trusted", true],
      ["ftp://nope", false],
      ["", false],
    ])("checks trusted URL %s", (input, expected) => {
      expect(isTrustedUrl(input as string)).toBe(expected);
    });

    it("derives initials and placeholders", () => {
      expect(initialFromName("  alice ")).toBe("A");
      expect(initialFromName("", "F")).toBe("F");
      expect(placeholderAvatar("alice", 64)).toContain("64x64");
    });

    it("selects safe image sources", () => {
      const placeholder = placeholderAvatar("Bob");
      expect(safeImageSrc("javascript:alert(1)", "Bob")).toBe(placeholder);
      expect(safeImageSrc("https://img", "Bob")).toBe("https://img");
    });

    it("shortens npubs and supplies fallbacks", () => {
      expect(shortenNpub("npub1abcdefghijk", 4, 4)).toBe("npub…hijk");
      expect(shortenNpub("", 4, 4)).toBe("Unnamed User");
    });

    it("prefers display name, then name, nip05, or npub", () => {
      const meta: ProfileMeta = {
        display_name: "Display",
        name: "Name",
        nip05: "user@example.com",
      };
      expect(displayNameFromProfile(meta, "npub12345")).toBe("Display");
      expect(
        displayNameFromProfile({ display_name: "", name: "Alice" }, "npub12345"),
      ).toBe("Alice");
      expect(
        displayNameFromProfile({ name: "", nip05: "bob@example.com" }, "npubABCDE"),
      ).toBe("bob");
      expect(displayNameFromProfile({}, "npubWXYZ")).toBe("npubWXYZ");
      expect(displayNameFromProfile(undefined, undefined)).toBe("Unnamed User");
    });

    it("normalizes diverse metadata fields", () => {
      const normalized = normalizeMeta({
        displayName: "Display",
        username: "User",
        name: "Name",
        about: "About",
        picture: "https://img",
        nip05: "id@example.com",
        website: "https://site",
      });
      expect(normalized).toEqual({
        display_name: "Display",
        name: "Name",
        about: "About",
        picture: "https://img",
        nip05: "id@example.com",
        website: "https://site",
      });
    });
  });

  describe("subscriber CSV export", () => {
    const createObjectURL = vi.fn(() => "blob:csv");
    const revokeObjectURL = vi.fn();
    let clickSpy: vi.SpyInstance;

    beforeEach(() => {
      (URL.createObjectURL as unknown) = createObjectURL;
      (URL.revokeObjectURL as unknown) = revokeObjectURL;
      clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
      clickSpy.mockRestore();
      (URL.createObjectURL as unknown) = originalCreateObjectURL;
      (URL.revokeObjectURL as unknown) = originalRevokeObjectURL;
    });

    it("creates a CSV blob with subscriber data", async () => {
      const rows = [
        {
          name: "Alice",
          npub: "npub1",
          nip05: "alice@example.com",
          tierName: "Tier",
          frequency: "monthly",
          status: "active",
          amountSat: 1234,
          nextRenewal: 1_700_000_000,
          lifetimeSat: 4321,
          startDate: 1_699_000_000,
        },
      ] as any[];

      downloadCsv(rows as any);

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      const header = 'name,npub,nip05,tier,frequency,status,amount_sat,next_renewal_iso,lifetime_sat,start_date_iso';
      const expectedRow = [
        "\"Alice\"",
        "npub1",
        "alice@example.com",
        "\"Tier\"",
        "monthly",
        "active",
        "1234",
        new Date(1_700_000_000 * 1000).toISOString(),
        "4321",
        new Date(1_699_000_000 * 1000).toISOString(),
      ].join(',');
      const expectedText = `${header}\n${expectedRow}`;
      if (typeof blob.text === 'function') {
        const text = await blob.text();
        expect(text).toBe(expectedText);
      } else {
        const expectedLength = new TextEncoder().encode(expectedText).length;
        expect(blob.size).toBe(expectedLength);
      }
      expect(blob.type).toBe('text/csv;charset=utf-8;');
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:csv");
    });
  });

  describe("receipt utilities", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2024-01-02T03:04:05Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("saves receipts with decoded details", () => {
      tokenMock.decode.mockReturnValue({});
      tokenMock.getProofs.mockReturnValue([
        { amount: 10 },
        { amount: 20 },
      ]);
      tokenMock.getMint.mockReturnValue("https://mint");

      saveReceipt({
        subscriptionPayment: {
          token: "encoded",
          unlock_time: 1700000000,
          subscription_id: "sub-1",
        },
      } as any);

      expect(exportFileMock).toHaveBeenCalledTimes(1);
      const [name, payload] = exportFileMock.mock.calls[0];
      expect(name).toBe("fundstr_sub-1_20240102-030405.json");
      const parsed = JSON.parse(payload as string);
      expect(parsed).toEqual({
        rawToken: "encoded",
        amount: 30,
        mintUrl: "https://mint",
        unlock_time: 1700000000,
      });
    });

    it("ignores messages without subscription payments", () => {
      saveReceipt({} as any);
      expect(exportFileMock).not.toHaveBeenCalled();
    });

    it("builds subscription payloads with optional HTLC", () => {
      const meta = {
        subscription_id: "sub",
        tier_id: "tier",
        month_index: 1,
        total_months: 12,
      };
      expect(subscriptionPayload("token", 123, meta)).toEqual({
        type: "cashu_subscription_payment",
        token: "token",
        unlock_time: 123,
        subscription_id: "sub",
        tier_id: "tier",
        month_index: 1,
        total_months: 12,
      });
      expect(subscriptionPayload("token", null, meta, "hash")).toEqual({
        type: "cashu_subscription_payment",
        token: "token",
        unlock_time: null,
        subscription_id: "sub",
        tier_id: "tier",
        month_index: 1,
        total_months: 12,
        htlc_hash: "hash",
      });
    });

    it("formats timestamps and parses subscription payloads", () => {
      const ts = 1_700_000_000;
      const d = new Date(ts * 1000);
      const expected = `${d.getFullYear()}-${("0" + (d.getMonth() + 1)).slice(-2)}-${"0" + d.getDate()}.slice(-2) ${("0" + d.getHours()).slice(-2)}:${("0" + d.getMinutes()).slice(-2)}`;
      expect(formatTimestamp(ts)).toBe(expected);

      const payload = {
        type: "cashu_subscription_payment",
        token: "tok",
        unlock_time: 123,
        subscription_id: "sub",
        tier_id: "tier",
        month_index: 1,
        total_months: 3,
        htlc_hash: "hash",
        htlc_secret: "secret",
      };
      expect(parseSubscriptionDm(JSON.stringify(payload))).toEqual(payload);
    });

    it.each([
      "{",
      JSON.stringify({ type: "cashu_subscription_payment" }),
      JSON.stringify({ type: "other", token: "tok" }),
    ])("returns undefined for malformed DM %s", (input) => {
      expect(parseSubscriptionDm(input)).toBeUndefined();
    });
  });

  describe("trusted time retrieval", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      fetchMock.mockReset();
    });

    it.each([
      { nowValue: 1_700_000_000, expected: 1_700_000_000_000 },
      { nowValue: 1_700_000_000_123, expected: 1_700_000_000_123 },
    ])("prefers ndk pool timestamps %s", async ({ nowValue, expected }) => {
      const ndk = { pool: { now: vi.fn().mockResolvedValue(nowValue) } } as any;
      fetchMock.mockResolvedValue({ headers: new Headers() });

      const result = await getTrustedTime(ndk, ["wss://relay.example"]);

      expect(result).toBe(expected);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("falls back to relay HEAD requests when pool fails", async () => {
      const ndk = { pool: { now: vi.fn().mockRejectedValue(new Error("fail")) } } as any;
      const date = new Date("2024-01-03T12:34:56Z");
      fetchMock.mockResolvedValue({
        headers: new Headers({ date: date.toUTCString() }),
      });

      const result = await getTrustedTime(ndk, ["wss://relay.example"]);

      expect(fetchMock).toHaveBeenCalledWith("https://relay.example", { method: "HEAD" });
      expect(result).toBe(date.getTime());
    });

    it("returns null when all sources fail", async () => {
      const ndk = {
        pool: { now: vi.fn().mockResolvedValue(NaN) },
      } as any;
      fetchMock
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce({ headers: new Headers({ date: "invalid" }) });

      const result = await getTrustedTime(ndk, ["wss://one", "wss://two"]);

      expect(result).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
