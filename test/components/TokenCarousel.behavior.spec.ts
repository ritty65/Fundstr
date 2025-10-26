import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";

vi.mock("src/utils/receipt-utils", () => ({
  saveReceipt: vi.fn(),
}));

import TokenCarousel from "src/components/TokenCarousel.vue";
import { saveReceipt } from "src/utils/receipt-utils";

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

const QCarouselStub = defineComponent({
  name: "QCarouselStub",
  props: { modelValue: { type: Number, default: 0 } },
  emits: ["update:modelValue"],
  setup(props, { slots }) {
    return () => h("div", { class: "q-carousel", "data-model": props.modelValue }, slots.default?.());
  },
});

const QCarouselSlideStub = defineComponent({
  name: "QCarouselSlideStub",
  setup(_, { slots, attrs }) {
    return () => h("div", { class: "q-carousel-slide", ...attrs }, slots.default?.());
  },
});

function mountCarousel(options?: {
  payments?: Array<Record<string, any>>;
  creator?: boolean;
}) {
  const wrapper = mount(TokenCarousel, {
    props: {
      payments:
        options?.payments ?? [
          {
            token: "encoded",
            status: "redeemable",
            unlock_time: undefined,
          },
        ],
      creator: options?.creator ?? true,
      message: { id: "message" },
    },
    global: {
      stubs: {
        "q-carousel": QCarouselStub,
        "q-carousel-slide": QCarouselSlideStub,
        "q-btn": QBtnStub,
        "q-badge": SimpleStub,
        "q-icon": SimpleStub,
        TokenInformation: SimpleStub,
      },
    },
  });

  return wrapper;
}

describe("TokenCarousel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits a redeem event when the redeem button is clicked", async () => {
    const payment = { token: "encoded", status: "redeemable", unlock_time: undefined };
    const wrapper = mountCarousel({ payments: [payment], creator: true });

    const redeemButton = wrapper
      .findAll("button")
      .find((btn) => btn.text() === "Redeem");
    expect(redeemButton).toBeTruthy();

    await redeemButton!.trigger("click");

    expect(wrapper.emitted("redeem")).toBeTruthy();
    expect(wrapper.emitted("redeem")?.[0]).toEqual([payment]);

    wrapper.unmount();
  });

  it("disables the redeem action while a payment is locked", () => {
    const future = Math.floor(Date.now() / 1000) + 120;
    const wrapper = mountCarousel({
      payments: [
        {
          token: "locked",
          status: "pending",
          unlock_time: future,
        },
      ],
      creator: true,
    });

    const redeemButton = wrapper
      .findAll("button")
      .find((btn) => btn.text() === "Redeem");
    expect(redeemButton).toBeTruthy();
    expect(redeemButton!.attributes("disabled")).toBeDefined();

    wrapper.unmount();
  });

  it("downloads the receipt when the download button is clicked", async () => {
    const message = { id: "message", note: "details" };
    const payment = { token: "encoded", status: "claimed", unlock_time: undefined };
    const wrapper = mountCarousel({ payments: [payment], creator: false });
    await wrapper.setProps({ message });

    const downloadButton = wrapper
      .findAll("button")
      .find((btn) => btn.text() === "Download");
    expect(downloadButton).toBeTruthy();

    await downloadButton!.trigger("click");

    expect(saveReceipt).toHaveBeenCalledWith({ ...message, subscriptionPayment: payment });

    wrapper.unmount();
  });
});
