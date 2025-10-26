import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNostrStore } from "../src/stores/nostr";
import { cashuDb } from "../src/stores/dexie";

const decodeMock = vi.fn();
const getProofsMock = vi.fn();

let creatorsStoreMock: any;
let receiveStoreMock: any;
let tokensStoreMock: any;
let sendTokensStoreMock: any;
let prStoreMock: any;
let bucketsStoreMock: any;

const notifySuccessMock = vi.fn();
const notifyWarningMock = vi.fn();

vi.mock("../src/js/token", () => ({
  default: {
    decode: (...args: any[]) => decodeMock(...args),
    getProofs: (...args: any[]) => getProofsMock(...args),
    getMint: vi.fn(),
    getUnit: vi.fn(),
    getMemo: vi.fn(),
    createP2PKHTLC: vi.fn(),
  },
}));

vi.mock("../src/stores/creators", () => ({
  useCreatorsStore: () => creatorsStoreMock,
}));

vi.mock("../src/stores/receiveTokensStore", () => ({
  useReceiveTokensStore: () => receiveStoreMock,
}));

vi.mock("../src/stores/sendTokensStore", () => ({
  useSendTokensStore: () => sendTokensStoreMock,
}));

vi.mock("../src/stores/tokens", () => ({
  useTokensStore: () => tokensStoreMock,
}));

vi.mock("../src/stores/payment-request", () => ({
  usePRStore: () => prStoreMock,
}));

vi.mock("../src/stores/buckets", () => ({
  useBucketsStore: () => bucketsStoreMock,
}));

vi.mock("../src/js/notify", () => ({
  notifySuccess: (...args: any[]) => notifySuccessMock(...args),
  notifyWarning: (...args: any[]) => notifyWarningMock(...args),
  notifyError: vi.fn(),
  notifyApiError: vi.fn(),
  notify: vi.fn(),
}));

beforeEach(async () => {
  setActivePinia(createPinia());

  creatorsStoreMock = { tiersMap: {} };
  receiveStoreMock = {
    receiveData: { tokensBase64: "", description: "" },
    enqueue: vi.fn(async (fn: () => any) => await fn()),
    receiveToken: vi.fn().mockResolvedValue(undefined),
    receiveIfDecodes: vi.fn().mockResolvedValue(true),
    showReceiveTokens: false,
  };
  tokensStoreMock = {
    tokenAlreadyInHistory: vi.fn().mockReturnValue(null),
    addPendingToken: vi.fn(),
  };
  sendTokensStoreMock = { showSendTokens: false };
  prStoreMock = {
    receivePaymentRequestsAutomatically: false,
    showPRDialog: false,
  };
  bucketsStoreMock = { bucketList: [], buckets: [] };

  decodeMock.mockReset();
  getProofsMock.mockReset();
  notifySuccessMock.mockReset();
  notifyWarningMock.mockReset();

  localStorage.clear();
  await cashuDb.close();
  await cashuDb.delete();
  await cashuDb.open();
});

describe("parseMessageForEcash", () => {
  it("ignores malformed JSON without touching Dexie", async () => {
    const nostr = useNostrStore();
    nostr.pubkey = "creator-pub";

    await expect(
      nostr.parseMessageForEcash("{not json", "npub1invalid"),
    ).resolves.toBeUndefined();

    expect(await cashuDb.lockedTokens.count()).toBe(0);
    expect(receiveStoreMock.enqueue).not.toHaveBeenCalled();
  });

  it("skips subscription payloads that omit the token", async () => {
    const nostr = useNostrStore();
    nostr.pubkey = "creator-pub";

    const message = JSON.stringify({
      type: "cashu_subscription_payment",
      subscription_id: "sub-1",
      tier_id: "tier-1",
      unlock_time: 123,
    });

    await expect(
      nostr.parseMessageForEcash(message, "npub1xyz"),
    ).resolves.toBeUndefined();

    expect(decodeMock).not.toHaveBeenCalled();
    expect(await cashuDb.lockedTokens.count()).toBe(0);
  });

  it("returns without writes when creator tier metadata is unavailable", async () => {
    creatorsStoreMock = {
      get tiersMap() {
        throw new Error("mint not registered");
      },
    };

    const nostr = useNostrStore();
    nostr.pubkey = "creator-pub";

    decodeMock.mockReturnValue({ proofs: [{ amount: 5 }] });
    getProofsMock.mockReturnValue([{ amount: 5 }]);

    const message = JSON.stringify({
      type: "cashu_subscription_payment",
      token: "encoded-token",
      subscription_id: "sub-2",
      tier_id: "tier-x",
    });

    await expect(
      nostr.parseMessageForEcash(message, "npub1unknown"),
    ).resolves.toBeUndefined();

    expect(await cashuDb.lockedTokens.count()).toBe(0);
  });

  it("persists valid subscription payments with interval metadata", async () => {
    const nostr = useNostrStore();
    nostr.pubkey = "creator-pub";

    creatorsStoreMock.tiersMap = {
      "creator-pub": [
        { id: "tier-1", name: "Gold" },
      ],
    };

    decodeMock.mockReturnValue({
      proofs: [{ amount: 42 }],
      mint: "https://mint",
      unit: "sat", 
    });
    getProofsMock.mockReturnValue([{ amount: 42 }]);

    const unlockTime = Math.floor(Date.now() / 1000) + 60;
    const message = JSON.stringify({
      type: "cashu_subscription_payment",
      token: "encoded-token",
      subscription_id: "sub-123",
      tier_id: "tier-1",
      month_index: 3,
      total_months: 12,
      frequency: "monthly",
      interval_days: 30,
      unlock_time: unlockTime,
    });

    await nostr.parseMessageForEcash(message, "npub1subscriber");

    const rows = await cashuDb.lockedTokens.toArray();
    expect(rows).toHaveLength(1);
    const entry = rows[0];
    expect(entry.autoRedeem).toBe(true);
    expect(entry.frequency).toBe("monthly");
    expect(entry.intervalDays).toBe(30);
    expect(entry.subscriptionId).toBe("sub-123");
    expect(entry.monthIndex).toBe(3);
    expect(entry.totalPeriods).toBe(12);
    expect(entry.tierName).toBe("Gold");
    expect(entry.unlockTs).toBe(unlockTime);
    expect(entry.owner).toBe("creator");
    expect(receiveStoreMock.enqueue).toHaveBeenCalledTimes(1);
    expect(receiveStoreMock.receiveToken).toHaveBeenCalledWith(
      "encoded-token",
      expect.any(String),
    );
  });

  it("marks subscription intervals as claimed when notified", async () => {
    const subscription = {
      id: "sub-1",
      creatorNpub: "creator-pub",
      tierId: "tier-1",
      creatorP2PK: "p2pk",
      mintUrl: "https://mint",
      amountPerInterval: 100,
      frequency: "monthly" as const,
      intervalDays: 30,
      startDate: 0,
      commitmentLength: 12,
      intervals: [
        {
          intervalKey: "interval-1",
          lockedTokenId: "token-1",
          unlockTs: 0,
          status: "unlockable" as const,
          tokenString: "token",
          subscriptionId: "sub-1",
          monthIndex: 4,
          totalPeriods: 12,
        },
      ],
      status: "active" as const,
      createdAt: 0,
      updatedAt: 0,
    };

    await cashuDb.subscriptions.add(subscription as any);

    const nostr = useNostrStore();

    const message = JSON.stringify({
      type: "cashu_subscription_claimed",
      subscription_id: "sub-1",
      month_index: 4,
    });

    await nostr.parseMessageForEcash(message, "npub1subscriber");

    const stored = await cashuDb.subscriptions.get("sub-1");
    expect(stored?.intervals[0].status).toBe("claimed");
    expect(notifySuccessMock).toHaveBeenCalledWith(
      "Subscription payment claimed",
    );
  });
});
