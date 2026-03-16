import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick, reactive, ref } from "vue";

import SubscribeDialog from "src/components/SubscribeDialog.vue";

const notifyMocks = vi.hoisted(() => ({
  notify: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock("src/js/notify", () => notifyMocks);

const bucketList = ref([{ id: "default", name: "Default" }]);
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
const activeMintUrl = ref("https://mint");
const activeBalance = ref(2500);
const activeInfo = ref<any>({
  nuts: {
    4: { methods: [], disabled: false },
    10: { supported: true },
    11: { supported: true },
    14: { supported: true },
  },
});

const mintsStoreMock = {
  activeUnit,
  get activeMintUrl() {
    return activeMintUrl.value;
  },
  get activeBalance() {
    return activeBalance.value;
  },
  get activeInfo() {
    return activeInfo.value;
  },
};

const bootErrorStoreMock = { set: vi.fn() };

const fetchNutzapProfileMock = vi.fn(async () => ({
  p2pkPubkey: "p2pk",
  relays: [],
  trustedMints: [],
  name: "Creator",
  picture: "pic",
}));

const RelayConnectionErrorMock = vi.hoisted(
  () => class RelayConnectionErrorMock extends Error {},
);

vi.mock("stores/donationPresets", () => ({
  useDonationPresetsStore: () => donationStoreMock,
}));

vi.mock("stores/buckets", () => ({
  useBucketsStore: () => bucketsStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => ({
    formatCurrency: (value: number, unit: string) => `${value} ${unit}`,
  }),
}));

vi.mock("stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
  fetchNutzapProfile: (...args: any[]) =>
    fetchNutzapProfileMock.apply(null, args),
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
      tier: {
        id: "tier",
        name: "Supporter",
        price_sats: 1000,
        frequency: "monthly",
      },
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

function getConfirmButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper
    .findAll("button")
    .find((btn) => /lock 1000 sat|subscribe/i.test(btn.text()));
}

describe("SubscribeDialog invalid states", () => {
  beforeEach(() => {
    nostrStoreMock.initSignerIfNotSet.mockClear();
    cashuStoreMock.subscribeToTier.mockClear();
    fetchNutzapProfileMock.mockClear();
    bootErrorStoreMock.set.mockClear();
    notifyMocks.notifyError.mockClear();
    notifyMocks.notifySuccess.mockClear();
    activeMintUrl.value = "https://mint";
    activeBalance.value = 2500;
    activeInfo.value = {
      nuts: {
        4: { methods: [], disabled: false },
        10: { supported: true },
        11: { supported: true },
        14: { supported: true },
      },
    };
  });

  it("surfaces the signer warning banner and disables confirmation until a signer is present", async () => {
    const wrapper = mountDialog({ signer: null });

    await nextTick();

    expect(wrapper.html()).toContain("CreatorHub.profile.signerAlert.message");

    const confirmButton = getConfirmButton(wrapper);

    expect(confirmButton).toBeDefined();
    expect(confirmButton!.attributes()["disabled"]).toBeDefined();

    nostrStoreMock.signer = { pubkey: "abc" };

    await flushPromises();
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

    const confirmButton = getConfirmButton(wrapper);

    expect(confirmButton).toBeDefined();
    expect(confirmButton!.attributes()["disabled"]).toBeUndefined();
  });

  it("blocks confirmation when the active mint is exact-only", async () => {
    activeInfo.value = {
      nuts: {
        10: { supported: true },
        11: { supported: true },
        14: { supported: true },
      },
    };

    const wrapper = mountDialog({ signer: { pubkey: "abc" } });

    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toContain("Recurring support needs split support");
    expect(wrapper.html()).toContain(
      "Your active mint is exact-match only. Switch to a split-capable mint before locking this subscription.",
    );

    const confirmButton = getConfirmButton(wrapper);
    expect(confirmButton).toBeDefined();
    expect(confirmButton!.attributes()["disabled"]).toBeDefined();
  });

  it("blocks confirmation when the active mint is not creator-trusted", async () => {
    fetchNutzapProfileMock.mockResolvedValueOnce({
      p2pkPubkey: "p2pk",
      relays: [],
      trustedMints: ["https://creator-trusted-mint"],
      name: "Creator",
      picture: "pic",
    });

    const wrapper = mountDialog({ signer: { pubkey: "abc" } });

    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toContain("Switch to a creator-trusted mint");

    const confirmButton = getConfirmButton(wrapper);
    expect(confirmButton).toBeDefined();
    expect(confirmButton!.attributes()["disabled"]).toBeDefined();
  });

  it("surfaces relay connectivity failures when fetching the creator profile fails", async () => {
    fetchNutzapProfileMock.mockRejectedValueOnce(
      new RelayConnectionErrorMock("offline"),
    );

    const wrapper = mountDialog({ signer: { pubkey: "abc" } });

    await flushPromises();
    await nextTick();

    const confirmButton = getConfirmButton(wrapper);

    expect(confirmButton).toBeDefined();
    expect(confirmButton!.attributes()["disabled"]).toBeDefined();

    expect(cashuStoreMock.subscribeToTier).not.toHaveBeenCalled();
    expect(wrapper.html()).toContain(
      "Unable to verify creator payment setup right now.",
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

    const confirmButton = getConfirmButton(wrapper);

    expect(confirmButton).toBeDefined();

    await flushPromises();
    await nextTick();

    await confirmButton!.trigger("click");
    await nextTick();

    expect(cashuStoreMock.subscribeToTier).toHaveBeenCalledTimes(1);
    expect(notifyMocks.notifyError).toHaveBeenCalledWith("network offline");
    expect(wrapper.emitted()["update:modelValue"]).toBeUndefined();
  });
});
