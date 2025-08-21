import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useCreatorSubscriptionsStore } from "../src/stores/creatorSubscriptions";
import { cashuDb } from "../src/stores/dexie";

vi.mock("../src/stores/creators", () => ({
  useCreatorsStore: () => ({ tiersMap: {} }),
}));

const WEEK = 7 * 24 * 60 * 60;
const BIWEEK = 14 * 24 * 60 * 60;
const FEB_29_2024 = Math.floor(new Date("2024-02-29T00:00:00Z").getTime() / 1000);
const JAN_31_2024 = Math.floor(new Date("2024-01-31T00:00:00Z").getTime() / 1000);

beforeEach(async () => {
  setActivePinia(createPinia());
  localStorage.clear();
  await cashuDb.close();
  await cashuDb.delete();
  await cashuDb.open();
});

describe("creatorSubscriptions store", () => {
  it("computes weekly and biweekly subscriptions correctly", async () => {
    const store = useCreatorSubscriptionsStore();

    await cashuDb.lockedTokens.bulkAdd([
      {
        id: "w1",
        tokenString: "tokw1",
        amount: 1,
        owner: "creator",
        subscriberNpub: "npub",
        tierId: "tier",
        tierName: "Tier",
        intervalKey: "wk1",
        unlockTs: 0,
        status: "unlockable",
        subscriptionEventId: null,
        subscriptionId: "subW",
        totalPeriods: 3,
        intervalDays: 7,
      },
      {
        id: "w2",
        tokenString: "tokw2",
        amount: 1,
        owner: "creator",
        subscriberNpub: "npub",
        tierId: "tier",
        tierName: "Tier",
        intervalKey: "wk2",
        unlockTs: WEEK,
        status: "unlockable",
        subscriptionEventId: null,
        subscriptionId: "subW",
        totalPeriods: 3,
        intervalDays: 7,
      },
      {
        id: "b1",
        tokenString: "tokb1",
        amount: 1,
        owner: "creator",
        subscriberNpub: "npub",
        tierId: "tier",
        tierName: "Tier",
        intervalKey: "bw1",
        unlockTs: 0,
        status: "unlockable",
        subscriptionEventId: null,
        subscriptionId: "subB",
        totalPeriods: 2,
        intervalDays: 14,
      },
      {
        id: "b2",
        tokenString: "tokb2",
        amount: 1,
        owner: "creator",
        subscriberNpub: "npub",
        tierId: "tier",
        tierName: "Tier",
        intervalKey: "bw2",
        unlockTs: BIWEEK,
        status: "unlockable",
        subscriptionEventId: null,
        subscriptionId: "subB",
        totalPeriods: 2,
        intervalDays: 14,
      },
    ] as any);

    await new Promise((r) => setTimeout(r, 20));

    const weekly = store.subscriptions.find((s) => s.subscriptionId === "subW");
    const biweekly = store.subscriptions.find(
      (s) => s.subscriptionId === "subB",
    );

    expect(weekly?.totalPeriods).toBe(3);
    expect(weekly?.receivedPeriods).toBe(2);
    expect(weekly?.nextRenewal).toBe(WEEK * 2);
    expect(weekly?.status).toBe("pending");

    expect(biweekly?.totalPeriods).toBe(2);
    expect(biweekly?.receivedPeriods).toBe(2);
    expect(biweekly?.nextRenewal).toBe(BIWEEK * 2);
    expect(biweekly?.status).toBe("active");
  });

  it("computes monthly subscriptions correctly without drift", async () => {
    const store = useCreatorSubscriptionsStore();

    await cashuDb.lockedTokens.bulkAdd([
      {
        id: "m1",
        tokenString: "tokm1",
        amount: 1,
        owner: "creator",
        subscriberNpub: "npub",
        tierId: "tier",
        tierName: "Tier",
        intervalKey: "m1",
        unlockTs: JAN_31_2024,
        status: "unlockable",
        subscriptionEventId: null,
        subscriptionId: "subM",
        totalPeriods: 3,
        intervalDays: 30,
        frequency: "monthly",
      },
      {
        id: "m2",
        tokenString: "tokm2",
        amount: 1,
        owner: "creator",
        subscriberNpub: "npub",
        tierId: "tier",
        tierName: "Tier",
        intervalKey: "m2",
        unlockTs: FEB_29_2024,
        status: "unlockable",
        subscriptionEventId: null,
        subscriptionId: "subM",
        totalPeriods: 3,
        intervalDays: 30,
        frequency: "monthly",
      },
    ] as any);

    await new Promise((r) => setTimeout(r, 20));

    const monthly = store.subscriptions.find((s) => s.subscriptionId === "subM");
    expect(monthly?.frequency).toBe("monthly");
    const expectedNext = Math.floor(
      new Date("2024-03-29T00:00:00Z").getTime() / 1000,
    );
    expect(monthly?.nextRenewal).toBe(expectedNext);
    expect(monthly?.status).toBe("pending");
  });

  it("falls back to Unknown Tier when tier data is missing", async () => {
    const store = useCreatorSubscriptionsStore();

    await cashuDb.lockedTokens.add({
      id: "u1",
      tokenString: "tok",
      amount: 1,
      owner: "creator",
      subscriberNpub: "npub",
      tierId: "tier",
      intervalKey: "int1",
      unlockTs: 0,
      status: "unlockable",
      subscriptionEventId: null,
      subscriptionId: "subU",
      totalPeriods: 1,
      intervalDays: 30,
    } as any);

    await new Promise((r) => setTimeout(r, 20));

    const sub = store.subscriptions.find((s) => s.subscriptionId === "subU");
    expect(sub?.tierName).toBe("Unknown Tier");
  });
});
