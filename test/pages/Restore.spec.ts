import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { defineComponent, h } from "vue";

import "./pageStoreMocks";

const RestoreViewStub = defineComponent({
  name: "RestoreViewStub",
  setup() {
    return () => h("div", { "data-test": "restore-view" }, "Restore flow");
  },
});

const ThemeToggleStub = defineComponent({
  name: "ThemeToggleStub",
  setup(_, { attrs }) {
    return () => h("button", { "data-test": "theme-toggle", ...attrs }, "Toggle");
  },
});

const stubs = {
  RestoreView: RestoreViewStub,
  ThemeToggle: ThemeToggleStub,
};

describe("Restore page", () => {
  it("exposes the restore workflow prompt and theme toggle", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: (await import("src/pages/Restore.vue")).default }],
    });
    await router.push("/");
    await router.isReady();
    const module = await import("src/pages/Restore.vue");
    const component = module.default;

    const wrapper = mount(component, {
      global: {
        plugins: [router],
        stubs,
        mocks: { $t: (key: string) => key, $q: { dark: { isActive: false }, screen: { gt: { xs: true }, lt: { md: false } } } },
      },
    });

    expect(wrapper.find("[data-test='restore-view']").exists()).toBe(true);
    const toggle = wrapper.find("[data-test='theme-toggle']");
    expect(toggle.exists()).toBe(true);
    expect(toggle.classes()).toContain("absolute-top-right");
  });
});
