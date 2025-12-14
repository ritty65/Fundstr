import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  useCreatorsStore,
  FEATURED_CREATORS,
} from "../../../src/stores/creators";
import { toHex } from "@/nostr/relayClient";

vi.mock(
  "@sentry/vue",
  () => ({
    init: vi.fn(),
    captureMessage: vi.fn(),
    captureException: vi.fn(),
    withScope: vi.fn(),
    setContext: vi.fn(),
    setUser: vi.fn(),
  }),
  { virtual: true },
);

const findProfilesMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    query: "",
    results: [],
    count: 0,
  }),
);

const getUserFromNip05Mock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

const getCreatorsMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ results: [], warnings: [] }),
);
const getCreatorsByPubkeysMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ results: [], warnings: [] }),
);
const fetchLegacyCreatorsMock = vi.hoisted(() => vi.fn().mockResolvedValue([]));

vi.mock("../../../src/api/phonebook", () => ({
  findProfiles: findProfilesMock,
  toNpub: (pubkey: string) => `npub${pubkey}`,
}));

vi.mock("../../../src/composables/useNdk", () => ({
  useNdk: vi.fn(async () => ({
    getUserFromNip05: getUserFromNip05Mock,
  })),
}));

vi.mock("../../../src/api/fundstrDiscovery", () => ({
  useDiscovery: () => ({
    getCreators: getCreatorsMock,
    getCreatorsByPubkeys: getCreatorsByPubkeysMock,
  }),
}));

vi.mock("../../../src/lib/fundstrApi", () => ({
  __esModule: true,
  fetchCreators: fetchLegacyCreatorsMock,
}));

const makeCreator = (pubkey: string, overrides: Partial<any> = {}) => ({
  pubkey,
  profile: null,
  followers: null,
  following: null,
  joined: null,
  displayName: null,
  name: null,
  about: null,
  nip05: null,
  picture: null,
  banner: null,
  tierSummary: null,
  metrics: null,
  tiers: [],
  tierDataFresh: null,
  ...overrides,
});

const fetchProfile = vi.fn();
const userProfile = { name: "Alice" };
const getUserMock = vi.fn(() => ({ fetchProfile, profile: userProfile }));
const nostrStoreMock = {
  initNdkReadOnly: vi.fn(),
  ndk: { getUser: getUserMock },
  fetchFollowerCount: vi.fn().mockResolvedValue(10),
  fetchFollowingCount: vi.fn().mockResolvedValue(5),
  fetchJoinDate: vi.fn().mockResolvedValue(123456),
  connected: true,
  lastError: null,
};

vi.mock("../../../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNostrStore: () => nostrStoreMock };
});

vi.mock("nostr-tools", () => ({
  nip19: {
    decode: vi.fn(),
    npubEncode: (k: string) => `npub${k}`,
  },
}));

import { nip19 } from "nostr-tools";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  findProfilesMock.mockResolvedValue({ query: "", results: [], count: 0 });
  getCreatorsMock.mockResolvedValue({ results: [], warnings: [] });
  getCreatorsByPubkeysMock.mockResolvedValue({ results: [], warnings: [] });
  getUserFromNip05Mock.mockResolvedValue(null);
  (nip19.decode as any).mockImplementation((value: string) => ({
    data: value.startsWith("npub") ? "f".repeat(64) : value,
  }));
});

describe("Creators store", () => {
  it("populates searchResults for valid npub", async () => {
    (nip19.decode as any).mockReturnValue({ data: "f".repeat(64) });
    const creators = useCreatorsStore();
    creators.fetchCreator = vi
      .fn()
      .mockResolvedValue(
        makeCreator("f".repeat(64), {
          profile: userProfile,
          followers: 10,
          following: 5,
          joined: 123456,
        }),
      ) as any;
    await creators.searchCreators("npub123");

    expect(creators.error).toBe("");
    expect(creators.searchResults.length).toBe(1);
    expect(creators.searchResults[0].pubkey).toBe("f".repeat(64));
    expect(creators.searchResults[0].profile).toEqual(userProfile);
    expect(creators.searchResults[0].followers).toBe(10);
    expect(creators.searchResults[0].following).toBe(5);
    expect(creators.searchResults[0].joined).toBe(123456);
  });

  it("populates searchResults for hex pubkey", async () => {
    const pubkey = "a".repeat(64);
    getCreatorsMock.mockResolvedValueOnce({
      results: [makeCreator(pubkey)],
      warnings: [],
    });
    const creators = useCreatorsStore();
    await creators.searchCreators(pubkey);

    expect(creators.error).toBe("");
    expect(creators.searchResults.length).toBe(1);
    expect(creators.searchResults[0].pubkey).toBe(pubkey);
  });

  it("treats invalid npub as plain query and searches phonebook", async () => {
    const pubkey = "b".repeat(64);
    (nip19.decode as any).mockImplementation(() => {
      throw new Error("bad");
    });
    findProfilesMock.mockResolvedValueOnce({
      query: "npubbad",
      results: [
        {
          pubkey,
          name: "bad npub",
          display_name: "Bad npub",
          about: "Invalid npub should still search",
          picture: "https://example.com/avatar.png",
          nip05: null,
        },
      ],
      count: 1,
    });
    getCreatorsByPubkeysMock.mockResolvedValueOnce({
      results: [makeCreator(pubkey)],
      warnings: [],
    });
    const creators = useCreatorsStore();
    creators.fetchCreator = vi.fn().mockResolvedValue(null) as any;

    await creators.searchCreators("npubbad");

    expect(findProfilesMock).toHaveBeenCalledWith("npubbad", expect.any(AbortSignal));
    expect(creators.searchResults.length).toBe(1);
    expect(creators.searchResults[0].pubkey).toBe(pubkey);
    expect(creators.error).toBe("");
  });

  it("falls back to discovery when npub decoding fails and phonebook is empty", async () => {
    (nip19.decode as any).mockImplementation(() => {
      throw new Error("bad npub");
    });

    findProfilesMock.mockResolvedValueOnce({ query: "npubbad", results: [], count: 0 });

    const discoveryCreator = makeCreator("d".repeat(64), { name: "fallback" });
    getCreatorsMock.mockResolvedValueOnce({ results: [discoveryCreator], warnings: [] });

    const creators = useCreatorsStore();
    await creators.searchCreators("npubbad");

    expect(findProfilesMock).toHaveBeenCalledWith("npubbad", expect.any(AbortSignal));
    expect(getCreatorsMock).toHaveBeenCalled();
    expect(creators.searchResults).toHaveLength(1);
    expect(creators.error).toBe("");
  });

  it("handles invalid hex", async () => {
    const pubkey = "g".repeat(64);
    getCreatorsMock.mockResolvedValueOnce({ results: [], warnings: [] });
    fetchLegacyCreatorsMock.mockResolvedValueOnce([]);
    const creators = useCreatorsStore();
    await creators.searchCreators(pubkey);

    expect(creators.searchResults.length).toBe(0);
    expect(creators.error).toBe("");
  });

  it("loads featured creators", async () => {
    (nip19.decode as any).mockReturnValue({ data: "f".repeat(64) });
    const creators = useCreatorsStore();
    creators.loadFeatured = vi.fn().mockImplementation(async () => {
      creators.searchResults = FEATURED_CREATORS.map((npub, index) =>
        makeCreator(`${index.toString().padStart(2, "0")}${npub}`),
      );
      creators.error = "";
    }) as any;

    await creators.loadFeaturedCreators();

    expect(creators.error).toBe("");
    expect(creators.searchResults.length).toBe(FEATURED_CREATORS.length);
    expect(creators.loadFeatured).toHaveBeenCalledWith(FEATURED_CREATORS, {
      fresh: false,
    });
  });

  it("uses phonebook results before discovery search", async () => {
    const pubkey = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2";
    findProfilesMock.mockResolvedValueOnce({
      query: "jack",
      results: [
        {
          pubkey,
          name: "jack",
          display_name: "",
          about: "no state is the best state",
          picture: "https://image.nostr.build/...",
          nip05: "jack@nostr.com",
        },
      ],
      count: 1,
    });

    getCreatorsByPubkeysMock.mockResolvedValueOnce({
      results: [makeCreator(pubkey)],
      warnings: ["discovery"],
    });

    const creators = useCreatorsStore();
    creators.fetchCreator = vi.fn().mockResolvedValue(null) as any;

    await creators.searchCreators("jack");

    expect(findProfilesMock).toHaveBeenCalledWith("jack", expect.any(AbortSignal));
    expect(getCreatorsByPubkeysMock).toHaveBeenCalledWith({
      npubs: [`npub${pubkey}`],
      signal: expect.any(AbortSignal),
    });
    expect(getCreatorsMock).not.toHaveBeenCalled();
    expect(creators.searchResults).toHaveLength(1);
    expect(creators.searchResults[0].pubkey).toBe(pubkey);
    expect(creators.searchResults[0].displayName).toBe("jack");
    expect(creators.searchResults[0].about).toBe("no state is the best state");
    expect(creators.searchWarnings).toEqual([]);
    expect(creators.searchAbortController).toBeNull();
    expect(creators.searching).toBe(false);
  });

  it("enriches phonebook hits for direct pubkey searches", async () => {
    const pubkey = "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2";
    findProfilesMock.mockResolvedValueOnce({
      query: pubkey,
      results: [
        {
          pubkey,
          name: "jack",
          display_name: "",
          about: "no state is the best state",
          picture: "https://image.nostr.build/...",
          nip05: "jack@nostr.com",
        },
      ],
      count: 1,
    });

    getCreatorsByPubkeysMock.mockResolvedValueOnce({ results: [], warnings: [] });

    const fetchedCreator = makeCreator(pubkey);
    const fetchCreatorMock = vi.fn().mockResolvedValue(fetchedCreator);
    const creators = useCreatorsStore();
    creators.fetchCreator = fetchCreatorMock as any;

    await creators.searchCreators(pubkey);

    expect(findProfilesMock).toHaveBeenCalledWith(pubkey, expect.any(AbortSignal));
    expect(getCreatorsByPubkeysMock).toHaveBeenCalled();
    expect(fetchCreatorMock).toHaveBeenCalledWith(pubkey, false);
    expect(getCreatorsMock).not.toHaveBeenCalled();
    expect(creators.searchResults).toHaveLength(1);
    expect(creators.searchResults[0].pubkey).toBe(pubkey);
    expect(creators.searchResults[0].name).toBe("jack");
    expect(creators.searchResults[0].about).toBe("no state is the best state");
    expect(creators.searchAbortController).toBeNull();
    expect(creators.searching).toBe(false);
  });

  it("falls back to discovery search when phonebook is empty", async () => {
    findProfilesMock.mockResolvedValueOnce({ query: "randomxyz", results: [], count: 0 });

    const discoveryCreator = makeCreator("b".repeat(64), { name: "random" });
    getCreatorsMock.mockResolvedValueOnce({ results: [discoveryCreator], warnings: ["warn"] });

    const creators = useCreatorsStore();
    await creators.searchCreators("randomxyz");

    expect(findProfilesMock).toHaveBeenCalledWith("randomxyz", expect.any(AbortSignal));
    expect(getCreatorsMock).toHaveBeenCalledWith({
      q: "randomxyz",
      fresh: false,
      signal: expect.any(AbortSignal),
    });
    expect(creators.searchResults).toHaveLength(1);
    expect(creators.searchResults[0].pubkey).toBe("b".repeat(64));
    expect(creators.error).toBe("");
    expect(creators.searchAbortController).toBeNull();
    expect(creators.searching).toBe(false);
  });

  it("falls back when phonebook lookup fails", async () => {
    findProfilesMock.mockRejectedValueOnce(new Error("network failure"));

    const discoveryCreator = makeCreator("c".repeat(64), { name: "fallback" });
    getCreatorsMock.mockResolvedValueOnce({ results: [discoveryCreator], warnings: [] });

    const creators = useCreatorsStore();
    await creators.searchCreators("jack");

    expect(findProfilesMock).toHaveBeenCalled();
    expect(getCreatorsMock).toHaveBeenCalled();
    expect(creators.searchResults).toHaveLength(1);
    expect(creators.searchResults[0].name).toBe("fallback");
    expect(creators.error).toBe("");
    expect(creators.searchAbortController).toBeNull();
    expect(creators.searching).toBe(false);
  });

  it("merges featured creator matches by display name when discovery is empty", async () => {
    const featuredNpub = FEATURED_CREATORS[0];
    const featuredPubkey = toHex(featuredNpub);
    const featuredCreator = makeCreator(featuredPubkey, {
      displayName: "Featured Hero",
      featured: true,
    });

    findProfilesMock.mockResolvedValueOnce({ query: "Featured Hero", results: [], count: 0 });
    getCreatorsMock.mockResolvedValueOnce({ results: [], warnings: [] });
    getCreatorsByPubkeysMock.mockResolvedValueOnce({ results: [], warnings: [] });

    const creators = useCreatorsStore();
    creators.featuredCreators = [featuredCreator];
    creators.fetchCreator = vi.fn().mockResolvedValue(featuredCreator) as any;

    await creators.searchCreators("Featured Hero");

    expect(creators.searchResults).toHaveLength(1);
    expect(creators.searchResults[0].pubkey).toBe(featuredPubkey);
    expect(creators.searchResults[0].featured).toBe(true);
  });

  it("surfaces featured npub queries even without discovery hits", async () => {
    const featuredNpub = FEATURED_CREATORS[1];
    const featuredPubkey = "e".repeat(64);
    const featuredCreator = makeCreator(featuredPubkey, { featured: true });

    (nip19.decode as any)
      .mockImplementationOnce(() => {
        throw new Error("decode fail");
      })
      .mockImplementation(() => ({ data: featuredPubkey }));

    findProfilesMock.mockResolvedValueOnce({ query: featuredNpub, results: [], count: 0 });
    getCreatorsMock.mockResolvedValueOnce({ results: [], warnings: [] });
    getCreatorsByPubkeysMock.mockResolvedValueOnce({ results: [], warnings: [] });
    fetchLegacyCreatorsMock.mockResolvedValueOnce([]);

    const creators = useCreatorsStore();
    creators.fetchCreator = vi.fn().mockResolvedValue(featuredCreator) as any;

    await creators.searchCreators(featuredNpub);

    expect(creators.searchResults).toHaveLength(1);
    expect(creators.searchResults[0].pubkey).toBe(featuredPubkey);
    expect(creators.searchResults[0].featured).toBe(true);
  });

  it("treats failed NIP-05 lookups as plain discovery queries", async () => {
    findProfilesMock.mockResolvedValueOnce({
      query: "user@example.com",
      results: [],
      count: 0,
    });

    getUserFromNip05Mock.mockRejectedValueOnce(new Error("nip05 failed"));

    const discoveryCreator = makeCreator("e".repeat(64), { name: "nip05" });
    getCreatorsMock.mockResolvedValueOnce({ results: [discoveryCreator], warnings: [] });

    const creators = useCreatorsStore();
    await creators.searchCreators("user@example.com");

    expect(findProfilesMock).toHaveBeenCalledWith(
      "user@example.com",
      expect.any(AbortSignal),
    );
    expect(getUserFromNip05Mock).toHaveBeenCalledWith("user@example.com");
    expect(getCreatorsMock).toHaveBeenCalledWith({
      q: "user@example.com",
      fresh: false,
      signal: expect.any(AbortSignal),
    });
    expect(creators.searchResults).toHaveLength(1);
    expect(creators.error).toBe("");
  });
});
