import "fake-indexeddb/auto";
import Dexie from "dexie";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  cashuDb,
  type Subscription,
  type LockedToken,
} from "../src/stores/dexie";
import {
  initializeLegacyDexie,
  resetLegacyDexie,
  LEGACY_DB_NAME,
  LEGACY_LOCKED_TOKEN_ID,
  LEGACY_SUBSCRIPTION_ID,
  LEGACY_SUBSCRIBER_PREF_ID,
  LEGACY_SUBSCRIBER_VIEW_NAME,
} from "./utils/dexieLegacy";

const openCashuDb = async () => {
  if (!cashuDb.isOpen()) {
    await cashuDb.open();
  }
};

const closeCashuDb = async () => {
  if (cashuDb.isOpen()) {
    await cashuDb.close();
  }
};

beforeEach(async () => {
  localStorage.clear();
  await closeCashuDb();
  await Dexie.delete(LEGACY_DB_NAME);
});

afterEach(async () => {
  await closeCashuDb();
  await resetLegacyDexie();
});

describe("Dexie migrations", () => {
  it("populates subscription relationships when upgrading from v6", async () => {
    await initializeLegacyDexie(6);

    await openCashuDb();

    const lockedToken = (await cashuDb.lockedTokens.get(
      LEGACY_LOCKED_TOKEN_ID,
    )) as LockedToken | undefined;
    expect(lockedToken).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(lockedToken ?? {}, "subscriptionId")).toBe(
      true,
    );
    expect(Object.prototype.hasOwnProperty.call(lockedToken ?? {}, "totalPeriods")).toBe(
      true,
    );
    expect(lockedToken?.totalPeriods ?? null).toBeNull();

    const subscription = (await cashuDb.subscriptions.get(
      LEGACY_SUBSCRIPTION_ID,
    )) as Subscription | undefined;
    expect(subscription).toBeDefined();
    const [interval] = subscription?.intervals ?? [];
    expect(interval).toBeDefined();
    expect(interval?.subscriptionId).toBe(LEGACY_SUBSCRIPTION_ID);
    expect(interval?.tierId).toBe(subscription?.tierId);
    expect(interval?.totalPeriods).toBe(subscription?.commitmentLength);
  });

  it("defaults autoRedeem fields when upgrading from v10", async () => {
    await initializeLegacyDexie(10);

    await openCashuDb();

    const lockedToken = (await cashuDb.lockedTokens.get(
      LEGACY_LOCKED_TOKEN_ID,
    )) as LockedToken | undefined;
    expect(lockedToken?.autoRedeem).toBe(false);

    const subscription = (await cashuDb.subscriptions.get(
      LEGACY_SUBSCRIPTION_ID,
    )) as Subscription | undefined;
    const [interval] = subscription?.intervals ?? [];
    expect(interval?.autoRedeem).toBe(false);
  });

  it("adds HTLC metadata when upgrading from v16", async () => {
    await initializeLegacyDexie(16);

    await openCashuDb();

    const lockedToken = (await cashuDb.lockedTokens.get(
      LEGACY_LOCKED_TOKEN_ID,
    )) as LockedToken | undefined;
    expect(lockedToken?.htlcHash).toBeNull();
    expect(lockedToken?.htlcSecret).toBeNull();

    const subscription = (await cashuDb.subscriptions.get(
      LEGACY_SUBSCRIPTION_ID,
    )) as Subscription | undefined;
    const [interval] = subscription?.intervals ?? [];
    expect(interval?.htlcHash).toBeNull();
    expect(interval?.htlcSecret).toBeNull();
  });

  it("backfills frequency metadata when upgrading from v20", async () => {
    await initializeLegacyDexie(20);

    await openCashuDb();

    const lockedToken = (await cashuDb.lockedTokens.get(
      LEGACY_LOCKED_TOKEN_ID,
    )) as LockedToken | undefined;
    expect(lockedToken?.frequency).toBe("monthly");
    expect(lockedToken?.intervalDays).toBeGreaterThan(0);
    expect(lockedToken?.totalPeriods).toBe(12);

    const subscription = (await cashuDb.subscriptions.get(
      LEGACY_SUBSCRIPTION_ID,
    )) as Subscription | undefined;
    expect(subscription?.frequency).toBe("monthly");
    expect(subscription?.intervalDays).toBeGreaterThan(0);
    const [interval] = subscription?.intervals ?? [];
    expect(interval?.frequency).toBe("monthly");
    expect(interval?.intervalDays).toBeGreaterThan(0);
    expect(interval?.totalPeriods).toBe(subscription?.commitmentLength);
  });

  it("preserves subscriber view data and indices from v22", async () => {
    await initializeLegacyDexie(22);

    await openCashuDb();

    const view = await cashuDb.subscriberViews.get(LEGACY_SUBSCRIBER_VIEW_NAME);
    expect(view).toBeDefined();
    const schema = cashuDb.subscriberViews.schema;
    expect(schema.primKey.keyPath).toBe("name");
    expect(schema.indexes).toHaveLength(0);
  });

  it("retains subscriber view prefs from v23 and exposes nutzap profile indices", async () => {
    await initializeLegacyDexie(23);

    await openCashuDb();

    const pref = await cashuDb.subscriberViewPrefs.get(LEGACY_SUBSCRIBER_PREF_ID);
    expect(pref?.activeViewId).toBe(LEGACY_SUBSCRIBER_VIEW_NAME);
    expect(cashuDb.subscriberViewPrefs.schema.primKey.keyPath).toBe("id");

    const nutzapSchema = cashuDb.nutzapProfiles.schema;
    expect(nutzapSchema.primKey.keyPath).toBe("pubkey");
    const indexKeyPaths = nutzapSchema.indexes.flatMap((idx) =>
      Array.isArray(idx.keyPath) ? idx.keyPath : [idx.keyPath],
    );
    expect(indexKeyPaths).toContain("updatedAt");
    expect(indexKeyPaths).toContain("eventId");

    await cashuDb.nutzapProfiles.put({
      pubkey: "npub-nutzap",
      profile: null,
      updatedAt: Date.now(),
      eventId: "event-nutzap",
    });
    const stored = await cashuDb.nutzapProfiles.get("npub-nutzap");
    expect(stored?.eventId).toBe("event-nutzap");
  });
});
