import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import { defineComponent, h } from "vue";
import { createTestingPinia } from "@pinia/testing";

import ReceiveDialog from "src/components/ReceiveDialog.vue";
import { useUiStore } from "src/stores/ui";
import { useReceiveTokensStore } from "src/stores/receiveTokensStore";
import { useWalletStore } from "src/stores/wallet";

const notifyMocks = vi.hoisted(() => ({
  notify: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock("src/js/notify.ts", () => notifyMocks);

const QDialogStub = defineComponent({
  name: "QDialogStub",
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { slots }) {
    return () => (props.modelValue ? h("div", slots.default?.()) : null);
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

const simpleStub = defineComponent({
  name: "SimpleStub",
  setup(_, { slots }) {
    return () => h("div", slots.default?.());
  },
});

describe("ReceiveDialog interactions", () => {
  beforeEach(() => {
    Object.values(notifyMocks).forEach((mock) => mock.mockClear());
    (window as any).windowMixin = {
      methods: {
        formatCurrency: () => "",
      },
    };
  });

  function renderDialog(options?: { mints?: Array<Record<string, unknown>> }) {
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        ui: {
          showReceiveDialog: true,
          showInvoiceDetails: false,
          showReceiveEcashDrawer: false,
        },
        receiveTokensStore: {
          showReceiveTokens: true,
          receiveData: { tokensBase64: "cached" },
        },
        wallet: {
          invoiceData: {
            amount: "1000",
            bolt11: "bolt",
            hash: "hash",
            memo: "memo",
          },
        },
        mints: {
          mints: options?.mints ?? [],
        },
        camera: {
          camera: { show: false },
        },
      },
      stubActions: false,
    });

    const utils = render(ReceiveDialog, {
      props: { modelValue: true },
      global: {
        plugins: [pinia],
        stubs: {
          "q-dialog": QDialogStub,
          "q-card": simpleStub,
          "q-card-section": simpleStub,
          "q-btn": QBtnStub,
          ReceiveEcashDrawer: simpleStub,
          XIcon: true,
          CoinsIcon: true,
          ZapIcon: true,
          ScanIcon: true,
        },
        mocks: {
          $t: (key: string) => key,
          $i18n: { t: (key: string) => key },
          $q: {
            screen: { lt: { sm: false } },
            dark: { isActive: false },
          },
        },
      },
    });

    const user = userEvent.setup();

    return { ...utils, user };
  }

  it("warns and closes when attempting to create a lightning invoice without mints", async () => {
    const { getByRole, emitted, user } = renderDialog({ mints: [] });

    await user.click(
      getByRole("button", { name: "ReceiveDialog.actions.lightning.label" }),
    );

    expect(notifyMocks.notifyWarning).toHaveBeenCalledWith(
      "ReceiveDialog.actions.lightning.error_no_mints",
    );

    const uiStore = useUiStore();
    expect(uiStore.showReceiveDialog).toBe(false);

    expect(emitted()["update:modelValue"]).toBeTruthy();
    expect(emitted()["update:modelValue"][0]).toEqual([false]);
  });

  it("prepares invoice state when lightning receive is available", async () => {
    const { getByRole, user } = renderDialog({ mints: [{}] });

    await user.click(
      getByRole("button", { name: "ReceiveDialog.actions.lightning.label" }),
    );

    expect(notifyMocks.notifyWarning).not.toHaveBeenCalled();

    const uiStore = useUiStore();
    const walletStore = useWalletStore();

    expect(uiStore.showInvoiceDetails).toBe(true);
    expect(uiStore.showReceiveDialog).toBe(false);

    expect(walletStore.invoiceData.amount).toBe("");
    expect(walletStore.invoiceData.bolt11).toBe("");
    expect(walletStore.invoiceData.hash).toBe("");
    expect(walletStore.invoiceData.memo).toBe("");
  });

  it("opens the ecash drawer and emits updates when selecting Cashu receive", async () => {
    const { getByRole, emitted, user } = renderDialog({ mints: [{}] });

    const receiveStore = useReceiveTokensStore();
    receiveStore.showReceiveTokens = true;

    await user.click(
      getByRole("button", { name: "ReceiveDialog.actions.ecash.label" }),
    );

    const uiStore = useUiStore();

    expect(uiStore.showReceiveDialog).toBe(false);
    expect(uiStore.showReceiveEcashDrawer).toBe(true);
    expect(receiveStore.showReceiveTokens).toBe(false);

    expect(emitted()["update:modelValue"]).toBeTruthy();
    expect(emitted()["update:modelValue"].at(-1)).toEqual([false]);
  });
});
