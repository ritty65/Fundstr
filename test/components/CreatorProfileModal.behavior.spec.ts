import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import CreatorProfileModal from "components/CreatorProfileModal.vue";

interface DiscoveryMock {
  getCreators: ReturnType<typeof vi.fn>;
  getCreatorTiers: ReturnType<typeof vi.fn>;
}

const createDiscoveryMock = vi.hoisted(() => () => ({
  getCreators: vi.fn(),
  getCreatorTiers: vi.fn(),
} as DiscoveryMock));

let discoveryMock = createDiscoveryMock();

vi.mock("src/api/fundstrDiscovery", () => ({
  useFundstrDiscovery: () => discoveryMock,
}));

const createRouterMock = vi.hoisted(() => () => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

let routerMock = createRouterMock();

vi.mock("vue-router", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRouter: () => routerMock,
    useRoute: vi.fn(() => ({ params: {}, query: {} })),
  };
});

const createQuasarMock = vi.hoisted(() => () => ({
  dark: { isActive: false },
  platform: { is: { mobile: false } },
  screen: {
    width: 1280,
    height: 720,
    lt: { sm: false, md: false },
    gt: { sm: true },
  },
  iconSet: { arrow: { dropdown: "arrow_drop_down" } },
  notify: vi.fn(),
}));

let quasarMock = createQuasarMock();

vi.mock("quasar", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQuasar: () => quasarMock,
  };
});

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const QDialogStub = defineComponent({
  name: "QDialogStub",
  props: { modelValue: { type: Boolean, default: false } },
  emits: ["update:modelValue"],
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h("div", { class: "q-dialog-stub" }, slots.default ? slots.default() : undefined)
        : null;
  },
});

const QCardStub = defineComponent({
  name: "QCardStub",
  setup(_, { slots, attrs }) {
    return () => {
      const rawClass = (attrs as Record<string, unknown>).class;
      const normalizedClass = Array.isArray(rawClass)
        ? rawClass
        : rawClass
          ? [rawClass as string]
          : [];
      return h(
        "div",
        { class: ["q-card-stub", ...normalizedClass] },
        slots.default ? slots.default() : undefined,
      );
    };
  },
});

const QCardSectionStub = defineComponent({
  name: "QCardSectionStub",
  setup(_, { slots, attrs }) {
    return () => {
      const rawClass = (attrs as Record<string, unknown>).class;
      const normalizedClass = Array.isArray(rawClass)
        ? rawClass
        : rawClass
          ? [rawClass as string]
          : [];
      return h(
        "section",
        { class: ["q-card-section-stub", ...normalizedClass] },
        slots.default ? slots.default() : undefined,
      );
    };
  },
});

const QBtnStub = defineComponent({
  name: "QBtnStub",
  inheritAttrs: false,
  props: {
    label: { type: String, default: undefined },
    disable: { type: Boolean, default: false },
  },
  emits: ["click"],
  setup(props, { slots, emit, attrs }) {
    return () => {
      const { class: rawClass, type: rawType, ...rest } = attrs as Record<string, unknown>;
      const normalizedClass = Array.isArray(rawClass)
        ? rawClass
        : rawClass
          ? [rawClass as string]
          : [];
      return h(
        "button",
        {
          ...(rest as Record<string, unknown>),
          type: (rawType as string | undefined) ?? "button",
          disabled: props.disable,
          class: ["q-btn-stub", ...normalizedClass],
          onClick: (event: Event) => emit("click", event),
        },
        slots.default ? slots.default() : props.label,
      );
    };
  },
});

const QAvatarStub = defineComponent({
  name: "QAvatarStub",
  setup(_, { slots, attrs }) {
    return () =>
      h(
        "div",
        { class: ["q-avatar-stub", attrs.class] },
        slots.default ? slots.default() : undefined,
      );
  },
});

const QSpinnerStub = defineComponent({
  name: "QSpinnerStub",
  setup(_, { attrs }) {
    return () => h("div", { class: ["q-spinner-stub", attrs.class] });
  },
});

const TierDetailsPanelStub = defineComponent({
  name: "TierDetailsPanelStub",
  inheritAttrs: false,
  props: {
    tierId: { type: String, required: true },
    tierName: { type: String, required: true },
    isActive: { type: Boolean, required: true },
    index: { type: Number, required: true },
  },
  emits: ["subscribe"],
  setup(props, { emit, attrs }) {
    return () => {
      const { class: rawClass, ...rest } = attrs as Record<string, unknown>;
      const normalizedClass = Array.isArray(rawClass)
        ? rawClass
        : rawClass
          ? [rawClass as string]
          : [];
      return h(
        "div",
        {
          ...(rest as Record<string, unknown>),
          class: [
            ...normalizedClass,
            "tier-details-panel-stub",
            props.isActive ? "tier-details-panel-stub--active" : null,
          ],
          "data-tier-id": props.tierId,
          "data-index": String(props.index),
        },
        [
          h("div", { class: "tier-details-panel-stub__name" }, props.tierName),
          h(
            "button",
            {
              type: "button",
              class: "tier-details-panel-stub__subscribe",
              onClick: () => emit("subscribe", props.tierId),
            },
            "Choose",
          ),
        ],
      );
    };
  },
});

function buildCreator(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    pubkey: "creator-pubkey",
    displayName: "Creator Name",
    about: "About creator",
    profile: {
      name: "Creator",
      about: "Full bio",
      picture: "https://example.com/avatar.png",
    },
    tiers: [
      {
        id: "tier-1",
        name: "Bronze",
        description: "Supporter tier",
        price_msat: 5000,
        benefits: ["Perk A", "Perk B"],
        period: "Monthly",
        media: [{ url: "https://example.com/image.png" }],
      },
    ],
    ...overrides,
  };
}

function mountModal(options?: { show?: boolean; pubkey?: string }) {
  return mount(CreatorProfileModal, {
    props: {
      show: options?.show ?? true,
      pubkey: options?.pubkey ?? "creator-pubkey",
    },
    global: {
      stubs: {
        "q-dialog": QDialogStub,
        "q-card": QCardStub,
        "q-card-section": QCardSectionStub,
        "q-btn": QBtnStub,
        "q-avatar": QAvatarStub,
        "q-spinner": QSpinnerStub,
        TierDetailsPanel: TierDetailsPanelStub,
      },
    },
  });
}

describe("CreatorProfileModal", () => {
  const originalRaf = globalThis.requestAnimationFrame;

  beforeEach(() => {
    discoveryMock = createDiscoveryMock();
    routerMock = createRouterMock();
    quasarMock = createQuasarMock();
    globalThis.requestAnimationFrame = originalRaf;
  });

  afterEach(() => {
    vi.clearAllMocks();
    globalThis.requestAnimationFrame = originalRaf;
  });

  it("shows a loading spinner while fetching data and hides it when complete", async () => {
    const deferred = createDeferred<{ results: unknown[] }>();
    discoveryMock.getCreators.mockReturnValueOnce(deferred.promise);
    discoveryMock.getCreatorTiers.mockResolvedValue({ tiers: [] });

    const wrapper = mountModal();

    expect(wrapper.find(".loading-state").exists()).toBe(true);
    expect(wrapper.find(".q-spinner-stub").exists()).toBe(true);

    deferred.resolve({ results: [buildCreator()] });
    await flushPromises();

    expect(wrapper.find(".loading-state").exists()).toBe(false);
    expect(wrapper.find(".tiers-carousel").exists()).toBe(true);
  });

  it("aborts the active fetch when the modal closes", async () => {
    let capturedSignal: AbortSignal | undefined;
    discoveryMock.getCreators.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });

    const wrapper = mountModal();
    await flushPromises();

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal?.aborted).toBe(false);

    await wrapper.setProps({ show: false });
    await nextTick();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it("supports keyboard navigation through tier carousel slides", async () => {
    const creator = buildCreator({
      tiers: [
        { id: "tier-1", name: "Bronze", price_msat: 5000, benefits: ["A"], period: "Monthly" },
        { id: "tier-2", name: "Silver", price_msat: 8000, benefits: ["B"], period: "Monthly" },
        { id: "tier-3", name: "Gold", price_msat: 12000, benefits: ["C"], period: "Monthly" },
      ],
    });
    discoveryMock.getCreators.mockResolvedValue({ results: [creator] });
    discoveryMock.getCreatorTiers.mockResolvedValue({ tiers: [] });

    const wrapper = mountModal();
    await flushPromises();

    const viewport = wrapper.find(".tiers-carousel__viewport");
    expect(viewport.exists()).toBe(true);

    const dots = () => wrapper.findAll(".tiers-carousel__dot");
    expect(dots().length).toBe(3);
    expect(dots()[0].attributes("aria-selected")).toBe("true");

    await viewport.trigger("keydown", { key: "ArrowRight" });
    await nextTick();
    expect(dots()[1].attributes("aria-selected")).toBe("true");

    await viewport.trigger("keydown", { key: "ArrowLeft" });
    await nextTick();
    expect(dots()[0].attributes("aria-selected")).toBe("true");

    await viewport.trigger("keydown", { key: "End" });
    await nextTick();
    expect(dots()[2].attributes("aria-selected")).toBe("true");

    await viewport.trigger("keydown", { key: "Home" });
    await nextTick();
    expect(dots()[0].attributes("aria-selected")).toBe("true");
  });

  it("shows the sticky footer CTA on small screens and focuses the primary tier", async () => {
    const creator = buildCreator({
      tiers: [
        { id: "tier-1", name: "Bronze", price_msat: 5000, benefits: ["A"], period: "Monthly" },
        { id: "tier-2", name: "Silver", price_msat: 8000, benefits: ["B"], period: "Monthly" },
      ],
    });
    discoveryMock.getCreators.mockResolvedValue({ results: [creator] });
    discoveryMock.getCreatorTiers.mockResolvedValue({ tiers: [] });

    quasarMock.screen.lt.md = true;
    quasarMock.screen.lt.sm = true;
    quasarMock.screen.gt.sm = false;
    quasarMock.screen.width = 640;

    const focusSpy = vi.fn();
    const scrollSpy = vi.fn();
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    };

    const wrapper = mountModal();
    await flushPromises();

    const viewport = wrapper.find(".tiers-carousel__viewport");
    (viewport.element as HTMLElement).focus = focusSpy;
    (viewport.element as HTMLElement).scrollIntoView = scrollSpy;

    const stickyButton = wrapper.find(".profile-sticky-footer__cta");
    expect(stickyButton.exists()).toBe(true);

    const nextButton = wrapper.findAll(".tiers-carousel__control")[1];
    await nextButton.trigger("click");
    await nextTick();
    expect(wrapper.findAll(".tiers-carousel__dot")[0].attributes("aria-selected")).toBe("false");

    await stickyButton.trigger("click");
    await nextTick();

    expect(wrapper.findAll(".tiers-carousel__dot")[0].attributes("aria-selected")).toBe("true");
    expect(focusSpy).toHaveBeenCalled();
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("navigates to subscriptions and emits actions when tiers are available", async () => {
    const creator = buildCreator();
    discoveryMock.getCreators.mockResolvedValue({ results: [creator] });
    discoveryMock.getCreatorTiers.mockResolvedValue({ tiers: [] });

    const wrapper = mountModal();
    await flushPromises();

    const subscribeButton = wrapper.find(".hero-actions .action-button.subscribe");
    expect(subscribeButton.attributes("disabled")).toBeUndefined();

    const actionButtons = wrapper
      .findAll(".hero-actions .action-button")
      .filter((btn) => !btn.classes("subscribe"));
    expect(actionButtons.length).toBe(2);

    await actionButtons[0].trigger("click");
    await actionButtons[1].trigger("click");

    const events = wrapper.emitted();
    expect(events.message?.[0]).toEqual(["creator-pubkey"]);
    expect(events.donate?.[0]).toEqual(["creator-pubkey"]);

    await subscribeButton.trigger("click");
    expect(routerMock.push).toHaveBeenCalledWith({
      path: "/subscriptions",
      query: { pubkey: "creator-pubkey", tier: "tier-1" },
    });
  });

  it("disables subscription when no tiers but still allows messaging and donations", async () => {
    const creator = buildCreator({ tiers: [] });
    discoveryMock.getCreators.mockResolvedValue({ results: [creator] });
    discoveryMock.getCreatorTiers.mockResolvedValue({ tiers: [] });

    const wrapper = mountModal();
    await flushPromises();

    const subscribeButton = wrapper.find(".hero-actions .action-button.subscribe");
    expect(subscribeButton.attributes("disabled")).toBe("");
    await subscribeButton.trigger("click");
    expect(routerMock.push).not.toHaveBeenCalled();

    const buttons = wrapper.findAll(".hero-actions .action-button").filter((btn) => !btn.classes("subscribe"));
    expect(buttons.length).toBe(2);
    await buttons[0].trigger("click");
    await buttons[1].trigger("click");

    expect(wrapper.emitted().message?.[0]).toEqual(["creator-pubkey"]);
    expect(wrapper.emitted().donate?.[0]).toEqual(["creator-pubkey"]);
  });

  it("shows an error state when creator data fails to load", async () => {
    discoveryMock.getCreators.mockRejectedValue(new Error("network"));
    discoveryMock.getCreatorTiers.mockResolvedValue({ tiers: [] });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const wrapper = mountModal();
    await flushPromises();

    expect(wrapper.find(".hero-actions").exists()).toBe(false);
    expect(wrapper.text()).toContain("We couldn't load this creator's profile");

    consoleError.mockRestore();
  });
});
