import { flushPromises, shallowMount } from "@vue/test-utils";
import { reactive } from "vue";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useRoute } from "vue-router";
import PublicCreatorProfilePage from "src/pages/PublicCreatorProfilePage.vue";

const mockFindProfiles = vi.fn();
const mockFetchFundstrProfileBundle = vi.fn();

vi.mock("src/api/phonebook", () => ({
  findProfiles: (...args: any[]) => mockFindProfiles(...args),
}));

vi.mock("components/SubscribeDialog.vue", () => ({
  default: { name: "SubscribeDialog", template: "<div />" },
}));
vi.mock("components/SubscriptionReceipt.vue", () => ({
  default: { name: "SubscriptionReceipt", template: "<div />" },
}));
vi.mock("components/SetupRequiredDialog.vue", () => ({
  default: { name: "SetupRequiredDialog", template: "<div />" },
}));
vi.mock("components/PaywalledContent.vue", () => ({
  default: { name: "PaywalledContent", template: "<div />" },
}));
vi.mock("components/MintSafetyList.vue", () => ({
  default: { name: "MintSafetyList", template: "<div />" },
}));
vi.mock("components/RelayBadgeList.vue", () => ({
  default: { name: "RelayBadgeList", template: "<div />" },
}));
vi.mock("components/TierSummaryCard.vue", () => ({
  default: { name: "TierSummaryCard", template: "<div><slot /></div>" },
}));

const creatorsStore = reactive({
  tiersMap: {} as Record<string, any[]>,
  tierFetchError: false,
  fetchCreator: vi.fn().mockResolvedValue(undefined),
});

vi.mock("stores/creators", () => ({
  useCreatorsStore: () => creatorsStore,
  fetchFundstrProfileBundle: (...args: any[]) => mockFetchFundstrProfileBundle(...args),
  FundstrProfileFetchError: class FundstrProfileFetchError extends Error {},
}));

vi.mock("stores/nostr", () => ({
  useNostrStore: () => ({
    hasIdentity: true,
    initNdkReadOnly: vi.fn(),
    resolvePubkey: (v: string) => v,
    relays: [],
  }),
  fetchNutzapProfile: vi.fn().mockResolvedValue(null),
}));

vi.mock("src/utils/nostrKeys", () => ({
  deriveCreatorKeys: () => ({ npub: "npub-test", hex: "hex-test" }),
}));

vi.mock("src/utils/profileUrl", () => ({
  buildProfileUrl: () => "/profile/npub-test",
}));

vi.mock("src/composables/useClipboard", () => ({
  useClipboard: () => ({ copy: vi.fn() }),
}));

vi.mock("stores/price", () => ({ usePriceStore: () => ({ bitcoinPrice: 0 }) }));
vi.mock("stores/ui", () => ({ useUiStore: () => ({ formatCurrency: () => "" }) }));
vi.mock("stores/welcome", () => ({ useWelcomeStore: () => ({ welcomeCompleted: true }) }));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("PublicCreatorProfilePage phonebook enrichment", () => {
  beforeEach(() => {
    mockFindProfiles.mockReset();
    mockFetchFundstrProfileBundle.mockReset();
    mockFindProfiles.mockResolvedValue({
      query: "hex-test",
      count: 1,
      results: [
        {
          pubkey: "hex-test",
          name: "",
          display_name: "Phonebook Creator",
          about: "Phonebook about",
          picture: "https://example.com/pb.png",
          nip05: "creator@example.com",
        },
      ],
    });

    mockFetchFundstrProfileBundle.mockResolvedValue({
      profile: {},
      profileDetails: null,
      tiers: [],
      profileEvent: null,
      tierDataFresh: true,
      tierSecurityBlocked: false,
      tierFetchFailed: false,
      relayHints: [],
      fetchedFromFallback: false,
      followers: null,
      following: null,
      joined: Date.now(),
    });

    vi.mocked(useRoute).mockReturnValue({
      query: {},
      params: { npubOrHex: "npub-test" },
      path: "/",
      fullPath: "/",
      name: "PublicCreatorProfile",
    } as any);
  });

  it("falls back to phonebook metadata when primary profile is empty", async () => {
    const wrapper = shallowMount(PublicCreatorProfilePage, {
      global: {
        stubs: {
          SubscribeDialog: true,
          SubscriptionReceipt: true,
          SetupRequiredDialog: true,
          PaywalledContent: true,
          MintSafetyList: true,
          RelayBadgeList: true,
          TierSummaryCard: true,
        },
        config: {
          globalProperties: { $t: (key: string) => key },
        },
      },
    });

    await flushPromises();

    expect(mockFindProfiles).toHaveBeenCalledWith("hex-test", expect.anything());

    expect(wrapper.find(".profile-hero__name").text()).toBe("Phonebook Creator");
    expect(wrapper.find(".profile-section__text").text()).toBe("Phonebook about");
    expect(wrapper.find(".profile-hero__avatar img").attributes("src")).toBe(
      "https://example.com/pb.png",
    );
  });
});
