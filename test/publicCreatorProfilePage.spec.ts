import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { reactive, defineComponent, nextTick } from "vue";
import { nip19 } from "nostr-tools";

const copy = vi.fn();
const buildProfileUrl = vi.fn(() => "https://profile/url");

vi.mock("components/SubscribeDialog.vue", () => ({
  default: defineComponent({
    name: "SubscribeDialog",
    props: {
      modelValue: { type: Boolean, default: false },
      tier: { type: Object, default: null },
    },
    emits: ["update:modelValue", "confirm"],
    template: `<div v-if="modelValue" class="subscribe-dialog"><slot /></div>`,
  }),
}));
vi.mock("components/DonateDialog.vue", () => ({
  default: defineComponent({
    name: "DonateDialog",
    props: { modelValue: { type: Boolean, default: false } },
    emits: ["update:modelValue", "confirm"],
    template: `<div v-if="modelValue" class="donate-dialog"><slot /></div>`,
  }),
}));
vi.mock("components/SendTokenDialog.vue", () => ({
  default: defineComponent({
    name: "SendTokenDialog",
    template: `<div class="send-token-dialog" />`,
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
  default: defineComponent({
    name: "SubscriptionReceipt",
    template: `<div class="receipt" />`,
  }),
}));
vi.mock("components/PaywalledContent.vue", () => ({
  default: defineComponent({
    name: "PaywalledContent",
    template: `<div class="paywalled"><slot /></div>`,
  }),
}));
vi.mock("components/MediaPreview.vue", () => ({
  default: defineComponent({
    name: "MediaPreview",
    template: `<div class="media" />`,
  }),
}));

vi.mock("src/utils/profileUrl", () => ({
  buildProfileUrl: (...args: any[]) => buildProfileUrl.apply(null, args),
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
const mintsStore = reactive({
  activeMintUrl: "https://mint.example",
  activeInfo: {
    nuts: {
      4: { methods: [], disabled: false },
      10: { supported: true },
      11: { supported: true },
      14: { supported: true },
    },
  },
});

vi.mock("stores/creators", () => ({
  useCreatorsStore: () => creatorsStore,
  fetchFundstrProfileBundle: (...args: any[]) =>
    fetchFundstrProfileBundleMock(...args),
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
  fetchNutzapProfile: vi.fn().mockResolvedValue(null),
}));
vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStore,
}));
const translations = vi.hoisted(
  () =>
    ({
      "CreatorHub.profile.retry": "Retry",
      "CreatorHub.profile.tierLoadError":
        "Failed to load tiers – check relay connectivity.",
      "CreatorHub.profile.tierRefreshError":
        "Failed to refresh tiers – check relay connectivity.",
      "CreatorHub.profile.fallbackFailed":
        "Could not load creator. Please try again later.",
      "CreatorHub.profile.fallbackActive":
        "Fundstr relay is slow, loading data from public relays…",
      "CreatorHub.profile.fallbackRelaysLabel": "Attempting relays:",
      "CreatorHub.profile.followers": "{count} followers",
      "CreatorHub.profile.following": "{count} following",
    } as Record<string, string>),
);

function translate(key: string, params?: Record<string, unknown>): string {
  const template = translations[key];
  if (!template) {
    return key;
  }
  if (!params) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`,
  );
}

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      translate(key, params),
  }),
  createI18n: () => ({
    global: {
      t: (key: string, params?: Record<string, unknown>) =>
        translate(key, params),
    },
  }),
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
  template: `<div class="q-spinner-hourglass"></div>`,
});

describe("PublicCreatorProfilePage", () => {
  beforeEach(() => {
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
    });
    creatorsStore = reactive({
      tiersMap: reactive({}),
      tierFetchError: false,
      fetchCreator: fetchCreatorMock,
    });
    priceStore.bitcoinPrice = 0;
    welcomeStore.welcomeCompleted = true;
    nostrStore.hasIdentity = true;
    mintsStore.activeMintUrl = "https://mint.example";
    mintsStore.activeInfo = {
      nuts: {
        4: { methods: [], disabled: false },
        10: { supported: true },
        11: { supported: true },
        14: { supported: true },
      },
    };
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
          QIcon: SimpleStub("QIcon"),
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
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
      query: { tierId: "tier-1" },
    });
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

  it("normalizes hex route params and uses them for lookups", async () => {
    const sampleHex = "d".repeat(64);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleHex },
    });
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
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();
    await nextTick();

    const copyButton = wrapper.find('[data-icon="content_copy"]');
    expect(copyButton.exists()).toBe(true);
    await copyButton.trigger("click");

    expect(copy).toHaveBeenCalledWith("https://profile/url");
  });

  it("shows an hourglass spinner while tiers are loading", async () => {
    const sampleHex = "e".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();

    wrapper.vm.loadingTiers = true;
    wrapper.vm.refreshingTiers = true;
    await nextTick();

    expect(wrapper.find(".q-spinner-hourglass").exists()).toBe(true);
  });

  it("shows tier error banner text when tier loading fails", async () => {
    const sampleHex = "f".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });
    await router.isReady();

    fetchCreatorMock.mockReset();
    fetchCreatorMock.mockRejectedValueOnce(new Error("failed"));

    const wrapper = mountPage(router);
    await flushPromises();
    await nextTick();

    const tierBanner = wrapper
      .findAll(".q-banner")
      .find((banner) => banner.text().includes("Failed to load tiers"));

    expect(tierBanner).toBeTruthy();
  });

  it("shows tier refresh error text when refresh fails with existing tiers", async () => {
    const sampleHex = "g".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    creatorsStore.tiersMap[sampleHex] = [
      {
        id: "existing-tier",
        name: "Existing Tier",
        description: "Description",
        benefits: [],
        media: [],
      },
    ];

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });
    await router.isReady();

    fetchCreatorMock.mockReset();
    fetchCreatorMock.mockRejectedValueOnce(new Error("failed"));

    const wrapper = mountPage(router);
    await flushPromises();
    await nextTick();

    const refreshBanner = wrapper
      .findAll(".q-banner")
      .find((banner) => banner.text().includes("Failed to refresh tiers"));

    expect(refreshBanner).toBeTruthy();
  });

  it("shows a friendly banner when the Fundstr profile bundle fails", async () => {
    const sampleHex = "h".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });
    await router.isReady();

    fetchFundstrProfileBundleMock.mockRejectedValueOnce(
      new Error("bundle failed"),
    );

    const wrapper = mountPage(router);
    await flushPromises();
    await nextTick();

    const fallbackBanner = wrapper
      .findAll(".q-banner")
      .find((banner) => banner.text().includes("Could not load creator"));

    expect(fallbackBanner).toBeTruthy();
  });

  it("rejects mismatched creator bundles instead of rendering another creator's profile", async () => {
    const sampleHex = "1".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });
    await router.isReady();

    fetchFundstrProfileBundleMock.mockResolvedValueOnce({
      ownerPubkey: "2".repeat(64),
      profile: { display_name: "Wrong Creator", about: "Wrong about" },
      profileEvent: null,
      followers: 5,
      following: 3,
      profileDetails: null,
      relayHints: [],
      fetchedFromFallback: false,
      tierDataFresh: true,
      tierSecurityBlocked: false,
      tierFetchFailed: false,
      tiers: [],
    });

    const wrapper = mountPage(router);
    await flushPromises();
    await nextTick();

    expect(wrapper.text()).not.toContain("Wrong Creator");
    expect(
      wrapper
        .findAll(".q-banner")
        .some((banner) => banner.text().includes("Could not load creator")),
    ).toBe(true);
  });

  it("shows tier error banner and retries fetch when retry button is clicked", async () => {
    const sampleHex = "c".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });
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
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: "invalid" },
    });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();

    const banners = wrapper.findAll(".q-banner");
    expect(
      banners.some((b) =>
        b.text().includes("We couldn't load this creator profile"),
      ),
    ).toBe(true);
    expect(fetchCreatorMock).not.toHaveBeenCalled();
  });

  it("shows support readiness when the active mint is creator-trusted and split-capable", async () => {
    const sampleHex = "i".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    fetchFundstrProfileBundleMock.mockResolvedValueOnce({
      profile: { display_name: "Creator" },
      profileEvent: null,
      followers: 5,
      following: 3,
      profileDetails: {
        trustedMints: ["https://mint.example"],
        relays: [],
        p2pkPubkey: "p2pk",
      },
      relayHints: [],
      fetchedFromFallback: false,
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toContain("Current mint is ready for support");
    expect(wrapper.html()).toContain(
      "creator-trusted and split-capable for flexible gifts and recurring tiers",
    );
  });

  it("warns when the active mint is not on the creator trusted list", async () => {
    const sampleHex = "j".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    fetchFundstrProfileBundleMock.mockResolvedValueOnce({
      profile: { display_name: "Creator" },
      profileEvent: null,
      followers: 5,
      following: 3,
      profileDetails: {
        trustedMints: ["https://creator-only.example"],
        relays: [],
        p2pkPubkey: "p2pk",
      },
      relayHints: [],
      fetchedFromFallback: false,
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    router.push({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toContain("Switch to a creator-trusted mint");
    expect(wrapper.html()).toContain(
      "Switch to a creator-trusted mint before subscribing.",
    );
  });
});
