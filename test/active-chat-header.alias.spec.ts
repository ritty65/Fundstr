import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { useMessengerStore } from "src/stores/messenger";
import { useNostrStore } from "src/stores/nostr";

describe("ActiveChatHeader", () => {
  it("ignores non-string aliases", async () => {
    const ActiveChatHeader = (await import("src/components/ActiveChatHeader.vue")).default;
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const messenger = useMessengerStore();
    messenger.aliases["pk"] = {} as any;
    const nostr = useNostrStore();
    nostr.getProfile = vi.fn().mockResolvedValue(null);
    nostr.resolvePubkey = vi.fn().mockReturnValue("pk");
    const wrapper = shallowMount(ActiveChatHeader, {
      props: { pubkey: "pk", relays: [] },
      global: { plugins: [pinia] },
    });
    expect(wrapper.find(".text-h6").text()).not.toBe("[object Object]");
  });
});
