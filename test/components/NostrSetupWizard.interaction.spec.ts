import { describe, it, beforeEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import {
  defineComponent,
  computed,
  provide,
  inject,
  h,
  nextTick,
  type Ref,
} from "vue";

import NostrSetupWizard from "src/components/NostrSetupWizard.vue";

let nostrStoreMock: any;
let messengerStoreMock: any;

vi.mock("src/stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
}));

vi.mock("src/stores/messenger", () => ({
  useMessengerStore: () => messengerStoreMock,
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
  props: { modelValue: { type: Boolean, default: true } },
  emits: ["update:modelValue"],
  setup(_, { slots }) {
    return () => h("div", slots.default ? slots.default() : []);
  },
});

const QStepperStub = defineComponent({
  name: "QStepperStub",
  props: { modelValue: { type: Number, required: true } },
  emits: ["update:modelValue"],
  setup(props, { emit, slots }) {
    const model = computed({
      get: () => props.modelValue,
      set: (value: number) => emit("update:modelValue", value),
    });
    provide("stepperModel", model);
    return () => h("div", slots.default ? slots.default() : []);
  },
});

const QStepStub = defineComponent({
  name: "QStepStub",
  props: { name: { type: Number, required: true } },
  setup(props, { slots }) {
    const model = inject<Ref<number> | undefined>("stepperModel");
    return () =>
      model && model.value === props.name
        ? h("div", slots.default ? slots.default() : [])
        : null;
  },
});

const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: {
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
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

const QOptionGroupStub = defineComponent({
  name: "QOptionGroupStub",
  props: {
    modelValue: { type: String, default: "" },
    options: { type: Array as () => Array<{ label: string; value: string }>, default: () => [] },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h(
        "div",
        props.options.map((option) =>
          h("label", { key: option.value }, [
            h("input", {
              type: "radio",
              value: option.value,
              checked: option.value === props.modelValue,
              onChange: () => emit("update:modelValue", option.value),
            }),
            option.label,
          ]),
        ),
      );
  },
});

const QInputStub = defineComponent({
  name: "QInputStub",
  props: {
    modelValue: { type: String, default: "" },
    label: { type: String, default: "" },
    type: { type: String, default: "text" },
  },
  emits: ["update:modelValue", "keyup"],
  setup(props, { emit }) {
    return () =>
      h("label", [
        props.label ? h("span", props.label) : null,
        h("input", {
          value: props.modelValue,
          type: props.type || "text",
          onInput: (event: Event) =>
            emit(
              "update:modelValue",
              (event.target as HTMLInputElement).value,
            ),
          onKeyup: (event: KeyboardEvent) => emit("keyup", event),
        }),
      ]);
  },
});

const QListStub = SimpleWrapperStub;
const QItemStub = SimpleWrapperStub;
const QItemSectionStub = SimpleWrapperStub;
const QSpinnerStub = SimpleWrapperStub;

function mountWizard() {
  return mount(NostrSetupWizard, {
    props: {
      modelValue: true,
    },
    global: {
      stubs: {
        "q-dialog": QDialogStub,
        "q-card": SimpleWrapperStub,
        "q-card-section": SimpleWrapperStub,
        "q-stepper": QStepperStub,
        "q-step": QStepStub,
        "q-option-group": QOptionGroupStub,
        "q-input": QInputStub,
        "q-btn": QBtnStub,
        "q-list": QListStub,
        "q-item": QItemStub,
        "q-item-section": QItemSectionStub,
        "q-spinner": QSpinnerStub,
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });
}

describe("NostrSetupWizard interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nostrStoreMock = {
      activePrivateKeyNsec: "",
      initPrivateKeySigner: vi.fn().mockResolvedValue(undefined),
      checkNip07Signer: vi.fn().mockResolvedValue(true),
      connectBrowserSigner: vi.fn().mockResolvedValue(undefined),
    };
    messengerStoreMock = {
      relays: ["wss://relay.one"],
      connect: vi.fn().mockImplementation(async () => {
        messengerStoreMock.connected = true;
      }),
      connected: false,
    };
  });

  it("completes the private key flow including relay validation and finish emit", async () => {
    const wrapper = mountWizard();

    expect(wrapper.vm.step).toBe(1);

    const privateNextBtn = wrapper.find('[data-label="Next"]');
    await privateNextBtn.trigger("click");
    await nextTick();

    expect(nostrStoreMock.initPrivateKeySigner).not.toHaveBeenCalled();
    expect(wrapper.vm.step).toBe(1);

    const privateKeyInput = wrapper.find('input[type="text"]');
    await privateKeyInput.setValue(" nsec123 ");
    await privateNextBtn.trigger("click");
    await flushPromises();
    await nextTick();

    expect(nostrStoreMock.initPrivateKeySigner).toHaveBeenCalledWith("nsec123");
    expect(wrapper.vm.step).toBe(2);

    const deleteRelayBtn = wrapper.find('[data-icon="delete"]');
    await deleteRelayBtn.trigger("click");
    await nextTick();

    const relaysNextBtn = wrapper.find('[data-label="Next"]');
    await relaysNextBtn.trigger("click");
    await nextTick();
    expect(wrapper.vm.step).toBe(2);

    const relayInput = wrapper.find('input[type="text"]');
    await relayInput.setValue("wss://relay.new");
    await relayInput.trigger("keyup", { key: "Enter" });
    await nextTick();

    expect(wrapper.vm.relays).toEqual(["wss://relay.new"]);

    await relaysNextBtn.trigger("click");
    await nextTick();
    expect(wrapper.vm.step).toBe(3);

    const connectBtn = wrapper.find('[data-label="Connect"]');
    await connectBtn.trigger("click");
    await flushPromises();
    await nextTick();

    expect(messengerStoreMock.connect).toHaveBeenCalledWith(["wss://relay.new"]);
    expect(wrapper.vm.connected).toBe(true);

    const finishBtn = wrapper.find('[data-label="Finish"]');
    await finishBtn.trigger("click");

    expect(wrapper.emitted("complete")).toBeTruthy();
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual([false]);
  });

  it("handles the extension flow and surfaces connection errors", async () => {
    nostrStoreMock.checkNip07Signer
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const wrapper = mountWizard();

    const extensionRadio = wrapper.find('input[value="extension"]');
    await extensionRadio.setChecked();
    await nextTick();

    const connectExtensionBtn = wrapper.find('[data-label="Connect Extension"]');

    await connectExtensionBtn.trigger("click");
    await flushPromises();
    await nextTick();

    expect(nostrStoreMock.checkNip07Signer).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("No NIP-07 extension detected");
    expect(wrapper.vm.step).toBe(1);

    await connectExtensionBtn.trigger("click");
    await flushPromises();
    await nextTick();

    expect(nostrStoreMock.checkNip07Signer).toHaveBeenCalledTimes(2);
    expect(nostrStoreMock.connectBrowserSigner).toHaveBeenCalledTimes(1);
    expect(wrapper.vm.step).toBe(2);

    const relaysNextBtn = wrapper.find('[data-label="Next"]');
    await relaysNextBtn.trigger("click");
    await nextTick();
    expect(wrapper.vm.step).toBe(3);

    messengerStoreMock.connect.mockImplementationOnce(async () => {
      messengerStoreMock.connected = false;
      throw new Error("Connection failed");
    });

    const connectBtn = wrapper.find('[data-label="Connect"]');
    await connectBtn.trigger("click");
    await flushPromises();
    await nextTick();

    expect(messengerStoreMock.connect).toHaveBeenCalledWith([
      "wss://relay.one",
    ]);
    expect(wrapper.text()).toContain("Connection failed");
    expect(wrapper.find('[data-label="Finish"]').exists()).toBe(false);
    expect(wrapper.vm.connected).toBe(false);
  });
});
