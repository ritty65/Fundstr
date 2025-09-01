import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { useNostrStore } from "src/stores/nostr";
import { useMessengerStore } from "src/stores/messenger";

async function mountBubble(message: any, prevMessage?: any) {
  (window as any).windowMixin = {};
  const ChatMessageBubble = (
    await import("src/components/ChatMessageBubble.vue")
  ).default;
  const pinia = createTestingPinia({ createSpy: vi.fn });
  const nostr = useNostrStore();
  nostr.pubkey = "pk";
  nostr.getProfile = vi.fn().mockResolvedValue(null);
  const messenger = useMessengerStore();
  messenger.aliases = {};
  return shallowMount(ChatMessageBubble, {
    props: { message, prevMessage },
    global: { plugins: [pinia] },
  });
}

describe("ChatMessageBubble alignment", () => {
  it("aligns consecutive outgoing messages without avatar", async () => {
    const message = {
      id: "2",
      pubkey: "pk",
      content: "hello",
      created_at: 100,
      outgoing: true,
    };
    const prevMessage = {
      id: "1",
      pubkey: "pk",
      content: "hi",
      created_at: 90,
      outgoing: true,
    };
    const wrapper = await mountBubble(message, prevMessage);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll("q-avatar-stub").length).toBe(0);
    expect(wrapper.classes()).toContain("justify-end");
    const column = wrapper.find("div.column");
    expect(column.classes()).toContain("items-end");
  });

  it("aligns consecutive incoming messages without avatar", async () => {
    const message = {
      id: "2",
      pubkey: "other",
      content: "hello",
      created_at: 100,
      outgoing: false,
    };
    const prevMessage = {
      id: "1",
      pubkey: "other",
      content: "hi",
      created_at: 90,
      outgoing: false,
    };
    const wrapper = await mountBubble(message, prevMessage);
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll("q-avatar-stub").length).toBe(0);
    expect(wrapper.classes()).toContain("justify-start");
    const column = wrapper.find("div.column");
    expect(column.classes()).toContain("items-start");
  });
});
