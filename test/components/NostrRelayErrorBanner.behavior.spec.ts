import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import NostrRelayErrorBanner from "src/components/NostrRelayErrorBanner.vue";

type RelayError = { message: string; details?: { byRelay?: Array<{ url: string; err?: string }> } };

const qBannerStub = {
  name: "QBannerStub",
  template: `
    <div class="q-banner">
      <slot />
      <div class="actions">
        <slot name="action" />
      </div>
    </div>
  `,
};

const qBtnStub = {
  name: "QBtnStub",
  props: ["label", "flat", "dense"],
  emits: ["click"],
  template: `
    <button type="button" @click="$emit('click')">
      <slot />
      <span v-if="label">{{ label }}</span>
    </button>
  `,
};

function mountBanner(props: { error?: RelayError; allowReplace?: boolean }) {
  return mount(NostrRelayErrorBanner, {
    props,
    global: {
      stubs: {
        "q-banner": qBannerStub,
        "q-btn": qBtnStub,
      },
    },
  });
}

describe("NostrRelayErrorBanner", () => {
  it("renders a relay failure table with contextual suggestions", () => {
    const wrapper = mountBanner({
      error: {
        message: "All relays failed",
        details: {
          byRelay: [
            { url: "wss://relay.one", err: "timeout" },
            { url: "wss://relay.two", err: "notConnected" },
            { url: "wss://relay.three", err: "blocked" },
            { url: "wss://relay.four" },
          ],
        },
      },
      allowReplace: true,
    });

    const text = wrapper.text();
    expect(text).toContain("All relays failed");
    expect(text).toContain("wss://relay.one");
    expect(text).toContain("timeout");
    expect(text).toContain("Relay timeout");
    expect(text).toContain("Check URL or connectivity");
    expect(text).toContain("Relay rejected event");
    expect(wrapper.findAll("tbody tr")).toHaveLength(4);
  });

  it("emits retry, replace, and manage events", async () => {
    const wrapper = mountBanner({
      error: {
        message: "Failed",
        details: { byRelay: [] },
      },
      allowReplace: true,
    });

    const [retry, replace, manage] = wrapper.findAll("button");
    expect(retry.text()).toContain("Retry");
    expect(replace.text()).toContain("Replace with vetted relays");
    expect(manage.text()).toContain("Manage");

    await retry.trigger("click");
    await replace.trigger("click");
    await manage.trigger("click");

    expect(wrapper.emitted().retry).toHaveLength(1);
    expect(wrapper.emitted().replace).toHaveLength(1);
    expect(wrapper.emitted().manage).toHaveLength(1);
  });

  it("hides the replace action when not allowed", () => {
    const wrapper = mountBanner({
      error: { message: "Failed", details: { byRelay: [] } },
      allowReplace: false,
    });

    const buttons = wrapper.findAll("button");
    expect(buttons).toHaveLength(2);
    expect(buttons[0].text()).toContain("Retry");
    expect(buttons[1].text()).toContain("Manage");
  });
});
