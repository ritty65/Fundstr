import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { reactive, defineComponent, nextTick } from "vue";
import { nip19 } from "nostr-tools";
import * as relayClient from "@/nostr/relayClient";
import * as notifyModule from "src/js/notify";

const copy = vi.fn();
const buildProfileUrl = vi.fn(() => "https://profile/url");
let queryNostrSpy: ReturnType<typeof vi.spyOn>;
let queryNutzapTiersSpy: ReturnType<typeof vi.spyOn>;
let notifySuccessSpy: ReturnType<typeof vi.spyOn>;

vi.mock("components/SubscribeDialog.vue", () => ({
  default: defineComponent({
    name: "SubscribeDialog",
    props: { modelValue: { type: Boolean, default: false }, tier: { type: Object, default: null } },
    emits: ["update:modelValue", "confirm"],
    template: `<div v-if="modelValue" class="subscribe-dialog"><slot /></div>`,
  }),
}));
vi.mock("components/SetupRequiredDialog.vue", () => ({
  default: defineComponent({
    name: "SetupRequiredDialog",
    props: { modelValue: { type: Boolean, default: false } },
    emits: ["update:modelValue"],
    template: `<div v-if="modelValue" class="setup-dialog"><slot /></div>`,
  }),
}));
vi.mock("components/SubscriptionReceipt.vue", () => ({
  default: defineComponent({ name: "SubscriptionReceipt", template: `<div class="receipt" />` }),
}));
vi.mock("components/PaywalledContent.vue", () => ({
  default: defineComponent({ name: "PaywalledContent", template: `<div class="paywalled"><slot /></div>` }),
}));
vi.mock("components/MediaPreview.vue", () => ({
  default: defineComponent({ name: "MediaPreview", template: `<div class="media" />` }),
}));

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
let fetchCreatorMock: ReturnType<typeof vi.fn>;
let fetchFundstrProfileBundleMock: ReturnType<typeof vi.fn>;
const priceStore = reactive({ bitcoinPrice: 0 });
const uiStore = { formatCurrency: vi.fn(() => "$0.00") };
const welcomeStore = reactive({ welcomeCompleted: true });
const nostrStore = {
  hasIdentity: true,
  initNdkReadOnly: vi.fn().mockResolvedValue(undefined),
  getProfile: vi.fn().mockResolvedValue({ display_name: "Creator" }),
  fetchFollowerCount: vi.fn().mockResolvedValue(5),
  fetchFollowingCount: vi.fn().mockResolvedValue(3),
};

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
vi.mock("stores/welcome", () => ({
  useWelcomeStore: () => welcomeStore,
}));
vi.mock("stores/nostr", () => ({
  useNostrStore: () => nostrStore,
}));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

import PublicCreatorProfilePage from "src/pages/PublicCreatorProfilePage.vue";

const SubscribeDialogGlobalStub = defineComponent({
  name: "SubscribeDialog",
  props: { modelValue: { type: Boolean, default: false } },
  emits: ["update:modelValue"],
  template: `<div v-if="modelValue" class="subscribe-dialog"><slot /></div>`,
});

const QBtnStub = defineComponent({
  name: "QBtn",
  props: {
    label: { type: String, default: "" },
    icon: { type: String, default: "" },
    disable: { type: Boolean, default: false },
    to: { type: [String, Object], default: null },
  },
  emits: ["click"],
  template: `<button class="q-btn" :data-icon="icon" :disabled="disable" @click="$emit('click')"><slot />{{ label }}</button>`,
});

const SimpleStub = (name: string, extraClass = "") =>
  defineComponent({
    name,
    props: { modelValue: { type: Boolean, default: false } },
    emits: ["update:modelValue"],
    template: `<div :class="['${extraClass}']"><slot /><slot name=\"header\"></slot><slot name=\"action\"></slot></div>`,
  });

const QDialogStub = defineComponent({
  name: "QDialog",
  props: { modelValue: { type: Boolean, default: false } },
  emits: ["update:modelValue"],
  template: `<div v-if="modelValue" class="q-dialog"><slot /></div>`,
});

const QExpansionItemStub = defineComponent({
  name: "QExpansionItem",
  template: `<div class="q-expansion-item"><slot name=\"header\"></slot><slot /></div>`,
});

const QBannerStub = defineComponent({
  name: "QBanner",
  template: `<div class="q-banner"><slot /><slot name=\"action\"></slot></div>`,
});

const QTooltipStub = defineComponent({
  name: "QTooltip",
  template: `<span class="q-tooltip"><slot /></span>`,
});

const QSpinnerStub = defineComponent({
  name: "QSpinnerHourglass",
  template: `<div class="q-spinner"></div>`,
});

describe("PublicCreatorProfilePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    fetchCreatorMock = vi.fn().mockImplementation(async (pubkey: string) => {
      creatorsStore.tiersMap[pubkey] = [
        {
          id: "tier-1",
          name: "Tier 1",
          description: "Tier description",
          benefits: ["Benefit"],
          media: [],
        },
      ];
    });
    fetchFundstrProfileBundleMock = vi.fn().mockResolvedValue({
      profile: { display_name: "Creator" },
      profileEvent: null,
      followers: 5,
      following: 3,
      profileDetails: null,
      relayHints: [],
      fetchedFromFallback: false,
      fallbackTimestamps: null,
      tiers: null,
    });
    creatorsStore = reactive({
      tiersMap: reactive({}),
      tierFetchError: false,
      fetchCreator: fetchCreatorMock,
      saveTierCache: vi.fn(async (pubkey: string, tiers: any[]) => {
        creatorsStore.tiersMap[pubkey] = Array.isArray(tiers)
          ? tiers.map((tier: any) => ({ ...tier }))
          : [];
      }),
      updateTierCacheState: vi.fn((pubkey: string, tiers: any[] | null) => {
        creatorsStore.tiersMap[pubkey] = Array.isArray(tiers)
          ? tiers.map((tier: any) => ({ ...tier }))
          : [];
      }),
    });
    priceStore.bitcoinPrice = 0;
    welcomeStore.welcomeCompleted = true;
    nostrStore.hasIdentity = true;
    copy.mockClear();
    buildProfileUrl.mockReturnValue("https://profile/url");
    queryNostrSpy = vi.spyOn(relayClient, "queryNostr").mockResolvedValue([]);
    queryNutzapTiersSpy = vi
      .spyOn(relayClient, "queryNutzapTiers")
      .mockResolvedValue(null as any);
    notifySuccessSpy = vi.spyOn(notifyModule, "notifySuccess").mockImplementation(() => {});
  });

  function mountPage(router: ReturnType<typeof createRouter>) {
    const pinia = createPinia();
    setActivePinia(pinia);
    return mount(PublicCreatorProfilePage, {
      global: {
        plugins: [router, pinia],
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          SubscribeDialog: SubscribeDialogGlobalStub,
          QBtn: QBtnStub,
          QBanner: QBannerStub,
          QDialog: QDialogStub,
          QCard: SimpleStub("QCard"),
          QCardSection: SimpleStub("QCardSection"),
          QCardActions: SimpleStub("QCardActions"),
          QExpansionItem: QExpansionItemStub,
          QTooltip: QTooltipStub,
          QSpinnerHourglass: QSpinnerStub,
        },
      },
    });
  }

  it("opens the requested tier when tierId query param is provided", async () => {
    const sampleHex = "a".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/creator/:npubOrHex", name: "PublicCreatorProfile", component: PublicCreatorProfilePage },
      ],
    });
    router.push({ name: "PublicCreatorProfile", params: { npubOrHex: sampleNpub }, query: { tierId: "tier-1" } });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();
    await nextTick();

    expect(fetchCreatorMock).toHaveBeenCalled();
    expect(fetchCreatorMock.mock.calls[0][0]).toBe(sampleHex);
    expect(fetchCreatorMock.mock.calls[0][1]).toBe(true);
    expect(wrapper.vm.selectedTier?.id).toBe("tier-1");
    expect(wrapper.vm.showSubscribeDialog).toBe(true);
    expect(router.currentRoute.value.query.tierId).toBeUndefined();
  });

  it("recovers tiers after fallback relay refresh", async () => {
    const sampleHex = "b".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/creator/:npubOrHex", name: "PublicCreatorProfile", component: PublicCreatorProfilePage },
      ],
    });
    router.push({ name: "PublicCreatorProfile", params: { npubOrHex: sampleNpub } });
    await router.isReady();

    const fallbackTiers = [
      { id: "cached-tier", name: "Cached", description: "", price_sats: 500, benefits: [], media: [] },
    ];
    fetchFundstrProfileBundleMock.mockResolvedValueOnce({
      profile: { display_name: "Creator" },
      profileEvent: null,
      followers: 5,
      following: 3,
      profileDetails: { relays: ["wss://cached"] },
      relayHints: ["wss://cached"],
      fetchedFromFallback: true,
      fallbackTimestamps: { profile: 50, tiers: 80 },
      tiers: fallbackTiers,
    });

    queryNostrSpy.mockResolvedValue([
      {
        id: "meta1",
        kind: 0,
        pubkey: sampleHex,
        created_at: 200,
        tags: [],
        content: JSON.stringify({ name: "Relay Creator" }),
      },
    ]);
    queryNutzapTiersSpy.mockResolvedValue({
      id: "tierEvt",
      kind: 30019,
      pubkey: sampleHex,
      created_at: 200,
      tags: [["d", "tiers"]],
      content: JSON.stringify([
        { id: "relay-tier", title: "Relay Tier", price: 2100, description: "Fresh" },
      ]),
    });

    const wrapper = mountPage(router);
    await flushPromises();
    await nextTick();
    await flushPromises();

    const tierList = creatorsStore.tiersMap[sampleHex];
    expect(Array.isArray(tierList)).toBe(true);
    expect(tierList[0].id).toBe("relay-tier");
    expect(wrapper.vm.fallbackActive).toBe(false);
    expect(wrapper.vm.fallbackRecoveryMessage).toContain("Live data restored from relays.");
    expect(notifySuccessSpy).toHaveBeenCalledWith("Live data restored from relays.");
  });

  it("normalizes hex route params and uses them for lookups", async () => {
    const sampleHex = "d".repeat(64);
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

    expect(fetchCreatorMock).toHaveBeenCalledWith(sampleHex, true);
    expect(wrapper.vm.creatorHex).toBe(sampleHex);
    expect(wrapper.vm.creatorNpub).toBe(nip19.npubEncode(sampleHex));
  });

  it("copies the profile URL when the copy button is clicked", async () => {
    const sampleHex = "b".repeat(64);
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
    await nextTick();

    const copyButton = wrapper.find('[data-icon="content_copy"]');
    expect(copyButton.exists()).toBe(true);
    await copyButton.trigger("click");

    expect(copy).toHaveBeenCalledWith("https://profile/url");
  });

  it("shows tier error banner and retries fetch when retry button is clicked", async () => {
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
    await nextTick();

    creatorsStore.tierFetchError = true;
    await nextTick();

    const banner = wrapper.find(".q-banner");
    expect(banner.exists()).toBe(true);

    await wrapper
      .findAll("button")
      .find((btn) => btn.text() === "Retry")
      ?.trigger("click");

    expect(fetchCreatorMock).toHaveBeenCalledTimes(2);
  });

  it("shows a friendly error when the pubkey cannot be decoded", async () => {
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

    const banners = wrapper.findAll(".q-banner");
    expect(banners.some((b) => b.text().includes("We couldn't load this creator profile"))).toBe(true);
    expect(fetchCreatorMock).not.toHaveBeenCalled();
  });
});
