import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, h, reactive, ref } from "vue";

const messengerStoreFactory = () => {
  const conversations = ref<Record<string, any[]>>({
    alice: [
      { id: "m1", created_at: 1700000000, content: "Hello" },
      { id: "m2", created_at: 1700000500, content: "Again" },
    ],
    bob: [{ id: "m3", created_at: 1700001000, content: "Hey" }],
  });
  const pinned = reactive<Record<string, boolean>>({ alice: true });

  return {
    conversations,
    pinned,
    drawerMini: false,
    togglePin: vi.fn(),
    deleteConversation: vi.fn(),
  };
};

const nostrStoreFactory = () => {
  return {
    profiles: reactive<Record<string, any>>({
      alice: { profile: { display_name: "Alice" } },
    }),
    resolvePubkey: vi.fn((pk: string) => `resolved-${pk}`),
    getProfile: vi.fn(() => Promise.resolve()),
  };
};

let currentMessenger = messengerStoreFactory();
let currentNostr = nostrStoreFactory();

vi.mock("src/stores/messenger", () => ({
  useMessengerStore: () => currentMessenger,
}));

vi.mock("src/stores/nostr", () => ({
  useNostrStore: () => currentNostr,
}));

import ConversationList from "src/components/ConversationList.vue";

describe("ConversationList", () => {
  beforeEach(() => {
    currentMessenger = messengerStoreFactory();
    currentNostr = nostrStoreFactory();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function mountList(overrides?: {
    search?: string;
    mini?: boolean;
    messenger?: ReturnType<typeof messengerStoreFactory>;
    nostr?: ReturnType<typeof nostrStoreFactory>;
  }) {
    if (overrides?.messenger) {
      currentMessenger = overrides.messenger;
    }
    if (overrides?.nostr) {
      currentNostr = overrides.nostr;
    }

    const QVirtualScrollStub = defineComponent({
      name: "QVirtualScroll",
      props: {
        items: {
          type: Array,
          default: () => [],
        },
      },
      setup(props, { slots }) {
        return () =>
          h(
            "div",
            { class: "conversation-scroll" },
            props.items.map((item: any) =>
              slots.default ? slots.default({ item }) : null,
            ),
          );
      },
    });

    const ConversationListItemStub = defineComponent({
      name: "ConversationListItem",
      props: {
        pubkey: { type: String, required: true },
        lastMsg: { type: Object, required: true },
        selected: { type: Boolean, default: false },
      },
      emits: ["click", "pin", "delete"],
      setup(props, { emit }) {
        return () =>
          h(
            "div",
            {
              class: "conversation-item",
              "data-pubkey": props.pubkey,
              onClick: () => emit("click"),
            },
            [
              h(
                "button",
                {
                  class: "pin-toggle",
                  type: "button",
                  onClick: (event: Event) => {
                    event.stopPropagation();
                    emit("pin");
                  },
                },
                "pin",
              ),
            ],
          );
      },
    });

    const wrapper = mount(ConversationList, {
      props: {
        selectedPubkey: "resolved-alice",
        search: overrides?.search,
        mini: overrides?.mini,
      },
      global: {
        stubs: {
          "q-virtual-scroll": QVirtualScrollStub,
          ConversationListItem: ConversationListItemStub,
        },
      },
    });

    return { wrapper };
  }

  it("renders headers for pinned and regular conversations", () => {
    const { wrapper } = mountList();

    const headers = wrapper.findAll(".conversation-header");
    expect(headers.length).toBe(2);
    expect(headers[0].text()).toBe("Pinned");
    expect(headers[1].text()).toBe("All Conversations");

    const items = wrapper.findAll(".conversation-item");
    expect(items.map((i) => i.attributes("data-pubkey"))).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("filters conversations when search query changes", async () => {
    const messenger = messengerStoreFactory();
    const nostr = nostrStoreFactory();
    nostr.profiles.bob = { profile: { display_name: "Bob" } };

    const { wrapper } = mountList({ messenger, nostr, search: "alice" });

    let items = wrapper.findAll(".conversation-item");
    expect(items).toHaveLength(1);
    expect(items[0].attributes("data-pubkey")).toBe("alice");

    currentMessenger = messenger;
    currentNostr = nostr;
    await wrapper.setProps({ search: "bob" });
    await flushPromises();

    items = wrapper.findAll(".conversation-item");
    expect(items).toHaveLength(1);
    expect(items[0].attributes("data-pubkey")).toBe("bob");
  });

  it("toggles pin using resolved pubkey", async () => {
    const messenger = messengerStoreFactory();
    const nostr = nostrStoreFactory();

    const { wrapper } = mountList({ messenger, nostr });

    const itemComponents = wrapper.findAllComponents({ name: "ConversationListItem" });
    const bobItem = itemComponents.find((c) => c.props("pubkey") === "bob");
    expect(bobItem).toBeDefined();

    bobItem!.vm.$emit("pin");

    expect(nostr.resolvePubkey).toHaveBeenCalledWith("bob");
    expect(messenger.togglePin).toHaveBeenCalledWith("resolved-bob");
  });

  it("loads missing profiles for conversations", async () => {
    vi.useFakeTimers();

    const messenger = messengerStoreFactory();
    const nostr = nostrStoreFactory();
    delete nostr.profiles.bob;

    mountList({ messenger, nostr });

    await vi.runAllTimersAsync();
    await flushPromises();

    expect(nostr.getProfile).toHaveBeenCalledWith("bob");
    expect(nostr.getProfile).not.toHaveBeenCalledWith("alice");

    vi.useRealTimers();
  });
});
