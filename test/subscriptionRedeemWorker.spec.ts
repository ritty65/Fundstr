import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSubscriptionRedeemWorker } from "stores/subscriptionRedeemWorker";

let subscriptionsEntries: any[];
let subscriptionsTable: any;
let cashuDbMock: any;
let tokenModule: any;
let tokenDecode: ReturnType<typeof vi.fn>;
let tokenGetMint: ReturnType<typeof vi.fn>;
let tokenGetUnit: ReturnType<typeof vi.fn>;

const walletStoreMock: any = {};
const p2pkStoreMock: any = {};
const mintsStoreMock: any = {};
const proofsStoreMock: any = {};
const tokensStoreMock: any = {};

vi.mock("stores/dexie", () => ({
  get cashuDb() {
    return cashuDbMock;
  },
}));

vi.mock("stores/wallet", () => ({
  useWalletStore: () => walletStoreMock,
}));

vi.mock("stores/p2pk", () => ({
  useP2PKStore: () => p2pkStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => proofsStoreMock,
}));

vi.mock("stores/tokens", () => ({
  useTokensStore: () => tokensStoreMock,
}));

vi.mock("src/js/token", () => ({
  get default() {
    return tokenModule;
  },
}));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  subscriptionsEntries = [];
  subscriptionsTable = {
    toArray: vi.fn(async () => subscriptionsEntries),
    update: vi.fn(async (id: any, data: Record<string, any>) => {
      const entry = subscriptionsEntries.find((item) => item.id === id);
      if (entry) Object.assign(entry, data);
    }),
  };
  cashuDbMock = {
    subscriptions: subscriptionsTable,
    transaction: vi.fn(async (_mode: string, _table: any, fn: () => Promise<void>) => {
      await fn();
    }),
  };
  tokenDecode = vi.fn();
  tokenGetMint = vi.fn();
  tokenGetUnit = vi.fn();
  tokenModule = {
    decode: tokenDecode,
    getMint: tokenGetMint,
    getUnit: tokenGetUnit,
  };
  walletStoreMock.mintWallet = vi.fn(() => ({
    receive: vi.fn(async () => [{ amount: 5, id: "proof" }]),
  }));
  walletStoreMock.getKeyset = vi.fn(() => "kid");
  walletStoreMock.keysetCounter = vi.fn(() => 0);
  walletStoreMock.increaseKeysetCounter = vi.fn();
  walletStoreMock.mintUnitProofs = vi.fn(() => []);
  walletStoreMock.receive = vi.fn(async () => {});
  p2pkStoreMock.getPrivateKeyForP2PKEncodedToken = vi.fn(() => "priv");
  mintsStoreMock.mints = [
    { url: "https://mint", keysets: [{ id: "keyset-1" }], mint: "https://mint" },
  ];
  mintsStoreMock.mintUnitProofs = vi.fn(() => []);
  proofsStoreMock.addProofs = vi.fn(async () => {});
  tokensStoreMock.addPaidToken = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("subscriptionRedeemWorker", () => {
  it("starts and stops processing timers", async () => {
    const worker = useSubscriptionRedeemWorker();
    const processSpy = vi
      .spyOn(worker, "process")
      .mockImplementation(async () => {});

    worker.start();
    expect(worker.worker).not.toBeNull();
    expect(processSpy).toHaveBeenCalledTimes(1);

    await vi.runOnlyPendingTimersAsync();
    expect(processSpy).toHaveBeenCalledTimes(2);

    worker.stop();
    expect(worker.worker).toBeNull();
  });

  it("redeems unlockable subscription intervals", async () => {
    const now = Math.floor(Date.now() / 1000);
    const interval = {
      intervalKey: "interval-1",
      lockedTokenId: 1,
      status: "unlockable",
      unlockTs: now - 1,
      redeemed: false,
      tokenString: "token-1",
      tierId: "tier-1",
    };
    subscriptionsEntries.push({ id: 1, intervals: [interval] });

    tokenDecode.mockReturnValue({
      proofs: [{ id: "keyset-1", amount: 5, secret: "secret" }],
    });
    tokenGetMint.mockReturnValue("https://mint");
    tokenGetUnit.mockReturnValue("sat");

    const worker = useSubscriptionRedeemWorker();
    await worker._process();

    expect(cashuDbMock.transaction).toHaveBeenCalled();
    expect(subscriptionsTable.update).toHaveBeenCalledWith(1, {
      intervals: expect.arrayContaining([
        expect.objectContaining({ status: "claimed", redeemed: true }),
      ]),
    });
    expect(walletStoreMock.mintWallet).toHaveBeenCalledWith(
      "https://mint",
      "sat",
    );
    const mintedWallet = (walletStoreMock.mintWallet as any).mock
      .results[0].value;
    expect(mintedWallet.receive).toHaveBeenCalledWith("token-1", {
      counter: 0,
      privkey: "priv",
      proofsWeHave: [],
    });
    expect(proofsStoreMock.addProofs).toHaveBeenCalledWith(
      [{ amount: 5, id: "proof" }],
      undefined,
      "tier-1",
      "Subscription payment",
    );
    expect(walletStoreMock.increaseKeysetCounter).toHaveBeenCalledWith(
      "kid",
      1,
    );
    expect(tokensStoreMock.addPaidToken).toHaveBeenCalledWith({
      amount: 5,
      token: "token-1",
      mint: "https://mint",
      unit: "sat",
      label: "Subscription payment",
      bucketId: "tier-1",
    });
  });
});
