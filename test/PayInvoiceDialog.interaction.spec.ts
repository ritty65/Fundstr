import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { nextTick } from "vue";

import PayInvoiceDialog from "src/components/PayInvoiceDialog.vue";
import { useWalletStore } from "src/stores/wallet";
import { useMintsStore } from "src/stores/mints";
import { useBucketsStore } from "src/stores/buckets";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

const qBtnStub = {
  name: "QBtnStub",
  props: ["label", "disable", "loading", "color", "rounded", "unelevated", "textColor"],
  emits: ["click"],
  template: `
    <button
      :disabled="disable"
      :data-loading="loading ? 'true' : 'false'"
      @click="$emit('click')"
    >
      <slot />
      <span v-if="label">{{ label }}</span>
    </button>
  `,
};

const qInputStub = {
  name: "QInputStub",
  props: ["modelValue", "label", "type", "min", "max", "readonly", "dense", "outlined", "autofocus"],
  emits: ["update:modelValue"],
  template: `
    <label>
      <span v-if="label">{{ label }}</span>
      <input
        :value="modelValue"
        :type="type || 'text'"
        :readonly="readonly"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <slot />
    </label>
  `,
};

const simpleStub = { template: "<div><slot /></div>" };

function createMount(options?: {
  activeBalance?: number;
  meltAmount?: number;
  meltError?: string;
}) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    stubActions: false,
    initialState: {
      wallet: {
        payInvoiceData: {
          show: true,
          blocking: false,
          bucketId: DEFAULT_BUCKET_ID,
          paymentChecker: null,
          meltQuote: {
            response: { amount: options?.meltAmount ?? 1 },
            error: options?.meltError ?? "",
          },
          invoice: {
            description: "Test invoice",
          },
          lnurlpay: null,
          lnurlauth: null,
          domain: "",
          input: {
            request: "",
            comment: "",
            amount: 0,
          },
        },
      },
      mints: {
        activeBalance: options?.activeBalance ?? 5,
        totalUnitBalance: options?.activeBalance ?? 5,
        activeUnit: "sat",
        activeProofs: [],
        mints: [],
        addMintBlocking: false,
        activeMintUrl: "https://mint",
      },
      price: {
        bitcoinPrice: 0,
      },
      ui: {
        tickerShort: "sat",
        showReceiveDialog: false,
      },
      camera: {
        camera: { show: false },
        hasCamera: false,
      },
      buckets: {
        bucketList: [{ id: DEFAULT_BUCKET_ID, name: "Default" }],
      },
    },
  });

  const walletStore = useWalletStore();
  walletStore.meltInvoiceData = vi.fn();
  walletStore.meltQuoteInvoiceData = vi.fn();
  walletStore.decodeRequest = vi.fn();
  walletStore.lnurlPaySecond = vi.fn();

  const bucketsStore = useBucketsStore();
  bucketsStore.autoBucketFor = vi.fn().mockReturnValue(null);

  const wrapper = mount(PayInvoiceDialog, {
    global: {
      plugins: [pinia],
      stubs: {
        "q-dialog": simpleStub,
        "q-card": simpleStub,
        "q-card-section": simpleStub,
        "q-btn": qBtnStub,
        "q-select": simpleStub,
        "q-form": simpleStub,
        "q-input": qInputStub,
        "q-separator": simpleStub,
        "q-spinner-hourglass": simpleStub,
        "q-img": simpleStub,
        ToggleUnit: simpleStub,
        ChooseMint: simpleStub,
        "i18n-t": simpleStub,
      },
      mocks: {
        $t: (key: string) => key,
        $i18n: { t: (key: string) => key },
        $q: {
          screen: { lt: { sm: false } },
          dark: { isActive: false },
        },
      },
      config: {
        globalProperties: {
          formatCurrency: (value: number, unit: string) => `${value} ${unit}`,
        },
      },
    },
  });

  return { wrapper, pinia };
}

describe("PayInvoiceDialog interactions", () => {
  it("shows a balance warning chip and blocks payment when the balance is too low", async () => {
    const { wrapper } = createMount({ activeBalance: 1, meltAmount: 5 });
    await nextTick();

    expect(wrapper.html()).toContain(
      "PayInvoiceDialog.invoice.balance_too_low_warning_text",
    );

    const payButton = wrapper
      .findAll("button")
      .find((btn) =>
        btn.text().includes("PayInvoiceDialog.invoice.actions.pay.label"),
      );
    expect(payButton).toBeUndefined();
  });

  it("renders the pay action once the user has sufficient balance again", async () => {
    const { wrapper } = createMount({ activeBalance: 1, meltAmount: 5 });
    await nextTick();

    const mintsStore = useMintsStore();
    mintsStore.activeBalance = 10;
    mintsStore.totalUnitBalance = 10;

    await nextTick();

    expect(wrapper.html()).not.toContain(
      "PayInvoiceDialog.invoice.balance_too_low_warning_text",
    );

    const payButton = wrapper
      .findAll("button")
      .find((btn) =>
        btn.text().includes("PayInvoiceDialog.invoice.actions.pay.label"),
      );

    expect(payButton).toBeDefined();
    expect(payButton!.attributes()["disabled"]).toBeUndefined();
  });

  it("disables the pay button and surfaces the error label when quoting fails", async () => {
    const { wrapper } = createMount({
      activeBalance: 10,
      meltAmount: 0,
      meltError: "network down",
    });
    const mintsStore = useMintsStore();
    mintsStore.activeBalance = 10;
    mintsStore.totalUnitBalance = 10;
    await nextTick();
    await nextTick();

    expect(wrapper.html()).toContain(
      "PayInvoiceDialog.invoice.actions.pay.error",
    );

    const disabledButton = wrapper.find("button[disabled]");
    expect(disabledButton.exists()).toBe(true);
  });
});
