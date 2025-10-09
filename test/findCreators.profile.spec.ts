import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { reactive, nextTick, defineComponent } from "vue";
import FindCreators from "src/pages/FindCreators.vue";

const queryNutzapProfile = vi.fn();
const toHex = vi.fn((value: string) => value);
const fallbackDiscoverRelays = vi.fn();

vi.mock("@/nostr/relayClient", () => ({
  queryNutzapProfile: (...args: any[]) => queryNutzapProfile(...args),
  toHex: (...args: any[]) => toHex(...args),
}));

vi.mock("@/nostr/discovery", () => ({
  fallbackDiscoverRelays: (...args: any[]) => fallbackDiscoverRelays(...args),
}));

vi.mock("components/DonateDialog.vue", () => ({
  default: { name: "DonateDialog", template: "<div />" },
}));
vi.mock("components/SubscribeDialog.vue", () => ({
  default: { name: "SubscribeDialog", template: "<div />" },
}));
vi.mock("components/SendTokenDialog.vue", () => ({
  default: { name: "SendTokenDialog", template: "<div />" },
}));
vi.mock("components/MediaPreview.vue", () => ({
  default: { name: "MediaPreview", template: "<div />" },
}));
vi.mock("components/NostrRelayErrorBanner.vue", () => ({
  default: { name: "NostrRelayErrorBanner", template: "<div />" },
}));

const sendTokensStore = { clearSendData: vi.fn(), sendData: {}, showSendTokens: false };
vi.mock("stores/sendTokensStore", () => ({
  useSendTokensStore: () => sendTokensStore,
}));

const donationStore = { createDonationPreset: vi.fn() };
vi.mock("stores/donationPresets", () => ({
  useDonationPresetsStore: () => donationStore,
}));

let creatorsStore: any;
let fetchTierDefinitions: ReturnType<typeof vi.fn>;

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

vi.mock("src/js/notify", () => ({
  notifyWarning: vi.fn(),
}));
vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (k: string) => k }),
  createI18n: () => ({ global: { t: (k: string) => k } }),
}));

vi.mock("quasar", () => {
  const createStub = (name: string) =>
    defineComponent({
      name,
      template: "<div><slot /><slot name=\"action\"></slot></div>",
    });
  return {
    useQuasar: () => ({
      dark: {
        isActive: false,
      },
    }),
    QDialog: defineComponent({
      name: "QDialog",
      props: { modelValue: { type: Boolean, default: false } },
      emits: ["update:modelValue"],
      template: `<div v-if=\"modelValue\" class=\"q-dialog\"><slot /></div>`,
    }),
    QCard: createStub("QCard"),
    QCardSection: createStub("QCardSection"),
    QCardActions: createStub("QCardActions"),
    QSeparator: createStub("QSeparator"),
    QBtn: defineComponent({
      name: "QBtn",
      props: { label: { type: String, default: "" } },
      emits: ["click"],
      template: `<button class=\"q-btn\" @click=\"$emit('click')\"><slot />{{ label }}</button>`,
    }),
    QBanner: createStub("QBanner"),
    QSpinnerHourglass: createStub("QSpinnerHourglass"),
    QPage: createStub("QPage"),
    QTooltip: createStub("QTooltip"),
    QIcon: createStub("QIcon"),
  };
});

const SimpleStub = (name: string) =>
  defineComponent({
    name,
    template: "<div><slot /><slot name=\"action\"></slot></div>",
  });

const QDialogStub = defineComponent({
  name: "QDialog",
  props: { modelValue: { type: Boolean, default: false } },
  emits: ["update:modelValue"],
  template: `<div v-if="modelValue" class="q-dialog"><slot /></div>`,
});

const QBtnStub = defineComponent({
  name: "QBtn",
  props: {
    label: { type: String, default: "" },
  },
  emits: ["click"],
  template: `<button class="q-btn" @click="$emit('click')"><slot />{{ label }}</button>`,
});

const QCardStub = SimpleStub("QCard");
const QCardSectionStub = SimpleStub("QCardSection");
const QCardActionsStub = SimpleStub("QCardActions");
const QSeparatorStub = SimpleStub("QSeparator");
const QBannerStub = SimpleStub("QBanner");
const QSpinnerStub = SimpleStub("QSpinnerHourglass");

describe("FindCreators component behaviour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchTierDefinitions = vi.fn().mockResolvedValue(undefined);
    creatorsStore = reactive({
      tiersMap: reactive({}),
      tierFetchError: false,
      fetchTierDefinitions,
      ensureCreatorCacheFromDexie: vi.fn().mockResolvedValue(undefined),
      saveProfileCache: vi.fn().mockResolvedValue(undefined),
    });
    toHex.mockImplementation((val: string) => val);
    fallbackDiscoverRelays.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function mountComponent(props: Record<string, any> = {}) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    return mount(FindCreators, {
      props,
      global: {
        plugins: [router, pinia],
        mocks: {
          $t: (key: string) => key,
        },
        stubs: {
          QDialog: QDialogStub,
          QCard: QCardStub,
          QCardSection: QCardSectionStub,
          QCardActions: QCardActionsStub,
          QSeparator: QSeparatorStub,
          QBtn: QBtnStub,
          QBanner: QBannerStub,
          QSpinnerHourglass: QSpinnerStub,
        },
      },
    });
  }

  it("fans out relay hints using discovery results and profile content", async () => {
    toHex.mockImplementation((val: string) => {
      if (val === "npub123") return "hex123";
      throw new Error("bad");
    });
    queryNutzapProfile
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        tags: [
          ["relay", "wss://tag-relay"],
          ["relay", "wss://tag-relay"],
        ],
        content: JSON.stringify({
          p2pk: "p2pk",
          mints: ["mint1"],
          relays: ["wss://content-relay"],
        }),
      });
    fallbackDiscoverRelays.mockResolvedValue(["wss://fallback-relay"]);

    const wrapper = mountComponent({ npubOrHex: "npub123" });
    await flushPromises();

    expect(queryNutzapProfile.mock.calls[0][0]).toBe("hex123");
    expect(queryNutzapProfile.mock.calls[1]).toEqual([
      "hex123",
      expect.objectContaining({
        fanout: ["wss://fallback-relay"],
        allowFanoutFallback: true,
      }),
    ]);

    expect(fetchTierDefinitions).toHaveBeenCalledWith(
      "hex123",
      expect.objectContaining({
        relayHints: expect.arrayContaining([
          "wss://fallback-relay",
          "wss://tag-relay",
          "wss://content-relay",
        ]),
      }),
    );

    const hintsArg = fetchTierDefinitions.mock.calls[0][1].relayHints;
    expect(new Set(hintsArg)).toEqual(
      new Set(["wss://fallback-relay", "wss://tag-relay", "wss://content-relay"]),
    );
    expect(wrapper.vm.loadingProfile).toBe(false);
  });

  it("stops loading when provided pubkey cannot be converted to hex", async () => {
    toHex.mockImplementation(() => {
      throw new Error("invalid npub");
    });

    const wrapper = mountComponent({ npubOrHex: "badnpub" });
    await flushPromises();

    expect(queryNutzapProfile).not.toHaveBeenCalled();
    expect(fetchTierDefinitions).not.toHaveBeenCalled();
    expect(wrapper.vm.loadingProfile).toBe(false);
    expect(wrapper.vm.loadingTiers).toBe(false);
  });

  it("surfaces tier fetch failures and retries with relay hints", async () => {
    toHex.mockReturnValue("hex456");
    creatorsStore.tiersMap["hex456"] = [];
    queryNutzapProfile.mockResolvedValue({
      tags: [],
      content: JSON.stringify({ relays: [] }),
    });
    fallbackDiscoverRelays.mockResolvedValue([]);

    const wrapper = mountComponent({ npubOrHex: "npub456" });
    await flushPromises();

    creatorsStore.tierFetchError = true;
    await nextTick();

    vi.useFakeTimers();
    fetchTierDefinitions.mockImplementationOnce(() => new Promise(() => {}));
    await wrapper
      .findAll("button")
      .find((btn) => btn.text() === "Retry")
      ?.trigger("click");
    expect(fetchTierDefinitions).toHaveBeenLastCalledWith(
      "hex456",
      expect.objectContaining({ relayHints: expect.any(Array) }),
    );

    expect(wrapper.vm.loadingTiers).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(wrapper.vm.loadingTiers).toBe(false);
  });
});
