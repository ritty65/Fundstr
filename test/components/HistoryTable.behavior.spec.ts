import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { defineComponent, h, getCurrentInstance } from "vue";

vi.mock("quasar/dist/quasar.client.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Ripple: {
      ...(actual.Ripple || {}),
      name: "ripple",
      beforeMount: () => undefined,
      updated: () => undefined,
    },
  };
});

import HistoryTable from "src/components/HistoryTable.vue";
import { useTokensStore } from "src/stores/tokens";
import { useWalletStore } from "src/stores/wallet";
import { useReceiveTokensStore } from "src/stores/receiveTokensStore";
import { useSendTokensStore } from "src/stores/sendTokensStore";

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

const QItemStub = defineComponent({
  name: "QItemStub",
  setup(_, { slots, attrs }) {
    const instance = getCurrentInstance();
    if (instance && instance.appContext) {
      instance.appContext.config = {
        ...(instance.appContext.config || {}),
        globalProperties: {
          ...((instance.appContext.config || {}).globalProperties || {}),
          ripple: false,
        },
      } as any;
    }
    const onClick = attrs.onClick as any;
    return () =>
      h(
        "div",
        {
          class: "q-item",
          onClick,
        },
        slots.default?.(),
      );
  },
});

const QItemSectionStub = defineComponent({
  name: "QItemSectionStub",
  setup(_, { slots, attrs }) {
    return () => h("div", { class: "q-item-section", ...attrs }, slots.default?.());
  },
});

const QItemLabelStub = defineComponent({
  name: "QItemLabelStub",
  setup(_, { slots, attrs }) {
    return () => h("div", { class: "q-item-label", ...attrs }, slots.default?.());
  },
});

const QPaginationStub = defineComponent({
  name: "QPaginationStub",
  props: {
    modelValue: { type: Number, default: 1 },
    max: { type: Number, default: 1 },
  },
  emits: ["update:modelValue", "input"],
  setup(props, { emit }) {
    return () =>
      h(
        "button",
        {
          type: "button",
          class: "q-pagination",
          onClick: () => {
            const next = props.modelValue >= props.max ? 1 : props.modelValue + 1;
            emit("update:modelValue", next);
            emit("input", next);
          },
        },
        `page-${props.modelValue}`,
      );
  },
});

function mountHistoryTable(options?: {
  tokens?: Array<Record<string, any>>;
}) {
  const pinia = createTestingPinia({
    stubActions: false,
    createSpy: vi.fn,
  });

  const tokensStore = useTokensStore();
  tokensStore.historyTokens =
    options?.tokens ??
    ([
      {
        id: "1",
        status: "pending",
        amount: -100,
        unit: "sat",
        token: "pending-negative",
        date: new Date().toISOString(),
        bucketId: "bucket-1",
      },
      {
        id: "2",
        status: "pending",
        amount: 150,
        unit: "sat",
        token: "pending-positive",
        date: new Date().toISOString(),
        bucketId: "bucket-1",
      },
      {
        id: "3",
        status: "paid",
        amount: 200,
        unit: "sat",
        token: "paid",
        date: new Date().toISOString(),
        bucketId: "bucket-1",
      },
    ] as any);

  const walletStore = useWalletStore();
  walletStore.checkTokenSpendable = vi.fn();

  const receiveStore = useReceiveTokensStore();
  Object.assign(receiveStore, {
    showReceiveTokens: false,
    receiveData: { tokensBase64: "" },
  });

  const sendStore = useSendTokensStore();
  Object.assign(sendStore, {
    showSendTokens: false,
    sendData: {},
  });

  const wrapper = mount(HistoryTable, {
    global: {
      plugins: [
        pinia,
        {
          install(app) {
            app._context.config = {
              ...(app._context.config || {}),
              globalProperties: {
                ...((app._context.config || {}).globalProperties || {}),
                ripple: false,
              },
            } as any;
          },
        },
      ],
      mixins: [
        {
          beforeCreate() {
            if (this && (this as any).$?.appContext) {
              const context = (this as any).$?.appContext;
              context.config = {
                ...(context.config || {}),
                globalProperties: {
                  ...((context.config || {}).globalProperties || {}),
                  ripple: false,
                },
              } as any;
            }
          },
        },
      ],
      stubs: {
        "q-list": SimpleStub,
        "q-item": QItemStub,
        "q-item-section": QItemSectionStub,
        "q-item-label": QItemLabelStub,
        "q-btn": QBtnStub,
        "q-icon": SimpleStub,
        "q-tooltip": SimpleStub,
        "q-dialog": SimpleStub,
        "q-card": SimpleStub,
        "q-card-section": SimpleStub,
        "q-input": SimpleStub,
        "q-pagination": QPaginationStub,
      },
      directives: {
        ripple: {
          beforeMount: () => undefined,
          updated: () => undefined,
        },
        Ripple: {
          beforeMount: () => undefined,
          updated: () => undefined,
        },
      },
      mocks: {
        $t: (key: string) => key,
        $i18n: { t: (key: string) => key },
        formatCurrency: (value: number, unit: string) => `${value} ${unit}`,
      },
    },
  });

  return { wrapper, walletStore, receiveStore };
}

describe("HistoryTable", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("renders an empty state message when there are no history tokens", () => {
    const { wrapper } = mountHistoryTable({ tokens: [] });
    expect(wrapper.text()).toContain("HistoryTable.empty_text");
  });

  it("filters pending tokens and resets pagination when toggled", async () => {
    const { wrapper } = mountHistoryTable();
    await wrapper.setData({ currentPage: 2 });

    const toggleButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("HistoryTable.actions.filter_pending.label"));
    expect(toggleButton).toBeTruthy();

    await toggleButton!.trigger("click");

    expect(wrapper.vm.filterPending).toBe(true);
    expect(wrapper.vm.currentPage).toBe(1);
    expect(wrapper.vm.paginatedTokens.every((t: any) => t.status === "pending")).toBe(
      true,
    );
  });

  it("checks token spendability and opens receive flow for pending entries", async () => {
    const { wrapper, walletStore, receiveStore } = mountHistoryTable();

    const refreshButton = wrapper
      .findAll("button")
      .find((btn) => btn.attributes("aria-label") ===
        "HistoryTable.actions.check_status.tooltip_text");
    expect(refreshButton).toBeTruthy();
    await refreshButton!.trigger("click");
    expect(walletStore.checkTokenSpendable).toHaveBeenCalled();

    const receiveButton = wrapper
      .findAll("button")
      .find((btn) => btn.attributes("aria-label") ===
        "HistoryTable.actions.receive.tooltip_text");
    expect(receiveButton).toBeTruthy();
    await receiveButton!.trigger("click");
    expect(receiveStore.showReceiveTokens).toBe(true);
    expect(receiveStore.receiveData.tokensBase64).toBe("pending-positive");
  });
});
