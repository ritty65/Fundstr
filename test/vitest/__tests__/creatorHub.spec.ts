import { beforeEach, describe, expect, it, vi } from "vitest";
import "fake-indexeddb/auto";
import {
  useCreatorHubStore,
  maybeRepublishNutzapProfile,
} from "../../../src/stores/creatorHub";
import { useP2PKStore } from "../../../src/stores/p2pk";
import { useMintsStore } from "../../../src/stores/mints";
import { useCreatorProfileStore } from "../../../src/stores/creatorProfile";

const notifySuccess = vi.hoisted(() => vi.fn());
const notifyError = vi.hoisted(() => vi.fn());

vi.mock("../../../src/js/notify", () => ({
  notifySuccess,
  notifyError,
}));

let createdEvents: any[] = [];
const signMock = vi.fn();
const publishMock = vi.fn();
let fetchNutzapProfileMock: any;
let publishNutzapProfileMock: any;
let ensureRelayConnectivityMock: any;
let filterHealthyRelaysMock: any;

let ndkStub: any = {};

const MockNDKEvent = vi.hoisted(() => {
  return class MockNDKEvent {
    kind: number | undefined;
    tags: any[] = [];
    created_at?: number;
    content = "";
    constructor(_ndk: any) {
      createdEvents.push(this);
    }
    sign = signMock;
    publish = publishMock;
    rawEvent() {
      return {} as any;
    }
  };
});

vi.mock("@nostr-dev-kit/ndk", async () => {
  const actual: any = await vi.importActual("@nostr-dev-kit/ndk");
  return { ...actual, NDKEvent: MockNDKEvent };
});

vi.mock("../../../src/composables/useNdk", () => ({
  useNdk: vi.fn().mockImplementation(async () => ndkStub),
}));

const nostrStoreMock = {
  initSignerIfNotSet: vi.fn(),
  ndk: {},
  signer: "sig",
  pubkey: "pub",
  relays: ["wss://relay"] as string[],
  connected: true,
  lastError: null,
  connect: vi.fn(),
};

vi.mock("../../../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNostrStore: () => nostrStoreMock,
    ensureRelayConnectivity: (...args: any[]) =>
      ensureRelayConnectivityMock(...args),
    fetchNutzapProfile: (...args: any[]) => fetchNutzapProfileMock(...args),
    publishNutzapProfile: (...args: any[]) => publishNutzapProfileMock(...args),
    RelayConnectionError: class RelayConnectionError extends Error {},
  };
});

vi.mock("../../../src/utils/relayHealth", () => ({
  filterHealthyRelays: (...args: any[]) => filterHealthyRelaysMock(...args),
}));

beforeEach(() => {
  createdEvents = [];
  signMock.mockClear();
  publishMock.mockClear();
  nostrStoreMock.initSignerIfNotSet.mockClear();
  nostrStoreMock.connect.mockClear();
  fetchNutzapProfileMock = vi.fn(async () => null);
  publishNutzapProfileMock = vi.fn();
  ensureRelayConnectivityMock = vi.fn();
  filterHealthyRelaysMock = vi.fn(async (r: string[]) => r);
  localStorage.clear();
});

describe("CreatorHub store", () => {
  it("addTier stores tier", async () => {
    const store = useCreatorHubStore();
    await store.addTier({ name: "Tier 1", price_sats: 5, perks: "p" });
    const tier = store.getTierArray()[0];
    expect(tier.name).toBe("Tier 1");
  });

  it("saveTier stores tier", async () => {
    const store = useCreatorHubStore();
    const tier = {
      id: "id1",
      name: "T",
      price_sats: 1,
      perks: "p",
      welcomeMessage: "w",
    };
    await store.saveTier(tier);
    expect(store.tiers["id1"]).toBeDefined();
  });

  it("removeTier publishes deletion event", async () => {
    const store = useCreatorHubStore();
    store.tiers["id1"] = {
      id: "id1",
      name: "T",
      price_sats: 1,
      description: "",
      welcomeMessage: "",
    } as any;
    await store.removeTier("id1");
    expect(store.tiers["id1"]).toBeUndefined();
  });
});

describe("publishTierDefinitions", () => {
  it("creates a 30000 event with correct tags and content", async () => {
    const store = useCreatorHubStore();
    store.tiers = {
      t1: {
        id: "t1",
        name: "Tier",
        price_sats: 1,
        description: "",
        welcomeMessage: "",
        media: [],
      },
    } as any;
    store.tierOrder = ["t1"];

    await store.publishTierDefinitions();

    expect(createdEvents.length).toBe(1);
    const ev = createdEvents[0];
    expect(ev.kind).toBe(30000);
    expect(ev.tags).toEqual([["d", "tiers"]]);
    expect(ev.content).toBe(
      JSON.stringify([
        {
          id: "t1",
          name: "Tier",
          price_sats: 1,
          price: 1,
          description: "",
          welcomeMessage: "",
          media: [],
        },
      ]),
    );
    expect(signMock).toHaveBeenCalledWith(nostrStoreMock.signer);
    expect(publishMock).toHaveBeenCalled();
  });
});

describe("maybeRepublishNutzapProfile", () => {
  it("calls publishNutzapProfile when profile differs", async () => {
    const p2pk = useP2PKStore();
    p2pk.p2pkKeys = [
      { publicKey: "pk", privateKey: "priv", used: false, usedCount: 0 },
    ];
    const mints = useMintsStore();
    mints.mints = [{ url: "mint1" }, { url: "mint2" }] as any;
    const profileStore = useCreatorProfileStore();
    profileStore.mints = "mint1";

    fetchNutzapProfileMock = vi.fn(async () => ({
      p2pkPubkey: "other",
      trustedMints: ["mint2"],
      relays: [],
      hexPub: "pub",
    }));

    await maybeRepublishNutzapProfile();

    expect(publishNutzapProfileMock).toHaveBeenCalledWith({
      p2pkPub: "pk",
      mints: ["mint1"],
      relays: nostrStoreMock.relays,
    });
  });
});
