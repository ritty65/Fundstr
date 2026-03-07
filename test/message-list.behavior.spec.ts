import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h } from "vue";

import MessageList from "src/components/MessageList.vue";

describe("MessageList", () => {
  function mountList(messages: any[], options?: { scrollTo?: ReturnType<typeof vi.fn> }) {
    const scrollTo = options?.scrollTo ?? vi.fn();

    const QVirtualScrollStub = defineComponent({
      name: "QVirtualScroll",
      props: {
        items: {
          type: Array,
          default: () => [],
        },
      },
      setup(props, { slots, expose }) {
        expose({ scrollTo });
        return () =>
          h(
            "div",
            { class: "virtual-scroll" },
            props.items.map((item: any, index: number) =>
              slots.default ? slots.default({ item, index }) : null,
            ),
          );
      },
    });

    const ChatMessageBubbleStub = defineComponent({
      name: "ChatMessageBubble",
      props: {
        message: {
          type: Object,
          required: true,
        },
        prevMessage: {
          type: Object,
          default: undefined,
        },
      },
      setup(props) {
        return () =>
          h(
            "div",
            {
              class: "chat-bubble",
              "data-prev": props.prevMessage?.id || "",
              "data-message": props.message.id,
            },
          );
      },
    });

    const wrapper = mount(MessageList, {
      props: { messages },
      global: {
        stubs: {
          "q-virtual-scroll": QVirtualScrollStub,
          ChatMessageBubble: ChatMessageBubbleStub,
        },
      },
    });

    return { wrapper, scrollTo };
  }

  it("renders date separators when day changes", () => {
    const base = Math.floor(Date.now() / 1000);
    const messages = [
      { id: "1", created_at: base, content: "first" },
      { id: "2", created_at: base + 60, content: "second" },
      { id: "3", created_at: base + 86400, content: "next" },
    ];

    const { wrapper } = mountList(messages);

    const separators = wrapper.findAll(".divider-text");
    expect(separators.length).toBe(2);

    const expectedFirstDay = new Date(base * 1000).toLocaleDateString();
    expect(separators[0].text()).toBe(expectedFirstDay);
    const expectedSecondDay = new Date((base + 86400) * 1000).toLocaleDateString();
    expect(separators[1].text()).toBe(expectedSecondDay);
  });

  it("passes previous message to ChatMessageBubble", () => {
    const base = Math.floor(Date.now() / 1000);
    const messages = [
      { id: "1", created_at: base, content: "first" },
      { id: "2", created_at: base + 60, content: "second" },
    ];

    const { wrapper } = mountList(messages);
    const bubbles = wrapper.findAll(".chat-bubble");

    expect(bubbles[0].attributes("data-prev")).toBe("");
    expect(bubbles[1].attributes("data-prev")).toBe("1");
  });

  it("auto-scrolls to end when new message arrives", async () => {
    const base = Math.floor(Date.now() / 1000);
    const messages = [{ id: "1", created_at: base, content: "first" }];

    const scrollSpy = vi.fn();
    const { wrapper } = mountList(messages, { scrollTo: scrollSpy });

    const nextMessages = [
      ...messages,
      { id: "2", created_at: base + 60, content: "second" },
    ];

    await wrapper.setProps({ messages: nextMessages });
    await flushPromises();

    expect(scrollSpy).toHaveBeenCalledWith(nextMessages.length - 1, "end");
  });
});
