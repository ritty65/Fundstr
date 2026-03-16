import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nip19, getPublicKey } from "nostr-tools";
import { ensureCompressed } from "src/utils/ecash";
import { flushPromises, shallowMount } from "@vue/test-utils";
import { reactive, nextTick } from "vue";

const primarySecret = "1".repeat(64);
const hex = getPublicKey(primarySecret);
const npub = nip19.npubEncode(hex);
const secondarySecret = "2".repeat(64);
const altHex = getPublicKey(secondarySecret);
const altNpub = nip19.npubEncode(altHex);

const {
  storeMock,
  routerReplace,
  routerPush,
  creatorsStoreMock,
  fetchFundstrProfileBundleMock,
  queryNutzapProfileMock,
  queryNutzapTiersMock,
  fallbackDiscoverRelaysMock,
} = vi.hoisted(() => ({
  storeMock: { initNdkReadOnly: vi.fn(), hasIdentity: true } as any,
  routerReplace: vi.fn(),
  routerPush: vi.fn(),
  creatorsStoreMock: {
    fetchCreator: vi.fn(async () => {}),
    tierFetchError: false,
    tiersMap: {} as Record<string, any>,
  },
  fetchFundstrProfileBundleMock: vi.fn(),
  queryNutzapProfileMock: vi.fn(),
  queryNutzapTiersMock: vi.fn(),
  fallbackDiscoverRelaysMock: vi.fn(async () => []),
}));

vi.mock("src/composables/useNdk", () => ({
  useNdk: vi.fn(async () => ({ subscribe: vi.fn() })),
}));
vi.mock("@/nostr/relayClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/nostr/relayClient")>();
  return {
    ...actual,
    queryNutzapProfile: queryNutzapProfileMock,
    queryNutzapTiers: queryNutzapTiersMock,
  };
});
vi.mock("@/nostr/discovery", () => ({
  fallbackDiscoverRelays: fallbackDiscoverRelaysMock,
}));
vi.mock("stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNostrStore: () => storeMock,
    ensureRelayConnectivity: vi.fn(),
  };
});

const route = reactive({
  params: { npubOrHex: npub },
  query: {} as Record<string, any>,
  fullPath: "/creator",
});

vi.mock("vue-router", () => ({
  useRoute: () => route,
  useRouter: () => ({ replace: routerReplace, push: routerPush }),
}));
vi.mock("stores/creators", () => ({
  useCreatorsStore: () => creatorsStoreMock,
  fetchFundstrProfileBundle: fetchFundstrProfileBundleMock,
  FundstrProfileFetchError: class extends Error {},
}));

vi.mock("stores/price", () => ({
  usePriceStore: () => ({ bitcoinPrice: 0 }),
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => ({ formatCurrency: vi.fn(() => "$0.00") }),
}));

vi.mock("stores/welcome", () => ({
  useWelcomeStore: () => ({ welcomeCompleted: true }),
}));

vi.mock("stores/sendTokensStore", () => ({
  useSendTokensStore: () => ({
    clearSendData: vi.fn(),
    recipientPubkey: "",
    sendViaNostr: false,
    sendData: {},
    showLockInput: false,
    showSendTokens: false,
  }),
}));

vi.mock("stores/donationPresets", () => ({
  useDonationPresetsStore: () => ({
    createDonationPreset: vi.fn(),
    showCreatePresetDialog: false,
  }),
}));

vi.mock("stores/messenger", () => ({
  useMessengerStore: () => ({
    startChat: vi.fn(),
  }),
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => ({
    activeMintUrl: "",
    activeInfo: null,
  }),
}));

vi.mock("src/composables/useClipboard", () => ({
  useClipboard: () => ({ copy: vi.fn() }),
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key } }),
}));

vi.mock("src/utils/profileUrl", () => ({
  buildProfileUrl: () => "https://example.com/profile",
  extractCreatorIdentifier: (value: string) => value,
  preferredCreatorPublicIdentifier: ({ fallbackIdentifier }: any) =>
    fallbackIdentifier,
}));

vi.mock("src/utils/nostrKeys", () => ({
  deriveCreatorKeys: (param?: string) => ({
    npub: param ?? "",
    hex:
      typeof param === "string" && param.startsWith("npub")
        ? hex
        : typeof param === "string"
        ? param
        : "",
  }),
}));

vi.mock("src/utils/sanitize-url", () => ({
  isTrustedUrl: () => true,
}));

import * as nostrModule from "stores/nostr";
import PublicCreatorProfilePage from "pages/PublicCreatorProfilePage.vue";

const makeEvent = (overrides: Partial<Record<string, unknown>> = {}) => {
  const p2pk = (overrides.p2pk as string | undefined) ?? npub;
  const mints = (overrides.mints as string[] | undefined) ?? ["https://mint"];
  const relays = (overrides.relays as string[] | undefined) ?? [];
  const displayName = overrides.display_name as string | undefined;
  const about = overrides.about as string | undefined;
  const picture = overrides.picture as string | undefined;
  return {
    content: JSON.stringify({
      p2pk,
      mints,
      relays,
      ...(displayName ? { display_name: displayName } : {}),
      ...(about ? { about } : {}),
      ...(picture ? { picture } : {}),
    }),
    tags: [
      ["t", "nutzap-profile"],
      ["client", "fundstr"],
      ["pubkey", p2pk],
      ...(displayName ? [["name", displayName]] : []),
      ...(picture ? [["picture", picture]] : []),
      ...relays.map((url) => ["relay", url]),
    ],
  } as any;
};

const makeTierEvent = (overrides: Partial<Record<string, unknown>> = {}) => ({
  pubkey: hex,
  kind: 30019,
  created_at: 1700000200,
  id: "t".repeat(64),
  sig: "e".repeat(128),
  tags: [["d", "tiers"]],
  content: JSON.stringify({
    v: 1,
    tiers: [
      {
        id: "relay-tier",
        title: "Relay Tier",
        price: 5000,
        frequency: "monthly",
        description: "Recovered via relay refresh",
      },
    ],
    ...(overrides.content as Record<string, unknown> | undefined),
  }),
  ...overrides,
});

const resetComponentDeps = () => {
  creatorsStoreMock.fetchCreator.mockReset();
  creatorsStoreMock.tierFetchError = false;
  creatorsStoreMock.tiersMap = {};
  fetchFundstrProfileBundleMock.mockReset();
  fetchFundstrProfileBundleMock.mockResolvedValue({
    profile: { display_name: "Cached", about: "" },
    profileEvent: null,
    profileDetails: {
      trustedMints: ["https://cached"],
      relays: ["wss://cached"],
      tierAddr: "",
      p2pkPubkey: ensureCompressed(hex),
    },
    tiers: [],
    followers: 0,
    following: 0,
    joined: null,
    relayHints: [],
    fetchedFromFallback: false,
    tierDataFresh: true,
    tierSecurityBlocked: false,
    tierFetchFailed: false,
  });
};

beforeEach(() => {
  localStorage.clear();
  queryNutzapProfileMock.mockReset();
  queryNutzapTiersMock.mockReset();
  queryNutzapTiersMock.mockResolvedValue(null);
  fallbackDiscoverRelaysMock.mockReset();
  fallbackDiscoverRelaysMock.mockResolvedValue([]);
  storeMock.initNdkReadOnly.mockReset();
  storeMock.hasIdentity = true;
  route.params.npubOrHex = npub;
  route.query = {};
  route.fullPath = "/creator";
  routerReplace.mockReset();
  routerPush.mockReset();
  resetComponentDeps();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("fetchNutzapProfile", () => {
  it("returns compressed hex from npub tag", async () => {
    queryNutzapProfileMock.mockResolvedValue(makeEvent());
    const prof = await nostrModule.fetchNutzapProfile(npub);
    expect(prof?.p2pkPubkey).toBe(ensureCompressed(hex));
    expect(prof?.p2pkPubkey?.length).toBe(66);
  });

  it("hydrates display metadata from relay profile content and tags", async () => {
    queryNutzapProfileMock.mockResolvedValue(
      makeEvent({
        display_name: "Relay Creator",
        about: "Recovered from relay",
        picture: "https://example.com/avatar.png",
      }),
    );

    const prof = await nostrModule.fetchNutzapProfile(npub, {
      forceRefresh: true,
    });

    expect(prof).toMatchObject({
      display_name: "Relay Creator",
      about: "Recovered from relay",
      picture: "https://example.com/avatar.png",
    });
  });

  it("forces bypassing cached values and rehydrates the cache", async () => {
    queryNutzapProfileMock.mockResolvedValue(
      makeEvent({
        p2pk: altNpub,
        mints: ["https://cached"],
        relays: ["wss://cached"],
      }),
    );
    await nostrModule.fetchNutzapProfile(altNpub, { forceRefresh: true });
    expect(queryNutzapProfileMock).toHaveBeenCalledTimes(1);

    queryNutzapProfileMock.mockResolvedValue(
      makeEvent({
        p2pk: altNpub,
        mints: ["https://fresh"],
        relays: ["wss://fresh"],
      }),
    );
    const fresh = await nostrModule.fetchNutzapProfile(altNpub, {
      forceRefresh: true,
    });
    expect(fresh?.trustedMints).toEqual(["https://fresh"]);
    expect(fresh?.relays).toEqual(["wss://fresh"]);
    expect(queryNutzapProfileMock).toHaveBeenCalledTimes(2);

    queryNutzapProfileMock.mockClear();
    const cached = await nostrModule.fetchNutzapProfile(altNpub);
    expect(cached?.trustedMints).toEqual(["https://fresh"]);
    expect(cached?.relays).toEqual(["wss://fresh"]);
    expect(queryNutzapProfileMock).not.toHaveBeenCalled();
  });
});

describe("PublicCreatorProfilePage", () => {
  it("forces a relay refresh on load and waits for the fresh profile", async () => {
    resetComponentDeps();

    const deferred: { resolve: (value: any) => void; promise: Promise<any> } = {
      resolve: () => {},
      promise: Promise.resolve(null),
    };
    deferred.promise = new Promise((resolve) => {
      deferred.resolve = resolve;
    });

    fetchFundstrProfileBundleMock.mockImplementation(async (_hex, options) => {
      expect(options?.forceRefresh).toBe(true);
      return deferred.promise;
    });

    const wrapper = shallowMount(PublicCreatorProfilePage, {
      global: {
        stubs: {
          transition: false,
          "q-btn": true,
          "q-banner": true,
          "q-tooltip": true,
          "q-chip": true,
          "q-spinner-dots": true,
          "q-spinner-hourglass": true,
          SubscribeDialog: true,
          SetupRequiredDialog: true,
          SubscriptionReceipt: true,
          MintSafetyList: true,
          RelayBadgeList: true,
          TierSummaryCard: true,
          PaywalledContent: true,
        },
        config: {
          globalProperties: {
            $t: (key: string) => key,
            $tc: (key: string) => key,
          },
        },
      },
    });

    await nextTick();
    expect(fetchFundstrProfileBundleMock).toHaveBeenCalledTimes(1);

    deferred.resolve({
      profile: {},
      profileDetails: {
        p2pkPubkey: ensureCompressed(hex),
        trustedMints: ["https://fresh"],
        relays: ["wss://fresh"],
        tierAddr: "tier:1",
      },
      tiers: [],
      profileEvent: null,
      tierDataFresh: true,
      tierSecurityBlocked: false,
      tierFetchFailed: false,
      relayHints: [],
      fetchedFromFallback: false,
      followers: null,
      following: null,
      joined: Date.now(),
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.vm.profile.trustedMints).toEqual(["https://fresh"]);
    expect(wrapper.vm.profile.relays).toEqual(["wss://fresh"]);

    wrapper.unmount();
  });

  it("hydrates relay metadata and tiers when discovery returns sparse profile data", async () => {
    resetComponentDeps();
    fetchFundstrProfileBundleMock.mockResolvedValue({
      profile: {},
      profileEvent: null,
      profileDetails: {
        trustedMints: ["https://mint"],
        relays: ["wss://cached"],
        tierAddr: `30019:${hex}:tiers`,
        p2pkPubkey: ensureCompressed(hex),
      },
      tiers: null,
      followers: 0,
      following: 0,
      joined: null,
      relayHints: [],
      fetchedFromFallback: false,
      tierDataFresh: true,
      tierSecurityBlocked: false,
      tierFetchFailed: false,
    });
    queryNutzapProfileMock.mockResolvedValue(
      makeEvent({
        display_name: "Relay Creator",
        about: "Recovered from relay",
        picture: "https://example.com/avatar.png",
        relays: ["wss://relay.fundstr.me"],
      }),
    );
    queryNutzapTiersMock.mockResolvedValue(makeTierEvent());

    const wrapper = shallowMount(PublicCreatorProfilePage, {
      global: {
        stubs: {
          transition: false,
          "q-btn": true,
          "q-banner": true,
          "q-tooltip": true,
          "q-chip": true,
          "q-spinner-dots": true,
          "q-spinner-hourglass": true,
          SubscribeDialog: true,
          SetupRequiredDialog: true,
          SubscriptionReceipt: true,
          MintSafetyList: true,
          RelayBadgeList: true,
          TierSummaryCard: true,
          PaywalledContent: true,
        },
        config: {
          globalProperties: {
            $t: (key: string) => key,
            $tc: (key: string) => key,
          },
        },
      },
    });

    await flushPromises();
    await nextTick();
    await flushPromises();

    expect(wrapper.vm.profile.display_name).toBe("Relay Creator");
    expect(wrapper.vm.profile.about).toBe("Recovered from relay");
    expect(queryNutzapTiersMock).toHaveBeenCalledTimes(1);
    expect(creatorsStoreMock.tiersMap[hex]?.[0]).toMatchObject({
      id: "relay-tier",
      name: "Relay Tier",
      price_sats: 5000,
    });

    wrapper.unmount();
  });
});
