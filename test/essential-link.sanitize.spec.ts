import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import EssentialLink from "src/components/EssentialLink.vue";

const QItemStub = defineComponent({
  props: ["href", "target", "rel", "tag"],
  setup(props, { slots }) {
    return () =>
      h(
        props.tag || "div",
        { href: props.href, target: props.target, rel: props.rel },
        slots.default ? slots.default() : [],
      );
  },
});

describe("EssentialLink", () => {
  it("sanitizes malicious link", () => {
    const wrapper = mount(EssentialLink, {
      props: { title: "t", link: "javascript:console.log(1)" },
      global: {
        stubs: {
          "q-item": QItemStub,
          "q-item-section": { template: "<div><slot/></div>" },
          "q-item-label": { template: "<div><slot/></div>" },
          "q-icon": { template: "<i />" },
        },
      },
    });
    const a = wrapper.get("a");
    expect(a.attributes("href")).toBe("#");
    expect(a.attributes("rel")).toBe("noopener noreferrer");
  });
});
