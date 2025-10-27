import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useDexieLockedTokensStore } from "@/stores/lockedTokensDexie";
import type { LockedToken } from "@/stores/dexie";
import type { SubscriptionFrequency } from "@/constants/subscriptionFrequency";

const hoisted = vi.hoisted(() => {
  let subscriptionHandlers: { next?: (rows: LockedToken[]) => void } = {};

  const lockedTokensTable = {
    toArray: vi.fn<[], Promise<LockedToken[]>>(() => Promise.resolve([])),
    put: vi.fn<(entry: LockedToken) => Promise<void>>(() => Promise.resolve()),
    delete: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
  };

  const liveQueryMock = vi.fn(
    (queryFn: () => Promise<LockedToken[]>) => ({
      subscribe: ({ next, error }: { next: (rows: LockedToken[]) => void; error: (err: unknown) => void }) => {
        subscriptionHandlers = { next };
        // execute the query once to simulate initial emission
        queryFn().then((rows) => next(rows)).catch(error);
        return { unsubscribe: vi.fn() };
      },
    }),
  );

  return {
    getHandlers: () => subscriptionHandlers,
    lockedTokensTable,
    liveQueryMock,
  };
});

vi.mock("dexie", () => ({
  __esModule: true,
  liveQuery: hoisted.liveQueryMock,
}));

vi.mock("stores/dexie", () => ({
  __esModule: true,
  cashuDb: {
    lockedTokens: hoisted.lockedTokensTable,
  },
}));

vi.mock("uuid", () => ({
  __esModule: true,
  v4: vi.fn(() => "generated-uuid"),
}));

describe("useDexieLockedTokensStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    hoisted.lockedTokensTable.put.mockClear();
    hoisted.lockedTokensTable.delete.mockClear();
    hoisted.liveQueryMock.mockClear();
  });

  it("reacts to liveQuery emissions", async () => {
    const store = useDexieLockedTokensStore();
    const handlers = hoisted.getHandlers();

    const sample: LockedToken[] = [
      {
        id: "token-1",
        tokenString: "cashuA",
        amount: 100,
        owner: "subscriber",
        tierId: "tier",
        intervalKey: "interval",
        unlockTs: 1,
        status: "pending",
        subscriptionEventId: null,
        frequency: "monthly" as SubscriptionFrequency,
      },
    ];

    handlers.next?.(sample);

    expect(store.lockedTokens).toEqual(sample);
  });

  it("creates a token with generated id when missing", async () => {
    const store = useDexieLockedTokensStore();

    const result = await store.addLockedToken({
      tokenString: "cashuA",
      amount: 10,
      owner: "subscriber",
      tierId: "tier",
      intervalKey: "interval",
      unlockTs: 123,
      status: "pending",
      subscriptionEventId: null,
      frequency: "monthly" as SubscriptionFrequency,
    });

    expect(result.id).toBe("generated-uuid");
    expect(hoisted.lockedTokensTable.put).toHaveBeenCalledWith(result);
  });

  it("preserves provided ids on insert", async () => {
    const store = useDexieLockedTokensStore();

    await store.addLockedToken({
      id: "token-2",
      tokenString: "cashuB",
      amount: 5,
      owner: "creator",
      tierId: "tier",
      intervalKey: "interval",
      unlockTs: 321,
      status: "unlockable",
      subscriptionEventId: "event",
      frequency: "monthly" as SubscriptionFrequency,
    });

    expect(hoisted.lockedTokensTable.put).toHaveBeenCalledWith(
      expect.objectContaining({ id: "token-2" }),
    );
  });

  it("deletes tokens by id", async () => {
    const store = useDexieLockedTokensStore();

    await store.deleteLockedToken("token-3");

    expect(hoisted.lockedTokensTable.delete).toHaveBeenCalledWith("token-3");
  });
});
