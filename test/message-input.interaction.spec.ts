import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, ref, watch } from "vue";

import MessageInput from "src/components/MessageInput.vue";

const QInputStub = defineComponent({
  name: "QInput",
  props: {
    modelValue: {
      type: String,
      default: "",
    },
  },
  emits: ["update:modelValue"],
  inheritAttrs: false,
  setup(props, { emit, slots, attrs }) {
    const localValue = ref(props.modelValue);

    watch(
      () => props.modelValue,
      (val) => {
        if (val !== localValue.value) {
          localValue.value = val;
        }
      },
    );

    const update = (event: Event) => {
      const target = event.target as HTMLInputElement;
      localValue.value = target.value;
      emit("update:modelValue", target.value);
    };

    const onKeyup = (event: KeyboardEvent) => {
      const handler = attrs.onKeyup as ((e: KeyboardEvent) => void) | undefined;
      handler?.(event);
    };

    return () =>
      h(
        "div",
        { class: "q-input-stub" },
        [
          h("input", {
            value: localValue.value,
            onInput: update,
            onKeyup,
            type: "text",
          }),
          slots.append?.(),
        ],
      );
  },
});

const QBtnStub = defineComponent({
  name: "QBtn",
  props: {
    disable: Boolean,
    flat: Boolean,
    round: Boolean,
    color: String,
    icon: String,
  },
  emits: ["click"],
  inheritAttrs: false,
  setup(props, { emit, slots, attrs }) {
    const onClick = (event: MouseEvent) => {
      if (props.disable) {
        event.preventDefault();
        return;
      }
      emit("click", event);
    };

    return () =>
      h(
        "button",
        {
          type: "button",
          disabled: props.disable,
          "aria-label": attrs["aria-label"],
          onClick,
        },
        slots.default ? slots.default() : attrs.icon ? attrs.icon : [],
      );
  },
});

const QImgStub = defineComponent({
  name: "QImg",
  props: { src: String },
  setup(props) {
    return () => h("img", { src: props.src || "" });
  },
});

const NutIconStub = defineComponent({
  name: "NutIcon",
  setup() {
    return () => h("span", { class: "nut-icon" });
  },
});

describe("MessageInput", () => {
  const originalFileReader = global.FileReader;

  afterEach(() => {
    if (originalFileReader) {
      global.FileReader = originalFileReader;
    }
  });

  it("emits send payload with text and resets after clicking send", async () => {
    const wrapper = mount(MessageInput, {
      global: {
        stubs: {
          "q-input": QInputStub,
          "q-btn": QBtnStub,
          "q-img": QImgStub,
          NutIcon: NutIconStub,
        },
      },
    });

    const textInput = wrapper.find("input[type='text']");
    await textInput.setValue(" hello world ");

    const sendBtn = wrapper.find("button[aria-label='Send message']");
    expect(sendBtn.exists()).toBe(true);
    await sendBtn.trigger("click");

    const events = wrapper.emitted("send");
    expect(events).toBeTruthy();
    expect(events![0][0]).toEqual({ text: "hello world" });

    expect(wrapper.find("button[aria-label='Send message']").attributes("disabled")).toBeDefined();
  });

  it("reads attachment, shows preview, and includes attachment in payload", async () => {
    const loadSpy = vi.fn();
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsDataURL() {
        this.result = "data:image/png;base64,stub";
        this.onload?.();
      }
      addEventListener() {}
      removeEventListener() {}
    }
    Object.defineProperty(MockFileReader.prototype, "onload", {
      writable: true,
      value: null,
    });
    MockFileReader.prototype.readAsDataURL = function () {
      this.result = "data:image/png;base64,stub";
      loadSpy();
      if (typeof this.onload === "function") {
        this.onload();
      }
    };
    global.FileReader = MockFileReader as any;

    const wrapper = mount(MessageInput, {
      global: {
        stubs: {
          "q-input": QInputStub,
          "q-btn": QBtnStub,
          "q-img": QImgStub,
          NutIcon: NutIconStub,
        },
      },
    });

    const file = new File(["data"], "test.png", { type: "image/png" });
    const fileInput = wrapper.find("input[type='file']");
    Object.defineProperty(fileInput.element, "files", {
      value: [file],
      configurable: true,
    });
    await fileInput.trigger("change");

    expect(loadSpy).toHaveBeenCalled();
    const preview = wrapper.find("img");
    expect(preview.exists()).toBe(true);
    expect(preview.attributes("src")).toBe("data:image/png;base64,stub");

    const sendBtn = wrapper.find("button[aria-label='Send message']");
    await sendBtn.trigger("click");

    const events = wrapper.emitted("send");
    expect(events).toBeTruthy();
    expect(events![0][0]).toEqual({
      text: "",
      attachment: {
        dataUrl: "data:image/png;base64,stub",
        name: "test.png",
        type: "image/png",
      },
    });
  });

  it("emits sendToken when token button is clicked", async () => {
    const wrapper = mount(MessageInput, {
      global: {
        stubs: {
          "q-input": QInputStub,
          "q-btn": QBtnStub,
          "q-img": QImgStub,
          NutIcon: NutIconStub,
        },
      },
    });

    const tokenBtn = wrapper.find("button[aria-label='Send token']");
    expect(tokenBtn.exists()).toBe(true);

    await tokenBtn.trigger("click");

    expect(wrapper.emitted("sendToken")).toEqual([[]]);
  });
});
