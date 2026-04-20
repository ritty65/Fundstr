import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("quasar", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useQuasar: () => ({
      dark: { isActive: false },
      platform: { is: { mobile: false } },
      screen: {
        width: 1920,
        height: 1080,
        lt: { sm: false, md: false },
        gt: { sm: true },
      },
      iconSet: { arrow: { dropdown: "arrow_drop_down" } },
      notify: vi.fn(),
    }),
  };
});

import CreatorProfileModal from "../../../src/components/CreatorProfileModal.vue";

type CreatorProfile = {
  pubkey: string;
  displayName?: string;
  about?: string | null;
  name?: string;
  trustedMetrics?: Record<string, unknown> | null;
  profile?: Record<string, unknown> | null;
  tiers?: Array<Record<string, any>> | null;
};

const fetchCreatorMock = vi.fn();

vi.mock("stores/creators", () => ({
  useCreatorsStore: () => ({
    buildCreatorProfileFromCache: vi.fn().mockReturnValue(null),
    getCreatorTiers: vi.fn().mockReturnValue(null),
    fetchCreator: fetchCreatorMock,
    warmCache: {},
  }),
  mergeCreatorProfileWithFallback: (fallback: any, profile: any) =>
    profile ?? fallback,
  creatorTrustedMetrics: (profile: any) => profile?.trustedMetrics ?? null,
  creatorIsSignalOnly: () => false,
  FundstrProfileFetchError: class FundstrProfileFetchError extends Error {
    fallbackAttempted = false;
  },
}));

vi.mock("stores/nostr", () => ({
  useNostrStore: () => ({
    hasIdentity: true,
    pubkey: "pubkey-123",
    npub: "npub1test",
    connected: false,
    relays: [],
    fetchRecentNotes: vi.fn().mockResolvedValue([]),
  }),
}));

describe("CreatorProfileModal fallback", () => {
    const initialProfile: CreatorProfile = {
      pubkey: "pubkey-123",
      displayName: "Initial Creator",
      about: "Fallback bio",
      name: "initial_creator",
      trustedMetrics: {
        rank: 89,
        providerLabel: "nostr.band",
        providerPubkey: "provider",
        relayUrl: "wss://nip85.nostr.band",
        createdAt: 1_712_765_600,
      },
      profile: { display_name: "Initial Creator", about: "Fallback bio" },
      tiers: [
      {
        id: "starter",
        name: "Starter Tier",
        price_sats: 1000,
        intervalDays: 30,
        benefits: ["Perk A"],
        media: [],
      },
    ],
  };

  const globalStubs = {
    "q-dialog": { template: "<div><slot /></div>" },
    "q-card": { template: "<div><slot /></div>" },
    "q-card-section": { template: "<section><slot /></section>" },
    "q-icon": { template: "<i><slot /></i>" },
    "q-btn": {
      props: ["label"],
      template: "<button><slot />{{ label }}</button>",
    },
    "q-avatar": { template: "<div><slot /></div>" },
    "q-tooltip": { template: "<div><slot /></div>" },
    "q-spinner": true,
    "q-tabs": { template: "<div><slot /></div>" },
    "q-tab": { template: "<div><slot /></div>" },
    "q-tab-panels": { template: "<div><slot /></div>" },
    "q-tab-panel": { template: "<div><slot /></div>" },
    TierDetailsPanel: {
      props: ["tierName"],
      template: '<div class="tier-stub">{{ tierName }}</div>',
    },
  } as const;

  beforeEach(() => {
    fetchCreatorMock.mockReset();
  });

  it("keeps the initial profile when fetching fails", async () => {
    fetchCreatorMock.mockRejectedValue(new Error("Network unreachable"));

    const wrapper = mount(CreatorProfileModal, {
      props: { show: true, pubkey: initialProfile.pubkey, initialProfile },
      global: { stubs: globalStubs },
    });

    await flushPromises();

    expect(fetchCreatorMock).toHaveBeenCalledWith(initialProfile.pubkey, false);
    expect(wrapper.text()).toContain("Initial Creator");
    expect(wrapper.text()).toContain("Fallback bio");
    expect(wrapper.text()).toContain("Trusted rank (NIP-85)");
    expect(wrapper.text()).toContain("89");
    expect(wrapper.text()).toContain("nostr.band");
    expect(wrapper.text()).toContain("Starter Tier");
    expect(wrapper.text()).toContain("Showing saved details.");
    expect(wrapper.text()).toContain("Retry");
  });

  it("keeps the initial profile when discovery returns null", async () => {
    fetchCreatorMock.mockResolvedValue(null);

    const wrapper = mount(CreatorProfileModal, {
      props: { show: true, pubkey: initialProfile.pubkey, initialProfile },
      global: { stubs: globalStubs },
    });

    await flushPromises();

    expect(fetchCreatorMock).toHaveBeenCalledWith(initialProfile.pubkey, false);
    expect(wrapper.text()).toContain("Initial Creator");
    expect(wrapper.text()).toContain("Fallback bio");
    expect(wrapper.text()).toContain("Starter Tier");
    expect(wrapper.text()).toContain("Showing saved details.");
  });
});
