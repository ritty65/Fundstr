import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

const dark = {
  isActive: false,
  toggle: vi.fn(function () {
    this.isActive = !this.isActive;
  }),
};

const $q = {
  dark,
  localStorage: { set: vi.fn() },
};

vi.mock("quasar", () => ({
  useQuasar: () => $q,
  QBtn: { template: '<button @click="$emit(\'click\')"><slot/></button>' },
}));

import ThemeToggle from "../../../src/components/ThemeToggle.vue";

describe("ThemeToggle", () => {
  it("toggles dark mode", async () => {
    const wrapper = mount(ThemeToggle);

    const initialCalls = dark.toggle.mock.calls.length;
    await wrapper.find("button").trigger("click");
    expect(dark.toggle.mock.calls.length).toBeGreaterThan(initialCalls);
  });
});

