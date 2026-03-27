import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, ref } from "vue";

import DonationCashuPanel from "src/components/DonationCashuPanel.vue";

const routerPush = vi.fn();
const closePrompt = vi.fn();
const fetchNutzapProfileMock = vi.fn();
const queryNutzapTiersMock = vi.fn();
const parseTiersContentMock = vi.fn();

const nostrStore = { pubkey: ref("") };
const mintsStore = {
  mints: ref([] as Array<{ url: string }>),
  activeMintUrl: ref(""),
};
const cashuStore = {
  loading: false,
  send: vi.fn().mockResolvedValue(undefined),
};

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (key === "DonationPrompt.cashu.priceLabel") {
        return `${params?.amount ?? ""} sats`;
      }
      return key;
    },
  }),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("stores/nostr", () => ({
  useNostrStore: () => nostrStore,
  fetchNutzapProfile: (...args: any[]) => fetchNutzapProfileMock(...args),
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStore,
}));

vi.mock("stores/cashu", () => ({
  useCashuStore: () => cashuStore,
}));

vi.mock("src/js/notify", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
}));

vi.mock("@/composables/useDonationPrompt", () => ({
  CASHU_SUPPORTER_NPUB: "npub1supporter",
  useDonationPrompt: () => ({ close: closePrompt }),
}));

vi.mock("@/nostr/relayClient", () => ({
  queryNutzapTiers: (...args: any[]) => queryNutzapTiersMock(...args),
}));

vi.mock("src/nutzap/profileShared", () => ({
  parseTiersContent: (...args: any[]) => parseTiersContentMock(...args),
}));

const simpleStub = { template: "<div><slot /></div>" };
const qBtnStub = {
  props: ["label", "disable", "loading"],
  emits: ["click"],
  template:
    '<button :disabled="disable" @click="$emit(\'click\')"><slot />{{ label }}</button>',
};
const qInputStub = defineComponent({
  props: ["modelValue", "type", "disable", "label", "min", "step", "inputmode"],
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h("label", [
        h("span", props.label as string),
        h("input", {
          type: (props.type as string) || "text",
          value: props.modelValue ?? "",
          disabled: props.disable,
          min: props.min,
          step: props.step,
          inputmode: props.inputmode,
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
        }),
      ]);
  },
});

function mountPanel() {
  return mount(DonationCashuPanel, {
    props: {
      supporterNpub: "npub1supporter",
      supporterDisplayName: "Fundstr",
      supporterAvatarUrl: "",
    },
    global: {
      stubs: {
        QAvatar: simpleStub,
        QBanner: simpleStub,
        QChip: simpleStub,
        QBtn: qBtnStub,
        QInput: qInputStub,
        QIcon: simpleStub,
        QSkeleton: simpleStub,
      },
    },
  });
}

describe("DonationCashuPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nostrStore.pubkey.value = "";
    mintsStore.mints.value = [];
    mintsStore.activeMintUrl.value = "";
    cashuStore.loading = false;
    cashuStore.send = vi.fn().mockResolvedValue(undefined) as any;
    fetchNutzapProfileMock.mockResolvedValue({
      hexPub: "a".repeat(64),
      trustedMints: ["https://mint.minibits.cash/Bitcoin"],
    });
    queryNutzapTiersMock.mockResolvedValue({ content: "tiers" });
    parseTiersContentMock.mockReturnValue([{ price: 5000 }, { price: 50000 }]);
  });

  it("keeps the custom amount input enabled even before wallet setup", async () => {
    const wrapper = mountPanel();
    await flushPromises();

    const input = wrapper.find('input[type="number"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes("disabled")).toBeUndefined();

    await input.setValue("12345");

    expect((input.element as HTMLInputElement).value).toBe("12345");
  });

  it("clears the active preset when the user types a custom amount", async () => {
    const wrapper = mountPanel();
    await flushPromises();

    const presetButtons = wrapper.findAll(".cashu-panel__preset");
    expect(presetButtons.length).toBeGreaterThan(0);

    await presetButtons[presetButtons.length - 1]!.trigger("click");
    expect(
      wrapper.findAll(".cashu-panel__preset--active").length,
    ).toBeGreaterThan(0);

    const input = wrapper.find('input[type="number"]');
    await input.setValue("12345");

    expect(wrapper.findAll(".cashu-panel__preset--active")).toHaveLength(0);
    expect((input.element as HTMLInputElement).value).toBe("12345");
  });
});
