import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreatorProfileStore } from "../../../src/stores/creatorProfile";

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("quasar", () => ({
  useQuasar: () => ({ dark: { isActive: false } }),
}));
vi.mock("src/composables/useClipboard", () => ({
  useClipboard: () => ({ copy: vi.fn() }),
}));
vi.mock("src/utils/profileUrl", () => ({ buildProfileUrl: vi.fn() }));
vi.mock("vue-i18n", () => ({ useI18n: () => ({ t: (s: string) => s }) }));

const publishDiscoveryProfile = vi.hoisted(() => vi.fn());
const nostrStore = vi.hoisted(() => ({
  hasIdentity: true,
  getProfile: vi.fn(async () => null),
  initSignerIfNotSet: vi.fn(),
  signer: {},
  npub: "",
}));
vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => nostrStore,
  publishDiscoveryProfile,
}));
vi.mock("../../../src/stores/creatorHub", () => ({
  useCreatorHubStore: () => ({ getTierArray: () => [] }),
}));
vi.mock("../../../src/stores/p2pk", () => ({
  useP2PKStore: () => ({
    showP2PKDialog: false,
    p2pkKeys: [],
    createAndSelectNewKey: vi.fn(),
    showLastKey: vi.fn(),
    showKeyDetails: vi.fn(),
  }),
}));
vi.mock("../../../src/stores/price", () => ({
  usePriceStore: () => ({ bitcoinPrice: null }),
}));
vi.mock("../../../src/stores/ui", () => ({
  useUiStore: () => ({ formatCurrency: vi.fn(() => "") }),
}));
vi.mock("../../../src/stores/mints", () => ({
  useMintsStore: () => ({ activeBalance: 0, activeUnit: "SATS" }),
}));
vi.mock("../../../src/stores/buckets", () => ({
  useBucketsStore: () => ({ bucketList: [] }),
}));
vi.mock("src/utils/safe-markdown", () => ({ renderMarkdownSafe: (s: string) => s }));
const notifySuccess = vi.hoisted(() => vi.fn());
const notifyError = vi.hoisted(() => vi.fn());
const notifyRefreshed = vi.hoisted(() => vi.fn());
vi.mock("src/js/notify", () => ({ notifySuccess, notifyError, notifyRefreshed }));
vi.mock("src/js/string-utils", () => ({ shortenString: (s: string) => s }));
vi.mock("../../../src/components/CreatorProfileForm.vue", () => ({ default: {} }));
vi.mock("../../../src/components/P2PKDialog.vue", () => ({ default: {} }));
vi.mock("src/utils/sanitize-url", () => ({ isTrustedUrl: () => true }));

import MyProfilePage from "../../../src/pages/MyProfilePage.vue";

describe("MyProfilePage saveProfile", () => {
  beforeEach(() => {
    publishDiscoveryProfile.mockClear();
    notifySuccess.mockClear();
    notifyError.mockClear();
    notifyRefreshed.mockClear();
    localStorage.clear();
  });

  it("publishes profile and resets dirty flag", async () => {
    const store = useCreatorProfileStore();
    store.setProfile({
      display_name: "name",
      picture: "",
      about: "",
      pubkey: "pub", 
      mints: "",
      relays: ["wss://relay"],
    });
    store.markClean();
    store.display_name = "changed";
    expect(store.isDirty).toBe(true);

    const { saveProfile } = (MyProfilePage as any).setup();
    await saveProfile();

    expect(publishDiscoveryProfile).toHaveBeenCalledWith({
      profile: { display_name: "changed", picture: "", about: "" },
      p2pkPub: "pub",
      mints: [],
      relays: ["wss://relay"],
    });
    expect(notifySuccess).toHaveBeenCalled();
    expect(store.isDirty).toBe(false);
  });

  it("notifies when profile already up to date", async () => {
    const store = useCreatorProfileStore();
    store.setProfile({
      display_name: "name",
      picture: "",
      about: "",
      pubkey: "pub",
      mints: "",
      relays: ["wss://relay"],
    });
    store.markClean();
    expect(store.isDirty).toBe(false);

    const { saveProfile } = (MyProfilePage as any).setup();
    await saveProfile();

    expect(publishDiscoveryProfile).not.toHaveBeenCalled();
    expect(notifyRefreshed).toHaveBeenCalled();
  });
});
