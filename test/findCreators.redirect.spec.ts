import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import FindCreators from "src/pages/FindCreators.vue";

function createStub(name: string, slotTemplate = '<slot />') {
  return {
    name,
    template: `<div>${slotTemplate}</div>`,
  };
}

var routeMock: any;
var routerMock: any;
vi.mock('vue-router', () => {
  routerMock = {
    replace: vi.fn(),
    resolve: vi.fn(() => ({ href: '' })),
  };
  routeMock = { query: {} };
  return {
    useRouter: () => routerMock,
    useRoute: () => routeMock,
  };
});

vi.mock('quasar', () => ({
  Notify: {
    create: vi.fn(),
  },
  useQuasar: () => ({
    notify: vi.fn(),
  }),
  QPage: createStub('QPage'),
  QCard: createStub('QCard'),
  QCardSection: createStub('QCardSection'),
  QCardActions: createStub('QCardActions'),
  QBtn: createStub('QBtn'),
  QIcon: createStub('QIcon'),
  QForm: createStub('QForm'),
  QInput: createStub('QInput', '<slot /><slot name="append" />'),
  QBanner: createStub('QBanner'),
  QSkeleton: createStub('QSkeleton'),
  QDialog: createStub('QDialog'),
}));
vi.mock("components/DonateDialog.vue", () => ({ default: { name: "DonateDialog", template: "<div></div>" } }));
vi.mock("components/SubscribeDialog.vue", () => ({ default: { name: "SubscribeDialog", template: "<div></div>" } }));
vi.mock("components/SendTokenDialog.vue", () => ({ default: { name: "SendTokenDialog", template: "<div></div>" } }));
vi.mock("components/MediaPreview.vue", () => ({ default: { name: "MediaPreview", template: "<div></div>" } }));
vi.mock("stores/sendTokensStore", () => ({ useSendTokensStore: () => ({ clearSendData: vi.fn(), sendData: {}, showSendTokens: false }) }));
vi.mock("stores/donationPresets", () => ({ useDonationPresetsStore: () => ({ createDonationPreset: vi.fn() }) }));
const creatorsStoreMock = {
  searchCreators: vi.fn().mockResolvedValue(undefined),
  loadFeaturedCreators: vi.fn().mockResolvedValue(undefined),
  searchResults: [],
  featuredCreators: [],
  searching: false,
  loadingFeatured: false,
  error: "",
  searchWarnings: [],
  featuredError: "",
};
vi.mock("stores/creators", () => ({
  FEATURED_CREATORS: [],
  useCreatorsStore: () => creatorsStoreMock,
}));
vi.mock("src/lib/fundstrApi", () => ({
  fetchCreators: vi.fn().mockResolvedValue([]),
  fetchCreator: vi.fn().mockResolvedValue({
    pubkey: "".padEnd(64, "a"),
    profile: null,
    followers: null,
    following: null,
    joined: null,
  }),
  formatMsatToSats: vi.fn(() => "0"),
}));
vi.mock("stores/nostr", () => ({
  useNostrStore: () => ({ pubkey: "", initNdkReadOnly: vi.fn().mockResolvedValue(undefined), resolvePubkey: (k: string) => k }),
  fetchNutzapProfile: vi.fn(),
  RelayConnectionError: class RelayConnectionError extends Error {},
}));
vi.mock("src/js/notify", () => ({ notifyWarning: vi.fn() }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));

describe("FindCreators redirection", () => {
  it("redirects to creator route when npub query is present", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    routerMock.replace.mockReset();
    routeMock.query = { npub: 'testnpub' };
    mount(FindCreators, {
      global: {
        plugins: [pinia],
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
    expect(routerMock.replace).toHaveBeenCalledWith({
      name: 'creator-profile',
      params: { npub: 'testnpub' },
    });
  });
});

