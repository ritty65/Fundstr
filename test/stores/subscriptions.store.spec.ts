import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useSubscriptionsStore } from "@/stores/subscriptions";
import { cashuDb, type Subscription } from "@/stores/dexie";
import type { SubscriptionFrequency } from "@/constants/subscriptionFrequency";

const baseSubscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: "sub-" + Math.random().toString(16).slice(2),
  creatorNpub: "npub-target",
  tierId: "tier-id",
  creatorP2PK: "p2pk",
  mintUrl: "https://mint.example",
  amountPerInterval: 1,
  frequency: "monthly" as SubscriptionFrequency,
  intervalDays: 30,
  startDate: 1,
  commitmentLength: 12,
  tierName: "Tier",
  benefits: [],
  creatorName: "Creator",
  creatorAvatar: null,
  intervals: [],
  status: "active",
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const interval = (overrides: Partial<Subscription["intervals"][number]> = {}) => ({
  intervalKey: "interval-" + Math.random().toString(16).slice(2),
  lockedTokenId: "lock-" + Math.random().toString(16).slice(2),
  unlockTs: 1,
  status: "pending" as Subscription["intervals"][number]["status"],
  tokenString: "token",
  redeemed: false,
  monthIndex: 0,
  totalPeriods: 12,
  ...overrides,
});

beforeEach(async () => {
  setActivePinia(createPinia());
  await cashuDb.close();
  await cashuDb.delete();
  await cashuDb.open();
});

describe("subscriptions store", () => {
  it("addSubscription normalizes defaults and persists to Dexie", async () => {
    const nowSeconds = 1704067200;
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(nowSeconds * 1000);
    try {
      const store = useSubscriptionsStore();

      const result = await store.addSubscription({
        creatorNpub: "npub1",
        tierId: "tier1",
        creatorP2PK: "p2pk",
        mintUrl: "https://mint.example",
        amountPerInterval: 100,
        frequency: "monthly",
        startDate: nowSeconds,
        commitmentLength: 6,
        intervals: [
          {
            intervalKey: "int-1",
            lockedTokenId: "locked-1",
            unlockTs: nowSeconds + 3600,
            status: "pending",
            tokenString: "token-1",
          },
        ],
      });

      expect(result.id).toMatch(/[0-9a-fA-F-]{36}/);
      expect(result.intervalDays).toBe(30);
      expect(result.tierName).toBeNull();
      expect(result.benefits).toEqual([]);
      expect(result.creatorName).toBeNull();
      expect(result.creatorAvatar).toBeNull();
      expect(result.createdAt).toBe(nowSeconds);
      expect(result.updatedAt).toBe(nowSeconds);
      expect(result.intervals).toHaveLength(1);
      expect(result.intervals[0]).toMatchObject({
        redeemed: false,
      });

      const stored = await cashuDb.subscriptions.get(result.id);
      expect(stored).toEqual(result);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it("cancelSubscription removes future locked tokens and cancels rows", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const futureUnlock = nowSeconds + 3600;
    const pastUnlock = nowSeconds - 3600;

    const firstSub = baseSubscription({
      id: "sub-1",
      intervals: [
        interval({ lockedTokenId: "future-1", unlockTs: futureUnlock, status: "pending" }),
        interval({ lockedTokenId: "future-2", unlockTs: futureUnlock + 10, status: "unlockable" }),
        interval({ lockedTokenId: "past-1", unlockTs: pastUnlock, status: "claimed" }),
      ],
    });

    const secondSub = baseSubscription({
      id: "sub-2",
      intervals: [interval({ lockedTokenId: "past-2", unlockTs: pastUnlock, status: "claimed" })],
    });

    await cashuDb.subscriptions.bulkPut([firstSub, secondSub]);

    const store = useSubscriptionsStore();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const bulkDeleteSpy = vi.spyOn(cashuDb.lockedTokens, "bulkDelete");

    await store.cancelSubscription("npub-target");

    expect(bulkDeleteSpy).toHaveBeenCalledTimes(1);
    expect(bulkDeleteSpy).toHaveBeenCalledWith(["future-1", "future-2"]);

    const updatedFirst = await cashuDb.subscriptions.get("sub-1");
    const updatedSecond = await cashuDb.subscriptions.get("sub-2");

    expect(updatedFirst?.status).toBe("cancelled");
    expect(updatedSecond?.status).toBe("cancelled");
  });

  it("markIntervalRedeemed updates interval and persists via Dexie", async () => {
    const sub = baseSubscription({
      id: "sub-interval",
      intervals: [
        interval({ monthIndex: 1, status: "unlockable", redeemed: false }),
        interval({ monthIndex: 2, status: "pending", redeemed: false }),
      ],
    });

    await cashuDb.subscriptions.put(sub);

    const store = useSubscriptionsStore();
    const updateSpy = vi.spyOn(cashuDb.subscriptions, "update");

    await store.markIntervalRedeemed("sub-interval", 1);

    expect(updateSpy).toHaveBeenCalledWith(
      "sub-interval",
      expect.objectContaining({ intervals: expect.any(Array) }),
    );

    const updated = await cashuDb.subscriptions.get("sub-interval");
    expect(updated?.intervals[0].status).toBe("claimed");
    expect(updated?.intervals[0].redeemed).toBe(true);
    expect(updated?.intervals[1].status).toBe("pending");
  });

  it("deleteSubscription removes row and liveQuery refresh updates state", async () => {
    const sub = baseSubscription({ id: "sub-delete" });

    const store = useSubscriptionsStore();

    await cashuDb.subscriptions.put(sub);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.subscriptions.some((row) => row.id === "sub-delete")).toBe(true);

    await store.deleteSubscription("sub-delete");

    await new Promise((resolve) => setTimeout(resolve, 0));

    const persisted = await cashuDb.subscriptions.get("sub-delete");
    expect(persisted).toBeUndefined();
    expect(store.subscriptions.some((row) => row.id === "sub-delete")).toBe(false);
  });
});
