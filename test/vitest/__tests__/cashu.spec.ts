import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCashuStore } from "../../../src/stores/cashu";
import { cashuDb } from "../../../src/stores/dexie";
import { subscriptionPayload } from "../../../src/utils/receipt-utils";
import { useP2PKStore } from "../../../src/stores/p2pk";
import { useNostrStore } from "../../../src/stores/nostr";

let sendDm: any;
let createHTLC: any;
let findSpendableMint: any;
let fetchNutzapProfileMock: any;

vi.mock("../../../src/stores/messenger", () => ({
  useMessengerStore: () => ({
    sendDm: (...args: any[]) => sendDm(...args),
    pushOwnMessage: vi.fn(),
  }),
}));

vi.mock("../../../src/js/token", () => ({
  default: {
    decode: vi.fn(() => ({ proofs: [{ amount: 1 }] })),
    getProofs: vi.fn(() => [{ amount: 1 }]),
  },
  createP2PKHTLC: (...args: any[]) => createHTLC(...args),
}));

vi.mock("../../../src/stores/wallet", () => ({
  useWalletStore: () => ({
    findSpendableMint: (...args: any[]) => findSpendableMint(...args),
    sendToLock: vi.fn(async () => ({
      sendProofs: [],
      locked: { id: "1", tokenString: "t" },
    })),
    generateKeypair: vi.fn(),
    firstKey: "mock_key",
  }),
}));

vi.mock("../../../src/stores/mints", () => ({
  useMintsStore: () => ({
    activeUnit: "sat",
    mintUnitProofs: () => [],
    activeMintUrl: "mint",
  }),
}));

vi.mock("../../../src/stores/proofs", () => ({
  useProofsStore: () => ({
    serializeProofs: vi.fn(() => "token"),
    updateActiveProofs: vi.fn(),
  }),
}));

vi.mock("../../../src/stores/p2pk");

vi.mock("../../../src/stores/nostr");

beforeEach(async () => {
  setActivePinia(createPinia());
  localStorage.clear();
  await cashuDb.close();
  await cashuDb.delete();
  await cashuDb.open();
  vi.spyOn(await import("../../../src/stores/p2pk"), "useP2PKStore").mockReturnValue({
    sendToLock: vi.fn(async () => ({
      sendProofs: [],
      locked: { id: "1", tokenString: "t" },
    })),
    generateKeypair: vi.fn(),
    firstKey: "mock_key",
  });
  vi.spyOn(await import("../../../src/stores/nostr"), "useNostrStore").mockReturnValue({
    fetchNutzapProfile: vi.fn(async () => ({
      p2pkPubkey: "02" + "a".repeat(64),
    })),
  });
  sendDm = vi.fn(async () => ({
    success: true,
    event: { id: "1", content: "{}" },
  }));
  createHTLC = vi.fn(() => ({
    token: JSON.stringify({ lockSecret: "pre" }),
    hash: "h",
  }));
  findSpendableMint = vi.fn(() => ({ url: "mint" }));
});

describe("subscribeToTier", () => {
  it("sends minimal DM payload", async () => {
    const store = useCashuStore();
    await store.subscribeToTier({
      creator: { nostrPubkey: "c", cashuP2pk: "02" + "a".repeat(64) },
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
        creator: { nostrPubkey: "c", cashuP2pk: "02" + "a".repeat(64) },
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

  it("handles insufficient balance during a multi-period pledge", async () => {
    const store = useCashuStore();
    const p2pkStore = useP2PKStore();
    let callCount = 0;
    vi.spyOn(p2pkStore, "sendToLock").mockImplementation(async () => {
      callCount++;
      if (callCount > 1) {
        throw new Error("Insufficient balance");
      }
      return {
        sendProofs: [],
        locked: { id: "1", tokenString: "t" },
      };
    });

    await expect(
      store.subscribeToTier({
        creator: { nostrPubkey: "c", cashuP2pk: "02" + "a".repeat(64) },
        tierId: "tier",
        periods: 2,
        price: 1,
        startDate: 0,
        relayList: [],
        trustedMints: [],
      }),
    ).rejects.toThrow("Insufficient balance");
  });

  it("handles fetchNutzapProfile failure", async () => {
    const store = useCashuStore();
    const nostrStore = useNostrStore();
    vi.spyOn(nostrStore, "fetchNutzapProfile").mockResolvedValue({
      p2pkPubkey: null,
    });

    await expect(
      store.send({
        npub: "npub1cj8znuztfqkvq89pl8hceph0svvvqk0qay6nydgk9uyq7fhpfsgsqwrz4u",
        amount: 1,
        periods: 1,
        startDate: 0,
      }),
    ).rejects.toThrow(
      "Creator's Nutzap profile is missing or does not contain a P2PK key.",
    );
    expect(store.error).toBe(
      "Creator's Nutzap profile is missing or does not contain a P2PK key.",
    );
  });

  it("handles resendQueued logic", async () => {
    const store = useCashuStore();
    let callCount = 0;
    sendDm.mockImplementation(async () => {
      callCount++;
      if (callCount > 1) {
        return { success: true, event: { id: "1", content: "{}" } };
      }
      return { success: false };
    });

    store.queueSend({
      npub: "npub1...",
      token: "test-token",
      unlockTime: 0,
      createdAt: 0,
    });

    await store.retryQueuedSends();
    expect(store.sendQueue.length).toBe(1);

    await store.retryQueuedSends();
    expect(store.sendQueue.length).toBe(0);
  });
});
