import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { nextTick } from "vue";

import SendDialog from "src/components/SendDialog.vue";
import { useUiStore } from "src/stores/ui";
import { useSendTokensStore } from "src/stores/sendTokensStore";
import { useMintsStore } from "src/stores/mints";
import { useWalletStore } from "src/stores/wallet";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

const notifyMocks = vi.hoisted(() => ({
  notifyWarning: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("src/js/notify", () => notifyMocks);

const qBtnStub = {
  name: "QBtnStub",
  inheritAttrs: true,
  props: ["label", "disable", "loading"],
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

function mountDialog(options?: { mints?: Array<Record<string, unknown>> }) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    stubActions: false,
    initialState: {
      mints: {
        mints: options?.mints ?? [],
      },
      ui: {
        showSendDialog: true,
        showInvoiceDetails: false,
        showReceiveDialog: false,
        tab: "home",
      },
      wallet: {
        invoiceData: {},
        payInvoiceData: {
          show: false,
          invoice: null,
          lnurlpay: null,
          lnurlauth: null,
          input: { request: "", comment: "", amount: null, quote: "" },
          domain: "",
        },
      },
      sendTokensStore: {
        showSendTokens: false,
        showLockInput: true,
        sendData: {
          tokens: "cached",
          tokensBase64: "cached",
          amount: 42,
          memo: "memo",
          p2pkPubkey: "pub",
          paymentRequest: { request: "bolt" },
          bucketId: "custom",
          historyAmount: null,
          historyToken: undefined,
          locktime: null,
          anonymous: true,
        },
      },
      camera: {
        camera: { show: false },
      },
      invoiceHistory: {
        invoiceHistory: [],
      },
    },
  });

  (window as any).windowMixin = {
    methods: {
      formatCurrency: (value: unknown) => String(value ?? ""),
    },
  };

  const wrapper = mount(SendDialog, {
    global: {
      plugins: [pinia],
      stubs: {
        "q-dialog": { template: "<div><slot /></div>" },
        "q-card": { template: "<div><slot /></div>" },
        "q-card-section": { template: "<section><slot /></section>" },
        "q-btn": qBtnStub,
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

  return { wrapper, pinia };
}

describe("SendDialog invalid states", () => {
  beforeEach(() => {
    notifyMocks.notifyWarning.mockClear();
  });

  it("blocks token sending when no mints exist and allows it once a mint is added", async () => {
    const { wrapper } = mountDialog({ mints: [] });

    const buttons = wrapper.findAll("button");
    const ecashButton = buttons.find((btn) =>
      btn.text().includes("SendDialog.actions.ecash.label"),
    );
    expect(ecashButton).toBeDefined();

    await ecashButton!.trigger("click");

    expect(notifyMocks.notifyWarning).toHaveBeenCalledWith(
      "SendDialog.actions.ecash.error_no_mints",
    );

    const uiStore = useUiStore();
    const sendTokensStore = useSendTokensStore();

    expect(uiStore.showSendDialog).toBe(false);
    expect(sendTokensStore.showSendTokens).toBe(false);

    notifyMocks.notifyWarning.mockClear();

    const mintsStore = useMintsStore();
    mintsStore.mints = [{}];
    uiStore.showSendDialog = true;

    await nextTick();
    await ecashButton!.trigger("click");

    expect(sendTokensStore.showSendTokens).toBe(true);
    expect(sendTokensStore.showLockInput).toBe(false);
    expect(sendTokensStore.sendData.tokens).toBe("");
    expect(sendTokensStore.sendData.tokensBase64).toBe("");
    expect(sendTokensStore.sendData.amount).toBeNull();
    expect(sendTokensStore.sendData.bucketId).toBe(DEFAULT_BUCKET_ID);
    expect(notifyMocks.notifyWarning).not.toHaveBeenCalled();
  });

  it("prevents lightning parsing without mints and resumes once balance sources are present", async () => {
    const { wrapper } = mountDialog({ mints: [] });

    const lightningButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("SendDialog.actions.lightning.label"));

    expect(lightningButton).toBeDefined();

    await lightningButton!.trigger("click");

    expect(notifyMocks.notifyWarning).toHaveBeenCalledWith(
      "SendDialog.actions.lightning.error_no_mints",
    );

    const uiStore = useUiStore();
    expect(uiStore.showSendDialog).toBe(false);

    notifyMocks.notifyWarning.mockClear();

    const mintsStore = useMintsStore();
    mintsStore.mints = [{}];
    uiStore.showSendDialog = true;

    await nextTick();
    await lightningButton!.trigger("click");

    const walletStore = useWalletStore();

    expect(walletStore.payInvoiceData.show).toBe(true);
    expect(walletStore.payInvoiceData.invoice).toBeNull();
    expect(walletStore.payInvoiceData.lnurlpay).toBeNull();
    expect(walletStore.payInvoiceData.input.request).toBe("");
    expect(notifyMocks.notifyWarning).not.toHaveBeenCalled();
  });
});
