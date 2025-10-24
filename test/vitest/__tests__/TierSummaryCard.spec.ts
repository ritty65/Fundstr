import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TierSummaryCard from "../../../src/components/TierSummaryCard.vue";

const baseTier = {
  name: "Supporter",
  media: [{ url: "https://example.com/one.png" }],
};

function mountComponent(props: Record<string, unknown> = {}) {
  return mount(TierSummaryCard, {
    props: {
      tier: baseTier,
      priceSats: 1000,
      ...props,
    },
    global: {
      stubs: {
        QBtn: {
          template: "<button class=\"q-btn\"><slot /></button>",
        },
        MediaPreview: {
          template: "<div class=\"media-preview\"></div>",
        },
      },
    },
  });
}

describe("TierSummaryCard", () => {
  it("keeps media collapsed until toggled when collapseMedia is true", async () => {
    const wrapper = mountComponent({ collapseMedia: true });

    const toggle = wrapper.get("[data-testid='tier-media-toggle']");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.find(".tier-card__media").exists()).toBe(false);

    await toggle.trigger("click");

    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".tier-card__media").exists()).toBe(true);
  });

  it("shows media by default when collapseMedia is false", () => {
    const wrapper = mountComponent({ collapseMedia: false });

    const toggle = wrapper.get("[data-testid='tier-media-toggle']");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".tier-card__media").exists()).toBe(true);
  });

  it("renders only provided benefits without fallbacks", () => {
    const wrapper = mountComponent({
      tier: { ...baseTier, benefits: ["Custom perk"] },
    });

    const benefits = wrapper
      .findAll(".tier-card__benefit")
      .map((node) => node.text());

    expect(benefits).toEqual(["Custom perk"]);
    expect(wrapper.find(".tier-card__section-title").text()).toBe("Benefits");
  });

  it("hides the benefits section when normalized benefits are empty", () => {
    const wrapper = mountComponent({
      tier: { ...baseTier, benefits: ["   "] },
    });

    expect(wrapper.find(".tier-card__benefits").exists()).toBe(false);
  });

  it("shows supplied benefits without defaults when explicitly disabled", () => {
    const wrapper = mountComponent({
      tier: { ...baseTier, benefits: ["  Exclusive stream access "] },
      useDefaultBenefits: false,
    });

    const benefits = wrapper
      .findAll(".tier-card__benefit")
      .map((node) => node.text());

    expect(benefits).toEqual(["Exclusive stream access"]);
  });

  it("suppresses the benefits section when showBenefits is false", () => {
    const wrapper = mountComponent({
      tier: { ...baseTier, benefits: ["Priority support"] },
      showBenefits: false,
    });

    expect(wrapper.find(".tier-card__benefits").exists()).toBe(false);
  });
});
