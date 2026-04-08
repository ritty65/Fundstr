import { beforeEach, describe, expect, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import WelcomeSlidePwa from "../../../src/pages/welcome/WelcomeSlidePwa.vue";

describe("WelcomeSlidePwa", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("shows coming soon copy without install controls", () => {
    const wrapper = mount(WelcomeSlidePwa, {
      global: {
        mocks: { $t: (msg: string) => msg, $q: {} },
        stubs: {
          "q-icon": { template: "<i></i>" },
        },
      },
    });
    expect(wrapper.text()).toContain("Welcome.pwa.title");
    expect(wrapper.find("button").exists()).toBe(false);
  });
});
