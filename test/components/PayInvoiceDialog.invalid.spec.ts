import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { nextTick } from "vue";

import PayInvoiceDialog from "src/components/PayInvoiceDialog.vue";
import { useWalletStore } from "src/stores/wallet";
import { useBucketsStore } from "src/stores/buckets";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

const simpleStub = { template: "<div><slot /></div>" };

const qBtnStub = {
  name: "QBtnStub",
  inheritAttrs: true,
  props: ["label", "loading", "color", "rounded", "unelevated", "textColor"],
  emits: ["click"],
  template: `
    <button
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
  inheritAttrs: true,
  props: [
    "modelValue",
    "label",
    "type",
    "min",
    "max",
    "readonly",
    "dense",
    "outlined",
    "autofocus",
  ],
  emits: ["update:modelValue"],
  template: `
    <label>
      <span v-if="label">{{ label }}</span>
      <input
        :value="modelValue"
        :type="type || 'text'"
        :readonly="readonly"
        :min="min"
        :max="max"
        @input="$emit('update:modelValue', $event.target.value)"
      />
      <slot />
    </label>
  `,
};

const qFormStub = {
  name: "QFormStub",
  emits: ["submit"],
  template: `
    <form @submit.prevent="onSubmit">
      <slot />
    </form>
  `,
  methods: {
    onSubmit(event: SubmitEvent) {
      const target = event.target as HTMLFormElement;
      const isValid =
        typeof target?.checkValidity === "function" ? target.checkValidity() : true;
      if (isValid) {
        this.$emit("submit", event);
      }
    },
  },
};

function mountDialog(options?: {
  meltError?: string;
  meltAmount?: number;
  activeBalance?: number;
  lnurl?: {
    minSendable: number;
    maxSendable: number;
  };
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
            response: { amount: options?.meltAmount ?? 5 },
            error: options?.meltError ?? "",
          },
          invoice: { description: "Invoice memo" },
          lnurlpay: options?.lnurl
            ? {
                domain: "pay.me",
                callback: "https://pay.me/callback",
                minSendable: options.lnurl.minSendable,
                maxSendable: options.lnurl.maxSendable,
                commentAllowed: 120,
                metadata: {},
                routes: [],
                tag: "payRequest",
                targetUser: "Payee",
                description: "Test description",
              }
            : null,
          lnurlauth: null,
          input: {
            request: "",
            comment: "",
            amount: options?.lnurl ? null : 0,
            quote: "",
          },
        },
      },
      mints: {
        activeBalance: options?.activeBalance ?? 10,
        totalUnitBalance: options?.activeBalance ?? 10,
        activeUnit: "sat",
        activeProofs: [],
        mints: [{}],
        addMintBlocking: false,
        activeMintUrl: "https://mint",
      },
      price: { bitcoinPrice: 0 },
      ui: { tickerShort: "sat", globalMutexLock: false },
      camera: { camera: { show: false }, hasCamera: false },
      buckets: {
        bucketList: [{ id: DEFAULT_BUCKET_ID, name: "Main" }],
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
        "q-banner": simpleStub,
        "q-btn": qBtnStub,
        "q-select": simpleStub,
        "q-form": qFormStub,
        "q-input": qInputStub,
        "q-separator": simpleStub,
        "q-img": simpleStub,
        "q-spinner-hourglass": simpleStub,
        ToggleUnit: simpleStub,
        ChooseMint: simpleStub,
        "i18n-t": simpleStub,
      },
      mocks: {
        $t: (key: string) => key,
        $i18n: { t: (key: string) => key },
        $q: { screen: { lt: { sm: false } }, dark: { isActive: false } },
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

describe("PayInvoiceDialog invalid states", () => {
  it("disables the pay action when the invoice quote reports an error and re-enables after recovery", async () => {
    const { wrapper } = mountDialog({
      meltError: "invalid invoice",
      meltAmount: 2,
      activeBalance: 50,
    });

    await nextTick();

    const errorButton = wrapper
      .findAll("button")
      .find((btn) =>
        btn.text().includes("PayInvoiceDialog.invoice.actions.pay.error"),
      );

    expect(errorButton).toBeDefined();
    expect(errorButton!.attributes()["disabled"]).toBeDefined();

    const walletStore = useWalletStore();
    walletStore.payInvoiceData.meltQuote.error = "";

    await nextTick();

    const payButton = wrapper
      .findAll("button")
      .find((btn) =>
        btn.text().includes("PayInvoiceDialog.invoice.actions.pay.label"),
      );

    expect(payButton).toBeDefined();
    expect(payButton!.attributes()["disabled"]).toBeUndefined();
  });

  it("shows LNURL helper text, blocks submission while invalid, and submits once the amount is corrected", async () => {
    const { wrapper } = mountDialog({
      activeBalance: 100,
      lnurl: { minSendable: 2000, maxSendable: 6000 },
    });

    await nextTick();

    expect(wrapper.html()).toContain(
      "PayInvoiceDialog.lnurlpay.amount_range_label",
    );

    const amountInput = wrapper.find("input[type='number']");
    expect(amountInput.exists()).toBe(true);
    expect(amountInput.attributes("min")).toBe("2");
    expect(amountInput.attributes("max")).toBe("6");

    const form = wrapper.find("form");
    expect(form.exists()).toBe(true);

    const walletStore = useWalletStore();
    walletStore.lnurlPaySecond = vi.fn();

    (form.element as HTMLFormElement).checkValidity = () => false;
    await form.trigger("submit.prevent");

    expect(walletStore.lnurlPaySecond).not.toHaveBeenCalled();

    walletStore.payInvoiceData.input.amount = 4;
    (form.element as HTMLFormElement).checkValidity = () => true;

    await nextTick();
    await form.trigger("submit.prevent");

    expect(walletStore.lnurlPaySecond).toHaveBeenCalledTimes(1);
  });
});
