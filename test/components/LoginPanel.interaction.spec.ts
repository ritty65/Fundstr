import { describe, it, beforeEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { createTestingPinia } from "@pinia/testing";

import LoginPanel from "src/components/LoginPanel.vue";

const loginWithExtension = vi.fn();
const loginWithSecret = vi.fn();

vi.mock("src/composables/useNostrAuth", () => ({
  useNostrAuth: () => ({
    loginWithExtension,
    loginWithSecret,
  }),
}));

const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: {
    label: { type: String, default: "" },
  },
  emits: ["click"],
  setup(props, { slots, emit }) {
    return () => {
      const slotNodes = slots.default ? slots.default() : [];
      const slotText = slotNodes
        .map((node) => (typeof node.children === "string" ? node.children : ""))
        .join("")
        .trim();

      return h(
        "button",
        {
          type: "button",
          "data-label": props.label || slotText,
          onClick: (event: MouseEvent) => emit("click", event),
        },
        slotNodes.length ? slotNodes : props.label,
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
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h(
        "label",
        { "data-label": props.label },
        [
          props.label ? h("span", props.label) : null,
          h("input", {
            value: props.modelValue,
            type: props.type || "text",
            onInput: (event: Event) =>
              emit("update:modelValue", (event.target as HTMLInputElement).value),
          }),
        ],
      );
  },
});

function mountPanel() {
  return mount(LoginPanel, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn })],
      stubs: {
        "q-btn": QBtnStub,
        "q-input": QInputStub,
      },
    },
  });
}

describe("LoginPanel interactions", () => {
  beforeEach(() => {
    loginWithExtension.mockClear();
    loginWithSecret.mockClear();
  });

  it("calls loginWithExtension when the browser signer button is clicked", async () => {
    const wrapper = mountPanel();

    await wrapper
      .get('button[data-label="Login with Browser Signer"]')
      .trigger("click");

    expect(loginWithExtension).toHaveBeenCalledTimes(1);
    expect(loginWithSecret).not.toHaveBeenCalled();
  });

  it("requires an nsec value before calling loginWithSecret", async () => {
    const wrapper = mountPanel();

    await wrapper
      .get('button[data-label="Login with nsec"]')
      .trigger("click");

    expect(loginWithSecret).not.toHaveBeenCalled();

    const nsecInput = wrapper.get('label[data-label="nsec"] input');
    await nsecInput.setValue("nsec1");

    await wrapper
      .get('button[data-label="Login with nsec"]')
      .trigger("click");

    expect(loginWithSecret).toHaveBeenCalledTimes(1);
    expect(loginWithSecret).toHaveBeenCalledWith("nsec1");
  });

  it("keeps the nsec input masked as a password field", async () => {
    const wrapper = mountPanel();

    const nsecInput = wrapper.get('label[data-label="nsec"] input');
    expect(nsecInput.attributes("type")).toBe("password");

    await nsecInput.setValue("secret-value");

    expect(nsecInput.attributes("type")).toBe("password");
  });
});
