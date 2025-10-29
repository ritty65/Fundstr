import { describe, it, expect, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import { defineComponent, h, nextTick } from "vue";

import "./pageStoreMocks";
import { useMessengerStore } from "src/stores/messenger";
import { useNostrStore } from "src/stores/nostr";
import { useNdk } from "src/composables/useNdk";


function createDeferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve: resolve! };
}

const SimpleStub = (name: string) =>
  defineComponent({
    name: `${name}Stub`,
    setup(_, { slots, attrs }) {
      return () => h("div", { class: `${name}-stub`, ...attrs }, slots.default?.());
    },
  });

const QBannerStub = SimpleStub("QBanner");

const QBtnStub = defineComponent({
  name: "QBtnStub",
  props: { label: { type: String, default: "" } },
  emits: ["click"],
  setup(props, { slots, attrs, emit }) {
    return () =>
      h(
        "button",
        {
          type: "button",
          class: "q-btn-stub",
          ...attrs,
          onClick: (event: MouseEvent) => emit("click", event),
        },
        slots.default?.() ?? props.label,
      );
  },
});

const QPageStub = defineComponent({
  name: "QPageStub",
  setup(_, { slots, attrs }) {
    return () => h("div", { class: "q-page-stub", ...attrs }, slots.default?.());
  },
});

const QSpinnerStub = SimpleStub("QSpinner");
const QSpaceStub = SimpleStub("QSpace");

const NostrSetupWizardStub = defineComponent({
  name: "NostrSetupWizardStub",
  props: { modelValue: { type: Boolean, default: false } },
  emits: ["update:modelValue", "complete"],
  setup(props, { slots }) {
    return () =>
      props.modelValue
        ? h(
            "div",
            { class: "nostr-setup-wizard-stub", "data-test": "setup-wizard" },
            slots.default?.(),
          )
        : null;
  },
});

const stubs = {
  ActiveChatHeader: SimpleStub("ActiveChatHeader"),
  MessageList: SimpleStub("MessageList"),
  MessageInput: SimpleStub("MessageInput"),
  ChatSendTokenDialog: SimpleStub("ChatSendTokenDialog"),
  NostrRelayErrorBanner: SimpleStub("NostrRelayErrorBanner"),
  NostrSetupWizard: NostrSetupWizardStub,
  "q-page": QPageStub,
  "q-banner": QBannerStub,
  "q-btn": QBtnStub,
  "q-spinner": QSpinnerStub,
  "q-space": QSpaceStub,
};

type RelayMock = {
  url: string;
  connected: boolean;
  status?: number;
  nextReconnectAt?: number | null;
};

function createNdk(relays: RelayMock[] = [
  { url: "wss://relay", connected: true, status: 5, nextReconnectAt: null },
]) {
  return {
    pool: {
      relays: new Map(
        relays.map((relay) => [
          relay.url,
          {
            url: relay.url,
            connected: relay.connected,
            status: relay.status ?? 5,
            connectionStats: { nextReconnectAt: relay.nextReconnectAt ?? null },
          },
        ]),
      ),
    },
  };
}

async function mountMessenger() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: (await import("src/pages/NostrMessenger.vue")).default }],
  });
  await router.push("/");
  await router.isReady();
  const module = await import("src/pages/NostrMessenger.vue");
  const component = module.default;
  return {
    pinia,
    router,
    wrapper: mount(component, {
      global: {
        plugins: [pinia, router],
        stubs,
        mocks: { $t: (key: string) => key, $q: { dark: { isActive: false }, screen: { gt: { xs: true }, lt: { md: false } } } },
      },
    }),
  };
}

describe("NostrMessenger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNdk).mockResolvedValue(createNdk());
  });

  it("shows a connecting banner while the messenger start is pending", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const messenger = useMessengerStore();
    const pending = createDeferred<void>();
    messenger.start = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(pending.promise);

    vi.mocked(useNdk).mockResolvedValue(createNdk());

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: (await import("src/pages/NostrMessenger.vue")).default }],
    });
    await router.push("/");
    await router.isReady();
    const module = await import("src/pages/NostrMessenger.vue");
    const component = module.default;
    const wrapper = mount(component, {
      global: {
        plugins: [pinia, router],
        stubs,
        mocks: { $t: (key: string) => key, $q: { dark: { isActive: false }, screen: { gt: { xs: true }, lt: { md: false } } } },
      },
    });

    await flushPromises();

    const reconnecting = (wrapper.vm as any).reconnectAll();
    await nextTick();

    expect(wrapper.text()).toContain("Connecting...");

    pending.resolve();
    await reconnecting;
    await flushPromises();

    expect(wrapper.text()).not.toContain("Connecting...");
  });

  it("hides the spinner and keeps retry interactive when start fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const pinia = createPinia();
      setActivePinia(pinia);
      const messenger = useMessengerStore();
      const nostr = useNostrStore();
      messenger.loadIdentity = vi.fn(async () => undefined);
      nostr.initSignerIfNotSet = vi.fn(async () => undefined);

      const startMock = vi
        .fn<() => Promise<void>>()
        .mockRejectedValueOnce(new Error("boom"))
        .mockResolvedValueOnce(undefined);
      messenger.start = startMock;

      vi.mocked(useNdk).mockResolvedValue(createNdk());

      const router = createRouter({
        history: createMemoryHistory(),
        routes: [{ path: "/", component: (await import("src/pages/NostrMessenger.vue")).default }],
      });
      await router.push("/");
      await router.isReady();
      const module = await import("src/pages/NostrMessenger.vue");
      const component = module.default;
      const wrapper = mount(component, {
        global: {
          plugins: [pinia, router],
          stubs,
          mocks: { $t: (key: string) => key, $q: { dark: { isActive: false }, screen: { gt: { xs: true }, lt: { md: false } } } },
        },
      });

      await flushPromises();
      await nextTick();

      expect(wrapper.find(".QSpinner-stub").exists()).toBe(false);
      expect(wrapper.text()).toContain("boom");

      const buttons = wrapper.findAll("button.q-btn-stub");
      const retryButton = buttons.find((btn) => btn.text() === "Retry");
      expect(retryButton).toBeDefined();

      await retryButton!.trigger("click");
      await flushPromises();

      expect(startMock).toHaveBeenCalledTimes(2);
    } finally {
      consoleError.mockRestore();
    }
  });

  it("renders relay disconnect and failure banners when offline", async () => {
    vi.mocked(useNdk).mockResolvedValue(
      createNdk([
        { url: "wss://relay-1", connected: true, status: 5, nextReconnectAt: null },
        { url: "wss://relay-2", connected: false, status: 2, nextReconnectAt: Date.now() + 5000 },
        { url: "wss://relay-3", connected: false, status: 2, nextReconnectAt: Date.now() + 5000 },
      ]),
    );
    const { wrapper } = await mountMessenger();
    const messenger = useMessengerStore();
    const nostr = useNostrStore();
    messenger.connected = false;
    messenger.failedRelays = ["wss://down"];
    nostr.failedRelays = ["wss://down"];
    messenger.sendQueue = [{ id: 1 }];

    await flushPromises();
    await nextTick();

    const text = wrapper.text();
    expect(text).toContain("Offline - 1/3 connected");
    expect(text).toContain("Relay wss://down unreachable");
    expect(text).toContain("message(s) failed");
  });

  it("opens the setup wizard when the user has no identity", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const nostr = useNostrStore();
    nostr.hasIdentity = false;
    nostr.relays = [];
    nostr.failedRelays = [];

    vi.mocked(useNdk).mockResolvedValue(createNdk());
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: (await import("src/pages/NostrMessenger.vue")).default }],
    });
    await router.push("/");
    await router.isReady();
    const module = await import("src/pages/NostrMessenger.vue");
    const component = module.default;

    const wrapper = mount(component, {
      global: {
        plugins: [pinia, router],
        stubs,
        mocks: { $t: (key: string) => key, $q: { dark: { isActive: false }, screen: { gt: { xs: true }, lt: { md: false } } } },
      },
    });

    await flushPromises();
    await nextTick();

    expect(wrapper.find("[data-test='setup-wizard']").exists()).toBe(true);
  });
});
