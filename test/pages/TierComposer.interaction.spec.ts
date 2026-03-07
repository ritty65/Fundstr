import { describe, it, expect } from "vitest";
import { mount, VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";

import TierComposer from "src/pages/creator-studio/TierComposer.vue";
import {
  draftToTier,
  type TierDraft,
  type TierFieldErrors,
} from "src/pages/creator-studio/tierComposerUtils";
import type { Tier } from "src/nutzap/types";

const QInputStub = defineComponent({
  name: "QInputStub",
  props: {
    modelValue: { type: [String, Number], default: "" },
    label: { type: String, default: "" },
    type: { type: String, default: "text" },
    error: { type: Boolean, default: false },
    errorMessage: { type: String, default: "" },
    disable: { type: Boolean, default: false },
  },
  emits: ["update:modelValue", "blur"],
  setup(props, { emit, slots, attrs }) {
    return () => {
      const disabled = props.disable || attrs.disable === "" || attrs.disable === true || attrs.disable === "true";
      const content = [] as ReturnType<typeof h>[];
      if (props.label) {
        content.push(h("span", { class: "q-input-stub__label" }, props.label));
      }
      const sharedProps = {
        disabled,
        "data-label": props.label,
        onInput: (event: Event) => emit("update:modelValue", (event.target as HTMLInputElement).value),
        onBlur: (event: Event) => emit("blur", event),
        value: props.modelValue,
      } as Record<string, unknown>;

      if (props.type === "textarea") {
        content.push(h("textarea", { ...sharedProps }));
      } else {
        const inputType = props.type === "number" ? "number" : "text";
        content.push(h("input", { ...sharedProps, type: inputType }));
      }

      if (props.error && props.errorMessage) {
        content.push(h("div", { class: "q-input-error" }, props.errorMessage));
      }

      if (slots.append) {
        content.push(h("div", { class: "q-input-stub__append" }, slots.append()));
      }

      return h("label", { class: "q-input-stub" }, content);
    };
  },
});

const QSelectStub = defineComponent({
  name: "QSelectStub",
  props: {
    modelValue: { type: [String, Number], default: "" },
    options: { type: Array, default: () => [] },
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
    error: { type: Boolean, default: false },
    errorMessage: { type: String, default: "" },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return () => {
      const disabled = props.disable;
      const optionNodes = (props.options as Array<Record<string, unknown>>).map(option => {
        const value = (option.value ?? option) as string;
        const label = (option.label ?? option.value ?? option) as string;
        return h(
          "option",
          {
            value,
            selected: props.modelValue === value,
          },
          label,
        );
      });

      const children = [
        props.label ? h("span", { class: "q-select-stub__label" }, props.label) : null,
        h(
          "select",
          {
            class: "q-select-stub__control",
            "data-label": props.label,
            disabled,
            value: props.modelValue,
            onChange: (event: Event) => emit("update:modelValue", (event.target as HTMLSelectElement).value),
          },
          optionNodes,
        ),
      ];

      if (props.error && props.errorMessage) {
        children.push(h("div", { class: "q-select-error" }, props.errorMessage));
      }

      return h("label", { class: "q-select-stub" }, children);
    };
  },
});

function extractSlotText(nodes: unknown): string {
  if (typeof nodes === "string") {
    return nodes;
  }
  if (Array.isArray(nodes)) {
    return nodes
      .map(node => {
        if (typeof node === "string") {
          return node;
        }
        if (typeof node === "number") {
          return String(node);
        }
        if (node && typeof node === "object" && "children" in node) {
          const children = (node as { children?: unknown }).children;
          return extractSlotText(children);
        }
        return "";
      })
      .join("")
      .trim();
  }
  if (nodes && typeof nodes === "object" && "children" in (nodes as Record<string, unknown>)) {
    return extractSlotText((nodes as { children?: unknown }).children);
  }
  return "";
}

const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: {
    label: { type: String, default: "" },
    disable: { type: Boolean, default: false },
  },
  emits: ["click"],
  setup(props, { attrs, slots, emit }) {
    return () => {
      const {
        disable: disableAttr,
        class: className,
        ...rest
      } = attrs as Record<string, unknown> & { class?: string; disable?: unknown };
      const disabled =
        props.disable === true ||
        disableAttr === "" ||
        disableAttr === true ||
        disableAttr === "true";
      const slotText = extractSlotText(slots.default?.());
      const labelText = props.label || (attrs.label as string | undefined) || slotText || "button";

      return h(
        "button",
        {
          type: "button",
          class: ["q-btn-stub", className].filter(Boolean).join(" "),
          disabled,
          ...rest,
          onClick: (event: MouseEvent) => {
            if (!disabled) {
              emit("click", event);
            }
          },
          "data-label": labelText,
        },
        slots.default?.() ?? props.label ?? (attrs.label as string | undefined) ?? labelText,
      );
    };
  },
});

const QChipStub = defineComponent({
  name: "QChipStub",
  props: {
    label: { type: String, default: "" },
    clickable: { type: Boolean, default: false },
    disable: { type: Boolean, default: false },
  },
  emits: ["click"],
  setup(props, { slots, emit, attrs }) {
    return () => {
      const disabled =
        props.disable === true ||
        attrs.disable === "" ||
        attrs.disable === true ||
        attrs.disable === "true";
      const slotText = extractSlotText(slots.default?.());
      const labelText = slotText || props.label || (attrs.label as string | undefined) || "";
      const content = slots.default?.() ?? labelText;

      if (props.clickable || attrs.clickable !== undefined) {
        return h(
          "button",
          {
            type: "button",
            class: "q-chip-stub",
            disabled,
            "data-label": labelText,
            onClick: (event: MouseEvent) => {
              if (!disabled) {
                emit("click", event);
              }
            },
          },
          content,
        );
      }

      return h("div", { class: "q-chip-stub", "data-label": labelText }, content);
    };
  },
});

const SimpleStub = (name: string) =>
  defineComponent({
    name: `${name}Stub`,
    setup(_, { slots, attrs }) {
      return () => h("div", { class: `${name}-stub`, ...attrs }, slots.default?.());
    },
  });

const QSlideTransitionStub = defineComponent({
  name: "QSlideTransitionStub",
  setup(_, { slots }) {
    return () => h("div", { class: "q-slide-transition-stub" }, slots.default?.());
  },
});

const QImgStub = defineComponent({
  name: "QImgStub",
  props: { src: { type: String, default: "" } },
  setup(props) {
    return () => h("img", { class: "q-img-stub", src: props.src });
  },
});

type TierComposerProps = {
  tiers?: Tier[];
  frequencyOptions?: { value: Tier["frequency"]; label: string }[];
  showErrors?: boolean;
  disabled?: boolean;
};

const defaultFrequencyOptions: TierComposerProps["frequencyOptions"] = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "one_time", label: "One-time" },
];

function mountTierComposer(props: TierComposerProps = {}) {
  return mount(TierComposer, {
    props: {
      tiers: props.tiers ?? [],
      frequencyOptions: props.frequencyOptions ?? defaultFrequencyOptions,
      showErrors: props.showErrors,
      disabled: props.disabled,
    },
    global: {
      stubs: {
        "q-btn": QBtnStub,
        "q-card": SimpleStub("QCard"),
        "q-card-section": SimpleStub("QCardSection"),
        "q-chip": QChipStub,
        "q-select": QSelectStub,
        "q-input": QInputStub,
        "q-separator": defineComponent({
          name: "QSeparatorStub",
          setup(_, { attrs }) {
            return () => h("hr", { class: "q-separator-stub", ...attrs });
          },
        }),
        "q-slide-transition": QSlideTransitionStub,
        "q-img": QImgStub,
      },
      mocks: {
        $t: (key: string) => key,
        $q: { dark: { isActive: false }, screen: { lt: { sm: false } } },
      },
    },
  });
}

function getSetupState(wrapper: VueWrapper) {
  const internal = wrapper.vm as unknown as { $: { setupState: Record<string, unknown> } };
  return internal.$.setupState;
}

function unwrapRefValue<T>(input: unknown): T | undefined {
  if (input && typeof input === "object" && "value" in (input as Record<string, unknown>)) {
    return (input as { value: T | undefined }).value;
  }
  return input as T | undefined;
}

function getDrafts(wrapper: VueWrapper) {
  const state = getSetupState(wrapper);
  const entriesState = unwrapRefValue<TierDraft[]>(state.entries);
  return Array.isArray(entriesState) ? entriesState : [];
}

function latestUpdate(wrapper: VueWrapper): Tier[] {
  const events = wrapper.emitted("update:tiers") ?? [];
  const last = events.at(-1);
  return (last?.[0] as Tier[]) ?? [];
}

function expectLatestUpdateMatchesDrafts(wrapper: VueWrapper) {
  const drafts = getDrafts(wrapper);
  const baseProp = wrapper.props("tiers");
  const base = Array.isArray(baseProp) ? (baseProp as Tier[]) : [];
  const expected = drafts.map((draft, index) => draftToTier(draft, base[index]));
  expect(latestUpdate(wrapper)).toEqual(expected);
}

function findButtonByLabel(wrapper: VueWrapper, label: string) {
  return wrapper.findAll("button.q-btn-stub").find(button => button.attributes("data-label") === label);
}

describe("TierComposer interactions", () => {
  it("emits sanitized updates while managing tier details", async () => {
    const wrapper = mountTierComposer();

    const addTierButton = findButtonByLabel(wrapper, "Add Tier");
    expect(addTierButton).toBeDefined();
    await addTierButton!.trigger("click");
    await nextTick();

    expectLatestUpdateMatchesDrafts(wrapper);

    const titleInput = wrapper.find("input[data-label='Title']");
    await titleInput.setValue("Super Fans");
    await nextTick();
    expectLatestUpdateMatchesDrafts(wrapper);

    const priceInput = wrapper.find("input[data-label='Price (sats)']");
    await priceInput.setValue("2500");
    await nextTick();
    expectLatestUpdateMatchesDrafts(wrapper);
    expect(latestUpdate(wrapper)[0]?.price).toBe(2500);

    const frequencySelect = wrapper.find("select[data-label='Frequency']");
    await frequencySelect.setValue("yearly");
    await nextTick();
    expectLatestUpdateMatchesDrafts(wrapper);
    expect(latestUpdate(wrapper)[0]?.frequency).toBe("yearly");

    const optionalToggle = findButtonByLabel(wrapper, "Add optional details");
    expect(optionalToggle).toBeDefined();
    await optionalToggle!.trigger("click");
    await nextTick();

    const descriptionInput = wrapper.find("textarea[data-label='Description (optional)']");
    await descriptionInput.setValue("Includes behind-the-scenes content");
    await nextTick();
    expect(latestUpdate(wrapper)[0]?.description).toBe("Includes behind-the-scenes content");

    const addMediaButton = findButtonByLabel(wrapper, "Add Media");
    expect(addMediaButton).toBeDefined();
    await addMediaButton!.trigger("click");
    await nextTick();
    expectLatestUpdateMatchesDrafts(wrapper);

    const firstMediaInput = wrapper.find("input[data-label='Media URL']");
    await firstMediaInput.setValue("https://example.com/preview.png");
    await nextTick();
    expect(latestUpdate(wrapper)[0]?.media).toEqual([
      { url: "https://example.com/preview.png", type: "image" },
    ]);

    await addMediaButton!.trigger("click");
    await nextTick();
    const mediaInputs = wrapper.findAll("input[data-label='Media URL']");
    expect(mediaInputs).toHaveLength(2);
    await mediaInputs[1].setValue("https://example.com/video.mp4");
    await nextTick();
    expect(latestUpdate(wrapper)[0]?.media).toEqual([
      { url: "https://example.com/preview.png", type: "image" },
      { url: "https://example.com/video.mp4", type: "video" },
    ]);

    const deleteButtons = wrapper.findAll("button[icon='delete']");
    const mediaDeleteButtons = deleteButtons.filter(button =>
      Boolean(button.element.previousElementSibling?.querySelector("input[data-label='Media URL']")),
    );
    expect(mediaDeleteButtons).toHaveLength(2);
    await mediaDeleteButtons[1].trigger("click");
    await nextTick();
    expect(latestUpdate(wrapper)[0]?.media).toEqual([
      { url: "https://example.com/preview.png", type: "image" },
    ]);

    const presetChip = wrapper
      .findAll("button.q-chip-stub")
      .find(chip => chip.attributes("data-label") === "Supporter • 1k sats / monthly");
    expect(presetChip).toBeDefined();
    await presetChip!.trigger("click");
    await nextTick();
    expectLatestUpdateMatchesDrafts(wrapper);

    const finalUpdate = latestUpdate(wrapper)[0];
    expect(finalUpdate?.title).toBe("Supporter");
    expect(finalUpdate?.price).toBe(1000);
    expect(finalUpdate?.frequency).toBe("monthly");
  });

  it("surfaces validation errors and emits validation state", async () => {
    const wrapper = mountTierComposer();

    const addTierButton = findButtonByLabel(wrapper, "Add Tier");
    await addTierButton!.trigger("click");
    await nextTick();

    const titleInput = wrapper.find("input[data-label='Title']");
    await titleInput.setValue("Temp");
    await nextTick();
    await titleInput.setValue("");
    await nextTick();

    const priceInput = wrapper.find("input[data-label='Price (sats)']");
    await priceInput.setValue("1000");
    await nextTick();
    await priceInput.setValue("0");
    await nextTick();

    const optionalToggle =
      findButtonByLabel(wrapper, "Hide optional details") ?? findButtonByLabel(wrapper, "Add optional details");
    if (optionalToggle?.attributes("data-label") === "Add optional details") {
      await optionalToggle.trigger("click");
      await nextTick();
    }

    const addMediaButton = findButtonByLabel(wrapper, "Add Media");
    await addMediaButton!.trigger("click");
    await nextTick();

    const mediaInput = wrapper.find("input[data-label='Media URL']");
    await mediaInput.setValue("notaurl");
    await nextTick();

    const validations = wrapper.emitted("validation-changed");
    expect(validations?.length).toBeGreaterThan(0);
    const latestValidation = validations?.at(-1)?.[0] as TierFieldErrors[];
    expect(latestValidation?.[0]?.title).toBe("Title is required.");
    expect(latestValidation?.[0]?.price).toBe("Enter a positive number of sats.");
    expect(latestValidation?.[0]?.media?.[0]).toBe("Media URLs must start with http:// or https://");

    const errorMessages = wrapper.findAll(".q-input-error").map(node => node.text());
    expect(errorMessages).toContain("Title is required.");
    expect(errorMessages).toContain("Enter a positive number of sats.");

    const hasErrorChip = wrapper
      .findAll(".q-chip-stub")
      .some(chip => chip.text().includes("Fix errors"));
    expect(hasErrorChip).toBe(true);
  });

  it("maintains draft bookkeeping for existing tiers and respects props", async () => {
    const existingTier: Tier = {
      id: "tier-1",
      title: "Founders",
      price: 5000,
      frequency: "monthly",
      description: "Early supporters",
      media: [{ url: "https://example.com/audio.mp3", type: "audio" }],
    };

    const wrapper = mountTierComposer({ tiers: [existingTier] });
    await nextTick();

    const state = getSetupState(wrapper);
    const touched = (state.touched as Record<string, { title: boolean; price: boolean; description: boolean }>)[
      existingTier.id
    ];
    const initialDirty = unwrapRefValue<boolean>(state.isLocallyDirty) ?? false;
    expect(initialDirty).toBe(false);
    expect(touched?.title).toBe(true);
    expect(touched?.price).toBe(false);
    expect(touched?.description).toBe(true);

    const optionalToggle =
      findButtonByLabel(wrapper, "Hide optional details") ?? findButtonByLabel(wrapper, "Add optional details");
    if (optionalToggle?.attributes("data-label") === "Add optional details") {
      await optionalToggle.trigger("click");
      await nextTick();
    }

    const descriptionInput = wrapper.find("textarea[data-label='Description (optional)']");
    await descriptionInput.setValue("  Updated plan  ");
    await nextTick();

    const dirtyAfterEdit = unwrapRefValue<boolean>(state.isLocallyDirty) ?? false;
    expect(dirtyAfterEdit).toBe(true);
    const latest = latestUpdate(wrapper);
    expect(latest[0]?.description).toBe("Updated plan");
    expect(latest[0]?.media).toEqual(existingTier.media);

    await wrapper.setProps({ showErrors: true });
    await nextTick();

    const addTierButton = findButtonByLabel(wrapper, "Add Tier");
    await addTierButton!.trigger("click");
    await nextTick();

    const newTitleError = wrapper
      .findAll(".q-input-error")
      .filter(node => node.element.previousElementSibling?.getAttribute("data-label") === "Title");
    expect(newTitleError.some(node => node.text() === "Title is required.")).toBe(true);

    await wrapper.setProps({ disabled: true });
    await nextTick();

    const disabledAddButton = findButtonByLabel(wrapper, "Add Tier");
    expect(disabledAddButton?.attributes("disabled")).toBeDefined();

    const titleInput = wrapper.find("input[data-label='Title']");
    expect(titleInput.attributes("disabled")).toBeDefined();
  });
});
