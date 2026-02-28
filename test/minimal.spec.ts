import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { ref } from "vue";
import { createI18n } from "vue-i18n";
import { messages as enMessages } from "../src/i18n/en-US/index.ts";
import CreatorSubscribersPage from "../src/pages/CreatorSubscribersPage.vue";

vi.mock("@vueuse/core", () => ({
  useDebounceFn: (fn: any) => fn,
  useLocalStorage: (_k: any, v: any) => ref(v),
  onKeyStroke: () => {},
}));

vi.mock("src/utils/clipboard", () => ({
  copyNpub: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("src/utils/subscriberCsv", () => ({
  default: vi.fn(),
}));

vi.mock("src/stores/nostr", () => ({
  useNostrStore: () => ({
    initNdkReadOnly: vi.fn().mockResolvedValue(undefined),
    resolvePubkey: (s: string) => s,
    connected: true,
    lastError: null,
  }),
}));

vi.mock("src/composables/useNdk", () => {
  const fetchEvents = vi.fn().mockResolvedValue(new Set());
  return {
    useNdk: vi.fn().mockResolvedValue({ fetchEvents }),
  };
});

describe("Minimal test for CreatorSubscribersPage", () => {
  it("mounts without errors", () => {
    const i18n = createI18n({
      locale: "en-US",
      messages: { "en-US": enMessages },
    });
    const wrapper = mount(CreatorSubscribersPage, {
      global: {
        plugins: [
          createTestingPinia({ createSpy: vi.fn, stubActions: false }),
          i18n,
        ],
      },
    });
    expect(wrapper.exists()).toBe(true);
  });
});