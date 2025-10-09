import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import FindCreators from "src/pages/FindCreators.vue";

vi.mock("components/CreatorProfileModal.vue", () => ({
  default: { name: "CreatorProfileModal", template: "<div />" },
}));
vi.mock("components/DonateDialog.vue", () => ({
  default: { name: "DonateDialog", template: "<div />" },
}));
vi.mock("components/SendTokenDialog.vue", () => ({
  default: { name: "SendTokenDialog", template: "<div />" },
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
    creatorsStore = reactive({
      searchResults: [],
      featuredCreators: [],
      searching: false,
      loadingFeatured: false,
      error: "",
      tiersMap: reactive({}),
      tierFetchError: false,
      fetchTierDefinitions: vi.fn().mockResolvedValue(undefined),
      ensureCreatorCacheFromDexie: vi.fn().mockResolvedValue(undefined),
      saveProfileCache: vi.fn().mockResolvedValue(undefined),
      loadFeaturedCreators: vi.fn().mockResolvedValue(undefined),
      searchCreators: vi.fn().mockResolvedValue(undefined),
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
});