import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { defineComponent, h, reactive, ref, nextTick } from "vue";

import SubscribeDialog from "src/components/SubscribeDialog.vue";

type Bucket = { id: string; name: string; creatorPubkey?: string };

const notifyMocks = vi.hoisted(() => ({
  notify: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock("src/js/notify", () => notifyMocks);

const bucketList = ref<Bucket[]>([
  { id: "default", name: "Default" },
]);

const bucketBalances = ref<Record<string, number>>({ default: 0 });

const bucketsStoreMock = {
  bucketList,
  bucketBalances,
  addBucket: vi.fn((bucket: Bucket) => {
    const newBucket: Bucket = {
      id: `bucket-${bucketList.value.length + 1}`,
      name: bucket.name,
      creatorPubkey: bucket.creatorPubkey,
    };
    bucketList.value.push(newBucket);
    return newBucket;
  }),
};

const nostrStoreMock = reactive({
  signer: {} as Record<string, unknown> | null,
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
  relays: ["wss://relay"],
  trustedMints: ["https://mint"],
  name: "Creator",
  picture: "pic",
}));

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
  RelayConnectionError: class RelayConnectionError extends Error {},
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

const simpleStub = defineComponent({
  name: "SimpleStub",
  setup(_, { slots }) {
    return () => h("div", slots.default?.());
  },
});

const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: {
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
  },
  emits: ["click"],
  setup(props, { slots, emit }) {
    return () =>
      h(
        "button",
        {
          type: "button",
          disabled: props.disable,
          onClick: (event: MouseEvent) => emit("click", event),
        },
        slots.default?.() ?? props.label,
      );
  },
});

const QSelectStub = defineComponent({
  name: "QSelectStub",
  props: {
    modelValue: { type: [String, Number], default: "" },
    options: { type: Array, default: () => [] },
    label: { type: String, default: "" },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("label", [
        props.label ? h("span", props.label) : null,
        h(
          "select",
          {
            value: props.modelValue as string | number,
            onInput: (event: Event) =>
              emit(
                "update:modelValue",
                (event.target as HTMLSelectElement).value,
              ),
          },
          (props.options as Array<{ label: string; value: string | number }>).map(
            (option) =>
              h(
                "option",
                { value: option.value },
                option.label ?? option.value,
              ),
          ),
        ),
      ]);
  },
});

const QInputStub = defineComponent({
  name: "QInputStub",
  props: {
    modelValue: { type: String, default: "" },
    label: { type: String, default: "" },
    type: { type: String, default: "text" },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("label", [
        props.label ? h("span", props.label) : null,
        h("input", {
          value: props.modelValue,
          type: props.type,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
        }),
      ]);
  },
});

const QBannerStub = defineComponent({
  name: "QBannerStub",
  setup(_, { slots }) {
    return () =>
      h("div", { role: "status" }, [
        slots.default?.(),
        slots.action?.(),
      ]);
  },
});

function renderDialog() {
  const utils = render(SubscribeDialog, {
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
        "q-select": QSelectStub,
        "q-input": QInputStub,
        "q-banner": QBannerStub,
        "q-btn": QBtnStub,
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });

  return { ...utils, user: userEvent.setup() };
}

describe("SubscribeDialog success flow", () => {
  beforeEach(() => {
    Object.values(notifyMocks).forEach((mock) => mock.mockClear());
    bucketList.value = [{ id: "default", name: "Default" }];
    bucketBalances.value = { default: 0 };
    nostrStoreMock.signer = {};
    nostrStoreMock.initSignerIfNotSet.mockClear();
    cashuStoreMock.subscribeToTier.mockClear();
    fetchNutzapProfileMock.mockClear();
  });

  it("subscribes successfully and emits confirmation payload", async () => {
    const { emitted, user } = renderDialog();

    await nextTick();

    const dialog = screen.getByText("Subscribe to Supporter").closest("div");
    expect(dialog).toBeTruthy();

    const confirmButton = within(dialog as HTMLElement).getByRole("button", {
      name: "global.actions.ok.label",
    });

    await user.click(confirmButton);

    expect(nostrStoreMock.initSignerIfNotSet).toHaveBeenCalled();
    expect(fetchNutzapProfileMock).toHaveBeenCalledWith("npub-creator");
    expect(cashuStoreMock.subscribeToTier).toHaveBeenCalledWith(
      expect.objectContaining({
        creator: {
          nostrPubkey: "npub-creator",
          cashuP2pk: "p2pk",
        },
        price: 1000,
        periods: 1,
      }),
    );

    expect(notifyMocks.notifySuccess).toHaveBeenCalledWith(
      "FindCreators.notifications.subscription_success",
    );

    const events = emitted();
    expect(events["confirm"]).toBeTruthy();
    expect(events["confirm"][0][0]).toMatchObject({
      bucketId: "default",
      periods: 1,
      total: 1000,
    });
    expect(events["update:modelValue"][0]).toEqual([false]);
  });
});
