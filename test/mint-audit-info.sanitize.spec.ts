import { describe, it, expect, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
describe("MintAuditInfo", () => {
  it("sanitizes auditor URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
    );
    const pinia = createTestingPinia({
      createSpy: vi.fn,
      initialState: {
        settings: {
          auditorUrl: "javascript:1",
          auditorApiUrl: "",
          defaultNostrRelays: [],
        },
      },
    });
    const MintAuditInfo = (await import("src/components/MintAuditInfo.vue"))
      .default;
    const wrapper = shallowMount(MintAuditInfo, {
      props: { mintUrl: "m" },
      global: {
        plugins: [pinia],
        stubs: {
          "q-spinner-hourglass": true,
          "q-icon": true,
          MintAuditWarningBox: true,
          MintAuditSwapsBarChart: true,
        },
      },
    });
    await wrapper.setData({ loading: false, mintNotAudited: true });
    const a = wrapper.get("a");
    expect(a.attributes("href")).toBe("#");
    expect(a.attributes("rel")).toBe("noopener noreferrer");
  });
});
