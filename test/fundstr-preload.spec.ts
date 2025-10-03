import { beforeEach, describe, expect, it, vi } from "vitest";

const initNdkReadOnlyMock = vi.fn();
const ensureCreatorCacheFromDexieMock = vi.fn();
const saveProfileCacheMock = vi.fn();
const saveTierCacheMock = vi.fn();
const queryNutzapProfileMock = vi.fn();
const queryNutzapTiersMock = vi.fn();
const toHexMock = vi.fn();
const parseNutzapProfileEventMock = vi.fn();
const parseTierDefinitionEventMock = vi.fn();
const isFundstrShareRouteActiveMock = vi.fn();

const creatorsStore = {
  favoriteHexPubkeys: [] as string[],
  ensureCreatorCacheFromDexie: ensureCreatorCacheFromDexieMock,
  saveProfileCache: saveProfileCacheMock,
  saveTierCache: saveTierCacheMock,
};

vi.mock("stores/nostr", () => ({
  useNostrStore: () => ({
    initNdkReadOnly: initNdkReadOnlyMock,
  }),
}));

vi.mock("stores/creators", () => ({
  FEATURED_CREATORS: ["npub1creator"],
  useCreatorsStore: () => creatorsStore,
}));

vi.mock("@/nostr/relayClient", () => ({
  queryNutzapProfile: queryNutzapProfileMock,
  queryNutzapTiers: queryNutzapTiersMock,
  toHex: toHexMock,
}));

vi.mock("@/nutzap/profileCache", () => ({
  parseNutzapProfileEvent: parseNutzapProfileEventMock,
}));

vi.mock("src/nostr/tiers", () => ({
  parseTierDefinitionEvent: parseTierDefinitionEventMock,
}));

vi.mock("boot/ndk", () => ({
  isFundstrShareRouteActive: isFundstrShareRouteActiveMock,
}));

describe("fundstr preload", () => {
  const hexPubkey = "f".repeat(64);
  const profileEvent = { id: "profile-event" } as const;
  const profileDetails = { about: "Creator" } as const;
  const tierEvent = { id: "tier-event" } as const;
  const parsedTiers = [
    { price_sats: 321, perks: "Tier", media: [] as string[] },
  ];
  const modulePath = "../src/boot/fundstr-preload";

  let preloadCreators: (typeof import("../src/boot/fundstr-preload"))[
    "preloadCreators"
  ];
  let resetCreatorPreloadStateForTesting: (typeof import(
    "../src/boot/fundstr-preload"
  ))["resetCreatorPreloadStateForTesting"];

  beforeEach(() => {
    vi.clearAllMocks();
    creatorsStore.favoriteHexPubkeys = [];
    initNdkReadOnlyMock.mockResolvedValue(undefined);
    ensureCreatorCacheFromDexieMock.mockResolvedValue(undefined);
    saveProfileCacheMock.mockResolvedValue(undefined);
    saveTierCacheMock.mockResolvedValue(undefined);
    queryNutzapProfileMock.mockResolvedValue(profileEvent);
    queryNutzapTiersMock.mockResolvedValue(tierEvent);
    parseNutzapProfileEventMock.mockReturnValue(profileDetails);
    parseTierDefinitionEventMock.mockReturnValue(parsedTiers);
    toHexMock.mockReturnValue(hexPubkey);
    isFundstrShareRouteActiveMock.mockReturnValue(false);
  });

  beforeEach(async () => {
    const mod = await import(modulePath);
    preloadCreators = mod.preloadCreators;
    resetCreatorPreloadStateForTesting =
      mod.resetCreatorPreloadStateForTesting;
    resetCreatorPreloadStateForTesting();
  });

  it("hydrates creator caches when share mode is inactive", async () => {
    await preloadCreators();

    expect(initNdkReadOnlyMock).toHaveBeenCalledWith({ fundstrOnly: true });
    expect(ensureCreatorCacheFromDexieMock).toHaveBeenCalledWith(hexPubkey);
    expect(queryNutzapProfileMock).toHaveBeenCalledWith(hexPubkey, {
      allowFanoutFallback: false,
    });
    expect(saveProfileCacheMock).toHaveBeenCalledWith(
      hexPubkey,
      profileEvent,
      profileDetails,
    );
    expect(queryNutzapTiersMock).toHaveBeenCalledWith(hexPubkey, {
      allowFanoutFallback: false,
    });

    const tierCall = saveTierCacheMock.mock.calls[0];
    expect(tierCall?.[0]).toBe(hexPubkey);
    expect(tierCall?.[2]).toBe(tierEvent);
    expect(tierCall?.[1]).toEqual([
      {
        price_sats: parsedTiers[0].price_sats,
        perks: parsedTiers[0].perks,
        media: [],
        benefits: [parsedTiers[0].perks],
      },
    ]);
  });

  it("aborts preload when share mode is active", async () => {
    isFundstrShareRouteActiveMock.mockReturnValue(true);

    await preloadCreators();

    expect(initNdkReadOnlyMock).not.toHaveBeenCalled();
    expect(ensureCreatorCacheFromDexieMock).not.toHaveBeenCalled();
    expect(queryNutzapProfileMock).not.toHaveBeenCalled();
    expect(saveTierCacheMock).not.toHaveBeenCalled();
  });
});
