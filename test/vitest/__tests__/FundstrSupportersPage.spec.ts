import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FundstrSupportersPage from "src/pages/FundstrSupportersPage.vue";

const SUPPORTER_NPUB =
  "npub1mxmqzhgvla9wrgc8qlptmuylqzal2c50pc744zcm9kunhekv6g3s63ytu0";
const SUPPORTER_HEX =
  "d9b6015d0cff4ae1a30707c2bdf09f00bbf5628f0e3d5a8b1b2db93be6ccd223";

const {
  routerPush,
  getCreatorsByPubkeysMock,
  queryKind0ProfileMock,
  messengerStartChat,
} = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getCreatorsByPubkeysMock: vi.fn(),
  queryKind0ProfileMock: vi.fn(),
  messengerStartChat: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock("quasar", () => ({
  useQuasar: () => ({
    screen: { lt: { md: false } },
  }),
  QPage: { name: "QPage", template: "<div><slot /></div>" },
  QBtn: { name: "QBtn", template: "<button><slot /></button>" },
  QBanner: {
    name: "QBanner",
    template: "<div><slot /><slot name='avatar' /><slot name='action' /></div>",
  },
  QIcon: { name: "QIcon", template: "<i />" },
  QSkeleton: { name: "QSkeleton", template: "<div />" },
}));

vi.mock("src/api/fundstrDiscovery", () => ({
  createFundstrDiscoveryClient: () => ({
    getCreatorsByPubkeys: (...args: any[]) => getCreatorsByPubkeysMock(...args),
  }),
}));

vi.mock("@/nostr/relayClient", () => ({
  queryKind0Profile: (...args: any[]) => queryKind0ProfileMock(...args),
}));

vi.mock("stores/creators", () => ({
  creatorHasVerifiedNip05: (profile: any) => Boolean(profile?.nip05Verified),
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

vi.mock("stores/nostr", () => ({
  useNostrStore: () => ({
    resolvePubkey: (value: string) => value,
  }),
}));

vi.mock("stores/messenger", () => ({
  useMessengerStore: () => ({
    startChat: messengerStartChat,
    setDrawer: vi.fn(),
  }),
}));

vi.mock("@/composables/useDonationPrompt", () => ({
  useDonationPrompt: () => ({
    open: vi.fn(),
    hasPaymentRails: true,
  }),
}));

describe("FundstrSupportersPage", () => {
  beforeEach(() => {
    routerPush.mockReset();
    getCreatorsByPubkeysMock.mockReset();
    queryKind0ProfileMock.mockReset();
    messengerStartChat.mockReset();
  });

  it("hydrates missing supporter metadata from kind-0 and routes verified handles canonically", async () => {
    getCreatorsByPubkeysMock.mockResolvedValue({
      results: [
        {
          pubkey: SUPPORTER_HEX,
          profile: null,
          followers: null,
          following: null,
          joined: null,
          displayName: null,
          name: null,
          about: null,
          picture: null,
          nip05: "fundstr@example.com",
          nip05Verified: true,
          tiers: [],
          hasLightning: true,
          hasTiers: true,
        },
      ],
      warnings: [],
    });
    queryKind0ProfileMock.mockResolvedValue({
      pubkey: SUPPORTER_HEX,
      kind: 0,
      created_at: 1700000500,
      id: "k".repeat(64),
      sig: "s".repeat(128),
      tags: [],
      content: JSON.stringify({
        display_name: "Official Supporter",
        about: "Backs Fundstr",
        picture: "https://example.com/supporter.png",
      }),
    });

    const wrapper = shallowMount(FundstrSupportersPage, {
      global: {
        stubs: {
          DonateDialog: true,
          SendTokenDialog: true,
          CreatorCard: {
            name: "CreatorCard",
            props: ["profile"],
            template:
              '<div><div class="supporter-name">{{ profile.displayName || profile.name || (profile.profile && profile.profile.display_name) || "" }}</div><button class="view-profile" @click="$emit(\'view-profile\')">view</button></div>',
          },
          "q-page": { template: "<div><slot /></div>" },
          "q-btn": true,
          "q-banner": true,
          "q-icon": true,
          "q-skeleton": true,
        },
      },
    });

    await flushPromises();

    expect(queryKind0ProfileMock).toHaveBeenCalledWith(
      SUPPORTER_HEX,
      expect.objectContaining({ allowFanoutFallback: true }),
    );
    expect(wrapper.find(".supporter-name").text()).toBe("Official Supporter");

    await wrapper.find(".view-profile").trigger("click");

    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "PublicCreatorProfile",
        params: { npubOrHex: "fundstr@example.com" },
      }),
    );

    wrapper.unmount();
  });

  it("falls back to npub routes when nip05 is not verified", async () => {
    getCreatorsByPubkeysMock.mockResolvedValue({
      results: [
        {
          pubkey: SUPPORTER_HEX,
          profile: { display_name: "Supporter" },
          followers: null,
          following: null,
          joined: null,
          displayName: "Supporter",
          name: null,
          about: null,
          picture: null,
          nip05: "fundstr@example.com",
          nip05Verified: false,
          tiers: [],
          hasLightning: true,
          hasTiers: true,
        },
      ],
      warnings: [],
    });
    queryKind0ProfileMock.mockResolvedValue(null);

    const wrapper = shallowMount(FundstrSupportersPage, {
      global: {
        stubs: {
          DonateDialog: true,
          SendTokenDialog: true,
          CreatorCard: {
            name: "CreatorCard",
            props: ["profile"],
            template:
              '<button class="view-tiers" @click="$emit(\'view-tiers\')">tiers</button>',
          },
          "q-page": { template: "<div><slot /></div>" },
          "q-btn": true,
          "q-banner": true,
          "q-icon": true,
          "q-skeleton": true,
        },
      },
    });

    await flushPromises();
    await wrapper.find(".view-tiers").trigger("click");

    expect(routerPush).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "PublicCreatorProfile",
        params: { npubOrHex: SUPPORTER_NPUB },
        query: { tab: "tiers" },
      }),
    );

    wrapper.unmount();
  });
});
