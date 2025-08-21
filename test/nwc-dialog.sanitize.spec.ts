import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { useNWCStore } from "src/stores/nwc";

vi.mock("src/composables/useClipboard", () => ({
  useClipboard: () => ({ copy: vi.fn() }),
}));

describe("NWCDialog", () => {
  it("rejects javascript protocol", async () => {
    (window as any).windowMixin = {};
    const NWCDialog = (await import("src/components/NWCDialog.vue")).default;
    const pinia = createTestingPinia({ createSpy: vi.fn });
    const nwcStore = useNWCStore();
    nwcStore.showNWCData.connectionString = "javascript:alert(1)";
    nwcStore.showNWCDialog = true;
    const wrapper = shallowMount(NWCDialog, {
      global: {
        plugins: [pinia],
        mocks: { $t: (s: string) => s },
        stubs: {
          "q-dialog": { template: "<div><slot /></div>" },
          "q-card": { template: "<div><slot /></div>" },
          "q-responsive": { template: "<div><slot /></div>" },
          "q-card-section": { template: "<div><slot /></div>" },
          "q-item-label": { template: "<div><slot /></div>" },
          "q-btn": { template: "<button><slot /></button>" },
          "vue-qrcode": { template: "<div />" },
        },
      },
    });
    const a = wrapper.get("a");
    expect(a.attributes("href")).toBe("#");
    expect(a.attributes("rel")).toBe("noopener noreferrer");
  });
});
