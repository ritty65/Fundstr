import { beforeEach, describe, expect, it, vi } from "vitest";

let filterMock = vi.fn();
let fetchEventsMock = vi.fn();
let queryNutzapTiersMock = vi.fn().mockResolvedValue(null);

vi.mock("zod", () => {
  const make = () => ({
    optional: () => make(),
    array: () => make(),
  });
  return {
    z: {
      object: () => make(),
      string: () => make(),
      number: () => make(),
      array: () => make(),
    },
  };
});

vi.mock("../../../src/stores/dexie", () => {
  const tierCollection = {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  const cashuDb = {
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    creatorsTierDefinitions: tierCollection,
  };
  return {
    cashuDb,
    db: cashuDb,
  };
});

vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => ({
    initNdkReadOnly: vi.fn().mockResolvedValue(undefined),
    connected: true,
    lastError: null,
  }),
  getEventHash: vi.fn(),
  signEvent: vi.fn(),
  publishEvent: vi.fn(),
}));

vi.mock("../../../src/composables/useNdk", () => ({
  useNdk: vi.fn().mockResolvedValue({
    fetchEvents: (...args: any[]) => fetchEventsMock(...args),
  }),
}));

vi.mock("../../../src/utils/relayHealth", () => ({
  filterHealthyRelays: (...args: any[]) => filterMock(...args),
}));

vi.mock("../../../src/nostr/relayClient", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    queryNutzapTiers: (...args: any[]) => queryNutzapTiersMock(...args),
  };
});

vi.mock("../../../src/stores/settings", () => ({
  useSettingsStore: () => ({
    tiersIndexerUrl: { value: "https://indexer/?pubkey={pubkey}" },
    defaultNostrRelays: { value: [] },
  }),
}));

vi.mock("../../../src/js/notify", () => ({
  notifyWarning: vi.fn(),
}));

import { useCreatorsStore } from "../../../src/stores/creators";
import { cashuDb as db } from "../../../src/stores/dexie";

const CREATOR_HEX = "a".repeat(64);

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  filterMock = vi.fn();
  fetchEventsMock = vi.fn().mockResolvedValue(new Set());
  queryNutzapTiersMock = vi.fn().mockResolvedValue(null);
  await db.close();
  await db.open();
});

describe("fetchTierDefinitions", () => {
  const modernEvent = {
    id: "modern",
    pubkey: CREATOR_HEX,
    created_at: 10,
    kind: 30019,
    tags: [["d", "tiers"]],
    content:
      '[{"id":"t","name":"Tier","price_sats":1,"perks":"Modern","media":[{"url":"https://ok"}]}]',
  } as any;
  const legacyEvent = {
    id: "legacy",
    pubkey: CREATOR_HEX,
    created_at: 5,
    kind: 30000,
    tags: [["d", "tiers"]],
    content: '{"tiers":[{"id":"t","name":"Tier","price":2,"perks":"Legacy"}]}',
  } as any;

  it("stores tiers from modern kind 30019 events", async () => {
    queryNutzapTiersMock.mockResolvedValueOnce(modernEvent);
    const store = useCreatorsStore();
    await store.fetchTierDefinitions(CREATOR_HEX);
    expect(queryNutzapTiersMock).toHaveBeenCalled();
    expect(queryNutzapTiersMock.mock.calls[0][0]).toBe(CREATOR_HEX);
    expect(store.tiersMap[CREATOR_HEX].length).toBe(1);
    expect(store.tiersMap[CREATOR_HEX][0].benefits).toEqual(["Modern"]);
    expect(store.tiersMap[CREATOR_HEX][0].media).toEqual([{ url: "https://ok" }]);
  });

  it("normalizes legacy kind 30000 tiers", async () => {
    queryNutzapTiersMock.mockResolvedValueOnce(legacyEvent);
    const store = useCreatorsStore();
    await store.fetchTierDefinitions(CREATOR_HEX);
    expect(queryNutzapTiersMock).toHaveBeenCalled();
    expect(store.tiersMap[CREATOR_HEX][0].price_sats).toBe(2);
    expect(store.tiersMap[CREATOR_HEX][0].benefits).toEqual(["Legacy"]);
  });

  it("decodes npub inputs before storing tiers", async () => {
    const { nip19 } = await import("nostr-tools");
    queryNutzapTiersMock.mockResolvedValueOnce(modernEvent);
    const store = useCreatorsStore();
    await store.fetchTierDefinitions(nip19.npubEncode(CREATOR_HEX));
    expect(queryNutzapTiersMock).toHaveBeenCalled();
    expect(queryNutzapTiersMock.mock.calls[0][0]).toBe(CREATOR_HEX);
    expect(store.tiersMap[CREATOR_HEX].length).toBe(1);
  });
});
