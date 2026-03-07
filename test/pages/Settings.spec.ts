import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { defineComponent, h } from "vue";

import "./pageStoreMocks";

const SettingsViewStub = defineComponent({
  name: "SettingsViewStub",
  setup() {
    return () => h("div", { "data-test": "settings-view" }, "Settings content");
  },
});

const stubs = {
  SettingsView: SettingsViewStub,
};

describe("Settings page", () => {
  it("wraps the settings view in the themed container", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: (await import("src/pages/Settings.vue")).default }],
    });
    await router.push("/");
    await router.isReady();
    const module = await import("src/pages/Settings.vue");
    const component = module.default;

    const wrapper = mount(component, {
      global: {
        plugins: [router],
        stubs,
        mocks: { $t: (key: string) => key, $q: { dark: { isActive: false }, screen: { gt: { xs: true }, lt: { md: false } } } },
      },
    });

    expect(wrapper.classes()).toContain("flex");
    expect(wrapper.classes()).toContain("flex-center");
    expect(wrapper.find("[data-test='settings-view']").exists()).toBe(true);
  });
});
