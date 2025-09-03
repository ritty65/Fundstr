import { beforeEach, describe, expect, it, vi } from "vitest";

var filterMock: any;
var fetchEventsMock: any;

vi.mock("../../../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNostrStore: () => ({
      initNdkReadOnly: vi.fn().mockResolvedValue(undefined),
      connected: true,
      lastError: null,
    }),
  };
});

vi.mock("../../../src/composables/useNdk", () => {
  fetchEventsMock = vi.fn().mockResolvedValue(new Set());
  return { useNdk: vi.fn().mockResolvedValue({ fetchEvents: fetchEventsMock }) };
});

vi.mock("../../../src/utils/relayHealth", () => {
  filterMock = vi.fn();
  return {
    filterHealthyRelays: (...args: any[]) => filterMock(...args),
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

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  await db.close();
  await db.open();
});

describe("fetchTierDefinitions fallback", () => {
  it("uses indexer when no relays healthy", async () => {
    filterMock.mockResolvedValue([]);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        event: {
          id: "1",
          created_at: 1,
          content:
            '[{"id":"t","name":"T","price_sats":1,"description":"d","benefits":[]}]',
          tags: [["d", "tiers"]],
        },
      }),
    } as any);
    const store = useCreatorsStore();
    await store.fetchTierDefinitions("pub");
    expect(fetchEventsMock).not.toHaveBeenCalled();
    expect(store.tiersMap["pub"].length).toBe(1);
    fetchSpy.mockRestore();
  });

  it("falls back when relay fetch returns no events", async () => {
    filterMock.mockResolvedValue(["wss://relay"]);
    fetchEventsMock.mockResolvedValue(new Set());
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        event: {
          id: "1",
          created_at: 1,
          content:
            '[{"id":"t","name":"T","price_sats":1,"description":"d","benefits":[]}]',
          tags: [["d", "tiers"]],
        },
      }),
    } as any);
    const store = useCreatorsStore();
    await store.fetchTierDefinitions("pub");
    expect(fetchEventsMock).toHaveBeenCalled();
    expect(store.tiersMap["pub"].length).toBe(1);
    fetchSpy.mockRestore();
  });

  it("decodes npub and stores using hex", async () => {
    filterMock.mockResolvedValue([]);
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        event: {
          id: "1",
          created_at: 1,
          content:
            '[{"id":"t","name":"T","price_sats":1,"description":"d","benefits":[]}]',
          tags: [["d", "tiers"]],
        },
      }),
    } as any);
    const { nip19 } = await import("nostr-tools");
    const hex = "f".repeat(64);
    const npub = nip19.npubEncode(hex);
    const store = useCreatorsStore();
    await store.fetchTierDefinitions(npub);
    expect(store.tiersMap[hex].length).toBe(1);
    fetchSpy.mockRestore();
  });
});
