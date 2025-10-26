import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

import SendDialog from "src/components/SendDialog.vue";
import { useUiStore } from "src/stores/ui";
import { useWalletStore } from "src/stores/wallet";
import { useSendTokensStore } from "src/stores/sendTokensStore";
import { useCameraStore } from "src/stores/camera";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

const notifyMocks = vi.hoisted(() => ({
  notifyWarning: vi.fn(),
}));

vi.mock("src/js/notify", () => notifyMocks);

const notifyWarning = notifyMocks.notifyWarning;

const qBtnStub = {
  name: "QBtnStub",
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

const basePayInvoiceData = () => ({
  show: false,
  invoice: { sat: 1, memo: "memo", bolt11: "bolt" },
  lnurlpay: { domain: "domain", callback: "", minSendable: 0, maxSendable: 0, metadata: {}, successAction: {}, routes: [], tag: "" },
  lnurlauth: { k1: "value" },
  input: {
    request: "old-request",
    comment: "old-comment",
    amount: 1,
    quote: "quote",
    paymentChecker: { id: 1 },
  },
  domain: "domain",
});

function mountSendDialog(options?: {
  mints?: Array<Record<string, unknown>>;
}) {
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
        invoiceData: { memo: "existing" },
        payInvoiceData: basePayInvoiceData(),
      },
      sendTokensStore: {
        showSendTokens: false,
        showLockInput: true,
        sendData: {
          amount: 42,
          memo: "memo",
          tokens: "token",
          tokensBase64: "base",
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
        camera: { show: true, data: null, camera: "auto" },
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

describe("SendDialog interactions", () => {
  beforeEach(() => {
    notifyWarning.mockClear();
  });

  it("warns and closes when attempting to send tokens without mints", async () => {
    const { wrapper } = mountSendDialog({ mints: [] });
    const buttons = wrapper.findAll("button");
    const sendTokensButton = buttons.find((btn) =>
      btn.text().includes("SendDialog.actions.ecash.label"),
    );
    expect(sendTokensButton).toBeDefined();
    await sendTokensButton!.trigger("click");

    expect(notifyWarning).toHaveBeenCalledWith(
      "SendDialog.actions.ecash.error_no_mints",
    );

    const uiStore = useUiStore();
    const sendTokensStore = useSendTokensStore();

    expect(uiStore.showSendDialog).toBe(false);
    expect(sendTokensStore.showSendTokens).toBe(false);
  });

  it("resets send data and opens token dialog when mints are available", async () => {
    const { wrapper } = mountSendDialog({ mints: [{}] });
    const buttons = wrapper.findAll("button");
    const sendTokensButton = buttons.find((btn) =>
      btn.text().includes("SendDialog.actions.ecash.label"),
    );
    expect(sendTokensButton).toBeDefined();

    await sendTokensButton!.trigger("click");

    const sendTokensStore = useSendTokensStore();
    const uiStore = useUiStore();

    expect(sendTokensStore.showSendTokens).toBe(true);
    expect(uiStore.showSendDialog).toBe(false);
    expect(sendTokensStore.showLockInput).toBe(false);
    expect(sendTokensStore.sendData.tokens).toBe("");
    expect(sendTokensStore.sendData.tokensBase64).toBe("");
    expect(sendTokensStore.sendData.amount).toBeNull();
    expect(sendTokensStore.sendData.memo).toBe("");
    expect(sendTokensStore.sendData.p2pkPubkey).toBe("");
    expect(sendTokensStore.sendData.paymentRequest).toBeUndefined();
    expect(sendTokensStore.sendData.bucketId).toBe(DEFAULT_BUCKET_ID);
  });

  it("warns and closes when parsing lightning without mints", async () => {
    const { wrapper } = mountSendDialog({ mints: [] });
    const buttons = wrapper.findAll("button");
    const lightningButton = buttons.find((btn) =>
      btn.text().includes("SendDialog.actions.lightning.label"),
    );
    expect(lightningButton).toBeDefined();

    await lightningButton!.trigger("click");

    expect(notifyWarning).toHaveBeenCalledWith(
      "SendDialog.actions.lightning.error_no_mints",
    );
    const uiStore = useUiStore();
    expect(uiStore.showSendDialog).toBe(false);
  });

  it("prepares pay invoice data when parsing lightning succeeds", async () => {
    const { wrapper } = mountSendDialog({ mints: [{}] });
    const buttons = wrapper.findAll("button");
    const lightningButton = buttons.find((btn) =>
      btn.text().includes("SendDialog.actions.lightning.label"),
    );
    expect(lightningButton).toBeDefined();

    await lightningButton!.trigger("click");

    const walletStore = useWalletStore();
    const cameraStore = useCameraStore();
    const uiStore = useUiStore();

    expect(walletStore.payInvoiceData.show).toBe(true);
    expect(walletStore.payInvoiceData.invoice).toBeNull();
    expect(walletStore.payInvoiceData.lnurlpay).toBeNull();
    expect(walletStore.payInvoiceData.lnurlauth).toBeNull();
    expect(walletStore.payInvoiceData.domain).toBe("");
    expect(walletStore.payInvoiceData.input.request).toBe("");
    expect(walletStore.payInvoiceData.input.comment).toBe("");
    expect(walletStore.payInvoiceData.input.paymentChecker).toBeNull();
    expect(cameraStore.camera.show).toBe(false);
    expect(uiStore.showSendDialog).toBe(false);
  });
});
