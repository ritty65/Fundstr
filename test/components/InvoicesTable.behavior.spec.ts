import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { defineComponent, h } from "vue";

import InvoicesTable from "src/components/InvoicesTable.vue";
import { useInvoiceHistoryStore } from "src/stores/invoiceHistory";
import { useUiStore } from "src/stores/ui";
import { useWalletStore } from "src/stores/wallet";

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
    return () => h("div", { class: "q-item", ...attrs }, slots.default?.());
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

function mountInvoicesTable(options?: {
  invoices?: Array<Record<string, any>>;
}) {
  const pinia = createTestingPinia({
    stubActions: false,
    createSpy: vi.fn,
  });

  const invoiceStore = useInvoiceHistoryStore();
  invoiceStore.invoiceHistory =
    options?.invoices ??
    ([
      {
        id: "1",
        status: "pending",
        amount: 200,
        unit: "sat",
        quote: "incoming",
        date: new Date().toISOString(),
      },
      {
        id: "2",
        status: "pending",
        amount: -300,
        unit: "sat",
        quote: "outgoing",
        date: new Date().toISOString(),
      },
      {
        id: "3",
        status: "paid",
        amount: 100,
        unit: "sat",
        quote: "paid",
        date: new Date().toISOString(),
      },
    ] as any);

  const uiStore = useUiStore();
  Object.assign(uiStore, {
    showInvoiceDetails: false,
  });

  const walletStore = useWalletStore();
  walletStore.checkInvoice = vi.fn().mockResolvedValue(undefined);
  walletStore.checkOutgoingInvoice = vi.fn().mockResolvedValue(undefined);
  walletStore.mintOnPaid = vi.fn();
  Object.assign(walletStore, {
    invoiceData: {},
    payInvoiceData: {},
  });

  const wrapper = mount(InvoicesTable, {
    global: {
      plugins: [pinia],
      stubs: {
        "q-list": SimpleStub,
        "q-item": QItemStub,
        "q-item-section": QItemSectionStub,
        "q-item-label": QItemLabelStub,
        "q-btn": QBtnStub,
        "q-icon": SimpleStub,
        "q-tooltip": SimpleStub,
        "q-pagination": QPaginationStub,
      },
      mocks: {
        $t: (key: string) => key,
        $i18n: { t: (key: string) => key },
        formatCurrency: (value: number, unit: string) => `${value} ${unit}`,
      },
    },
  });

  return { wrapper, walletStore, uiStore };
}

describe("InvoicesTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders an empty state message when there are no invoices", () => {
    const { wrapper } = mountInvoicesTable({ invoices: [] });
    expect(wrapper.text()).toContain("InvoiceTable.empty_text");
  });

  it("filters pending invoices and resets pagination when toggled", async () => {
    const { wrapper } = mountInvoicesTable();
    await wrapper.setData({ currentPage: 2 });

    const toggleButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("InvoiceTable.actions.filter_pending.label"));
    expect(toggleButton).toBeTruthy();

    await toggleButton!.trigger("click");

    expect(wrapper.vm.filterPending).toBe(true);
    expect(wrapper.vm.currentPage).toBe(1);
    expect(wrapper.vm.paginatedInvoices.every((inv: any) => inv.status === "pending")).toBe(
      true,
    );
  });

  it("polls invoice status for incoming and outgoing pending rows", async () => {
    const { wrapper, walletStore } = mountInvoicesTable();

    const checkButtons = wrapper
      .findAll("button")
      .filter((btn) => btn.attributes("aria-label") ===
        "InvoiceTable.actions.check_status.tooltip_text");

    expect(checkButtons.length).toBe(2);

    for (const btn of checkButtons) {
      await btn.trigger("click");
    }

    expect(walletStore.checkInvoice).toHaveBeenCalledWith("incoming", true);
    expect(walletStore.checkOutgoingInvoice).toHaveBeenCalledWith("outgoing", true);
  });
});
