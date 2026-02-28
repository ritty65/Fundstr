import { flushPromises, shallowMount } from "@vue/test-utils";
import { nextTick, reactive, ref } from "vue";
import { describe, expect, it, vi, beforeEach } from "vitest";
import MyProfilePage from "src/pages/MyProfilePage.vue";

const mockFindProfiles = vi.fn();

vi.mock("src/api/phonebook", () => ({
  findProfiles: (...args: any[]) => mockFindProfiles(...args),
}));

const creatorProfile = reactive({
  display_name: "",
  picture: "",
  about: "",
  pubkey: "hexpubkey",
  mints: [] as string[],
  relays: [] as string[],
});

const hydrating = ref(false);
const hydrationReady = ref(true);
const hydrationError = ref<Error | null>(null);

vi.mock("src/stores/creatorProfile", () => ({
  useCreatorProfileStore: () => creatorProfile,
}));

vi.mock("src/composables/useCreatorProfileHydration", () => ({
  useCreatorProfileHydration: () => ({
    hydrating,
    hydrationReady,
    hydrationError,
    hydrate: vi.fn(),
    onProfileUpdated: () => () => {},
  }),
}));

vi.mock("src/utils/nostrKeys", () => ({
  deriveCreatorKeys: (pubkey: string) => ({ npub: `npub-${pubkey}`, hex: pubkey }),
}));

vi.mock("src/composables/useClipboard", () => ({
  useClipboard: () => ({ copy: vi.fn() }),
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe("MyProfilePage phonebook enrichment", () => {
  beforeEach(() => {
    mockFindProfiles.mockReset();
    mockFindProfiles.mockResolvedValue({
      query: "hexpubkey",
      count: 1,
      results: [
        {
          pubkey: "hexpubkey",
          name: "Phonebook Name",
          display_name: "Phonebook Display",
          about: "Phonebook about",
          picture: "https://example.com/pb.png",
          nip05: "user@example.com",
        },
      ],
    });

    creatorProfile.display_name = "";
    creatorProfile.picture = "";
    creatorProfile.about = "";
    creatorProfile.pubkey = "hexpubkey";
    hydrating.value = false;
    hydrationReady.value = true;
    hydrationError.value = null;
  });

  it("renders phonebook data when profile fields are missing", async () => {
    const wrapper = shallowMount(MyProfilePage, {
      global: {
        stubs: {
          "q-page": { template: "<div class=\"q-page\"><slot /></div>" },
          "q-card": { template: "<div class=\"q-card\"><slot /></div>" },
          "q-card-section": {
            template: "<div class=\"q-card-section\"><slot /></div>",
          },
          "q-banner": { template: "<div class=\"q-banner\"><slot /></div>" },
          "q-avatar": { template: "<div class=\"q-avatar\"><slot /></div>" },
          "q-icon": { template: "<i class=\"q-icon\"></i>" },
          "q-btn": { template: "<button class=\"q-btn\"><slot /></button>" },
          "q-btn-dropdown": {
            template: "<div class=\"q-btn-dropdown\"><slot /></div>",
          },
          "q-item": { template: "<div class=\"q-item\"><slot /></div>" },
          "q-item-section": {
            template: "<div class=\"q-item-section\"><slot /></div>",
          },
          "q-item-label": {
            template: "<div class=\"q-item-label\"><slot /></div>",
          },
          "q-separator": { template: "<div class=\"q-separator\"></div>" },
          "q-chip": { template: "<div class=\"q-chip\"><slot /></div>" },
          "q-list": { template: "<div class=\"q-list\"><slot /></div>" },
          "q-spinner-dots": {
            template: "<div class=\"q-spinner-dots\"></div>",
          },
        },
        config: {
          globalProperties: { $t: (key: string) => key },
        },
      },
    });

    await flushPromises();
    await nextTick();

    expect(mockFindProfiles).toHaveBeenCalledTimes(1);
    expect(mockFindProfiles.mock.calls[0][0]).toBe("hexpubkey");

    const grid = wrapper.find(".profile-grid");
    expect(grid.exists()).toBe(true);

    const heroName = wrapper.find(".hero-name");
    expect(heroName.exists()).toBe(true);
    expect(heroName.text()).toBe("Phonebook Display");

    const heroAbout = wrapper.find(".hero-about");
    expect(heroAbout.exists()).toBe(true);
    expect(heroAbout.text()).toBe("Phonebook about");

    const heroAvatar = wrapper.find(".hero-avatar img");
    expect(heroAvatar.exists()).toBe(true);
    expect(heroAvatar.attributes("src")).toBe("https://example.com/pb.png");
  });
});
