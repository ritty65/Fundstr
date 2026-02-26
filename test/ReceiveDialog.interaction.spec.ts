import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";

import ReceiveDialog from "src/components/ReceiveDialog.vue";
import { useUiStore } from "src/stores/ui";
import { useReceiveTokensStore } from "src/stores/receiveTokensStore";
import { useMintsStore } from "src/stores/mints";

const notifyMocks = vi.hoisted(() => ({
  notifyWarning: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("src/js/notify.ts", () => notifyMocks);

const qBtnStub = {
  name: "QBtnStub",
  emits: ["click"],
  template: `
    <button @click="$emit('click')">
      <slot />
    </button>
  `,
};

const simpleStub = { template: "<div><slot /></div>" };

function mountReceiveDialog() {
  const pinia = createTestingPinia({
    createSpy: vi.fn,
    initialState: {
      ui: {
        showReceiveDialog: true,
        showReceiveEcashDrawer: false,
        showInvoiceDetails: false,
      },
      receiveTokensStore: {
        showReceiveTokens: false,
        receiveData: {
          tokensBase64: "",
          label: "",
          description: "",
          bucketId: "default",
        },
      },
      wallet: {
        invoiceData: {
          amount: "",
          bolt11: "",
          hash: "",
          memo: "",
        },
      },
      mints: {
        mints: [],
        activeMintUrl: "",
      },
    },
  });

  const wrapper = mount(ReceiveDialog, {
    props: {
      modelValue: true,
    },
    global: {
      plugins: [pinia],
      stubs: {
        "q-dialog": simpleStub,
        "q-card": simpleStub,
        "q-card-section": simpleStub,
        "q-btn": qBtnStub,
        ReceiveEcashDrawer: simpleStub,
        XIcon: simpleStub,
        CoinsIcon: simpleStub,
        ZapIcon: simpleStub,
        ScanIcon: simpleStub,
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
    },
  });

  return { wrapper, pinia };
}

describe("ReceiveDialog interactions", () => {
  beforeEach(() => {
    notifyMocks.notifyWarning.mockClear();
  });

  it("warns and closes when attempting to request lightning payments without an active mint", async () => {
    const { wrapper } = mountReceiveDialog();

    const lightningButton = wrapper
      .findAll("button")
      .find((btn) =>
        btn.text().includes("ReceiveDialog.actions.lightning.label"),
      );

    expect(lightningButton).toBeDefined();

    await lightningButton!.trigger("click");

    const uiStore = useUiStore();
    const receiveStore = useReceiveTokensStore();
    const mintsStore = useMintsStore();

    expect(notifyMocks.notifyWarning).toHaveBeenCalledWith(
      "ReceiveDialog.actions.lightning.error_no_mints",
    );
    expect(uiStore.showReceiveDialog).toBe(false);
    expect(receiveStore.showReceiveTokens).toBe(false);
    expect(uiStore.showInvoiceDetails).toBe(false);
    expect(mintsStore.mints).toHaveLength(0);
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
  });
});
