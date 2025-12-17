import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { reactive, nextTick } from "vue";
import FindCreators from "src/pages/FindCreators.vue";

const getCreatorsMock = vi.fn().mockResolvedValue({
  count: 0,
  warnings: [],
  results: [],
  cached: false,
  tookMs: 0,
});
vi.mock("src/api/fundstrDiscovery", () => ({
  useFundstrDiscovery: () => ({
    getCreators: getCreatorsMock,
    clearCache: vi.fn(),
  }),
  useDiscovery: () => ({
    getCreators: getCreatorsMock,
    clearCache: vi.fn(),
  }),
}));

vi.mock("components/CreatorProfileModal.vue", () => ({
  default: { name: "CreatorProfileModal", template: "<div />" },
}));
vi.mock("components/DonateDialog.vue", () => ({
  default: { name: "DonateDialog", template: "<div />" },
}));
vi.mock("components/SendTokenDialog.vue", () => ({
  default: { name: "SendTokenDialog", template: "<div />" },
}));

const findProfilesMock = vi.fn().mockResolvedValue({ query: "", results: [], count: 0 });
vi.mock("src/api/phonebook", () => ({
  findProfiles: findProfilesMock,
  toNpub: (value: string) => value,
}));

const sendTokensStore = { clearSendData: vi.fn(), sendData: {}, showSendTokens: false };
vi.mock("stores/sendTokensStore", () => ({
  useSendTokensStore: () => sendTokensStore,
}));

const donationStore = { createDonationPreset: vi.fn() };
vi.mock("stores/donationPresets", () => ({
  useDonationPresetsStore: () => donationStore,
}));

let creatorsStore;
vi.mock("stores/creators", () => ({
  useCreatorsStore: () => creatorsStore,
}));

const nostrStore = {
  pubkey: "",
  initNdkReadOnly: vi.fn().mockResolvedValue(undefined),
  resolvePubkey: (k: string) => k,
  hasIdentity: true,
};
vi.mock("stores/nostr", () => ({
  useNostrStore: () => nostrStore,
}));

const messengerStore = {
  started: false,
  startChat: vi.fn(),
  ensureChatSubscription: vi.fn(),
};
vi.mock("stores/messenger", () => ({
  useMessengerStore: () => messengerStore,
}));

describe("FindCreators.vue", () => {
  beforeEach(() => {
    getCreatorsMock.mockReset();
    getCreatorsMock.mockResolvedValue({
      count: 0,
      warnings: [],
      results: [],
      cached: false,
      tookMs: 0,
    });
    findProfilesMock.mockReset();
    findProfilesMock.mockResolvedValue({ query: "", results: [], count: 0 });
    creatorsStore = reactive({
      searchResults: [],
      featuredCreators: [],
      searching: false,
      loadingFeatured: false,
      error: "",
      searchWarnings: [],
      featuredError: "",
      tiersMap: reactive({}),
      tierFetchError: false,
      ensureCreatorCacheFromDexie: vi.fn().mockResolvedValue(undefined),
      saveProfileCache: vi.fn().mockResolvedValue(undefined),
      loadFeaturedCreators: vi.fn().mockResolvedValue(undefined),
      searchCreators: vi.fn().mockResolvedValue(undefined),
      buildCreatorProfileFromCache: vi.fn().mockReturnValue(null),
    });
  });

  function mountComponent() {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    return mount(FindCreators, {
      global: {
        plugins: [router, pinia],
      },
    });
  }

  it("mounts correctly", async () => {
    const wrapper = mountComponent();
    await flushPromises();
    expect(wrapper.exists()).toBe(true);
  });

  it("does not trigger a search until the user enters a query", async () => {
    mountComponent();
    await flushPromises();

    expect(creatorsStore.searchCreators).not.toHaveBeenCalled();
  });

  it("shows search skeletons while results are loading", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    creatorsStore.searching = true;
    await nextTick();

    const skeletonRegion = wrapper.find('[aria-label="Searching creators"]');
    expect(skeletonRegion.exists()).toBe(true);
    expect(wrapper.findAll(".result-skeleton").length).toBeGreaterThan(0);
  });

  it("shows featured skeletons while curated creators load", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    creatorsStore.loadingFeatured = true;
    await nextTick();

    expect(wrapper.findAll(".featured-skeleton").length).toBeGreaterThan(0);
  });

  it("shows search error banner text when a search fails", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    creatorsStore.error = "Search failed";
    creatorsStore.searching = false;
    await nextTick();

    const bannerText = wrapper
      .findAll(".status-banner__text")
      .find((node) => node.text() === "Search failed");

    expect(bannerText).toBeTruthy();
  });

  it("shows featured status banner text when available", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    creatorsStore.featuredError = "Could not load featured";
    creatorsStore.loadingFeatured = false;
    await nextTick();

    const bannerText = wrapper
      .findAll(".status-banner__text")
      .find((node) => node.text() === "Could not load featured");

    expect(bannerText).toBeTruthy();
  });

  it("passes enriched selected profile into the modal without waiting for discovery", async () => {
    const wrapper = mountComponent();
    await flushPromises();

    const baseProfile = {
      pubkey: "f".repeat(64),
      displayName: "",
      name: "",
      about: "",
      picture: "",
      banner: null,
      nip05: null,
      followers: null,
      following: null,
      joined: null,
      profile: null,
      tierSummary: null,
      metrics: null,
      tiers: [],
    } as any;

    const discoveryProfile = {
      ...baseProfile,
      displayName: "Discovery Display",
      about: "Discovery about",
    };

    creatorsStore.buildCreatorProfileFromCache = vi.fn().mockReturnValue(discoveryProfile);
    findProfilesMock.mockResolvedValue({
      query: baseProfile.pubkey,
      count: 1,
      results: [
        {
          pubkey: baseProfile.pubkey,
          display_name: "Phonebook Name",
          name: "",
          about: "Phonebook about",
          picture: "https://example.com/img.png",
          nip05: null,
        },
      ],
    });

    (wrapper.vm as any).viewProfile(baseProfile);

    await nextTick();

    const modal = wrapper.findComponent({ name: "CreatorProfileModal" });
    expect(modal.props("show")).toBe(true);
    expect((modal.props("initialProfile") as any).pubkey).toBe(baseProfile.pubkey);

    await flushPromises();

    const enrichedProfile = modal.props("initialProfile") as any;
    expect(enrichedProfile.displayName).toBe("Discovery Display");
    expect(enrichedProfile.about).toBe("Discovery about");
    expect(enrichedProfile.picture).toBe("https://example.com/img.png");
    expect(enrichedProfile.name).toBe("Phonebook Name");
  });
});
