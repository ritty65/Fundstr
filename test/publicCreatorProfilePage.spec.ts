import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { reactive, defineComponent, nextTick, computed } from "vue";
import { nip19 } from "nostr-tools";

const copy = vi.fn();
const buildProfileUrl = vi.fn(() => "https://profile/url");

const ndkMocks = vi.hoisted(() => {
  const subscribeMock = vi.fn();
  const useNdkMock = vi.fn();
  const subscriptions: any[] = [];
  return { subscribeMock, useNdkMock, subscriptions };
});
const { subscribeMock, useNdkMock, subscriptions: ndkSubscriptions } = ndkMocks;

const nostrMocks = vi.hoisted(() => ({
  fetchNutzapProfileMock: vi.fn(),
  urlsToRelaySetMock: vi.fn(),
}));
const { fetchNutzapProfileMock, urlsToRelaySetMock } = nostrMocks;

const routeState = reactive({
  name: "PublicCreatorProfile",
  params: {} as Record<string, any>,
  query: {} as Record<string, any>,
  fullPath: "/",
});
const routerCurrentRoute = computed(() => routeState);
let routerPushMock: ReturnType<typeof vi.fn>;
let routerReplaceMock: ReturnType<typeof vi.fn>;

function applyRouteLocation(location: Parameters<typeof routerPushMock>[0]) {
  const target =
    typeof location === "string"
      ? { path: location }
      : (location ?? {}) as Record<string, any>;
  if (typeof target.name === "string") {
    routeState.name = target.name;
  }
  const params = (target.params ?? {}) as Record<string, any>;
  for (const key of Object.keys(routeState.params)) {
    delete routeState.params[key];
  }
  Object.assign(routeState.params, params);
  const query = (target.query ?? {}) as Record<string, any>;
  for (const key of Object.keys(routeState.query)) {
    delete routeState.query[key];
  }
  Object.assign(routeState.query, query);
  if (typeof target.path === "string") {
    routeState.fullPath = target.path;
  } else if (typeof target.fullPath === "string") {
    routeState.fullPath = target.fullPath;
  } else if (routeState.name) {
    const id =
      typeof params.npubOrHex === "string"
        ? params.npubOrHex
        : typeof params.npub === "string"
          ? params.npub
          : "";
    routeState.fullPath = id ? `/creator/${id}` : "/";
  }
}

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

vi.mock("src/composables/useNdk", () => ({
  useNdk: (...args: any[]) => useNdkMock(...args),
}));
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
  fetchNutzapProfile: (...args: any[]) => fetchNutzapProfileMock(...args),
  urlsToRelaySet: (...args: any[]) => urlsToRelaySetMock(...args),
}));
vi.mock("vue-router", async () => {
  const actual = await vi.importActual<typeof import("vue-router")>("vue-router");
  return {
    ...actual,
    useRoute: () => routeState,
    useRouter: () => ({
      push: routerPushMock,
      replace: routerReplaceMock,
      currentRoute: routerCurrentRoute,
    }),
  };
});
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
    vi.clearAllMocks();
    fetchNutzapProfileMock.mockReset();
    fetchNutzapProfileMock.mockResolvedValue(null);
    urlsToRelaySetMock.mockReset();
    urlsToRelaySetMock.mockResolvedValue(undefined);
    subscribeMock.mockReset();
    useNdkMock.mockReset();
    ndkSubscriptions.length = 0;
    subscribeMock.mockImplementation(() => {
      const handlers: Record<string, Function[]> = {};
      const subscription = {
        on: vi.fn((event: string, handler: Function) => {
          (handlers[event] ||= []).push(handler);
        }),
        start: vi.fn(),
        stop: vi.fn(),
        emit(payload: any) {
          (handlers.event || []).forEach((handler) => handler(payload));
        },
      };
      ndkSubscriptions.push(subscription);
      return subscription;
    });
    routerPushMock = vi.fn(async (location) => {
      applyRouteLocation(location);
    });
    routerReplaceMock = vi.fn(async (location) => {
      applyRouteLocation(location);
    });
    applyRouteLocation({ name: "PublicCreatorProfile", params: {}, query: {}, path: "/" });
    useNdkMock.mockImplementation(async () => ({ subscribe: subscribeMock }));
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
    copy.mockClear();
    buildProfileUrl.mockReturnValue("https://profile/url");
  });

  function mountPage(initialLocation?: Parameters<typeof routerPushMock>[0]) {
    const pinia = createPinia();
    setActivePinia(pinia);
    if (initialLocation) {
      applyRouteLocation(initialLocation);
    }
    return mount(PublicCreatorProfilePage, {
      global: {
        plugins: [pinia],
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

  async function mountPageAt(location: Parameters<typeof routerPushMock>[0]) {
    const wrapper = mountPage(location);
    await flushPromises();
    await nextTick();
    return wrapper;
  }

  it("opens the requested tier when tierId query param is provided", async () => {
    const sampleHex = "a".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const wrapper = await mountPageAt({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
      query: { tierId: "tier-1" },
    });

    expect(fetchCreatorMock).toHaveBeenCalled();
    expect(fetchCreatorMock.mock.calls[0][0]).toBe(sampleHex);
    expect(fetchCreatorMock.mock.calls[0][1]).toBe(true);
    expect(wrapper.vm.selectedTier?.id).toBe("tier-1");
    expect(wrapper.vm.showSubscribeDialog).toBe(true);
    expect(routerCurrentRoute.value.query.tierId).toBeUndefined();
  });

  it("normalizes hex route params and uses them for lookups", async () => {
    const sampleHex = "d".repeat(64);
    const wrapper = await mountPageAt({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleHex },
    });

    expect(fetchCreatorMock).toHaveBeenCalledWith(sampleHex, true);
    expect(wrapper.vm.creatorHex).toBe(sampleHex);
    expect(wrapper.vm.creatorNpub).toBe(nip19.npubEncode(sampleHex));
  });

  it("copies the profile URL when the copy button is clicked", async () => {
    const sampleHex = "b".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const wrapper = await mountPageAt({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });

    const copyButton = wrapper.find('[data-icon="content_copy"]');
    expect(copyButton.exists()).toBe(true);
    await copyButton.trigger("click");

    expect(copy).toHaveBeenCalledWith("https://profile/url");
  });

  it("shows tier error banner and retries fetch when retry button is clicked", async () => {
    const sampleHex = "c".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const wrapper = await mountPageAt({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });

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
    const wrapper = await mountPageAt({
      name: "PublicCreatorProfile",
      params: { npubOrHex: "invalid" },
    });

    await flushPromises();
    await nextTick();

    const banners = wrapper.findAll(".q-banner");
    expect(banners.some((b) => b.text().includes("We couldn't load this creator profile"))).toBe(true);
    expect(fetchCreatorMock).not.toHaveBeenCalled();
  });

  it("updates tiers immediately when a realtime tier event arrives", async () => {
    const sampleHex = "e".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    await mountPageAt({
      name: "PublicCreatorProfile",
      params: { npubOrHex: sampleNpub },
    });

    expect(subscribeMock).toHaveBeenCalled();
    const sub = ndkSubscriptions[ndkSubscriptions.length - 1] as any;
    expect(sub).toBeTruthy();

    const tierEventRaw = {
      id: "evt-live",
      kind: 30019,
      pubkey: sampleHex,
      created_at: Math.floor(Date.now() / 1000) + 5,
      tags: [["d", "tiers"]],
      content: JSON.stringify({
        v: 1,
        tiers: [
          {
            id: "tier-live",
            title: "Live Tier",
            price: 2500,
            description: "Live tier description",
            benefits: ["Live benefit"],
          },
        ],
      }),
    };

    sub.emit({
      ...tierEventRaw,
      rawEvent: () => tierEventRaw,
    });

    await flushPromises();
    await nextTick();

    const tierList = creatorsStore.tiersMap[sampleHex];
    expect(Array.isArray(tierList)).toBe(true);
    expect(tierList.some((tier: any) => tier.id === "tier-live")).toBe(true);
    expect(fetchCreatorMock).toHaveBeenCalledTimes(1);
  });

});
