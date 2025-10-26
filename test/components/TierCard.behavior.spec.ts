import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";

import TierCard from "src/components/TierCard.vue";

const SimpleStub = defineComponent({
  name: "SimpleStub",
  setup(_, { slots }) {
    return () => h("div", slots.default ? slots.default() : []);
  },
});

const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: {
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
  },
  emits: ["click"],
  setup(props, { slots, emit, attrs }) {
    return () =>
      h(
        "button",
        {
          type: "button",
          ...attrs,
          disabled: props.disable,
          onClick: (evt: MouseEvent) => emit("click", evt),
        },
        slots.default?.() ?? props.label ?? attrs.icon ?? "button",
      );
  },
});

const QExpansionItemStub = defineComponent({
  name: "QExpansionItemStub",
  setup(_, { slots }) {
    return () =>
      h("div", { class: "q-expansion-item" }, [
        h("div", { class: "q-expansion-header" }, slots.header?.()),
        h("div", { class: "q-expansion-content" }, slots.default?.()),
      ]);
  },
});

function mountTierCard() {
  return mount(TierCard, {
    props: {
      tier: {
        id: "tier-1",
        name: "Starter",
        description: "Access",
        price_sats: 100,
        media: [{ url: "https://example.com/media.png" }],
      } as any,
    },
    global: {
      stubs: {
        "q-card": SimpleStub,
        "q-expansion-item": QExpansionItemStub,
        "q-icon": SimpleStub,
        "q-btn": QBtnStub,
        MediaPreview: SimpleStub,
      },
    },
  });
}

describe("TierCard", () => {
  it("emits edit and delete events when action buttons are used", async () => {
    const wrapper = mountTierCard();

    const buttons = wrapper.findAll("button");
    const editButton = buttons.find((btn) => btn.attributes("icon") === "edit");
    const deleteButton = buttons.find((btn) => btn.attributes("icon") === "delete");

    expect(editButton).toBeTruthy();
    expect(deleteButton).toBeTruthy();

    await editButton!.trigger("click");
    await deleteButton!.trigger("click");

    expect(wrapper.emitted("edit")).toBeTruthy();
    expect(wrapper.emitted("delete")).toBeTruthy();
  });

  it("emits tier updates when the local tier data changes", async () => {
    const wrapper = mountTierCard();

    wrapper.vm.tierLocal.description = "Updated description";
    await nextTick();

    const updates = wrapper.emitted("update:tier");
    expect(updates).toBeTruthy();
    expect(updates!.at(-1)?.[0]).toMatchObject({ description: "Updated description" });

    await wrapper.setProps({
      tier: {
        id: "tier-1",
        name: "Renamed",
        description: "Updated description",
        price_sats: 150,
        media: [],
      },
    });

    expect(wrapper.vm.tierLocal.name).toBe("Renamed");
  });
});
