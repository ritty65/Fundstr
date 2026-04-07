import { flushPromises, shallowMount } from "@vue/test-utils";
import { reactive } from "vue";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { useRoute } from "vue-router";
import PublicCreatorProfilePage from "src/pages/PublicCreatorProfilePage.vue";

const mockFindProfiles = vi.fn();
const mockFetchFundstrProfileBundle = vi.fn();
const mockFetchTrustedUserRank = vi.fn();
const mockFetchNutzapProfile = vi.fn();

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
  creatorHasVerifiedNip05: (profile: any) => Boolean(profile?.nip05Verified),
  fetchFundstrProfileBundle: (...args: any[]) =>
    mockFetchFundstrProfileBundle(...args),
  FundstrProfileFetchError: class FundstrProfileFetchError extends Error {},
}));

vi.mock("stores/nostr", () => ({
  useNostrStore: () => ({
    hasIdentity: true,
    initNdkReadOnly: vi.fn(),
    resolvePubkey: (v: string) => v,
    relays: [],
    fetchTrustedUserRank: (...args: any[]) => mockFetchTrustedUserRank(...args),
  }),
  fetchNutzapProfile: (...args: any[]) => mockFetchNutzapProfile(...args),
}));

vi.mock("src/utils/nostrKeys", () => ({
  deriveCreatorKeys: () => ({ npub: "npub-test", hex: "hex-test" }),
}));

vi.mock("src/utils/profileUrl", () => ({
  buildProfileUrl: () => "/profile/npub-test",
  extractCreatorIdentifier: (value: string) => value,
  preferredCreatorPublicIdentifier: ({ fallbackIdentifier }: any) =>
    fallbackIdentifier,
}));

vi.mock("src/composables/useClipboard", () => ({
  useClipboard: () => ({ copy: vi.fn() }),
}));

vi.mock("stores/price", () => ({ usePriceStore: () => ({ bitcoinPrice: 0 }) }));
vi.mock("stores/ui", () => ({
  useUiStore: () => ({ formatCurrency: () => "" }),
}));
vi.mock("stores/welcome", () => ({
  useWelcomeStore: () => ({ welcomeCompleted: true }),
}));

vi.mock("stores/sendTokensStore", () => ({
  useSendTokensStore: () => ({
    clearSendData: vi.fn(),
    recipientPubkey: "",
    sendViaNostr: false,
    sendData: {},
    showLockInput: false,
    showSendTokens: false,
  }),
}));

vi.mock("stores/donationPresets", () => ({
  useDonationPresetsStore: () => ({
    createDonationPreset: vi.fn(),
    showCreatePresetDialog: false,
  }),
}));

vi.mock("stores/messenger", () => ({
  useMessengerStore: () => ({
    startChat: vi.fn(),
  }),
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => ({
    activeMintUrl: "",
    activeInfo: null,
  }),
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: () => ({ global: { t: (key: string) => key } }),
}));

describe("PublicCreatorProfilePage phonebook enrichment", () => {
  beforeEach(() => {
    mockFindProfiles.mockReset();
    mockFetchFundstrProfileBundle.mockReset();
    mockFetchTrustedUserRank.mockReset();
    mockFetchNutzapProfile.mockReset();
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
    mockFetchTrustedUserRank.mockResolvedValue(null);
    mockFetchNutzapProfile.mockResolvedValue(null);

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

    expect(mockFindProfiles).toHaveBeenCalledWith(
      "hex-test",
      expect.anything(),
    );

    expect(wrapper.find(".profile-hero__name").text()).toBe(
      "Phonebook Creator",
    );
    expect(wrapper.find(".profile-section__text").text()).toBe(
      "Phonebook about",
    );
    expect(wrapper.find(".profile-hero__avatar img").attributes("src")).toBe(
      "https://example.com/pb.png",
    );
  });

  it("does not show a relay failure banner when no Fundstr relay profile exists for the creator", async () => {
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

    expect(mockFetchNutzapProfile).toHaveBeenCalled();
    expect((wrapper.vm as any).fallbackFailed).toBe(false);
    expect((wrapper.vm as any).fallbackBannerText).toBe("");
  });

  it("adds a trusted rank metadata chip when a NIP-85 rank is available", async () => {
    mockFetchTrustedUserRank.mockResolvedValue({
      rank: 89,
      providerLabel: "nostr.band",
      providerPubkey:
        "4fd5e210530e4f6b2cb083795834bfe5108324f1ed9f00ab73b9e8fcfe5f12fe",
      relayUrl: "wss://nip85.nostr.band",
      createdAt: 1712400000,
    });

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

    expect(mockFetchTrustedUserRank).toHaveBeenCalledWith("hex-test");

    const chip = (wrapper.vm as any).metadataChips.find(
      (entry: any) => entry.id === "trusted-rank",
    );

    expect(chip).toMatchObject({
      id: "trusted-rank",
      icon: "shield",
      label: "Trusted rank 89",
      ariaLabel: "Trusted rank 89 via nostr.band",
    });
    expect(chip.title).toContain(
      "Provider-signed reputation signal via NIP-85 from nostr.band",
    );
    expect(chip.info).toMatchObject({
      title: "About trusted rank",
      provider: "Current provider: nostr.band",
      ariaLabel: "About trusted rank via nostr.band",
    });
    expect(chip.info.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "nip85-spec",
          label: "What is NIP-85?",
          href: "https://github.com/nostr-protocol/nips/blob/master/85.md",
        }),
        expect.objectContaining({
          id: "nostr-band-trust",
          label: "About nostr.band trust",
          href: "https://trust.nostr.band",
        }),
      ]),
    );
  });

  it("does not add a trusted rank metadata chip when no NIP-85 rank is available", async () => {
    mockFetchTrustedUserRank.mockResolvedValue(null);

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

    expect(mockFetchTrustedUserRank).toHaveBeenCalledWith("hex-test");
    expect(
      (wrapper.vm as any).metadataChips.some(
        (entry: any) => entry.id === "trusted-rank",
      ),
    ).toBe(false);
  });

  it("shows a generic support-data refresh banner when the relay refresh throws", async () => {
    mockFetchNutzapProfile.mockRejectedValueOnce(new Error("relay timeout"));

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

    expect((wrapper.vm as any).fallbackFailed).toBe(true);
    expect((wrapper.vm as any).fallbackBannerText).toContain(
      "Live Fundstr support data couldn't be refreshed right now.",
    );
  });
});
