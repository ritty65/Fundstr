import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { useNostrStore } from "src/stores/nostr";

describe("ChatMessageBubble", () => {
  it("blocks HTML data URLs", async () => {
    (window as any).windowMixin = {};
    const ChatMessageBubble = (
      await import("src/components/ChatMessageBubble.vue")
    ).default;
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const nostr = useNostrStore();
    nostr.pubkey = "pk";
    nostr.getProfile = vi.fn().mockResolvedValue(null);
    const message = {
      id: "1",
      pubkey: "pk",
      content: "data:text/html,<script>console.log(1)</script>",
      created_at: 0,
      outgoing: true,
    };
    const wrapper = shallowMount(ChatMessageBubble, {
      props: { message },
      global: { plugins: [pinia] },
    });
    expect(wrapper.find("a").exists()).toBe(false);
  });
});
