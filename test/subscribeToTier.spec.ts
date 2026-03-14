import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCashuStore } from "../src/stores/cashu";
import { cashuDb } from "../src/stores/dexie";
import { subscriptionPayload } from "../src/utils/receipt-utils";

let sendDm: any;
let createHTLC: any;
let findSpendableMint: any;
let sendToLock: any;
let firstKey: any;
let generateKeypair: any;

const VALID_P2PK = `02${"a".repeat(64)}`;

vi.mock("../src/stores/messenger", () => ({
  useMessengerStore: () => ({
    sendDm: (...args: any[]) => sendDm(...args),
    pushOwnMessage: vi.fn(),
  }),
}));

vi.mock("../src/js/token", () => ({
  default: {
    decode: vi.fn(() => ({ proofs: [{ amount: 1 }] })),
    getProofs: vi.fn(() => [{ amount: 1 }]),
  },
  createP2PKHTLC: (...args: any[]) => createHTLC(...args),
}));

vi.mock("../src/stores/p2pk", () => ({
  useP2PKStore: () => ({
    get firstKey() {
      return firstKey;
    },
    generateKeypair: (...args: any[]) => generateKeypair(...args),
    sendToLock: (...args: any[]) => sendToLock(...args),
  }),
}));

vi.mock("../src/stores/wallet", () => ({
  useWalletStore: () => ({
    findSpendableMint: (...args: any[]) => findSpendableMint(...args),
    sendToLock: vi.fn(async () => ({
      sendProofs: [],
      locked: { id: "1", tokenString: "t" },
    })),
  }),
}));

vi.mock("../src/stores/mints", () => ({
  useMintsStore: () => ({
    activeUnit: "sat",
    mintUnitProofs: () => [],
    activeMintUrl: "mint",
  }),
}));

vi.mock("../src/stores/proofs", () => ({
  useProofsStore: () => ({
    serializeProofs: vi.fn(() => "token"),
    updateActiveProofs: vi.fn(),
  }),
}));

beforeEach(async () => {
  setActivePinia(createPinia());
  localStorage.clear();
  await cashuDb.close();
  await cashuDb.delete();
  await cashuDb.open();
  sendDm = vi.fn(async () => ({
    success: true,
    event: { id: "1", content: "{}" },
  }));
  createHTLC = vi.fn(() => ({
    token: JSON.stringify({ lockSecret: "pre" }),
    hash: "h",
  }));
  findSpendableMint = vi.fn(() => ({ url: "mint" }));
  let lockCounter = 0;
  sendToLock = vi.fn(async () => {
    lockCounter += 1;
    return {
      sendProofs: [{ amount: 1 }],
      locked: { id: `lock-${lockCounter}`, tokenString: `token-${lockCounter}` },
    };
  });
  firstKey = { publicKey: "pub" };
  generateKeypair = vi.fn(async () => {
    firstKey = { publicKey: "generated" };
  });
});

describe("subscribeToTier", () => {
  it("sends minimal DM payload", async () => {
    const store = useCashuStore();
    await store.subscribeToTier({
      creator: { nostrPubkey: "c", cashuP2pk: VALID_P2PK },
      tierId: "tier",
      periods: 1,
      price: 1,
      startDate: 0,
      relayList: [],
      trustedMints: [],
    });
    expect(sendDm).toHaveBeenCalled();
    const payload = JSON.parse(sendDm.mock.calls[0][1]);
    const expected = subscriptionPayload("token", expect.any(Number), {
      subscription_id: expect.any(String),
      tier_id: "tier",
      month_index: 1,
      total_months: 1,
    });
    expect(payload).toMatchObject(expected);
  });

  it("enforces trusted mints when provided", async () => {
    const store = useCashuStore();
    findSpendableMint.mockReturnValue(null);
    await expect(
      store.subscribeToTier({
        creator: { nostrPubkey: "c", cashuP2pk: VALID_P2PK },
        tierId: "tier",
        periods: 1,
        price: 1,
        startDate: 0,
        relayList: [],
        trustedMints: ["https://mintA"],
      }),
    ).rejects.toThrow(/creator-trusted mints/i);
    expect(findSpendableMint).toHaveBeenCalledWith(1, ["https://mintA"]);
  });

  describe("failure handling", () => {
    it("does not persist partial locks when sendToLock fails mid-subscription", async () => {
      sendToLock.mockImplementationOnce(async () => ({
        sendProofs: [{ amount: 1 }],
        locked: { id: "lock-1", tokenString: "token-1" },
      }));
      sendToLock.mockImplementationOnce(async () => ({
        sendProofs: [{ amount: 1 }],
        locked: { id: "lock-2", tokenString: "token-2" },
      }));
      sendToLock.mockImplementationOnce(async () => {
        throw new Error("lock failed");
      });

      const store = useCashuStore();
      await expect(
        store.subscribeToTier({
          creator: { nostrPubkey: "c", cashuP2pk: VALID_P2PK },
          tierId: "tier",
          periods: 3,
          price: 1,
          startDate: 0,
          relayList: [],
          trustedMints: [],
        }),
      ).rejects.toThrow("lock failed");

      expect(await cashuDb.lockedTokens.count()).toBe(0);
      expect(await cashuDb.subscriptions.count()).toBe(0);
    });

    it("queues failed DM payloads and clears them after successful resend", async () => {
      sendDm.mockImplementationOnce(async () => {
        throw new Error("relay offline");
      });
      sendDm.mockImplementationOnce(async () => ({
        success: true,
        event: { id: "event-2", content: "{}" },
      }));
      sendDm.mockImplementationOnce(async () => ({
        success: true,
        event: { id: "retry", content: "{}" },
      }));

      const store = useCashuStore();
      const ok = await store.subscribeToTier({
        creator: { nostrPubkey: "c", cashuP2pk: VALID_P2PK },
        tierId: "tier",
        periods: 2,
        price: 1,
        startDate: 0,
        relayList: [],
        trustedMints: [],
      });

      expect(ok).toBe(true);
      expect(store.sendQueue.length).toBe(1);
      const queued = store.sendQueue[0];
      expect(queued.npub).toBe("c");
      expect(queued.token).toBe("token");

      const lockedRows = await cashuDb.lockedTokens.toArray();
      expect(lockedRows).toHaveLength(2);
      const subs = await cashuDb.subscriptions.toArray();
      expect(subs).toHaveLength(1);
      expect(subs[0].intervals).toHaveLength(2);

      const storedQueue = JSON.parse(
        localStorage.getItem("cashu.cashu.sendQueue") || "[]",
      );
      expect(storedQueue).toHaveLength(1);
      expect(storedQueue[0].npub).toBe("c");

      await store.retryQueuedSends();

      expect(store.sendQueue.length).toBe(0);
      const storedAfter = JSON.parse(
        localStorage.getItem("cashu.cashu.sendQueue") || "[]",
      );
      expect(storedAfter).toHaveLength(0);

      const finalLocked = await cashuDb.lockedTokens.toArray();
      expect(finalLocked).toHaveLength(2);
      const finalSubs = await cashuDb.subscriptions.toArray();
      expect(finalSubs).toHaveLength(1);
      expect(finalSubs[0].intervals).toHaveLength(2);
    });
  });
});
