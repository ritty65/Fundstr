import { beforeEach, describe, expect, it, vi } from "vitest";
import { shallowMount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nip19 } from "nostr-tools";

import NewChat from "src/components/NewChat.vue";
import type { DmSuggestion } from "src/utils/dmSuggestions";

const searchDmSuggestions = vi.hoisted(() => vi.fn());
vi.mock("src/utils/dmSuggestions", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchDmSuggestions,
  };
});

const notifyError = vi.hoisted(() => vi.fn());
vi.mock("src/js/notify", () => ({
  notifyError,
}));

const resolvePubkey = vi.hoisted(() => vi.fn((pk: string) => `resolved-${pk}`));
vi.mock("src/stores/nostr", () => ({
  useNostrStore: () => ({
    resolvePubkey,
  }),
}));

const QInputStub = {
  name: "q-input",
  props: ["modelValue", "label", "loading"],
  emits: ["update:modelValue", "keyup"],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup="$emit(\'keyup\', $event)" />',
};
const QListStub = {
  name: "q-list",
  template: '<div v-bind="$attrs"><slot /></div>',
};
const QItemStub = {
  name: "q-item",
  emits: ["click"],
  template: '<div v-bind="$attrs" @click="$emit(\'click\')"><slot /></div>',
};
const QItemSectionStub = {
  name: "q-item-section",
  template: '<div><slot /></div>',
};
const QItemLabelStub = {
  name: "q-item-label",
  template: '<div><slot /></div>',
};
const QAvatarStub = {
  name: "q-avatar",
  template: '<div><slot /></div>',
};
const QBtnStub = {
  name: "q-btn",
  props: ["disable"],
  emits: ["click"],
  template: '<button @click="$emit(\'click\')"><slot /></button>',
};
const QBannerStub = {
  name: "q-banner",
  template: '<div v-bind="$attrs"><slot /></div>',
};

function mountComponent() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return shallowMount(NewChat, {
    global: {
      plugins: [pinia],
      stubs: {
        "q-input": QInputStub,
        "q-list": QListStub,
        "q-item": QItemStub,
        "q-item-section": QItemSectionStub,
        "q-item-label": QItemLabelStub,
        "q-avatar": QAvatarStub,
        "q-btn": QBtnStub,
        "q-banner": QBannerStub,
      },
    },
  });
}

describe("NewChat suggestions", () => {
  beforeEach(() => {
    searchDmSuggestions.mockReset();
    resolvePubkey.mockClear();
  });

  it("shows phonebook suggestions and emits start on selection", async () => {
    const pubkey = "a".repeat(64);
    const suggestion: DmSuggestion = {
      pubkey,
      npub: nip19.npubEncode(pubkey),
      label: "Jack",
      picture: "https://example.com/pic.jpg",
      nip05: "jack@example.com",
      raw: {
        pubkey,
        name: "",
        display_name: "Jack",
        about: null,
        picture: "https://example.com/pic.jpg",
        nip05: "jack@example.com",
      },
    };
    searchDmSuggestions.mockResolvedValue([suggestion]);

    const wrapper = mountComponent();
    const input = wrapper.find("input");
    await input.setValue("jack");
    await flushPromises();

    expect(searchDmSuggestions).toHaveBeenCalledWith("jack", expect.any(AbortSignal));

    const suggestionNode = wrapper.find('[data-test="dm-suggestion"]');
    expect(suggestionNode.exists()).toBe(true);

    await suggestionNode.trigger("click");

    const emitted = wrapper.emitted("start");
    expect(emitted?.[0]?.[0]).toBe(`resolved-${pubkey}`);
    expect(resolvePubkey).toHaveBeenCalledWith(pubkey);
  });

  it("keeps direct pubkey flow working", async () => {
    const hex = "b".repeat(64);
    searchDmSuggestions.mockResolvedValue([]);

    const wrapper = mountComponent();
    const input = wrapper.find("input");
    await input.setValue(hex);
    await input.trigger("keyup", { key: "Enter" });

    const emitted = wrapper.emitted("start");
    expect(emitted?.[0]?.[0]).toBe(`resolved-${hex}`);
    expect(searchDmSuggestions).not.toHaveBeenCalled();
  });

  it("shows a no matches banner for empty phonebook results but not for direct keys", async () => {
    searchDmSuggestions.mockResolvedValue([]);

    const wrapper = mountComponent();
    const input = wrapper.find("input");

    await input.setValue("something");
    await flushPromises();

    expect(searchDmSuggestions).toHaveBeenCalledWith("something", expect.any(AbortSignal));
    const banner = wrapper.findComponent({ name: "q-banner" });
    expect(banner.exists()).toBe(true);
    expect(banner.text()).toContain("No matches found");

    const hex = "c".repeat(64);
    searchDmSuggestions.mockClear();
    await input.setValue(hex);
    await flushPromises();

    expect(searchDmSuggestions).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "q-banner" }).exists()).toBe(false);

    const npub = nip19.npubEncode(hex);
    await input.setValue(npub);
    await flushPromises();

    expect(searchDmSuggestions).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "q-banner" }).exists()).toBe(false);
  });
});
