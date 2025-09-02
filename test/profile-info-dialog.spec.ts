import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import ProfileInfoDialog from "../src/components/ProfileInfoDialog.vue";

let fetchTiers: any;

vi.mock("../src/stores/nostr", () => ({
  useNostrStore: () => ({
    getProfile: vi.fn(),
    fetchFollowerCount: vi.fn(),
    fetchFollowingCount: vi.fn(),
    fetchJoinDate: vi.fn(),
    fetchMostRecentPost: vi.fn(),
    resolvePubkey: (s: string) => s,
  }),
}));

vi.mock("../src/stores/creators", () => ({
  useCreatorsStore: () => ({
    fetchTierDefinitions: (...args: any[]) => fetchTiers(...args),
    tiersMap: {},
  }),
}));

const stubs = {
  "q-dialog": {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template: '<div v-if="modelValue"><slot /></div>',
  },
  "q-card": { template: '<div><slot /></div>' },
  "q-card-section": { template: '<div><slot /></div>' },
  "q-avatar": { template: '<div><slot /></div>' },
  "q-card-actions": { template: '<div><slot /></div>' },
  "q-btn": { template: '<button><slot /></button>' },
};

function mountDialog(props: any) {
  return mount(ProfileInfoDialog, { props, global: { stubs } });
}

beforeEach(() => {
  fetchTiers = vi.fn();
});

describe("ProfileInfoDialog", () => {
  it("does not request tiers while closed", async () => {
    const wrapper = mountDialog({ modelValue: false, pubkey: "pk1" });
    await flushPromises();
    expect(fetchTiers).not.toHaveBeenCalled();

    await wrapper.setProps({ pubkey: "pk2" });
    await flushPromises();
    expect(fetchTiers).not.toHaveBeenCalled();

    await wrapper.setProps({ modelValue: true });
    await flushPromises();
    expect(fetchTiers).toHaveBeenCalledTimes(1);
    expect(fetchTiers).toHaveBeenCalledWith("pk2", true);
  });

  it("reloads when pubkey changes while open", async () => {
    const wrapper = mountDialog({ modelValue: true, pubkey: "pk1" });
    await flushPromises();
    expect(fetchTiers).toHaveBeenCalledTimes(1);
    expect(fetchTiers).toHaveBeenCalledWith("pk1", true);

    await wrapper.setProps({ pubkey: "pk2" });
    await flushPromises();
    expect(fetchTiers).toHaveBeenCalledTimes(2);
    expect(fetchTiers).toHaveBeenLastCalledWith("pk2", true);
  });
});
