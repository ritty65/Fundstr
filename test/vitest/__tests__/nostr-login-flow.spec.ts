import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { ref, computed } from "vue";
import { createRouter, createMemoryHistory } from "vue-router";

import { useNostrStore } from "../../../src/stores/nostr";
import { useCreatorHubStore } from "../../../src/stores/creatorHub";
import { useWelcomeStore } from "../../../src/stores/welcome";

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (s: string) => s }),
  createI18n: vi.fn(),
}));

vi.mock("quasar", () => ({
  useQuasar: () => ({ notify: vi.fn(), screen: { lt: { md: false } }, platform: { has: {} } }),
  QIcon: { template: "<i></i>" },
  QPage: { template: "<div><slot/></div>" },
  QCard: { template: "<div><slot/></div>" },
  QBtn: { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  QInput: { template: '<input />' },
  QForm: { template: '<form @submit.prevent="(e)=>$emit(\'submit\',e)"><slot/></form>' },
  QTabs: { template: '<div><slot/></div>' },
  QTab: { template: '<div><slot/></div>' },
  QTabPanels: { template: '<div><slot/></div>' },
  QTabPanel: { template: '<div><slot/></div>' },
  QDialog: { template: '<div><slot/></div>' },
  QCardSection: { template: '<div><slot/></div>' },
  QSeparator: { template: '<hr />' },
  QCardActions: { template: '<div><slot/></div>' },
  QLinearProgress: { template: '<div></div>' },
}));

vi.mock("nostr-tools", () => ({
  nip19: {
    npubEncode: (s: string) => `npub${s}`,
    decode: vi.fn(() => ({ data: new Uint8Array(32) })),
    nsecEncode: vi.fn(() => "nsec1abc"),
  },
}));

vi.mock("../../../src/composables/useCreatorHub", () => ({
  useCreatorHub: () => {
    const nostr = useNostrStore();
    const loggedIn = computed(() => !!nostr.pubkey);
    const npub = computed(() => (nostr.pubkey ? `npub${nostr.pubkey}` : ""));
    return {
      loggedIn,
      npub,
      isMobile: computed(() => true),
      splitterModel: ref(50),
      tab: ref("profile"),
      draggableTiers: ref([]),
      deleteDialog: ref(false),
      deleteId: ref(""),
      showTierDialog: ref(false),
      currentTier: ref({}),
      publishing: ref(false),
      isDirty: ref(false),
      login: vi.fn(),
      logout: vi.fn(),
      initPage: vi.fn(),
      publishFullProfile: vi.fn(),
      addTier: vi.fn(),
      editTier: vi.fn(),
      confirmDelete: vi.fn(),
      updateOrder: vi.fn(),
      refreshTiers: vi.fn(),
      removeTier: vi.fn(),
      performDelete: vi.fn(),
    };
  },
}));

import WelcomeSlideNostr from "../../../src/pages/welcome/WelcomeSlideNostr.vue";
import CreatorHubPage from "../../../src/pages/CreatorHubPage.vue";

describe("welcome flow with nsec", () => {
  it("logs in and shows creator hub without prompts", async () => {
    localStorage.clear();
    setActivePinia(createPinia());
    const nostr = useNostrStore();
    const welcome = useWelcomeStore();
    const creatorHubStore = useCreatorHubStore();

    const nsec = "nsec1abc";
    nostr.initPrivateKeySigner = vi.fn(async () => {
      nostr.pubkey = "pub";
    });
    Object.defineProperty(nostr, "activePrivateKeyNsec", { get: () => nsec });

    const loginSpy = vi.spyOn(creatorHubStore, "login").mockResolvedValue();

    const wrapperWelcome = mount(WelcomeSlideNostr, {
      global: {
        mocks: { t: (s: string) => s },
        stubs: {
          NostrBackupDialog: { template: "<div></div>", props: ["modelValue", "nsec"] },
        },
      },
    });

    (wrapperWelcome.vm as any).nsec = nsec;
    await wrapperWelcome.find("form").trigger("submit");

    expect(loginSpy).toHaveBeenCalledWith(nsec);
    expect(welcome.nostrSetupCompleted).toBe(true);

    welcome.closeWelcome();

    const routes = [{ path: "/creator-hub", component: CreatorHubPage }];
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push("/creator-hub");
    await router.isReady();

    const wrapperHub = mount({ template: "<router-view />" }, {
      global: {
        plugins: [router],
        mocks: { t: (s: string) => s },
        stubs: {
          ThemeToggle: { template: "<div></div>" },
          CreatorProfileForm: { template: "<div></div>" },
          TierItem: { template: "<div></div>" },
          AddTierDialog: { template: "<div></div>", props: ["modelValue", "tier"] },
          DeleteModal: { template: "<div></div>", props: ["modelValue"] },
          Draggable: { template: "<div><slot/></div>" },
        },
      },
    });

    const text = wrapperHub.text();
    expect(text).toContain("Logged in as");
    expect(text).not.toContain("Login with nsec");
  });
});

