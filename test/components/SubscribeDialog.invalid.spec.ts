import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick, reactive, ref } from "vue";

import SubscribeDialog from "src/components/SubscribeDialog.vue";

const notifyMocks = vi.hoisted(() => ({
  notify: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock("src/js/notify", () => notifyMocks);

const bucketList = ref([
  { id: "default", name: "Default" },
]);
const bucketBalances = ref<Record<string, number>>({ default: 0 });

const bucketsStoreMock = {
  bucketList,
  bucketBalances,
  addBucket: vi.fn((bucket: { name: string; creatorPubkey?: string }) => {
    const newBucket = {
      id: `bucket-${bucketList.value.length + 1}`,
      name: bucket.name,
      creatorPubkey: bucket.creatorPubkey,
    };
    bucketList.value.push(newBucket as any);
    return newBucket as any;
  }),
};

const nostrStoreMock = reactive({
  signer: null as null | Record<string, unknown>,
  initSignerIfNotSet: vi.fn(async () => undefined),
});

const cashuStoreMock = {
  subscribeToTier: vi.fn(async () => true),
};

const donationStoreMock = {
  presets: [{ periods: 1 }, { periods: 3 }],
};

const activeUnit = ref("sat");

const bootErrorStoreMock = { set: vi.fn() };

const fetchNutzapProfileMock = vi.fn(async () => ({
  p2pkPubkey: "p2pk",
  relays: [],
  trustedMints: [],
  name: "Creator",
  picture: "pic",
}));

class RelayConnectionErrorMock extends Error {}

vi.mock("stores/donationPresets", () => ({
  useDonationPresetsStore: () => donationStoreMock,
}));

vi.mock("stores/buckets", () => ({
  useBucketsStore: () => bucketsStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => ({ activeUnit }),
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => ({
    formatCurrency: (value: number, unit: string) => `${value} ${unit}`,
  }),
}));

vi.mock("stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
  fetchNutzapProfile: fetchNutzapProfileMock,
  npubToHex: (value: string) => value,
  RelayConnectionError: RelayConnectionErrorMock,
}));

vi.mock("stores/cashu", () => ({
  useCashuStore: () => cashuStoreMock,
}));

vi.mock("stores/bootError", () => ({
  useBootErrorStore: () => bootErrorStoreMock,
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ fullPath: "/profile" }),
}));

vi.mock("boot/ndk", () => ({
  NdkBootError: class NdkBootError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.reason = reason;
    }
  },
}));

const qBtnStub = {
  name: "QBtnStub",
  inheritAttrs: true,
  props: ["label", "color", "flat", "size", "disable"],
  emits: ["click"],
  template: `
    <button
      :disabled="disable"
      @click="$emit('click')"
    >
      <slot />
      <span v-if="label">{{ label }}</span>
    </button>
  `,
};

const qInputStub = {
  name: "QInputStub",
  inheritAttrs: true,
  props: [
    "modelValue",
    "label",
    "type",
    "error",
    "errorMessage",
    "outlined",
    "dense",
    "required",
  ],
  emits: ["update:modelValue"],
  template: `
    <label>
      <span v-if="label">{{ label }}</span>
      <input
        :value="modelValue"
        :type="type || 'text'"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <div v-if="errorMessage" class="error">{{ errorMessage }}</div>
    </label>
  `,
};

const simpleStub = { template: "<div><slot /></div>" };

const qBannerStub = {
  template: `
    <div class="q-banner">
      <slot />
      <slot name="action"></slot>
    </div>
  `,
};

function mountDialog(options?: { signer?: Record<string, unknown> | null }) {
  nostrStoreMock.signer = options?.signer ?? null;
  const wrapper = mount(SubscribeDialog, {
    props: {
      modelValue: true,
      tier: { id: "tier", name: "Supporter", price_sats: 1000, frequency: "monthly" },
      supporterPubkey: "npub-supporter",
      creatorPubkey: "npub-creator",
    },
    global: {
      stubs: {
        "q-dialog": simpleStub,
        "q-card": simpleStub,
        "q-card-section": simpleStub,
        "q-card-actions": simpleStub,
        "q-select": simpleStub,
        "q-input": qInputStub,
        "q-banner": qBannerStub,
        "q-btn": qBtnStub,
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });

  return wrapper;
}

describe("SubscribeDialog invalid states", () => {
  beforeEach(() => {
    nostrStoreMock.initSignerIfNotSet.mockClear();
    cashuStoreMock.subscribeToTier.mockClear();
    fetchNutzapProfileMock.mockClear();
    bootErrorStoreMock.set.mockClear();
    notifyMocks.notifyError.mockClear();
    notifyMocks.notifySuccess.mockClear();
  });

  it("surfaces the signer warning banner and disables confirmation until a signer is present", async () => {
    const wrapper = mountDialog({ signer: null });

    await nextTick();

    expect(wrapper.html()).toContain(
      "CreatorHub.profile.signerAlert.message",
    );

    const confirmButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("global.actions.ok.label"));

    expect(confirmButton).toBeDefined();
    expect(confirmButton!.attributes()["disabled"]).toBeDefined();

    nostrStoreMock.signer = { pubkey: "abc" };

    await nextTick();

    expect(wrapper.html()).not.toContain(
      "CreatorHub.profile.signerAlert.message",
    );
    expect(confirmButton!.attributes()["disabled"]).toBeUndefined();
  });

  it("shows a start date validation error when the value is in the past and clears it when corrected", async () => {
    const wrapper = mountDialog({ signer: { pubkey: "abc" } });

    await nextTick();

    (wrapper.vm as any).startDate = "2000-01-01";

    await nextTick();

    expect(wrapper.html()).toContain("Start date is in the past");

    (wrapper.vm as any).startDate = (wrapper.vm as any).today;

    await nextTick();

    expect(wrapper.html()).not.toContain("Start date is in the past");

    const confirmButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("global.actions.ok.label"));

    expect(confirmButton).toBeDefined();
    expect(confirmButton!.attributes()["disabled"]).toBeUndefined();
  });

  it("surfaces relay connectivity failures when fetching the creator profile fails", async () => {
    const wrapper = mountDialog({ signer: { pubkey: "abc" } });

    fetchNutzapProfileMock.mockRejectedValueOnce(
      new RelayConnectionErrorMock("offline"),
    );

    const confirmButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("global.actions.ok.label"));

    expect(confirmButton).toBeDefined();

    await confirmButton!.trigger("click");
    await nextTick();

    expect(cashuStoreMock.subscribeToTier).not.toHaveBeenCalled();
    expect(notifyMocks.notifyError).toHaveBeenCalledWith(
      "Unable to connect to Nostr relays",
    );
    expect(bootErrorStoreMock.set).not.toHaveBeenCalled();
  });

  it("reports subscription errors returned by the Cashu store and leaves the dialog open", async () => {
    const wrapper = mountDialog({ signer: { pubkey: "abc" } });

    fetchNutzapProfileMock.mockResolvedValueOnce({
      p2pkPubkey: "p2pk",
      relays: [],
      trustedMints: [],
      name: "Creator",
      picture: "pic",
    });
    cashuStoreMock.subscribeToTier.mockRejectedValueOnce(
      new Error("network offline"),
    );

    const confirmButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("global.actions.ok.label"));

    expect(confirmButton).toBeDefined();

    await confirmButton!.trigger("click");
    await nextTick();

    expect(cashuStoreMock.subscribeToTier).toHaveBeenCalledTimes(1);
    expect(notifyMocks.notifyError).toHaveBeenCalledWith("network offline");
    expect(wrapper.emitted()["update:modelValue"]).toBeUndefined();
  });
});
