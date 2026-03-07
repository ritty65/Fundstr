import { defineComponent, h, inject, provide, computed } from "vue";

export const SimpleStub = (name: string) =>
  defineComponent({
    name: `${name}Stub`,
    setup(_, { slots, attrs }) {
      return () => h("div", { class: `${name}-stub`, ...attrs }, slots.default?.());
    },
  });

export const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: { label: { type: String, default: "" } },
  emits: ["click"],
  setup(props, { slots, attrs, emit }) {
    return () => {
      const { class: className, label, ...rest } = attrs as Record<string, unknown> & { class?: string };
      const text = slots.default?.() ?? props.label ?? (label as string | undefined) ?? "button";
      return h(
        "button",
        {
          type: "button",
          class: ["q-btn-stub", className].filter(Boolean).join(" "),
          ...rest,
          onClick: (event: MouseEvent) => emit("click", event),
        },
        text,
      );
    };
  },
});

export const QBannerStub = SimpleStub("QBanner");

const tabsSymbol = Symbol("tabs");
const panelsSymbol = Symbol("panels");

export const QTabsStub = defineComponent({
  name: "QTabsStub",
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue"],
  setup(props, { slots, emit, attrs }) {
    const current = computed(() => props.modelValue);
    const select = (name: string) => emit("update:modelValue", name);
    provide(tabsSymbol, { current, select });
    provide(panelsSymbol, current);
    return () =>
      h(
        "div",
        {
          class: "q-tabs-stub",
          "data-model": props.modelValue,
          ...attrs,
        },
        slots.default?.(),
      );
  },
});

export const QTabStub = defineComponent({
  name: "QTabStub",
  props: { name: { type: String, required: true }, label: { type: String, default: "" } },
  setup(props, { slots, attrs }) {
    const api = inject<{ current: ReturnType<typeof computed>; select: (name: string) => void } | null>(
      tabsSymbol,
      null,
    );
    return () =>
      h(
        "button",
        {
          type: "button",
          class: "q-tab-stub",
          "data-role": "tab",
          "data-name": props.name,
          "data-active": api?.current.value === props.name ? "true" : "false",
          ...attrs,
          onClick: () => api?.select(props.name),
        },
        slots.default?.() ?? props.label,
      );
  },
});

export const QTabPanelsStub = defineComponent({
  name: "QTabPanelsStub",
  props: { modelValue: { type: String, default: "" } },
  setup(props, { slots, attrs }) {
    provide(panelsSymbol, computed(() => props.modelValue));
    return () =>
      h(
        "div",
        {
          class: "q-tab-panels-stub",
          "data-model": props.modelValue,
          ...attrs,
        },
        slots.default?.(),
      );
  },
});

export const QTabPanelStub = defineComponent({
  name: "QTabPanelStub",
  props: { name: { type: String, required: true } },
  setup(props, { slots, attrs }) {
    const current = inject<ReturnType<typeof computed>>(panelsSymbol, computed(() => ""));
    return () =>
      current.value === props.name
        ? h(
            "div",
            {
              class: "q-tab-panel-stub",
              "data-panel": props.name,
              ...attrs,
            },
            slots.default?.(),
          )
        : null;
  },
});

export const QExpansionItemStub = defineComponent({
  name: "QExpansionItemStub",
  props: { modelValue: { type: Boolean, default: false } },
  emits: ["update:modelValue"],
  setup(props, { slots, attrs }) {
    return () =>
      h(
        "div",
        {
          class: "q-expansion-item-stub",
          "data-expanded": props.modelValue ? "true" : "false",
          ...attrs,
        },
        [slots.header?.({ expanded: props.modelValue }), slots.default?.()],
      );
  },
});

export const QDialogStub = defineComponent({
  name: "QDialogStub",
  props: { modelValue: { type: Boolean, default: false } },
  setup(props, { slots, attrs }) {
    return () =>
      props.modelValue
        ? h("div", { class: "q-dialog-stub", ...attrs }, slots.default?.())
        : null;
  },
});

export const QSkeletonStub = defineComponent({
  name: "QSkeletonStub",
  setup(_, { attrs }) {
    return () => h("div", { class: "q-skeleton-stub", "data-test": "wallet-skeleton", ...attrs });
  },
});
