import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { nextTick } from "vue";

import ReceiveTokenDialog from "src/components/ReceiveTokenDialog.vue";
import { useReceiveTokensStore } from "src/stores/receiveTokensStore";
import { useBucketsStore } from "src/stores/buckets";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { useTokensStore } from "src/stores/tokens";
import { useP2PKStore } from "src/stores/p2pk";

const notifyMocks = vi.hoisted(() => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("src/js/notify", () => notifyMocks);

const tokenMocks = vi.hoisted(() => ({
  decode: vi.fn(() => ({})),
  getProofs: vi.fn(() => []),
  getMint: vi.fn(() => "https://mint"),
  getUnit: vi.fn(() => "sat"),
}));

vi.mock("src/js/token", () => ({
  ...tokenMocks,
  default: tokenMocks,
}));

const qBtnStub = {
  name: "QBtnStub",
  props: [
    "label",
    "disable",
    "loading",
    "color",
    "rounded",
    "flat",
    "unelevated",
    "textColor",
    "dense",
  ],
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
  props: ["modelValue", "label", "type", "dense", "outlined", "spellcheck"],
  emits: ["update:modelValue", "keyup"],
  template: `
    <label>
      <span v-if="label">{{ label }}</span>
      <input
        :value="modelValue"
        :type="type || 'text'"
        @input="$emit('update:modelValue', $event.target.value)"
        @keyup="$emit('keyup', $event)"
      />
      <slot />
    </label>
  `,
};

const simpleStub = { template: "<div><slot /></div>" };

declare global {
  interface Window {
    isSecureContext: boolean;
  }
}

function mountReceiveDialog(options?: {
  tokensBase64?: string;
  decodeReturns?: unknown;
}) {
  window.isSecureContext = false;

  const pinia = createTestingPinia({
    createSpy: vi.fn,
    stubActions: false,
    initialState: {
      receiveTokensStore: {
        showReceiveTokens: true,
        watchClipboardPaste: false,
        scanningCard: false,
        receiveData: {
          tokensBase64: options?.tokensBase64 ?? "",
          label: "",
          description: "",
          bucketId: DEFAULT_BUCKET_ID,
        },
      },
      ui: {
        tickerShort: "sat",
        ndefSupported: false,
        showReceiveDialog: false,
        formatCurrency: vi.fn(),
      },
      mints: {
        activeMintUrl: "https://mint",
        activeProofs: [],
        activeUnit: "sat",
        mints: [],
        addMintBlocking: false,
      },
      tokens: {
        historyTokens: [],
      },
      camera: {
        hasCamera: false,
        lastScannedResult: "",
      },
      buckets: {
        bucketList: [{ id: DEFAULT_BUCKET_ID, name: "Default" }],
      },
      price: {
        bitcoinPrice: 0,
      },
      settings: {
        enableReceiveSwaps: false,
      },
      pr: {
        enablePaymentRequest: false,
        showPRDialog: false,
      },
      swap: {
        swapBlocking: false,
      },
      p2pk: {
        p2pkKeys: [],
      },
    },
  });

  const receiveStore = useReceiveTokensStore();
  receiveStore.decodeToken = vi
    .fn()
    .mockReturnValue(options?.decodeReturns ?? undefined);
  receiveStore.decodePeanut = vi.fn().mockReturnValue(undefined as any);
  receiveStore.knowThisMintOfTokenJson = vi.fn().mockReturnValue(false);
  receiveStore.receiveIfDecodes = vi.fn();
  receiveStore.pasteToParseDialog = vi.fn();
  receiveStore.toggleScanner = vi.fn();

  const bucketsStore = useBucketsStore();
  bucketsStore.autoBucketFor = vi.fn().mockReturnValue(null);

  const tokensStore = useTokensStore();
  tokensStore.addPendingToken = vi.fn();

  const p2pkStore = useP2PKStore();
  p2pkStore.getTokenLocktime = vi.fn().mockReturnValue(undefined);
  p2pkStore.getTokenPubkey = vi.fn().mockReturnValue("");

  const wrapper = mount(ReceiveTokenDialog, {
    global: {
      plugins: [pinia],
      stubs: {
        "q-dialog": simpleStub,
        "q-card": simpleStub,
        "q-card-section": simpleStub,
        "q-input": qInputStub,
        "q-btn": qBtnStub,
        "q-chip": simpleStub,
        "q-badge": simpleStub,
        "q-icon": simpleStub,
        "q-tooltip": simpleStub,
        "q-responsive": simpleStub,
        "q-linear-progress": simpleStub,
        QSelect: simpleStub,
        TokenInformation: simpleStub,
        ChooseMint: simpleStub,
        MintSettings: simpleStub,
        ToggleUnit: simpleStub,
        TokenActions: simpleStub,
        TokenMetadata: simpleStub,
        "i18n-t": simpleStub,
      },
      mocks: {
        $t: (key: string) => key,
        $i18n: { t: (key: string) => key },
        $q: {
          screen: { lt: { sm: false } },
          dark: { isActive: false },
          platform: { is: { mobile: false } },
        },
      },
      config: {
        globalProperties: {
          formatCurrency: (value: number, unit: string) => `${value} ${unit}`,
        },
      },
    },
  });

  return { wrapper, receiveStore };
}

describe("ReceiveTokenDialog invalid token handling", () => {
  beforeEach(() => {
    tokenMocks.getProofs.mockReturnValue([]);
  });

  it("shows an invalid token warning chip and hides receive actions when decoding fails", async () => {
    const { wrapper } = mountReceiveDialog({
      tokensBase64: "bad-token",
      decodeReturns: undefined,
    });

    await nextTick();

    expect(wrapper.html()).toContain(
      "ReceiveTokenDialog.errors.invalid_token.label",
    );

    const receiveButton = wrapper
      .findAll("button")
      .find((btn) =>
        btn.text().includes("ReceiveTokenDialog.actions.receive.label"),
      );

    expect(receiveButton).toBeUndefined();
  });

  it("restores the receive action once the token decodes successfully", async () => {
    const { wrapper, receiveStore } = mountReceiveDialog({
      tokensBase64: "bad-token",
      decodeReturns: undefined,
    });

    await nextTick();

    receiveStore.decodeToken = vi.fn().mockReturnValue({ token: [] });
    tokenMocks.getProofs.mockReturnValue([{ amount: 1 }]);

    receiveStore.receiveData.tokensBase64 = "good-token";
    await nextTick();

    expect(wrapper.html()).not.toContain(
      "ReceiveTokenDialog.errors.invalid_token.label",
    );

    const receiveButton = wrapper
      .findAll("button")
      .find((btn) =>
        btn.text().includes("ReceiveTokenDialog.actions.receive.label"),
      );

    expect(receiveButton).toBeDefined();
    expect(receiveButton!.attributes()["disabled"]).toBeUndefined();
  });
});
