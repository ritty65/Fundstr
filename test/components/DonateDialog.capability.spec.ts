import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { nextTick, ref } from "vue";

import DonateDialog from "src/components/DonateDialog.vue";

const bucketList = ref([{ id: "default", name: "Default" }]);
const bucketBalances = ref<Record<string, number>>({ default: 12 });

const bucketsStoreMock = {
  bucketList,
  bucketBalances,
};

const activeUnit = ref("sat");
const activeProofs = ref<any[]>([{ amount: 8, bucketId: "default" }]);
const activeUnitCurrencyMultiplyer = ref(1);
const activeMintUrl = ref("https://mint.example");
const activeInfo = ref<any>({
  nuts: {
    4: { methods: [], disabled: false },
    10: { supported: true },
    11: { supported: true },
    14: { supported: true },
  },
});

const mintsStoreMock = {
  activeUnit,
  activeProofs,
  activeUnitCurrencyMultiplyer,
  get activeMintUrl() {
    return activeMintUrl.value;
  },
  get activeInfo() {
    return activeInfo.value;
  },
};

const proofsStoreMock = {
  getUnreservedProofs: vi.fn((proofs: any[]) => proofs),
};

const walletStoreMock = {
  wallet: {},
  coinSelect: vi.fn((proofs: any[]) => proofs),
  getFeesForProofs: vi.fn(() => 0),
};

const settingsStoreMock = {
  includeFeesInSendAmount: ref(false),
};

const donationStoreMock = {
  presets: [{ periods: 1 }, { periods: 3 }],
};

vi.mock("stores/buckets", () => ({
  useBucketsStore: () => bucketsStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => ({
    formatCurrency: (value: number, unit: string) => `${value} ${unit}`,
  }),
}));

vi.mock("stores/donationPresets", () => ({
  useDonationPresetsStore: () => donationStoreMock,
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => proofsStoreMock,
}));

vi.mock("stores/settings", () => ({
  useSettingsStore: () => settingsStoreMock,
}));

vi.mock("stores/wallet", () => ({
  useWalletStore: () => walletStoreMock,
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

const simpleStub = { template: "<div><slot /></div>" };

const qBtnStub = {
  props: ["label", "disable"],
  emits: ["click"],
  template: `<button :disabled="disable" @click="$emit('click')"><slot />{{ label }}</button>`,
};

const qInputStub = {
  props: ["modelValue", "label", "type", "errorMessage"],
  emits: ["update:modelValue"],
  template: `<label><span>{{ label }}</span><input :type="type || 'text'" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" /><div v-if="errorMessage">{{ errorMessage }}</div></label>`,
};

const qSelectStub = {
  props: ["modelValue", "options", "label"],
  emits: ["update:modelValue"],
  template: `<label><span>{{ label }}</span><select :value="modelValue" @input="$emit('update:modelValue', $event.target.value)"><option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>`,
};

const qBannerStub = {
  template: `<div class="q-banner"><slot /><slot name="avatar"></slot></div>`,
};

const qChipStub = {
  props: ["clickable"],
  emits: ["click"],
  template: `<button type="button" @click="$emit('click')"><slot /></button>`,
};

const qOptionGroupStub = {
  props: ["modelValue", "options"],
  emits: ["update:modelValue"],
  template: `<div><button v-for="option in options" :key="option.value" type="button" @click="$emit('update:modelValue', option.value)">{{ option.label }}</button></div>`,
};

const qExpansionItemStub = {
  props: ["modelValue", "label", "caption"],
  emits: ["update:modelValue"],
  template: `<div class="q-expansion-item"><div>{{ label }}</div><div>{{ caption }}</div><slot /></div>`,
};

function mountDialog(props?: Record<string, unknown>) {
  return mount(DonateDialog, {
    props: {
      modelValue: true,
      creatorPubkey: "npub-creator",
      creatorName: "Creator",
      creatorTrustedMints: ["https://mint.example"],
      ...props,
    },
    global: {
      stubs: {
        "q-dialog": simpleStub,
        "q-card": simpleStub,
        "q-card-section": simpleStub,
        "q-card-actions": simpleStub,
        "q-select": qSelectStub,
        "q-input": qInputStub,
        "q-banner": qBannerStub,
        "q-btn": qBtnStub,
        "q-chip": qChipStub,
        "q-option-group": qOptionGroupStub,
        "q-expansion-item": qExpansionItemStub,
        "q-space": simpleStub,
        "q-icon": simpleStub,
      },
      mocks: {
        $t: (key: string) => key,
        $q: { screen: { lt: { sm: false } } },
      },
    },
  });
}

function getConfirmButton(wrapper: ReturnType<typeof mountDialog>) {
  return wrapper
    .findAll("button")
    .find((button) => /send|create/i.test(button.text()));
}

describe("DonateDialog capability states", () => {
  beforeEach(() => {
    bucketBalances.value = { default: 12 };
    activeMintUrl.value = "https://mint.example";
    activeInfo.value = {
      nuts: {
        4: { methods: [], disabled: false },
        10: { supported: true },
        11: { supported: true },
        14: { supported: true },
      },
    };
    activeProofs.value = [{ amount: 8, bucketId: "default" }];
    proofsStoreMock.getUnreservedProofs.mockImplementation(
      (proofs: any[]) => proofs,
    );
    walletStoreMock.coinSelect.mockImplementation((proofs: any[]) => proofs);
    walletStoreMock.getFeesForProofs.mockReturnValue(0);
  });

  it("blocks donations when the active mint is not creator-trusted", async () => {
    const wrapper = mountDialog({
      creatorTrustedMints: ["https://creator-only.example"],
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.html()).toContain("Switch to a creator-trusted mint");
    expect(getConfirmButton(wrapper)?.attributes("disabled")).toBeDefined();
  });

  it("allows exact-match one-time gifts on exact-only mints", async () => {
    activeInfo.value = {
      nuts: {
        10: { supported: true },
        11: { supported: true },
        14: { supported: true },
      },
    };
    const wrapper = mountDialog();

    await nextTick();
    (wrapper.vm as any).amount = 8;
    await nextTick();

    expect(wrapper.html()).toContain("Exact-match one-time gifts only");
    expect(wrapper.html()).toContain("Exact-match donation available");
    expect(getConfirmButton(wrapper)?.attributes("disabled")).toBeUndefined();
  });

  it("blocks scheduled donations on exact-only mints", async () => {
    activeInfo.value = {
      nuts: {
        10: { supported: true },
        11: { supported: true },
        14: { supported: true },
      },
    };
    const wrapper = mountDialog();

    await nextTick();
    (wrapper.vm as any).type = "schedule";
    (wrapper.vm as any).amount = 8;
    await nextTick();

    expect(wrapper.html()).toContain("This donation mode needs split support");
    expect(getConfirmButton(wrapper)?.attributes("disabled")).toBeDefined();
  });
});
