import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import FindCreators from "src/pages/FindCreators.vue";

vi.mock("components/DonateDialog.vue", () => ({ default: { name: "DonateDialog", template: "<div></div>" } }));
vi.mock("components/SubscribeDialog.vue", () => ({ default: { name: "SubscribeDialog", template: "<div></div>" } }));
vi.mock("components/SendTokenDialog.vue", () => ({ default: { name: "SendTokenDialog", template: "<div></div>" } }));
vi.mock("components/MediaPreview.vue", () => ({ default: { name: "MediaPreview", template: "<div></div>" } }));
vi.mock("stores/sendTokensStore", () => ({ useSendTokensStore: () => ({ clearSendData: vi.fn(), sendData: {}, showSendTokens: false }) }));
vi.mock("stores/donationPresets", () => ({ useDonationPresetsStore: () => ({ createDonationPreset: vi.fn() }) }));
vi.mock("stores/creators", () => ({ useCreatorsStore: () => ({ tiersMap: {}, tierFetchError: false, fetchTierDefinitions: vi.fn() }) }));
vi.mock("stores/nostr", () => ({
  useNostrStore: () => ({ pubkey: "", initNdkReadOnly: vi.fn().mockResolvedValue(undefined), resolvePubkey: (k: string) => k }),
  fetchNutzapProfile: vi.fn(),
  RelayConnectionError: class RelayConnectionError extends Error {},
}));
vi.mock("stores/dm", () => ({ useDmStore: () => ({ started: false, startChat: vi.fn(), ensureChatSubscription: vi.fn() }) }));
vi.mock("src/js/notify", () => ({ notifyWarning: vi.fn() }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));

describe("FindCreators redirection", () => {
  it("redirects to creator route when npub query is present", async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/find-creators", component: FindCreators },
        { path: "/creator/:npub", component: { template: "<div />" } },
      ],
    });
    const pinia = createPinia();
    setActivePinia(pinia);
    router.push("/find-creators?npub=testnpub");
    await router.isReady();
    mount(FindCreators, {
      global: {
        plugins: [router, pinia],
        stubs: [
          "QDialog",
          "QCard",
          "QCardSection",
          "QCardActions",
          "QBtn",
          "QSeparator",
        ],
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(router.currentRoute.value.path).toBe("/creator/testnpub");
  });
});

