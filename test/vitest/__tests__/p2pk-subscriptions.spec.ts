import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useSubscriptionsStore } from "src/stores/subscriptions";
import { useLockedTokensStore } from "src/stores/lockedTokens";
import { cashuDb } from "src/stores/dexie";
import { buildTimedOutputs } from "src/stores/p2pk";

// Mock Dexie
vi.mock("src/stores/dexie", () => ({
  cashuDb: {
    subscriptions: {
      toArray: vi.fn(),
      put: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
      bulkDelete: vi.fn(),
    },
    lockedTokens: {
      bulkAdd: vi.fn(),
      bulkDelete: vi.fn(),
    }
  },
}));

// Mock dexie module
vi.mock("dexie", () => {
  return {
    default: class Dexie {
      constructor() {
        return {
          version: () => ({ stores: () => {} }),
          table: () => ({}),
        };
      }
    },
    liveQuery: (fn) => ({ subscribe: (cb) => { /* mock subscribe */ } }),
  };
});

describe("P2PK Subscriptions", () => {
  let subscriptionsStore: any;

  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
    subscriptionsStore = useSubscriptionsStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Subscription Creation (simulated)", () => {
    // Note: The actual creation logic involving buildTimedOutputs is usually called from a component or a higher level action.
    // Here we verify the utility function `buildTimedOutputs` which is key for subscriptions.

    it("buildTimedOutputs generates correct locktimes", async () => {
       const walletMock = {
         split: vi.fn((amounts, opts) => {
           // Simulate buildSecret callback
           const proofs = amounts.map((a, i) => {
             const secret = opts.buildSecret(i);
             return { amount: a, secret };
           });
           return Promise.resolve({ proofs, tokenStrings: [] });
         })
       };

       const count = 3;
       const startTime = 10000;
       const interval = 1000;
       const creatorPk = "02pubkey";

       const { proofs } = await buildTimedOutputs(
         walletMock as any,
         300,
         count,
         creatorPk,
         startTime,
         interval
       );

       expect(proofs.length).toBe(3);

       // Index 0: locktime = 0 (immediate)
       const secret0 = JSON.parse(proofs[0].secret);
       const tags0 = secret0[1].tags;
       expect(tags0).toEqual([]); // No locktime for first payment usually, or checks impl

       // Index 1: locktime = startTime + interval
       const secret1 = JSON.parse(proofs[1].secret);
       const tags1 = secret1[1].tags;
       const locktime1 = tags1.find(t => t[0] === "locktime")[1];
       expect(Number(locktime1)).toBe(startTime + interval);

       // Index 2: locktime = startTime + 2*interval
       const secret2 = JSON.parse(proofs[2].secret);
       const tags2 = secret2[1].tags;
       const locktime2 = tags2.find(t => t[0] === "locktime")[1];
       expect(Number(locktime2)).toBe(startTime + 2 * interval);
    });
  });

  describe("Cancellation Path", () => {
    it("Cancel Subscription: deletes future locked tokens and updates status", async () => {
      const pubkey = "npub_creator";

      // Mock existing subscription
      const sub = {
        id: "sub1",
        creatorNpub: pubkey,
        intervals: [
          { lockedTokenId: "tok1", unlockTs: 100, htlcHash: "hash1" }, // Past
          { lockedTokenId: "tok2", unlockTs: 9999999999, htlcHash: "hash2" } // Future
        ]
      };

      subscriptionsStore.subscriptions = [sub];

      await subscriptionsStore.cancelSubscription(pubkey);

      // Should verify that bulkDelete was called for future tokens
      expect(cashuDb.lockedTokens.bulkDelete).toHaveBeenCalledWith(["tok2"]);

      // Should verify status update
      expect(cashuDb.subscriptions.update).toHaveBeenCalledWith("sub1", expect.objectContaining({ status: "cancelled" }));
    });
  });

  describe("Interval Updates", () => {
     it("markIntervalRedeemed updates subscription interval status", async () => {
        const sub = {
          id: "sub1",
          intervals: [
             { monthIndex: 0, status: "pending", redeemed: false },
             { monthIndex: 1, status: "pending", redeemed: false }
          ]
        };
        // @ts-ignore
        cashuDb.subscriptions.get.mockResolvedValue(sub);

        await subscriptionsStore.markIntervalRedeemed("sub1", 1);

        expect(sub.intervals[1].status).toBe("claimed");
        expect(sub.intervals[1].redeemed).toBe(true);
        expect(cashuDb.subscriptions.update).toHaveBeenCalledWith("sub1", { intervals: sub.intervals });
     });
  });
});
