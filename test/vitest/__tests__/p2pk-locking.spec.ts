import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useP2PKStore } from "src/stores/p2pk";
import { useWalletStore } from "src/stores/wallet";
import { useMintsStore } from "src/stores/mints";
import { useLockedTokensStore } from "src/stores/lockedTokens";
import { useProofsStore } from "src/stores/proofs";
import { useLockedTokensRedeemWorker } from "src/stores/lockedTokensRedeemWorker";
import { useReceiveTokensStore } from "src/stores/receiveTokensStore";
import { cashuDb } from "src/stores/dexie";
import { P2PK_SECRET_FORMAT } from "src/utils/ecash";
import tokenUtil from "src/js/token";

// Mock dependencies
let mintsStoreMock: any;
let walletStoreMock: any;
let proofsStoreMock: any;

vi.mock("src/stores/wallet", () => ({
  useWalletStore: () => walletStoreMock,
}));

vi.mock("src/stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("src/stores/proofs", () => ({
  useProofsStore: () => proofsStoreMock,
}));

vi.mock("src/stores/dexie", () => ({
  cashuDb: {
    transaction: vi.fn((mode, table, cb) => cb()),
    lockedTokens: {
      add: vi.fn(),
      put: vi.fn(),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({ first: vi.fn(), delete: vi.fn() })),
        belowOrEqual: vi.fn(() => ({ toArray: vi.fn(() => []) })),
      })),
      filter: vi.fn(() => ({ toArray: vi.fn(() => []) })),
      update: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
    },
    subscriptions: {
       update: vi.fn(),
       get: vi.fn(),
    }
  },
}));

// Mock notify
vi.mock("src/js/notify", () => ({
  notifyError: vi.fn(),
  notifyApiError: vi.fn(),
  notifySuccess: vi.fn(),
}));

describe("P2PK Locking & Unlocking", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();

    mintsStoreMock = {
      activeProofs: [],
      activeInfo: { nut_supports: [10, 11] }, // Default supports P2PK
      mints: [{ url: "https://mint.com", keysets: [{ id: "kid" }] }],
      mintUnitProofs: vi.fn(() => []),
    };

    walletStoreMock = {
      wallet: {
        mint: { mintUrl: "https://mint.com" },
        unit: "sat",
        send: vi.fn(),
        receive: vi.fn(),
      },
      checkProofsSpendable: vi.fn(() => Promise.resolve([])),
      spendableProofs: vi.fn(() => []),
      coinSelect: vi.fn(() => []),
      getKeyset: vi.fn(() => "kid"),
      keysetCounter: vi.fn(() => 0),
      increaseKeysetCounter: vi.fn(),
      t: (key: string) => key, // Mock translation
      mintWallet: vi.fn(() => ({
         receive: vi.fn(),
      })),
      reconcileSpentProofs: vi.fn(),
      handleOutputsHaveAlreadyBeenSignedError: vi.fn(),
    };

    proofsStoreMock = {
      removeProofs: vi.fn(),
      addProofs: vi.fn(),
      serializeProofs: vi.fn(() => "cashuA..."),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Locking Flow", () => {
    it("Lock without Support: throws if mint does not support NUT-10/11", async () => {
      const p2pk = useP2PKStore();

      // Mock mint info to NOT support NUT-10/11
      mintsStoreMock.activeInfo = { nut_supports: [4, 5] };

      await expect(p2pk.sendToLock(100, "02pubkey", 0)).rejects.toThrow("Mint does not support timelocks or P2PK");
    });

    it("Basic Lock Roundtrip: creates locked token entry", async () => {
      const p2pk = useP2PKStore();
      const amount = 50;
      const pubkey = "02" + "a".repeat(64);
      const locktime = Math.floor(Date.now() / 1000) + 60;

      // Mock successful send
      walletStoreMock.wallet.send.mockResolvedValue({
        keep: [],
        send: [{ id: "a", amount: 50, C: "c", secret: "secret" }],
      });
      proofsStoreMock.serializeProofs.mockReturnValue("cashuA_locked_token");

      await p2pk.sendToLock(amount, pubkey, locktime);

      expect(walletStoreMock.wallet.send).toHaveBeenCalled();
      // Check if sendToLock calls addLockedToken
      // Since useLockedTokensStore is a real store (mostly), we can check its state or spies
      // However, addLockedToken writes to localStorage/Dexie.
      // The implementation of sendToLock in src/stores/p2pk.ts calls useLockedTokensStore().addLockedToken

      const lockedTokens = useLockedTokensStore().lockedTokens;
      expect(lockedTokens.length).toBe(1);
      expect(lockedTokens[0]).toMatchObject({
        amount,
        pubkey,
        locktime,
        tokenString: "cashuA_locked_token"
      });
    });
  });

  describe("Unlocking / Redeem Flow", () => {
    it("Redeem with Missing Key: triggers missing signer flow", async () => {
       // This tests the worker logic mostly.
       const worker = useLockedTokensRedeemWorker();
       const p2pk = useP2PKStore();

       // Mock DB to return a locked token
       const tokenString = "cashuA_test_token";
       const lockedTokenEntry = {
         id: "token-id",
         tokenString,
         tierId: "tier1",
         unlockTs: Math.floor(Date.now() / 1000) - 100, // Past unlock time
         autoRedeem: true
       };

       // Mock cashuDb to return this token
       const toArrayMock = vi.fn().mockResolvedValue([lockedTokenEntry]);
       // @ts-ignore
       cashuDb.lockedTokens.where.mockReturnValue({ belowOrEqual: () => ({ toArray: toArrayMock }) });
       // @ts-ignore
       cashuDb.lockedTokens.filter.mockReturnValue({ toArray: vi.fn(() => []) }); // Legacy entries

       // Mock token decode
       const validPub = "02" + "a".repeat(64);
       const secret = JSON.stringify(["P2PK", { data: validPub }]);
       vi.spyOn(tokenUtil, "decode").mockReturnValue({
         token: [{ proofs: [{ secret }] }],
         proofs: [{ secret }],
         memo: "memo"
       } as any);
       vi.spyOn(tokenUtil, "getMint").mockReturnValue("https://mint.com");
       vi.spyOn(tokenUtil, "getUnit").mockReturnValue("sat");
       vi.spyOn(tokenUtil, "getProofs").mockReturnValue([{ secret, id: "kid" }] as any);

       // Mock p2pkStore to return NO private key
       vi.spyOn(p2pk, "getPrivateKeyForP2PKEncodedToken").mockReturnValue("");

       // Spy on postMessage to verify "missing signer" signal
       const postMessageSpy = vi.spyOn(window, "postMessage").mockImplementation(() => {});

       await worker._processTokens();

       expect(postMessageSpy).toHaveBeenCalledWith({
         type: "locked-token-missing-signer",
         tokenId: "token-id",
       });
    });

    it("Redeem success: updates DB and receives tokens", async () => {
       const worker = useLockedTokensRedeemWorker();
       const p2pk = useP2PKStore();
       const receiveStore = useReceiveTokensStore();

       const tokenString = "cashuA_test_token";
       const lockedTokenEntry = {
         id: "token-id",
         tokenString,
         tierId: "tier1",
         unlockTs: Math.floor(Date.now() / 1000) - 100,
         autoRedeem: true,
         status: "pending"
       };

       const toArrayMock = vi.fn().mockResolvedValue([lockedTokenEntry]);
       // @ts-ignore
       cashuDb.lockedTokens.where.mockReturnValue({ belowOrEqual: () => ({ toArray: toArrayMock }) });
        // @ts-ignore
       cashuDb.lockedTokens.filter.mockReturnValue({ toArray: vi.fn(() => []) });
       // @ts-ignore
       cashuDb.lockedTokens.get.mockResolvedValue(lockedTokenEntry);

       const validPub = "02" + "a".repeat(64);
       const secret = JSON.stringify(["P2PK", { data: validPub }]);
       vi.spyOn(tokenUtil, "decode").mockReturnValue({
         token: [{ proofs: [{ secret }] }],
         proofs: [{ secret }],
         memo: "memo"
       } as any);
       vi.spyOn(tokenUtil, "getMint").mockReturnValue("https://mint.com");
       vi.spyOn(tokenUtil, "getUnit").mockReturnValue("sat");
       vi.spyOn(tokenUtil, "getProofs").mockReturnValue([{ secret, id: "kid" }] as any);

       // Mock valid private key
       vi.spyOn(p2pk, "getPrivateKeyForP2PKEncodedToken").mockReturnValue("privkeyhex");

       // Mock receive enqueue
       receiveStore.enqueue = vi.fn().mockResolvedValue(undefined);

       await worker._processTokens();

       expect(receiveStore.receiveData.tokensBase64).toBe(tokenString);
       expect(receiveStore.receiveData.p2pkPrivateKey).toBe("privkeyhex");
       expect(receiveStore.enqueue).toHaveBeenCalled();
       expect(cashuDb.lockedTokens.update).toHaveBeenCalledWith("token-id", { status: "claimed" });
    });
  });
});
