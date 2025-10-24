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

vi.mock("src/composables/useClipboard", () => ({
  useClipboard: () => ({ copy: vi.fn() }),
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key } }),
}));

vi.mock("src/utils/profileUrl", () => ({
  buildProfileUrl: () => "https://example.com/profile",
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
  return {
    content: JSON.stringify({
      p2pk,
      mints,
      relays,
    }),
    tags: [["t", "nutzap-profile"], ["client", "fundstr"], ["pubkey", p2pk], ...relays.map((url) => ["relay", url])],
  } as any;
};

const resetComponentDeps = () => {
  creatorsStoreMock.fetchCreator.mockReset();
  creatorsStoreMock.tierFetchError = false;
  creatorsStoreMock.tiersMap = {};
  fetchFundstrProfileBundleMock.mockReset();
  fetchFundstrProfileBundleMock.mockResolvedValue({
    profile: { display_name: "Cached", about: "" },
    profileDetails: {
      trustedMints: ["https://cached"],
      relays: ["wss://cached"],
      tierAddr: "",
      p2pkPubkey: ensureCompressed(hex),
    },
    tiers: [],
    followers: 0,
    following: 0,
    relayHints: [],
  });
};

beforeEach(() => {
  localStorage.clear();
  queryNutzapProfileMock.mockReset();
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

  it("forces bypassing cached values and rehydrates the cache", async () => {
    queryNutzapProfileMock.mockResolvedValue(
      makeEvent({ p2pk: altNpub, mints: ["https://cached"], relays: ["wss://cached"] }),
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
    const fresh = await nostrModule.fetchNutzapProfile(altNpub, { forceRefresh: true });
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
    vi.useFakeTimers();
    resetComponentDeps();

    const deferred: { resolve: (value: any) => void; promise: Promise<any> } = {
      resolve: () => {},
      promise: Promise.resolve(null),
    };
    deferred.promise = new Promise((resolve) => {
      deferred.resolve = resolve;
    });

    const fetchSpy = vi
      .spyOn(nostrModule, "fetchNutzapProfile")
      .mockImplementation(async (_hex, options) => {
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
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1]?.fundstrOnly).toBe(true);

    expect(wrapper.vm.profile.trustedMints).toEqual(["https://cached"]);

    deferred.resolve({
      hexPub: hex,
      p2pkPubkey: ensureCompressed(hex),
      trustedMints: ["https://fresh"],
      relays: ["wss://fresh"],
      tierAddr: "tier:1",
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.vm.profile.trustedMints).toEqual(["https://fresh"]);
    expect(wrapper.vm.profile.relays).toEqual(["wss://fresh"]);

    fetchSpy.mockRestore();
    wrapper.unmount();
  });
});
