import { describe, it, beforeEach, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { nip19 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";

import LoginPanel from "src/components/LoginPanel.vue";

const loginWithExtension = vi.fn();
const loginWithSecret = vi.fn();
let nostrStoreMock: any;
let vaultStoreMock: any;

const TEST_NSEC = nip19.nsecEncode(hexToBytes("11".repeat(32)));
const TEST_NPUB = nip19.npubEncode("22".repeat(32));

vi.mock("src/composables/useNostrAuth", () => ({
  useNostrAuth: () => ({
    loginWithExtension,
    loginWithSecret,
  }),
}));

vi.mock("src/stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
}));

vi.mock("src/stores/vault", () => ({
  useVaultStore: () => vaultStoreMock,
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
      h("label", { "data-label": props.label }, [
        props.label ? h("span", props.label) : null,
        h("input", {
          value: props.modelValue,
          type: props.type || "text",
          onInput: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLInputElement).value),
        }),
      ]);
  },
});

function mountPanel() {
  return mount(LoginPanel, {
    global: {
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
    nostrStoreMock = {
      encryptionKey: null,
      npub: TEST_NPUB,
      hasEncryptedSecrets: vi.fn(() => false),
      setEncryptionKeyFromPin: vi.fn(async () => {
        nostrStoreMock.encryptionKey = "pin-ready";
      }),
      unlockWithPin: vi.fn(async () => {}),
    };
    vaultStoreMock = {
      isUnlocked: false,
      hasEncryptedVault: false,
      setEncryptionKeyFromPin: vi.fn(async () => {
        vaultStoreMock.isUnlocked = true;
      }),
      unlockWithPin: vi.fn(async () => {
        vaultStoreMock.isUnlocked = true;
      }),
    };
  });

  it("calls loginWithExtension when the browser signer button is clicked", async () => {
    const wrapper = mountPanel();
    await wrapper
      .get('label[data-label="Unlock PIN / Password"] input')
      .setValue("1234");

    await wrapper
      .get('button[data-label="Login with Browser Signer"]')
      .trigger("click");

    expect(loginWithExtension).toHaveBeenCalledTimes(1);
    expect(loginWithSecret).not.toHaveBeenCalled();
  });

  it("requires an nsec value before calling loginWithSecret", async () => {
    const wrapper = mountPanel();
    await wrapper
      .get('label[data-label="Unlock PIN / Password"] input')
      .setValue("1234");

    await wrapper.get('button[data-label="Login with nsec"]').trigger("click");

    expect(loginWithSecret).not.toHaveBeenCalled();

    const nsecInput = wrapper.get('label[data-label="nsec"] input');
    await nsecInput.setValue(TEST_NSEC);

    await wrapper.get('button[data-label="Login with nsec"]').trigger("click");

    expect(loginWithSecret).toHaveBeenCalledTimes(1);
    expect(loginWithSecret).toHaveBeenCalledWith(TEST_NSEC);
  });

  it("keeps the nsec input masked as a password field", async () => {
    const wrapper = mountPanel();

    const nsecInput = wrapper.get('label[data-label="nsec"] input');
    expect(nsecInput.attributes("type")).toBe("password");

    await nsecInput.setValue("secret-value");

    expect(nsecInput.attributes("type")).toBe("password");
  });
});
