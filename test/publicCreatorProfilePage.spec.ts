import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { defineComponent, ref } from "vue";
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

let composableState: any;

vi.mock("src/composables/usePublicCreatorProfile", () => ({
  usePublicCreatorProfile: () => composableState,
}));

const priceStore = { bitcoinPrice: 0 };
const uiStore = { formatCurrency: vi.fn(() => "$0.00") };
const welcomeStore = { welcomeCompleted: true };
const nostrStore = { hasIdentity: true };

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

const SubscribeDialogStub = defineComponent({
  name: "SubscribeDialog",
  props: { modelValue: { type: Boolean, default: false }, tier: { type: Object, default: null } },
  emits: ["update:modelValue", "confirm"],
  template: `<div v-if="modelValue" class="subscribe-dialog"><slot /></div>`,
});

const TierSummaryCardStub = defineComponent({
  name: "TierSummaryCard",
  props: {
    tier: { type: Object, required: true },
    priceSats: { type: Number, default: 0 },
    priceFiat: { type: String, default: "" },
    frequencyLabel: { type: String, default: "" },
    subscribeLabel: { type: String, default: "" },
    subscribeDisabled: { type: Boolean, default: false },
  },
  emits: ["subscribe"],
  template: `
    <div class="tier-summary-card">
      <slot />
      <slot name="subscribe-tooltip" />
      <slot name="footer-note" />
      <button
        class="tier-summary-card__cta"
        :disabled="subscribeDisabled"
        @click="$emit('subscribe', tier)"
      >
        {{ subscribeLabel }}
      </button>
    </div>
  `,
});

const QBtnStub = defineComponent({
  name: "QBtn",
  props: { label: { type: String, default: "" }, disable: { type: Boolean, default: false } },
  emits: ["click"],
  template: `<button class="q-btn" :disabled="disable" @click="$emit('click')"><slot />{{ label }}</button>`,
});

const QBannerStub = defineComponent({
  name: "QBanner",
  template: `<div class="q-banner"><slot /><slot name="action" /></div>`,
});

const QTooltipStub = defineComponent({
  name: "QTooltip",
  template: `<span class="q-tooltip"><slot /></span>`,
});

const QSkeletonStub = defineComponent({
  name: "QSkeleton",
  template: `<div class="q-skeleton"><slot /></div>`,
});

describe("PublicCreatorProfilePage", () => {
  function createComposableMock(tiersFactory: () => any[] = () => []) {
    const tiers = ref<any[]>([]);
    const refresh = vi.fn(async () => {
      tiers.value = tiersFactory();
    });
    composableState = {
      profileEvent: ref({ content: JSON.stringify({ display_name: "Creator", about: "About" }) }),
      profileDetails: ref({
        tierAddr: "30019:pubkey:tiers",
        p2pkPubkey: "p2pk-public-key",
        trustedMints: ["https://mint.example"],
        relays: ["wss://relay.example"],
      }),
      profileLoading: ref(false),
      profileError: ref(null),
      tierEvent: ref(null),
      tiers,
      tiersLoading: ref(false),
      tiersError: ref(null),
      refresh,
    };
    return composableState;
  }

  function mountPage(router: ReturnType<typeof createRouter>) {
    return mount(PublicCreatorProfilePage, {
      global: {
        plugins: [router],
        stubs: {
          SubscribeDialog: SubscribeDialogStub,
          TierSummaryCard: TierSummaryCardStub,
          QBtn: QBtnStub,
          QBanner: QBannerStub,
          QTooltip: QTooltipStub,
          QSkeleton: QSkeletonStub,
        },
        mocks: {
          $t: (key: string) => key,
        },
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    priceStore.bitcoinPrice = 0;
    welcomeStore.welcomeCompleted = true;
    nostrStore.hasIdentity = true;
    createComposableMock(() => [
      {
        id: "tier-1",
        price_sats: 1200,
        frequency: "monthly",
      },
    ]);
    buildProfileUrl.mockReturnValue("https://profile/url");
    copy.mockClear();
  });

  it("opens the requested tier when tierId query param is provided", async () => {
    const sampleHex = "a".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex/profile",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    await router.push(`/creator/${sampleNpub}/profile?tierId=tier-1`);
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();

    expect(composableState.refresh).toHaveBeenCalled();
    await flushPromises();

    expect(wrapper.find(".subscribe-dialog").exists()).toBe(true);
    expect(router.currentRoute.value.query.tierId).toBeUndefined();
  });

  it("keeps subscribe CTA disabled for guests", async () => {
    welcomeStore.welcomeCompleted = false;
    createComposableMock(() => [
      {
        id: "tier-guest",
        price_sats: 500,
        frequency: "monthly",
      },
    ]);

    const sampleHex = "b".repeat(64);
    const sampleNpub = nip19.npubEncode(sampleHex);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/creator/:npubOrHex/profile",
          name: "PublicCreatorProfile",
          component: PublicCreatorProfilePage,
        },
      ],
    });
    await router.push(`/creator/${sampleNpub}/profile`);
    await router.isReady();

    const wrapper = mountPage(router);
    await flushPromises();

    const cta = wrapper.find(".tier-summary-card__cta");
    expect(cta.attributes("disabled")).toBeDefined();
  });
});
