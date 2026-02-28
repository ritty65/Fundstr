import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useCreatorProfileStore } from "../../../src/stores/creatorProfile";
import type { Tier } from "../../../src/nutzap/types";

type TierWithBenefits = Tier & { benefits?: string[] };

function buildTier(overrides: Partial<TierWithBenefits> = {}): TierWithBenefits {
  return {
    id: "tier-1",
    title: "Tier One",
    price: 1000,
    frequency: "monthly" as const,
    description: "",
    benefits: ["perk"],
    media: [{ url: "https://fundstr.me/example" }],
    ...overrides,
  };
}

const lsStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => (key in lsStore ? lsStore[key] : null),
  setItem: (key: string, value: string) => {
    lsStore[key] = String(value);
  },
  removeItem: (key: string) => {
    delete lsStore[key];
  },
  clear: () => {
    for (const key in lsStore) delete lsStore[key];
  },
  key: (index: number) => Object.keys(lsStore)[index] ?? null,
  get length() {
    return Object.keys(lsStore).length;
  },
};

describe("useCreatorHub", () => {
  beforeEach(() => {
    vi.resetModules();
    setActivePinia(createPinia());
    for (const key in lsStore) delete lsStore[key];
  });

  it("tracks tier draft dirtiness across nested mutations", async () => {
    const { useCreatorHub } = await import("../../../src/composables/useCreatorHub");
    const profile = useCreatorProfileStore();
    profile.setProfile({
      display_name: "Creator",
      about: "",
      picture: "",
      pubkey: "",
      mints: [],
      relays: [],
    });
    profile.markClean();

    const hub = useCreatorHub();
    const baseTier = buildTier();

    hub.replaceTierDrafts([baseTier]);
    hub.markTierDraftsClean();

    expect(hub.tiersDirty.value).toBe(false);

    hub.tierDrafts.value[0].benefits!.push("new perk");

    expect(hub.tiersDirty.value).toBe(true);
  });

  it("surfaces creator profile dirtiness alongside draft changes", async () => {
    const { useCreatorHub } = await import("../../../src/composables/useCreatorHub");
    const profile = useCreatorProfileStore();
    profile.setProfile({
      display_name: "Creator",
      about: "",
      picture: "",
      pubkey: "",
      mints: [],
      relays: [],
    });
    profile.markClean();

    const hub = useCreatorHub();
    hub.replaceTierDrafts([]);
    hub.markTierDraftsClean();
    profile.markClean();
    expect(hub.isDirty.value).toBe(false);

    profile.setProfile({ display_name: "Updated" });

    expect(hub.isDirty.value).toBe(true);

    profile.markClean();
    hub.replaceTierDrafts([buildTier({ id: "tier-2" })]);

    expect(hub.isDirty.value).toBe(true);

    hub.markTierDraftsClean();

    expect(hub.isDirty.value).toBe(false);
  });
});
