import { beforeEach, describe, expect, it } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { mount } from "@vue/test-utils";
import WelcomeSlidePwa from "../../../src/pages/welcome/WelcomeSlidePwa.vue";

describe("WelcomeSlidePwa", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("disables install button when prompt not available", () => {
    const wrapper = mount(WelcomeSlidePwa, {
      props: { deferredPrompt: undefined },
      global: {
        mocks: { $t: (msg: string) => msg, $q: {} },
        stubs: {
          "q-btn": {
            props: ["disable"],
            template: "<button :disabled='disable'><slot/></button>",
          },
          "q-icon": { template: "<i></i>" },
        },
      },
    });
    const btn = wrapper.find("button");
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  });
});
