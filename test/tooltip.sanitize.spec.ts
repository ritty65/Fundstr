import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import MintAuditSwapsBarChart from "../src/components/MintAuditSwapsBarChart.vue";
import safeHtml from "../src/directives/safeHtml";

describe("MintAuditSwapsBarChart tooltip", () => {
  it("sanitizes tooltip content", async () => {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    const wrapper = mount(MintAuditSwapsBarChart, {
      props: { swaps: [] },
      global: { directives: { "safe-html": safeHtml } },
    });
    (globalThis as any).__x = false;
    (wrapper.vm as any).tooltip.value = {
      show: true,
      x: 0,
      y: 0,
      content: '<img src=x onerror="__x=true">',
    };
    await nextTick();
    expect((globalThis as any).__x).toBe(false);
    expect(wrapper.html()).not.toContain("onerror");
  });
});
