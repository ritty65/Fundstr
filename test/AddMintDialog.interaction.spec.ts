import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";

import AddMintDialog from "src/components/AddMintDialog.vue";

const qBtnStub = {
  name: "QBtnStub",
  props: ["label", "loading", "color", "rounded", "flat"],
  emits: ["click"],
  template: `
    <button :data-loading="loading ? 'true' : 'false'" @click="$emit('click')">
      <slot />
      <span v-if="label">{{ label }}</span>
    </button>
  `,
};

const simpleStub = { template: "<div><slot /></div>" };

type AddMintDialogProps = {
  addMintData?: { url: string };
  showAddMintDialog?: boolean;
  addMintBlocking?: boolean;
};

const mountDialog = (props?: AddMintDialogProps) =>
  mount(AddMintDialog, {
    props: {
      addMintData: { url: "https://mint" },
      showAddMintDialog: true,
      addMintBlocking: false,
      ...props,
    },
    global: {
      stubs: {
        "q-dialog": simpleStub,
        "q-card": simpleStub,
        "q-card-section": simpleStub,
        "q-input": simpleStub,
        "q-btn": qBtnStub,
        HelpPopup: simpleStub,
        InfoTooltip: simpleStub,
      },
      mocks: {
        $t: (key: string) => key,
      },
    },
  });

describe("AddMintDialog interactions", () => {
  it("emits add event with verbose flag when add button is clicked", async () => {
    const wrapper = mountDialog();
    const addButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("AddMintDialog.actions.add_mint.label"));
    expect(addButton).toBeDefined();

    await addButton!.trigger("click");

    expect(wrapper.emitted().add).toBeTruthy();
    const [[payload, verbose]] = wrapper.emitted().add!;
    expect(payload).toEqual({ url: "https://mint" });
    expect(verbose).toBe(true);
  });

  it("reflects loading state on the add button", () => {
    const wrapper = mountDialog({ addMintBlocking: true });
    const addButton = wrapper
      .findAll("button")
      .find((btn) => btn.text().includes("AddMintDialog.actions.add_mint.label"));
    expect(addButton).toBeDefined();
    expect(addButton!.attributes()["data-loading"]).toBe("true");
  });

  it("proxies showAddMintDialog through the local computed property", async () => {
    const wrapper = mountDialog({ showAddMintDialog: true });

    (wrapper.vm as unknown as { showAddMintDialogLocal: boolean }).showAddMintDialogLocal =
      false;
    await nextTick();

    expect(wrapper.emitted()["update:showAddMintDialog"]).toBeTruthy();
    const [[value]] = wrapper.emitted()["update:showAddMintDialog"]!;
    expect(value).toBe(false);
  });
});
