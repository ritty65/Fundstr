import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";

import TierComposer from "src/pages/creator-studio/TierComposer.vue";
import type { Tier } from "src/nutzap/types";

const SimpleWrapper = defineComponent({
  name: "SimpleWrapper",
  setup(_, { slots }) {
    return () => h("div", slots.default?.());
  },
});

const VideoStub = defineComponent({
  name: "VideoStub",
  setup(_, { slots }) {
    return () => h("div", { class: "video-stub" }, slots.default?.());
  },
});

const AudioStub = defineComponent({
  name: "AudioStub",
  setup(_, { slots }) {
    return () => h("div", { class: "audio-stub" }, slots.default?.());
  },
});

const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: {
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
    icon: { type: String, default: "" },
  },
  emits: ["click"],
  setup(props, { emit, slots }) {
    return () =>
      h(
        "button",
        {
          type: "button",
          disabled: props.disable,
          "data-label": props.label || props.icon,
          "data-icon": props.icon,
          onClick: (event: MouseEvent) => emit("click", event),
        },
        (() => {
          const slotContent = slots.default?.();
          if (slotContent && slotContent.length) {
            return slotContent;
          }
          return [props.label || props.icon || "button"];
        })(),
      );
  },
});

const QChipStub = defineComponent({
  name: "QChipStub",
  props: {
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
  },
  emits: ["click"],
  setup(props, { emit, slots }) {
    return () =>
      h(
        "button",
        {
          type: "button",
          disabled: props.disable,
          class: "q-chip-stub",
          "data-label": props.label,
          onClick: (event: MouseEvent) => emit("click", event),
        },
        slots.default?.() ?? props.label,
      );
  },
});

const QInputStub = defineComponent({
  name: "QInputStub",
  props: {
    modelValue: { type: [String, Number], default: "" },
    label: { type: String, default: "" },
    type: { type: String, default: "text" },
    disable: { type: Boolean, default: false },
    error: { type: Boolean, default: false },
    errorMessage: { type: String, default: "" },
  },
  emits: ["update:modelValue", "blur"],
  setup(props, { emit }) {
    const renderControl = () => {
      const common: Record<string, unknown> = {
        value: props.modelValue ?? "",
        disabled: props.disable,
        "data-label": props.label,
        onInput: (event: Event) =>
          emit("update:modelValue", (event.target as HTMLInputElement).value),
        onBlur: (event: FocusEvent) => emit("blur", event),
      };
      if (props.type === "textarea") {
        return h("textarea", common);
      }
      return h("input", { ...common, type: props.type || "text" });
    };

    return () =>
      h("div", { class: "q-input-stub", "data-label": props.label }, [
        renderControl(),
        props.error && props.errorMessage
          ? h("span", { class: "error" }, props.errorMessage)
          : null,
      ]);
  },
});

const QSelectStub = defineComponent({
  name: "QSelectStub",
  props: {
    modelValue: { type: [String, Number], default: "" },
    options: { type: Array, default: () => [] },
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () =>
      h(
        "select",
        {
          value: props.modelValue ?? "",
          disabled: props.disable,
          "data-label": props.label,
          onChange: (event: Event) =>
            emit("update:modelValue", (event.target as HTMLSelectElement).value),
        },
        [
          h("option", { value: "" }, props.label || "Select"),
          ...(props.options as Array<{ value: string; label: string }>).map((option) =>
            h("option", { value: option.value }, option.label),
          ),
        ],
      );
  },
});

const QSlideTransitionStub = defineComponent({
  name: "QSlideTransitionStub",
  setup(_, { slots }) {
    return () => h("div", { class: "q-slide-transition" }, slots.default?.());
  },
});

vi.mock("uuid", () => {
  let counter = 0;
  return {
    v4: () => {
      counter += 1;
      return `generated-id-${counter}`;
    },
  };
});

function flush() {
  return Promise.resolve().then(() => nextTick());
}

function mountComposer(extraProps: Partial<{ tiers: Tier[]; showErrors: boolean }> = {}) {
  return mount(TierComposer, {
    props: {
      tiers: [],
      frequencyOptions: [
        { value: "one_time", label: "One-time" },
        { value: "monthly", label: "Monthly" },
        { value: "yearly", label: "Yearly" },
      ],
      ...extraProps,
    },
    global: {
      stubs: {
        "q-btn": QBtnStub,
        "q-card": SimpleWrapper,
        "q-card-section": SimpleWrapper,
        "q-separator": defineComponent({
          name: "QSeparatorStub",
          setup() {
            return () => h("hr");
          },
        }),
        "q-input": QInputStub,
        "q-select": QSelectStub,
        "q-chip": QChipStub,
        "q-slide-transition": QSlideTransitionStub,
        "q-img": SimpleWrapper,
        video: VideoStub,
        audio: AudioStub,
      },
    },
  });
}

describe("TierComposer", () => {
  it("lets users create a tier through form interactions", async () => {
    const wrapper = mountComposer();

    await wrapper.find('button[data-label="Add Tier"]').trigger("click");
    await flush();

    const titleInput = wrapper.find('input[data-label="Title"]');
    await titleInput.setValue("  Superstar  ");
    await flush();

    const priceInput = wrapper.find('input[data-label="Price (sats)"]');
    await priceInput.setValue("2500");
    await flush();

    const frequencySelect = wrapper.find('select[data-label="Frequency"]');
    await frequencySelect.setValue("yearly");
    await flush();

    const optionalToggle = wrapper.find('button[data-label="Add optional details"]');
    await optionalToggle.trigger("click");
    await flush();

    const descriptionInput = wrapper.find('textarea[data-label="Description (optional)"]');
    await descriptionInput.setValue("Exclusive content");
    await flush();

    const addMediaButton = wrapper.find('button[data-label="Add Media"]');
    await addMediaButton.trigger("click");
    await flush();

    const mediaInput = wrapper.find('input[data-label="Media URL"]');
    await mediaInput.setValue("https://example.com/video.mp4");
    await flush();
    await flush();

    const tierUpdates = wrapper.emitted("update:tiers");
    expect(tierUpdates?.length).toBeGreaterThan(0);
    const latestUpdate = tierUpdates?.at(-1)?.[0];
    expect(latestUpdate).toHaveLength(1);
    const createdTier = latestUpdate?.[0] as Tier;

    expect(createdTier.title).toBe("Superstar");
    expect(createdTier.price).toBe(2500);
    expect(createdTier.frequency).toBe("yearly");
    expect(createdTier.description).toBe("Exclusive content");
    expect(createdTier.media?.[0]?.url).toBe("https://example.com/video.mp4");

    const validationUpdates = wrapper.emitted("validation-changed");
    const latestValidation = validationUpdates?.at(-1)?.[0];
    expect(latestValidation).toEqual([{}]);
  });

  it("surfaces validation errors for incomplete tiers", async () => {
    const wrapper = mountComposer({ showErrors: true });

    await wrapper.find('button[data-label="Add Tier"]').trigger("click");
    await flush();

    const priceInput = wrapper.find('input[data-label="Price (sats)"]');
    await priceInput.setValue("-5");
    await flush();

    const addMediaButton = wrapper.find('button[data-label="Add Media"]');
    await addMediaButton.trigger("click");
    await flush();

    const mediaInput = wrapper.find('input[data-label="Media URL"]');
    await mediaInput.setValue("example.com/image.png");
    await flush();

    const validationUpdates = wrapper.emitted("validation-changed");
    const latestValidation = validationUpdates?.at(-1)?.[0];
    expect(latestValidation?.[0]?.title).toBe("Title is required.");
    expect(latestValidation?.[0]?.price).toBe("Enter a positive number of sats.");
    expect(latestValidation?.[0]?.media?.[0]).toBe(
      "Media URLs must start with http:// or https://",
    );
  });

  it("allows editing existing tiers and emits updates", async () => {
    const existingTier: Tier = {
      id: "tier-existing",
      title: "Founding Supporter",
      price: 900,
      frequency: "monthly",
      description: "Behind the scenes",
      media: [{ url: "https://example.com/image.png", type: "image" }],
    } as Tier;

    const wrapper = mountComposer({ tiers: [existingTier] });
    await flush();

    const titleInput = wrapper.find('input[data-label="Title"]');
    await titleInput.setValue("Founding Plus");
    await flush();

    const tierUpdates = wrapper.emitted("update:tiers");
    expect(tierUpdates?.length).toBeGreaterThan(0);
    const latestUpdate = tierUpdates?.at(-1)?.[0];
    const updatedTier = latestUpdate?.[0] as Tier;

    expect(updatedTier.title).toBe("Founding Plus");
    expect(updatedTier.price).toBe(900);
    expect(updatedTier.media?.[0]?.url).toBe("https://example.com/image.png");
  });
});
