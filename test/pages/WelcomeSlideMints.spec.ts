import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import WelcomeSlideMints from "src/pages/welcome/WelcomeSlideMints.vue";
import { useWelcomeStore } from "src/stores/welcome";
import { useMintsStore } from "src/stores/mints";

vi.mock("vue-i18n", async () => {
  const actual = await vi.importActual<any>("vue-i18n");
  return {
    ...actual,
    useI18n: () => ({ t: (message: string) => message }),
  };
});

vi.mock("quasar", () => ({
  useQuasar: () => ({ notify: vi.fn(), platform: { has: {} } }),
  QIcon: { template: "<i></i>" },
  QBtn: { template: "<button @click=\"$emit('click')\"><slot/></button>" },
  QForm: {
    template:
      "<form @submit.prevent=\"(e)=>$emit('submit', e)\"><slot/></form>",
  },
  QInput: {
    props: ["modelValue", "label", "placeholder"],
    template: "<input />",
  },
  QSelect: { props: ["modelValue", "options"], template: "<input />" },
  QBanner: { template: "<div><slot/></div>" },
  QDialog: { template: "<div><slot/></div>" },
  QCard: { template: "<div><slot/></div>" },
  QCardSection: { template: "<div><slot/></div>" },
  QCardActions: { template: "<div><slot/></div>" },
  ClosePopup: {},
  QList: { template: "<div><slot/></div>" },
  QItem: { template: "<div @click=\"$emit('click')\"><slot/></div>" },
  QItemSection: { template: "<div><slot/></div>" },
  QSpinner: { template: "<div></div>" },
}));

describe("WelcomeSlideMints", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ url: "https://mint.minibits.cash/Bitcoin" }],
      }),
    );
  });

  it("sets mintConnected after a successful manual connect", async () => {
    const mints = useMintsStore();
    mints.addMint = vi.fn(async (data: any) => {
      mints.mints = [{ url: data.url }] as any;
      mints.activeMintUrl = data.url;
      return { url: data.url } as any;
    }) as any;
    mints.activateMintUrl = vi.fn().mockResolvedValue(undefined) as any;

    const wrapper = mount(WelcomeSlideMints);
    await flushPromises();

    (wrapper.vm as any).url = "mint.minibits.cash/Bitcoin";
    await wrapper.find("form").trigger("submit");

    expect(useWelcomeStore().mintConnected).toBe(true);
    expect((wrapper.vm as any).activeConnectedMintUrl).toBe(
      "https://mint.minibits.cash/Bitcoin",
    );
  });

  it("keeps the catalog open and shows an error when a catalog mint fails", async () => {
    const mints = useMintsStore();
    mints.addMint = vi
      .fn()
      .mockRejectedValue(new Error("network offline")) as any;
    mints.activateMintUrl = vi.fn().mockResolvedValue(undefined) as any;

    const wrapper = mount(WelcomeSlideMints);
    await flushPromises();

    (wrapper.vm as any).showCatalog = true;
    await (wrapper.vm as any).selectMint("https://mint.minibits.cash/Bitcoin");

    expect((wrapper.vm as any).showCatalog).toBe(true);
    expect((wrapper.vm as any).error).toBe("Welcome.mints.errorUnreachable");
    expect(useWelcomeStore().mintConnected).toBe(false);
  });

  it("closes the catalog and remembers the active mint after a successful catalog selection", async () => {
    const mints = useMintsStore();
    mints.activeMintUrl = "";
    mints.mints = [] as any;
    mints.addMint = vi.fn(async (data: any) => {
      mints.mints = [{ url: data.url }] as any;
      mints.activeMintUrl = data.url;
      return { url: data.url } as any;
    }) as any;
    mints.activateMintUrl = vi.fn().mockResolvedValue(undefined) as any;

    const wrapper = mount(WelcomeSlideMints);
    await flushPromises();

    (wrapper.vm as any).showCatalog = true;
    await (wrapper.vm as any).selectMint("https://mint.minibits.cash/Bitcoin");

    expect((wrapper.vm as any).showCatalog).toBe(false);
    expect((wrapper.vm as any).connected).toEqual([
      { url: "https://mint.minibits.cash/Bitcoin" },
    ]);
    expect((wrapper.vm as any).activeConnectedMintUrl).toBe(
      "https://mint.minibits.cash/Bitcoin",
    );
    expect(useWelcomeStore().mintConnected).toBe(true);
  });
});
