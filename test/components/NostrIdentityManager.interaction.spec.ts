import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, reactive, ref } from "vue";

import NostrIdentityManager from "src/components/NostrIdentityManager.vue";

let nostrStoreMock: any;
let messengerStoreMock: any;
let settingsStoreMock: any;

vi.mock("pinia", () => ({
  storeToRefs: (store: any) => ({
    nip07SignerAvailable: store.nip07SignerAvailable,
  }),
}));

vi.mock("src/stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
}));

vi.mock("src/stores/messenger", () => ({
  useMessengerStore: () => messengerStoreMock,
}));

vi.mock("src/stores/settings", () => ({
  useSettingsStore: () => settingsStoreMock,
}));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

const SimpleWrapperStub = defineComponent({
  name: "SimpleWrapperStub",
  setup(_, { slots }) {
    return () => h("div", slots.default ? slots.default() : []);
  },
});

const QDialogStub = defineComponent({
  name: "QDialogStub",
  props: {
    modelValue: { type: Boolean, required: true },
  },
  emits: ["update:modelValue"],
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h(
            "div",
            { "data-dialog-open": "true" },
            slots.default ? slots.default() : [],
          )
        : null;
  },
});

const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: {
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    flat: { type: Boolean, default: false },
    dense: { type: Boolean, default: false },
    icon: { type: String, default: "" },
  },
  emits: ["click"],
  setup(props, { emit, slots }) {
    return () => {
      const children = [] as any[];
      if (slots.default) children.push(...slots.default());
      if (props.label) children.push(props.label);
      return h(
        "button",
        {
          type: "button",
          disabled: props.disable,
          "data-label": props.label,
          "data-icon": props.icon,
          "data-loading": props.loading ? "true" : "false",
          onClick: (event: MouseEvent) => emit("click", event),
        },
        children.length ? children : undefined,
      );
    };
  },
});

const QInputStub = defineComponent({
  name: "QInputStub",
  props: {
    modelValue: { type: [String, Number], default: "" },
    label: { type: String, default: "" },
    type: { type: String, default: "text" },
    dense: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "keyup"],
  setup(props, { emit }) {
    return () =>
      h("label", { "data-label": props.label }, [
        props.label ? h("span", props.label) : null,
        h("input", {
          value: props.modelValue,
          type: props.type || "text",
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
          onKeyup: (event: KeyboardEvent) => emit("keyup", event),
        }),
      ]);
  },
});

const QListStub = SimpleWrapperStub;
const QItemStub = SimpleWrapperStub;
const QItemSectionStub = SimpleWrapperStub;
const QTooltipStub = SimpleWrapperStub;
const QCardStub = SimpleWrapperStub;
const QCardSectionStub = SimpleWrapperStub;
const QCardActionsStub = SimpleWrapperStub;

function mountManager() {
  return mount(NostrIdentityManager, {
    global: {
      stubs: {
        "q-dialog": QDialogStub,
        "q-card": QCardStub,
        "q-card-section": QCardSectionStub,
        "q-card-actions": QCardActionsStub,
        "q-input": QInputStub,
        "q-btn": QBtnStub,
        "q-list": QListStub,
        "q-item": QItemStub,
        "q-item-section": QItemSectionStub,
        "q-tooltip": QTooltipStub,
      },
    },
  });
}

describe("NostrIdentityManager interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    nostrStoreMock = {
      activePrivateKeyNsec: "nsec-initial",
      npub: "npub-initial",
      nip07SignerAvailable: ref(false),
      checkNip07Signer: vi.fn().mockResolvedValue(true),
      connectBrowserSigner: vi.fn().mockImplementation(async () => {
        nostrStoreMock.activePrivateKeyNsec = "nsec-nip07";
        nostrStoreMock.npub = "npub-nip07";
      }),
      updateIdentity: vi.fn().mockImplementation(async (priv: string) => {
        nostrStoreMock.activePrivateKeyNsec = priv;
        nostrStoreMock.npub = "npub-updated";
      }),
    };

    settingsStoreMock = {
      defaultNostrRelays: ["wss://relay.one"],
    };

    messengerStoreMock = {
      aliases: reactive({ "npub-existing": "Existing" }),
      setAlias: vi.fn((key: string, value: string) => {
        if (value) {
          messengerStoreMock.aliases[key] = value;
        } else {
          delete messengerStoreMock.aliases[key];
        }
      }),
    };

    (window as any).nostr = {
      getPublicKey: vi.fn(),
    };
  });

  afterEach(() => {
    delete (window as any).nostr;
  });

  it("manages relays, aliases, and saves identity", async () => {
    const wrapper = mountManager();

    const openButton = wrapper.get('button[data-label="Identity / Relays"]');
    await openButton.trigger("click");
    await nextTick();

    const relayInput = wrapper.get('label[data-label="Add Relay"] input');
    await relayInput.setValue("wss://relay.two");
    await relayInput.trigger("keyup", { key: "Enter" });
    await nextTick();

    const relayDeleteButtons = wrapper.findAll('button[data-icon="delete"]');
    await relayDeleteButtons[0].trigger("click");
    await nextTick();

    expect((wrapper.vm as any).relays).toEqual(["wss://relay.two"]);

    const aliasPubkeyInput = wrapper.get('label[data-label="Pubkey"] input');
    await aliasPubkeyInput.setValue("npub-new");
    const aliasNameInput = wrapper.get('label[data-label="Alias"] input');
    await aliasNameInput.setValue("New Alias");

    const addAliasButton = wrapper.get('button[data-label="Add"]');
    await addAliasButton.trigger("click");
    await nextTick();

    expect(messengerStoreMock.setAlias).toHaveBeenCalledWith(
      "npub-new",
      "New Alias",
    );
    expect(messengerStoreMock.aliases).toHaveProperty("npub-new", "New Alias");

    const aliasDeleteButtons = wrapper.findAll('button[data-icon="delete"]');
    await aliasDeleteButtons[aliasDeleteButtons.length - 1].trigger("click");
    await nextTick();

    expect(messengerStoreMock.setAlias).toHaveBeenCalledWith("npub-new", "");
    expect(messengerStoreMock.aliases).not.toHaveProperty("npub-new");

    const privKeyInput = wrapper.get('label[data-label="Private Key"] input');
    await privKeyInput.setValue("nsec-updated");

    const saveButton = wrapper.get('button[data-label="Save"]');
    await saveButton.trigger("click");
    await flushPromises();

    expect(settingsStoreMock.defaultNostrRelays).toEqual(["wss://relay.two"]);
    expect(nostrStoreMock.updateIdentity).toHaveBeenCalledWith(
      "nsec-updated",
      ["wss://relay.two"],
    );
    expect((wrapper.vm as any).showDialog).toBe(false);
  });

  it("toggles signer availability and uses NIP-07", async () => {
    const wrapper = mountManager();

    const openButton = wrapper.get('button[data-label="Identity / Relays"]');
    await openButton.trigger("click");
    await nextTick();

    const useNip07Button = wrapper.get('button[data-label="Use NIP-07"]');
    expect(useNip07Button.attributes("disabled")).toBeDefined();

    nostrStoreMock.nip07SignerAvailable.value = true;
    await nextTick();

    expect(useNip07Button.attributes("disabled")).toBeUndefined();

    await useNip07Button.trigger("click");
    await flushPromises();

    expect(nostrStoreMock.checkNip07Signer).toHaveBeenCalledTimes(2);
    expect(nostrStoreMock.connectBrowserSigner).toHaveBeenCalledTimes(1);
    expect((wrapper.vm as any).showDialog).toBe(false);
    expect((wrapper.vm as any).pubKey).toBe("npub-nip07");
  });
});
