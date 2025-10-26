import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useLockedTokensRedeemWorker } from "stores/lockedTokensRedeemWorker";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

let lockedTokensEntries: any[];
let subscriptionsEntries: any[];
let lockedTokensTable: any;
let subscriptionsTable: any;
let cashuDbMock: any;
let notifySuccessMock: ReturnType<typeof vi.fn>;
let tokenModule: any;
let tokenDecode: ReturnType<typeof vi.fn>;
let tokenGetMint: ReturnType<typeof vi.fn>;
let tokenGetUnit: ReturnType<typeof vi.fn>;
let tokenGetProofs: ReturnType<typeof vi.fn>;

const walletStoreMock: any = {};
const receiveStoreMock: any = {};
const settingsStoreMock: any = {};
const mintsStoreMock: any = {};
const messengerStoreMock: any = {};
const p2pkStoreMock: any = {};

vi.mock("stores/dexie", () => ({
  get cashuDb() {
    return cashuDbMock;
  },
}));

vi.mock("stores/wallet", () => ({
  useWalletStore: () => walletStoreMock,
}));

vi.mock("stores/receiveTokensStore", () => ({
  useReceiveTokensStore: () => receiveStoreMock,
}));

vi.mock("stores/settings", () => ({
  useSettingsStore: () => settingsStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("stores/messenger", () => ({
  useMessengerStore: () => messengerStoreMock,
}));

vi.mock("stores/p2pk", () => ({
  useP2PKStore: () => p2pkStoreMock,
}));

vi.mock("src/js/notify", () => ({
  get notifySuccess() {
    return notifySuccessMock;
  },
}));

vi.mock("src/js/token", () => ({
  get default() {
    return tokenModule;
  },
}));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  lockedTokensEntries = [];
  subscriptionsEntries = [];
  lockedTokensTable = {
    where: vi.fn((field: string) => ({
      belowOrEqual: (value: number) => ({
        toArray: async () =>
          lockedTokensEntries.filter((entry) => entry[field] <= value),
      }),
      equals: (value: any) => ({
        delete: async () => {
          const index = lockedTokensEntries.findIndex(
            (entry) => entry[field] === value,
          );
          if (index !== -1) lockedTokensEntries.splice(index, 1);
        },
      }),
    })),
    filter: vi.fn((predicate: (entry: any) => boolean) => ({
      toArray: async () => lockedTokensEntries.filter(predicate),
    })),
    update: vi.fn(async (id: any, data: Record<string, any>) => {
      const entry = lockedTokensEntries.find((item) => item.id === id);
      if (entry) Object.assign(entry, data);
    }),
    get: vi.fn(async (id: any) =>
      lockedTokensEntries.find((entry) => entry.id === id),
    ),
  };
  subscriptionsTable = {
    toArray: vi.fn(async () => subscriptionsEntries),
    update: vi.fn(async (id: any, data: Record<string, any>) => {
      const entry = subscriptionsEntries.find((item) => item.id === id);
      if (entry) Object.assign(entry, data);
    }),
    get: vi.fn(async (id: any) =>
      subscriptionsEntries.find((entry) => entry.id === id),
    ),
  };
  cashuDbMock = {
    lockedTokens: lockedTokensTable,
    subscriptions: subscriptionsTable,
    transaction: vi.fn(
      async (_mode: string, _table: any, fn: () => Promise<void>) => {
        await fn();
      },
    ),
  };
  notifySuccessMock = vi.fn();
  tokenDecode = vi.fn();
  tokenGetMint = vi.fn();
  tokenGetUnit = vi.fn();
  tokenGetProofs = vi.fn();
  tokenModule = {
    decode: tokenDecode,
    getMint: tokenGetMint,
    getUnit: tokenGetUnit,
    getProofs: tokenGetProofs,
  };
  walletStoreMock.checkProofsSpendable = vi.fn(async () => []);
  walletStoreMock.mintWallet = vi.fn(() => ({
    receive: vi.fn(async () => [{ amount: 2, id: "proof-1", C: "c" }]),
  }));
  walletStoreMock.receive = vi.fn(async () => {});
  walletStoreMock.getKeyset = vi.fn(() => "kid");
  walletStoreMock.keysetCounter = vi.fn(() => 1);
  walletStoreMock.increaseKeysetCounter = vi.fn();
  receiveStoreMock.receiveData = {
    tokensBase64: "",
    bucketId: DEFAULT_BUCKET_ID,
    p2pkPrivateKey: "",
  };
  receiveStoreMock.enqueue = vi.fn(async (fn: () => Promise<any>) => {
    return fn();
  });
  settingsStoreMock.autoRedeemLockedTokens = true;
  mintsStoreMock.mints = [
    { url: "https://mint", keysets: [{ id: "keyset-1" }] },
  ];
  messengerStoreMock.sendDm = vi.fn(async () => {});
  p2pkStoreMock.getPrivateKeyForP2PKEncodedToken = vi.fn(() => "priv");
  (globalThis as any).window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  (globalThis as any).postMessage = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("lockedTokensRedeemWorker", () => {
  it("manages its timer lifecycle", async () => {
    const worker = useLockedTokensRedeemWorker();
    const processSpy = vi
      .spyOn(worker, "processTokens")
      .mockImplementation(async () => {});

    worker.startLockedTokensRedeemWorker();
    expect(window.addEventListener).toHaveBeenCalledWith(
      "message",
      worker.handleMessage,
    );
    expect(worker.worker).not.toBeNull();
    expect(processSpy).toHaveBeenCalledTimes(1);

    await vi.runOnlyPendingTimersAsync();
    expect(processSpy).toHaveBeenCalledTimes(2);

    worker.stopLockedTokensRedeemWorker();
    expect(window.removeEventListener).toHaveBeenCalledWith(
      "message",
      worker.handleMessage,
    );
    expect(worker.worker).toBeNull();
  });

  it("redeems matured locked tokens and notifies the creator", async () => {
    const now = Math.floor(Date.now() / 1000);
    const entry = {
      id: 1,
      autoRedeem: true,
      unlockTs: now - 1,
      tokenString: "token-1",
      tierId: "tier-1",
      subscriptionId: 10,
      intervalKey: "interval-1",
      monthIndex: 2,
      totalPeriods: 12,
      creatorNpub: "npub1",
      htlcSecret: "secret",
    };
    lockedTokensEntries.push(entry);
    subscriptionsEntries.push({
      id: 10,
      intervals: [
        {
          intervalKey: "interval-1",
          lockedTokenId: 1,
          status: "unlockable",
          unlockTs: now - 1,
          redeemed: false,
          tokenString: "token-1",
          tierId: "tier-1",
        },
      ],
    });

    const decoded = {
      proofs: [{
        id: "keyset-1",
        amount: 2,
        secret: "secret",
      }],
    };
    tokenDecode.mockReturnValue(decoded);
    tokenGetMint.mockReturnValue("https://mint");
    tokenGetUnit.mockReturnValue("sat");
    tokenGetProofs.mockReturnValue(decoded.proofs);

    const worker = useLockedTokensRedeemWorker();
    await worker.processTokens();

    expect(cashuDbMock.transaction).toHaveBeenCalled();
    expect(lockedTokensTable.update).toHaveBeenCalledWith(1, {
      status: "processing",
      redeemed: true,
    });
    expect(lockedTokensTable.update).toHaveBeenCalledWith(1, {
      status: "claimed",
    });
    expect(subscriptionsTable.update).toHaveBeenCalledWith(10, {
      intervals: expect.any(Array),
    });
    expect(walletStoreMock.receive).toHaveBeenCalledWith("token-1");
    expect(messengerStoreMock.sendDm).toHaveBeenCalledWith(
      "npub1",
      expect.stringContaining("cashu_subscription_claimed"),
    );
    expect(notifySuccessMock).toHaveBeenCalledWith("Subscription payment claimed");
  });
});
