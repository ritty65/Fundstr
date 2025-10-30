import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { nip19 } from "nostr-tools";
import type { Creator as DiscoveryCreator, CreatorTier as DiscoveryCreatorTier } from "src/lib/fundstrApi";

const PUBKEY_HEX = "a".repeat(64);
const NPUB = nip19.npubEncode(PUBKEY_HEX);

interface ResponsePlan<T> {
  cached?: PlanStep<T>;
  fresh?: PlanStep<T>;
}

type PlanStep<T> =
  | T
  | Error
  | Promise<T>
  | (() => T)
  | (() => Promise<T>)
  | (() => Error);

interface DiscoveryMockPlan {
  creators?: Record<string, ResponsePlan<{ results?: DiscoveryCreator[] }>>;
  tiers?: Record<string, ResponsePlan<{ tiers?: DiscoveryCreatorTier[] }>>;
}

interface DiscoveryMock {
  getCreators: ReturnType<typeof vi.fn>;
  getCreatorTiers: ReturnType<typeof vi.fn>;
}

const baseProfile = {
  name: "Sample Creator",
  relays: ["wss://relay.example"],
  about: "Creator bio",
};

const baseTier: DiscoveryCreatorTier = {
  id: "tier-basic",
  name: "Basic",
  amountMsat: 2500000,
  cadence: null,
  description: "Access to basic content",
  media: [],
};

function makeCreator(overrides: Partial<DiscoveryCreator> = {}): DiscoveryCreator {
  return {
    pubkey: PUBKEY_HEX,
    profile: baseProfile,
    followers: 42,
    following: 8,
    joined: 1700000000,
    tiers: [],
    ...overrides,
  };
}

function planStepToPromise<T>(step: PlanStep<T> | undefined, label: string): Promise<T> {
  if (step === undefined) {
    throw new Error(`Missing ${label} plan`);
  }
  if (step instanceof Error) {
    return Promise.reject(step);
  }
  if (typeof step === "function") {
    try {
      const result = step();
      if (result instanceof Error) {
        return Promise.reject(result);
      }
      return Promise.resolve(result as T | Promise<T>);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  return Promise.resolve(step);
}

function createDiscoveryMock(plan: DiscoveryMockPlan): DiscoveryMock {
  const mock = {
    getCreators: vi.fn(async (request: { q: string; fresh?: boolean }) => {
      const query = typeof request?.q === "string" ? request.q.trim() : "";
      const variant = request?.fresh ? plan.creators?.[query]?.fresh : plan.creators?.[query]?.cached;
      return planStepToPromise(variant, `getCreators(${query}) fresh=${Boolean(request?.fresh)}`);
    }),
    getCreatorTiers: vi.fn(async (request: { id: string; fresh?: boolean }) => {
      const id = typeof request?.id === "string" ? request.id.trim() : "";
      const variant = request?.fresh ? plan.tiers?.[id]?.fresh : plan.tiers?.[id]?.cached;
      return planStepToPromise(variant, `getCreatorTiers(${id}) fresh=${Boolean(request?.fresh)}`);
    }),
  } satisfies DiscoveryMock;
  return mock;
}

async function loadCreatorsModule(discoveryMock: DiscoveryMock) {
  vi.doMock("src/api/fundstrDiscovery", () => ({
    useDiscovery: () => discoveryMock,
  }));
  return import("stores/creators");
}

describe("fetchFundstrProfileBundle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a normalized bundle when fresh creator and tier fetches succeed", async () => {
    const discoveryMock = createDiscoveryMock({
      creators: {
        [PUBKEY_HEX]: {
          cached: { results: [] },
          fresh: { results: [makeCreator()] },
        },
      },
      tiers: {
        [PUBKEY_HEX]: {
          cached: { tiers: [] },
          fresh: { tiers: [baseTier] },
        },
      },
    });

    const { fetchFundstrProfileBundle } = await loadCreatorsModule(discoveryMock);
    const bundle = await fetchFundstrProfileBundle(PUBKEY_HEX);

    expect(discoveryMock.getCreators).toHaveBeenCalledTimes(2);
    expect(discoveryMock.getCreatorTiers).toHaveBeenCalledTimes(2);
    expect(bundle.fetchedFromFallback).toBe(false);
    expect(bundle.tierDataFresh).toBe(true);
    expect(bundle.tierSecurityBlocked).toBe(false);
    expect(bundle.profile).toEqual(baseProfile);
    expect(bundle.followers).toBe(42);
    expect(bundle.following).toBe(8);
    expect(bundle.profileDetails).toMatchObject({
      relays: ["wss://relay.example"],
      trustedMints: [],
      p2pkPubkey: "",
    });
    expect(bundle.relayHints).toEqual(["wss://relay.example"]);
    expect(bundle.tiers).toEqual([
      {
        id: "tier-basic",
        name: "Basic",
        price_sats: 2500,
        description: "Access to basic content",
        media: [],
      },
    ]);
  });

  it("uses cached discovery data when fresh creator lookup fails", async () => {
    const fallbackCreator = makeCreator({ followers: 100, following: 5 });
    const discoveryMock = createDiscoveryMock({
      creators: {
        [PUBKEY_HEX]: {
          cached: { results: [fallbackCreator] },
          fresh: () => {
            throw new Error("fresh creator failed");
          },
        },
        [NPUB]: {
          cached: { results: [] },
          fresh: { results: [] },
        },
      },
      tiers: {
        [PUBKEY_HEX]: {
          cached: { tiers: [] },
          fresh: { tiers: [baseTier] },
        },
      },
    });

    const { fetchFundstrProfileBundle } = await loadCreatorsModule(discoveryMock);
    const bundle = await fetchFundstrProfileBundle(PUBKEY_HEX);

    const creatorCalls = discoveryMock.getCreators.mock.calls.map(([request]) => request);
    expect(creatorCalls).toEqual([
      expect.objectContaining({ q: PUBKEY_HEX, fresh: false }),
      expect.objectContaining({ q: NPUB, fresh: false }),
      expect.objectContaining({ q: NPUB, fresh: true }),
    ]);
    expect(bundle.fetchedFromFallback).toBe(true);
    expect(bundle.tierDataFresh).toBe(true);
    expect(bundle.tierSecurityBlocked).toBe(false);
    expect(bundle.profile).toEqual(baseProfile);
    expect(bundle.followers).toBe(100);
    expect(bundle.following).toBe(5);
    expect(bundle.tiers).toEqual([
      {
        id: "tier-basic",
        name: "Basic",
        price_sats: 2500,
        description: "Access to basic content",
        media: [],
      },
    ]);
  });

  it("falls back to cached tiers from the npub lookup when the direct tier request fails", async () => {
    const discoveryMock = createDiscoveryMock({
      creators: {
        [PUBKEY_HEX]: {
          cached: { results: [] },
          fresh: { results: [makeCreator()] },
        },
      },
      tiers: {
        [PUBKEY_HEX]: {
          cached: { tiers: [] },
          fresh: () => {
            throw new Error("tier fresh failed");
          },
        },
        [NPUB]: {
          cached: { tiers: [baseTier] },
        },
      },
    });

    const { fetchFundstrProfileBundle } = await loadCreatorsModule(discoveryMock);
    const bundle = await fetchFundstrProfileBundle(PUBKEY_HEX);

    const tierCalls = discoveryMock.getCreatorTiers.mock.calls.map(([request]) => request);
    expect(tierCalls).toEqual([
      expect.objectContaining({ id: PUBKEY_HEX, fresh: false }),
      expect.objectContaining({ id: PUBKEY_HEX, fresh: true }),
      expect.objectContaining({ id: NPUB, fresh: false }),
    ]);
    expect(bundle.fetchedFromFallback).toBe(true);
    expect(bundle.tierDataFresh).toBe(false);
    expect(bundle.tierSecurityBlocked).toBe(false);
    expect(bundle.tiers).toEqual([
      {
        id: "tier-basic",
        name: "Basic",
        price_sats: 2500,
        description: "Access to basic content",
        media: [],
      },
    ]);
    expect(bundle.relayHints).toEqual(["wss://relay.example"]);
  });

  it("marks the bundle as tierSecurityBlocked when discovery throws a DOMException", async () => {
    const domException = typeof DOMException !== "undefined"
      ? new DOMException("Blocked by tracking protection", "NetworkError")
      : Object.assign(new Error("dom exception"), { name: "DOMException" });

    const discoveryMock = createDiscoveryMock({
      creators: {
        [PUBKEY_HEX]: {
          cached: { results: [] },
          fresh: { results: [makeCreator()] },
        },
      },
      tiers: {
        [PUBKEY_HEX]: {
          cached: { tiers: [] },
          fresh: () => {
            throw domException;
          },
        },
        [NPUB]: {
          cached: { tiers: [baseTier] },
          fresh: { tiers: [] },
        },
      },
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { fetchFundstrProfileBundle } = await loadCreatorsModule(discoveryMock);

    const bundle = await fetchFundstrProfileBundle(PUBKEY_HEX);

    expect(bundle.tierSecurityBlocked).toBe(true);
    expect(bundle.tierDataFresh).toBe(false);
    expect(bundle.fetchedFromFallback).toBe(true);
    expect(bundle.tiers).toEqual([
      {
        id: "tier-basic",
        name: "Basic",
        price_sats: 2500,
        description: "Access to basic content",
        media: [],
      },
    ]);

    warnSpy.mockRestore();
  });

  it("throws a FundstrProfileFetchError when discovery returns no profile records", async () => {
    const discoveryMock = createDiscoveryMock({
      creators: {
        [PUBKEY_HEX]: {
          cached: { results: [] },
          fresh: { results: [] },
        },
        [NPUB]: {
          cached: { results: [] },
          fresh: { results: [] },
        },
      },
    });

    const { fetchFundstrProfileBundle, FundstrProfileFetchError } = await loadCreatorsModule(discoveryMock);

    await fetchFundstrProfileBundle(PUBKEY_HEX)
      .then(() => {
        throw new Error("Expected fetchFundstrProfileBundle to reject");
      })
      .catch((error: unknown) => {
        expect(error).toBeInstanceOf(FundstrProfileFetchError);
        expect(error).toMatchObject({ fallbackAttempted: false });
      });
  });

  it("falls back gracefully when tier lookups are blocked by browser security", async () => {
    const securityError = typeof DOMException !== "undefined"
      ? new DOMException("The operation is insecure.", "SecurityError")
      : Object.assign(new Error("security"), { name: "SecurityError" });

    const discoveryMock = createDiscoveryMock({
      creators: {
        [PUBKEY_HEX]: {
          cached: { results: [] },
          fresh: { results: [makeCreator()] },
        },
        [NPUB]: {
          cached: { results: [] },
          fresh: { results: [] },
        },
      },
      tiers: {
        [PUBKEY_HEX]: {
          cached: () => {
            throw securityError;
          },
          fresh: () => {
            throw securityError;
          },
        },
        [NPUB]: {
          cached: { tiers: [baseTier] },
        },
      },
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { fetchFundstrProfileBundle } = await loadCreatorsModule(discoveryMock);

    const bundle = await fetchFundstrProfileBundle(PUBKEY_HEX);

    expect(bundle.tierDataFresh).toBe(false);
    expect(bundle.fetchedFromFallback).toBe(true);
    expect(bundle.tierSecurityBlocked).toBe(true);
    expect(bundle.tiers).toEqual([
      {
        id: "tier-basic",
        name: "Basic",
        price_sats: 2500,
        description: "Access to basic content",
        media: [],
      },
    ]);

    await fetchFundstrProfileBundle(PUBKEY_HEX);

    const freshTierCalls = discoveryMock.getCreatorTiers.mock.calls.filter(
      ([request]) => request?.fresh === true,
    );
    expect(freshTierCalls).toHaveLength(0);

    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("fetchFundstrProfileBundle discovery tier lookup failed"),
      expect.anything(),
    );
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
