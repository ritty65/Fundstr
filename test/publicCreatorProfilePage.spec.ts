import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { reactive, nextTick } from "vue";
import { nip19 } from "nostr-tools";

const copy = vi.fn();
const buildProfileUrl = vi.fn(() => "https://profile/url");

vi.mock("src/utils/profileUrl", () => ({
  buildProfileUrl: (...args: any[]) => buildProfileUrl(...args),
}));
vi.mock("src/utils/sanitize-url", () => ({
  isTrustedUrl: () => true,
}));
vi.mock("src/composables/useClipboard", () => ({
  useClipboard: () => ({ copy }),
}));

let creatorsStore: any;
let fetchTierDefinitions: ReturnType<typeof vi.fn>;
let fetchFundstrProfileBundleMock: ReturnType<typeof vi.fn>;
const priceStore = reactive({ bitcoinPrice: 0 });
const uiStore = { formatCurrency: vi.fn(() => "$0.00") };

vi.mock("stores/creators", () => ({
  useCreatorsStore: () => creatorsStore,
  fetchFundstrProfileBundle: (...args: any[]) => fetchFundstrProfileBundleMock(...args),
}));
vi.mock("stores/price", () => ({
  usePriceStore: () => priceStore,
}));
vi.mock("stores/ui", () => ({
  useUiStore: () => uiStore,
}));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import PublicCreatorProfilePage from "src/pages/PublicCreatorProfilePage.vue";

describe("PublicCreatorProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchTierDefinitions = vi.fn().mockImplementation(async (pubkey: string) => {
      creatorsStore.tiersMap[pubkey] = [
        {
          id: "tier-1",
          name: "Tier 1",
          description: "Tier description",
          benefits: ["Benefit"],
          price_sats: 1000,
          intervalDays: 30,
        },
      ];
    });
    fetchFundstrProfileBundleMock = vi.fn().mockResolvedValue({
      profile: { display_name: "Creator", nip05: "creator@example.com", website: "https://fundstr.me" },
      followers: 5,
      following: 3,
    });
    creatorsStore = reactive({
      tiersMap: reactive({}),
      tierFetchError: false,
      fetchTierDefinitions,
    });
    priceStore.bitcoinPrice = 0;
    uiStore.formatCurrency.mockReturnValue("$0.00");
    copy.mockClear();
    buildProfileUrl.mockReturnValue("https://profile/url");
  });

  function mountPage(router: ReturnType<typeof createRouter>) {
    const pinia = createPinia();
    setActivePinia(pinia);
    return mount(PublicCreatorProfilePage, {
      global: {
        plugins: [router, pinia],
        mocks: {
          $t: (key: string, vars?: Record<string, unknown>) => {
            if (key === "CreatorHub.profile.followers" && vars) {
              return `${vars.count} followers`;
            }
            if (key === "CreatorHub.profile.following" && vars) {
              return `${vars.count} following`;
            }
            return key;
          },
        },
      },
    });
  }

  it("fetches tiers using the creator hex when provided", async () => {
    const sampleHex = "d".repeat(64);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/creator/:npubOrHex", name: "PublicCreatorProfile", component: PublicCreatorProfilePage },
      ],
    });
    router.push({ name: "PublicCreatorProfile", params: { npubOrHex: sampleHex } });
    await router.isReady();

    mountPage(router);
    await flushPromises();

    expect(fetchTierDefinitions).toHaveBeenCalledWith(sampleHex, { fundstrOnly: true });
  });

  it("renders profile information and copy control", async () => {
    const sampleHex = "a".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/creator/:npubOrHex", name: "PublicCreatorProfile", component: PublicCreatorProfilePage },
      ],
    });
    router.push({ name: "PublicCreatorProfile", params: { npubOrHex: sampleNpub } });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();

    expect(wrapper.text()).toContain("Creator");
    expect(wrapper.text()).toContain("creator@example.com");
    expect(wrapper.text()).toContain("5 followers");
    expect(wrapper.text()).toContain("3 following");

    const copyButton = wrapper.find('[data-testid="copy-profile-link"]');
    expect(copyButton.exists()).toBe(true);
    await copyButton.trigger("click");
    expect(copy).toHaveBeenCalledWith("https://profile/url");
  });

  it("displays tier details including fiat price when available", async () => {
    priceStore.bitcoinPrice = 3000000000; // $30,000 per BTC
    uiStore.formatCurrency.mockImplementation(() => "$0.30");

    const sampleHex = "b".repeat(64);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/creator/:npubOrHex", name: "PublicCreatorProfile", component: PublicCreatorProfilePage },
      ],
    });
    router.push({ name: "PublicCreatorProfile", params: { npubOrHex: sampleHex } });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();

    const tierCard = wrapper.find(".profile-tier-card");
    expect(tierCard.exists()).toBe(true);
    expect(tierCard.text()).toContain("Tier 1");
    expect(tierCard.text()).toContain("Tier description");
    expect(tierCard.text()).toContain("Benefit");
    expect(tierCard.text()).toContain("Every month");
    expect(uiStore.formatCurrency).toHaveBeenCalledWith(30000, "USD", true);
    expect(tierCard.find(".profile-tier-card__fiat").text()).not.toEqual("");
  });

  it("shows retry controls when tier fetch errors occur", async () => {
    const sampleHex = "c".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/creator/:npubOrHex", name: "PublicCreatorProfile", component: PublicCreatorProfilePage },
      ],
    });
    router.push({ name: "PublicCreatorProfile", params: { npubOrHex: sampleNpub } });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();

    creatorsStore.tierFetchError = true;
    await nextTick();

    const retryButton = wrapper.find('[data-testid="retry-tier-refresh"]');
    expect(retryButton.exists()).toBe(true);
    await retryButton.trigger("click");
    expect(fetchTierDefinitions).toHaveBeenCalledTimes(2);
  });

  it("shows a decode error and skips tier fetch when pubkey is invalid", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/creator/:npubOrHex", name: "PublicCreatorProfile", component: PublicCreatorProfilePage },
      ],
    });
    router.push({ name: "PublicCreatorProfile", params: { npubOrHex: "invalid" } });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();

    expect(wrapper.text()).toContain("We couldn't load this creator profile");
    expect(fetchTierDefinitions).not.toHaveBeenCalled();
  });
});
