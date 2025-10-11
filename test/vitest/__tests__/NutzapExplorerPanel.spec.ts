import { describe, expect, it, vi } from "vitest";
import { shallowMount } from "@vue/test-utils";
import { nextTick } from "vue";
import NutzapExplorerPanel from "../../../src/nutzap/onepage/NutzapExplorerPanel.vue";

const mocks = vi.hoisted(() => ({
  multiRelaySearchMock: vi.fn(async () => ({ events: [], timedOut: false, usedRelays: [] })),
  mergeRelayHintsMock: vi.fn(() => []),
}));

vi.mock("../../../src/nutzap/onepage/multiRelaySearch", () => ({
  multiRelaySearch: mocks.multiRelaySearchMock,
  mergeRelayHints: mocks.mergeRelayHintsMock,
}));

const stubs = {
  "q-input": { props: ["modelValue"], emits: ["update:modelValue"], template: "<input />" },
  "q-btn": {
    emits: ["click"],
    template: "<button @click=\"$emit('click')\"><slot /></button>",
  },
  "q-btn-toggle": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: "<div><slot /></div>",
  },
  "q-banner": { template: "<div><slot /></div>" },
  "q-table": { template: "<div><slot /></div>" },
  "q-inner-loading": { template: "<div><slot /></div>" },
  "q-td": { template: "<td><slot /></td>" },
  "q-drawer": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: "<div><slot /></div>",
  },
  "q-toolbar": { template: "<div><slot /></div>" },
  "q-toolbar-title": { template: "<div><slot /></div>" },
  "q-separator": { template: "<hr />" },
};

describe("NutzapExplorerPanel", () => {
  it("keeps search disabled and handles null queries", async () => {
    mocks.multiRelaySearchMock.mockClear();
    mocks.mergeRelayHintsMock.mockClear();

    const wrapper = shallowMount(NutzapExplorerPanel, {
      props: { modelValue: "", loadingAuthor: false, tierAddressPreview: "" },
      global: { stubs },
    });

    const vm = wrapper.vm as unknown as {
      relayInput: string;
      query: string | null;
      canSearch: boolean;
      runSearch: () => Promise<void>;
    };

    vm.relayInput = "";
    vm.query = null;
    await nextTick();

    expect(vm.canSearch).toBe(false);
    await expect(vm.runSearch()).resolves.toBeUndefined();
    expect(mocks.multiRelaySearchMock).toHaveBeenCalledTimes(1);
  });
});
