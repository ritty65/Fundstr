import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { nextTick } from "vue";

import SendTokenDialog from "src/components/SendTokenDialog.vue";
import { useSendTokensStore } from "src/stores/sendTokensStore";
import { useMintsStore } from "src/stores/mints";
import { useUiStore } from "src/stores/ui";
import { useWalletStore } from "src/stores/wallet";
import { useWorkersStore } from "src/stores/workers";
import { useTokensStore } from "src/stores/tokens";
import { useProofsStore } from "src/stores/proofs";
import { useP2PKStore } from "src/stores/p2pk";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

const notifyMocks = vi.hoisted(() => ({
  notifyWarning: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock("src/js/notify", () => notifyMocks);
vi.mock("src/js/notify.ts", () => notifyMocks);

vi.mock("quasar", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    Dialog: { create: vi.fn(() => ({ onOk: vi.fn() })) },
    QSelect: actual.QSelect ?? { name: "QSelect", template: "<div><slot /></div>" },
  };
});

const urMocks = vi.hoisted(() => {
  class MockEncoder {
    nextPart = vi.fn(() => "fragment");
  }
  return {
    UR: { fromBuffer: vi.fn(() => ({})) },
    UREncoder: MockEncoder,
  };
});

vi.mock("@gandlaf21/bc-ur", () => urMocks);

vi.mock("src/composables/useClipboard", () => ({
  useClipboard: () => ({ copy: vi.fn() }),
}));

const notifyWarning = notifyMocks.notifyWarning;
const notifyError = notifyMocks.notifyError;

const qBtnStub = {
  name: "QBtnStub",
  props: ["label", "disable", "loading", "icon", "color", "flat", "rounded", "unelevated"],
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
  props: ["modelValue", "type", "label", "disable"],
  emits: ["update:modelValue", "keyup"],
  template: `
    <label>
      <span v-if="label">{{ label }}</span>
      <input
        :value="modelValue"
        :type="type || 'text'"
        :disabled="disable"
        @input="$emit('update:modelValue', $event.target.value)"
        @keyup="$emit('keyup', $event)"
      />
      <slot />
    </label>
  `,
};

const qToggleStub = {
  name: "QToggleStub",
  props: ["modelValue", "label"],
  emits: ["update:modelValue"],
  template: `
    <label>
      <input
        type="checkbox"
        :checked="modelValue"
        @change="$emit('update:modelValue', $event.target.checked)"
      />
      <span v-if="label">{{ label }}</span>
    </label>
  `,
};

const simpleStub = { template: "<div><slot /></div>" };

function mountSendTokenDialog(options?: {
  activeBalance?: number;
  amount?: number | null;
  showLockInput?: boolean;
  p2pkPubkey?: string;
  activeMintUrl?: string;
}) {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    stubActions: false,
    initialState: {
      sendTokensStore: {
        showSendTokens: true,
        showLockInput: options?.showLockInput ?? false,
        sendData: {
          amount: options?.amount ?? 0,
          historyAmount: null,
          memo: "",
          tokens: "",
          tokensBase64: "",
          p2pkPubkey: options?.p2pkPubkey ?? "",
          locktime: null,
          paymentRequest: null,
          historyToken: null,
          bucketId: DEFAULT_BUCKET_ID,
          anonymous: false,
        },
        recipientPubkey: "",
        sendViaNostr: false,
      },
      mints: {
        mints: [{}],
        activeProofs: [],
        activeUnit: "sat",
        activeUnitLabel: "Sats",
        activeUnitCurrencyMultiplyer: 1,
        activeMintUrl: options?.activeMintUrl ?? "https://mint",
        activeBalance: options?.activeBalance ?? 100,
      },
      ui: {
        tickerShort: "sat",
        canPasteFromClipboard: false,
        globalMutexLock: false,
        ndefSupported: false,
        offline: false,
        showNumericKeyboard: false,
      },
      wallet: {
        invoiceData: {},
        payInvoiceData: {},
        activeP2pk: { publicKey: "", privateKey: "" },
      },
      settings: {
        checkSentTokens: false,
        includeFeesInSendAmount: false,
        nfcEncoding: "", 
        useNumericKeyboard: false,
      },
      price: {
        bitcoinPrice: 0,
      },
      workers: {
        tokenWorkerRunning: false,
      },
      buckets: {
        bucketList: [
          { id: DEFAULT_BUCKET_ID, name: "Default", creatorPubkey: "" },
        ],
      },
      proofs: {},
      tokens: {},
      p2pk: {},
      camera: {
        camera: { show: false, data: null, camera: "auto" },
        hasCamera: false,
      },
    },
  });

  (window as any).windowMixin = {
    methods: {
      formatCurrency: (value: number | null, unit: string) =>
        `${value ?? ""} ${unit ?? ""}`.trim(),
    },
  };
  (globalThis as any).navigator =
    (globalThis as any).navigator || ({ permissions: { query: vi.fn() } } as any);

  const walletStore = useWalletStore();
  walletStore.send = vi.fn().mockResolvedValue({ _: null, sendProofs: [] });
  walletStore.coinSelect = vi.fn().mockReturnValue([[]]);
  walletStore.spendableProofs = vi.fn().mockReturnValue([]);
  walletStore.getFeesForProofs = vi.fn().mockReturnValue(0);
  walletStore.onTokenPaid = vi.fn();
  walletStore.mintWallet = vi.fn().mockReturnValue({});
  walletStore.checkTokenSpendable = vi.fn().mockReturnValue(true);
  Object.defineProperty(walletStore, "wallet", {
    get: () => ({}),
  });

  const tokensStore = useTokensStore();
  tokensStore.addPendingToken = vi.fn();
  tokensStore.setTokenPaid = vi.fn();
  tokensStore.deleteToken = vi.fn();

  const proofsStore = useProofsStore();
  proofsStore.serializeProofs = vi.fn().mockReturnValue("serialized");

  const p2pkStore = useP2PKStore();
  p2pkStore.isValidPubkey = vi.fn().mockReturnValue(true);
  p2pkStore.sendToLock = vi.fn();

  const workersStore = useWorkersStore();
  workersStore.clearAllWorkers = vi.fn();

  const mintsStore = useMintsStore();
  mintsStore.toggleUnit = vi.fn();

  const wrapper = mount(SendTokenDialog, {
    global: {
      plugins: [pinia],
      stubs: {
        "q-dialog": simpleStub,
        QDialog: simpleStub,
        "q-card": simpleStub,
        QCard: simpleStub,
        "q-card-section": simpleStub,
        QCardSection: simpleStub,
        "q-select": simpleStub,
        QSelect: simpleStub,
        "q-badge": simpleStub,
        "q-chip": simpleStub,
        "q-responsive": simpleStub,
        "q-linear-progress": simpleStub,
        "q-icon": simpleStub,
        "q-input": qInputStub,
        QInput: qInputStub,
        "q-toggle": qToggleStub,
        QToggle: qToggleStub,
        "q-btn": qBtnStub,
        QBtn: qBtnStub,
        "NumericKeyboard": simpleStub,
        "ChooseMint": simpleStub,
        "vue-qrcode": simpleStub,
      },
      mocks: {
        $t: (key: string) => key,
        $q: {
          screen: { lt: { sm: false } },
          dark: { isActive: false },
        },
        $i18n: { t: (key: string) => key },
      },
      config: {
        globalProperties: {
          formatCurrency: (value: number | null, unit?: string, _forceFiat?: boolean) =>
            `${value ?? ""}${unit ? ` ${unit}` : ""}`.trim(),
        },
      },
    },
  });

  return { wrapper, pinia, walletStore, p2pkStore };
}

describe("SendTokenDialog interactions", () => {
  beforeEach(() => {
    notifyWarning.mockClear();
    notifyError.mockClear();
  });

  it("warns when trying to send without selecting a mint", async () => {
    const { wrapper, walletStore } = mountSendTokenDialog({
      activeMintUrl: "",
      amount: 5,
    });

    await nextTick();
    await (wrapper.vm as unknown as { sendTokens: () => Promise<void> }).sendTokens();

    expect(notifyError).toHaveBeenCalledWith(
      "Select a mint in Wallet before sending.",
    );
    expect(walletStore.mintWallet).not.toHaveBeenCalled();
    expect(useSendTokensStore().showSendTokens).toBe(false);
  });

  it("warns when trying to lock without selecting a mint", async () => {
    const { wrapper, walletStore } = mountSendTokenDialog({
      activeMintUrl: "",
      amount: 5,
    });

    await nextTick();
    await (wrapper.vm as unknown as { lockTokens: () => Promise<void> }).lockTokens();

    expect(notifyError).toHaveBeenCalledWith(
      "Select a mint in Wallet before sending.",
    );
    expect(walletStore.mintWallet).not.toHaveBeenCalled();
    expect(useSendTokensStore().showSendTokens).toBe(false);
  });

  it("shows a disabled warning button when the amount exceeds the balance", async () => {
    const { wrapper } = mountSendTokenDialog({ activeBalance: 1, amount: 5 });
    await nextTick();
    expect(wrapper.html()).toContain(
      "SendTokenDialog.inputs.amount.invalid_too_much_error_text",
    );
  });

  it("warns when attempting to lock tokens without providing a public key", async () => {
    const { wrapper, walletStore } = mountSendTokenDialog({
      amount: 5,
      activeBalance: 10,
      showLockInput: true,
      p2pkPubkey: "",
    });
    await nextTick();
    await (wrapper.vm as unknown as { sendTokens: () => Promise<void> }).sendTokens();

    expect(notifyWarning).toHaveBeenCalledWith(
      "A public key is required for a locked token.",
    );
    expect(walletStore.send).not.toHaveBeenCalled();
  });

  it("resets recipient and anonymity flags when the dialog closes", async () => {
    mountSendTokenDialog({ amount: 1, activeBalance: 10 });
    await nextTick();
    const store = useSendTokensStore();
    store.sendData.paymentRequest = { bolt11: "test" } as any;
    store.sendData.anonymous = true;
    store.recipientPubkey = "npub123";
    store.sendViaNostr = true;

    store.showSendTokens = false;
    await nextTick();
    await nextTick();

    expect(store.sendData.paymentRequest).toBeNull();
    expect(store.sendData.anonymous).toBe(false);
    expect(store.recipientPubkey).toBe("");
    expect(store.sendViaNostr).toBe(false);
  });
});
