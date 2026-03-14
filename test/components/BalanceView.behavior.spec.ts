import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { defineComponent, h } from "vue";

import BalanceView from "src/components/BalanceView.vue";
import { useMintsStore } from "src/stores/mints";
import { useTokensStore } from "src/stores/tokens";
import { useWalletStore } from "src/stores/wallet";
import { useUiStore } from "src/stores/ui";
import { useBucketsStore } from "src/stores/buckets";
import { usePriceStore } from "src/stores/price";

const SimpleStub = defineComponent({
  name: "SimpleStub",
  setup(_, { slots }) {
    return () => h("div", slots.default ? slots.default() : []);
  },
});

const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: {
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
  },
  emits: ["click"],
  setup(props, { slots, emit, attrs }) {
    return () =>
      h(
        "button",
        {
          type: "button",
          ...attrs,
          disabled: props.disable,
          onClick: (evt: MouseEvent) => emit("click", evt),
        },
        slots.default?.() ?? props.label ?? attrs.icon ?? "button",
      );
  },
});

const QCarouselStub = defineComponent({
  name: "QCarouselStub",
  props: {
    modelValue: { type: [String, Number], default: null },
  },
  emits: ["update:modelValue"],
  setup(props, { slots }) {
    return () => h("div", { class: "q-carousel", "data-model": props.modelValue }, slots.default?.());
  },
});

const QCarouselSlideStub = defineComponent({
  name: "QCarouselSlideStub",
  setup(_, { slots }) {
    return () => h("div", { class: "q-carousel-slide" }, slots.default?.());
  },
});

const SpinnerStub = defineComponent({
  name: "QSpinnerHourglassStub",
  setup() {
    return () => h("div", { class: "spinner" }, "loading");
  },
});

function mountBalanceView(options?: {
  mutex?: boolean;
  pendingTokens?: Array<{ status: "pending" | "paid"; amount: number; unit: string }>;
}) {
  const pinia = createTestingPinia({
    stubActions: false,
    createSpy: vi.fn,
  });

  const mintsStore = useMintsStore();
  Object.assign(mintsStore, {
    activeMintUrl: "https://mint.one",
    activeBalance: 2500,
    totalUnitBalance: 5000,
    activeUnit: "sat",
    mints: [
      {
        url: "https://mint.one",
      },
      {
        url: "https://mint.two",
      },
    ],
  });
  mintsStore.activeMint = vi.fn().mockReturnValue({
    units: ["sat", "usd"],
    allBalances: { sat: 5000, usd: 2000 },
    mint: { errored: false, nickname: "Minty", info: { name: "Minty" } },
  });

  const tokensStore = useTokensStore();
  tokensStore.historyTokens =
    options?.pendingTokens ??
    ([
      { status: "pending", amount: -400, unit: "sat" },
      { status: "paid", amount: 200, unit: "sat" },
    ] as any);

  const uiStore = useUiStore();
  Object.assign(uiStore, {
    globalMutexLock: options?.mutex ?? false,
    hideBalance: false,
    lastBalanceCached: 0,
  });
  uiStore.formatCurrency = vi
    .fn()
    .mockImplementation((value: number, unit: string) => `${value} ${unit}`);

  const walletStore = useWalletStore();
  walletStore.checkPendingTokens = vi.fn();

  const bucketsStore = useBucketsStore();
  vi.spyOn(bucketsStore, "bucketList", "get").mockReturnValue([
    { id: "bucket-1", name: "Bucket One", goal: 1000 },
    { id: "bucket-2", name: "Bucket Two" },
  ] as any);
  vi.spyOn(bucketsStore, "bucketBalances", "get").mockReturnValue({
    "bucket-1": 400,
    "bucket-2": 50,
  });

  const priceStore = usePriceStore();
  priceStore.bitcoinPrice = null as any;
  priceStore.fetchBitcoinPriceUSD = vi.fn();

  const setTab = vi.fn();

  const wrapper = mount(BalanceView, {
    props: { setTab },
    global: {
      plugins: [pinia],
      stubs: {
        "q-carousel": QCarouselStub,
        "q-carousel-slide": QCarouselSlideStub,
        "q-spinner-hourglass": SpinnerStub,
        "q-btn": QBtnStub,
        "q-icon": SimpleStub,
        "q-tooltip": SimpleStub,
        "q-linear-progress": SimpleStub,
        ToggleUnit: SimpleStub,
        AnimatedNumber: SimpleStub,
        BucketDetailModal: SimpleStub,
      },
      mocks: {
        $t: (key: string) => key,
        $i18n: { t: (key: string) => key },
        $q: { screen: { width: 600 } },
      },
    },
  });

  return { wrapper, setTab, walletStore, uiStore };
}

describe("BalanceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading spinner when the global mutex lock is active", () => {
    const { wrapper } = mountBalanceView({ mutex: true });
    expect(wrapper.find(".spinner").exists()).toBe(true);
  });

  it("navigates to the mints tab when the mint label is clicked", async () => {
    const { wrapper, setTab } = mountBalanceView();
    const mintLink = wrapper
      .findAll("span")
      .find((node) => node.text().includes("BalanceView.mintUrl.label"));
    expect(mintLink).toBeTruthy();
    await mintLink!.trigger("click");
    expect(setTab).toHaveBeenCalledWith("mints");
  });

  it("checks for pending tokens when the pending balance button is clicked", async () => {
    const { wrapper, walletStore } = mountBalanceView();
    const pendingButton = wrapper
      .findAll("button")
      .find((node) => node.text().includes("BalanceView.pending.label"));
    expect(pendingButton).toBeTruthy();
    await pendingButton!.trigger("click");
    expect(walletStore.checkPendingTokens).toHaveBeenCalled();
  });
});
