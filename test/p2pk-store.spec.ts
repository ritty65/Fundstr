import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useP2PKStore } from "stores/p2pk";
import { useWalletStore } from "stores/wallet";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

let mintsStoreMock: any;
let proofsStoreMock: any;
let tokensStoreMock: any;
let walletStore: any;

vi.mock("src/js/token", () => ({
  default: {
    decode: vi.fn(() => ({ proofs: [], mint: "mint", unit: "sat" })),
    getMint: vi.fn(() => "mint"),
    getUnit: vi.fn(() => "sat"),
  },
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

vi.mock("stores/dexie", () => ({
  cashuDb: {
    lockedTokens: {
      where: () => ({ equals: () => ({ first: async () => null }) }),
    },
  },
}));

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  proofsStoreMock = { addProofs: vi.fn() };
  tokensStoreMock = { addPaidToken: vi.fn() };
  mintsStoreMock = {
    mints: [{ url: "mint", keysets: [] }],
    addMint: vi.fn(),
    mintUnitProofs: vi.fn(() => []),
  };
  walletStore = useWalletStore();
  vi.spyOn(walletStore, "mintWallet").mockReturnValue({
    receive: vi.fn(async () => [{ amount: 1, id: "a", C: "c" }]),
  } as any);
  vi.spyOn(walletStore, "getKeyset").mockReturnValue("kid");
  vi.spyOn(walletStore, "keysetCounter").mockReturnValue(1);
  vi.spyOn(walletStore, "increaseKeysetCounter").mockImplementation(() => {});
});

describe("p2pk store", () => {
  it("claims locked token using wallet.receive", async () => {
    const p2pk = useP2PKStore();
    p2pk.getPrivateKeyForP2PKEncodedToken = vi.fn(() => "priv");

    await p2pk.claimLockedToken("tok");

    const wallet = (walletStore.mintWallet as any).mock.results[0].value;
    expect(wallet.receive).toHaveBeenCalledWith("tok", {
      counter: 1,
      privkey: "priv",
      proofsWeHave: [],
    });
    expect(proofsStoreMock.addProofs).toHaveBeenCalled();
    expect(tokensStoreMock.addPaidToken).toHaveBeenCalledWith({
      amount: 1,
      token: "tok",
      mint: "mint",
      unit: "sat",
      label: "",
      bucketId: DEFAULT_BUCKET_ID,
    });
  });

  it("records, retrieves, and clears verification records with normalization", () => {
    const p2pk = useP2PKStore();
    const mixedCaseKey = `02${"A".repeat(64)}`;

    p2pk.recordVerification(mixedCaseKey, {
      timestamp: 123,
      mint: " https://mint.example/ ",
    });

    const normalizedKey = `02${"a".repeat(64)}`;
    expect(p2pk.verificationRecords?.[normalizedKey]).toEqual({
      timestamp: 123,
      mint: "https://mint.example/",
    });
    expect(p2pk.getVerificationRecord(mixedCaseKey)).toEqual({
      timestamp: 123,
      mint: "https://mint.example/",
    });

    p2pk.clearVerification(mixedCaseKey);
    expect(p2pk.getVerificationRecord(mixedCaseKey)).toBeNull();
  });

  it("ignores verification updates for invalid keys and leaves state unchanged", () => {
    const p2pk = useP2PKStore();

    p2pk.recordVerification("", { timestamp: 1, mint: "ignored" });
    expect(p2pk.verificationRecords).toEqual({});

    p2pk.clearVerification("not-a-key");
    expect(p2pk.verificationRecords).toEqual({});
    expect(p2pk.getVerificationRecord("not-a-key")).toBeNull();
  });

  it("updates key usage counters and surfaces key details", () => {
    const p2pk = useP2PKStore();
    p2pk.p2pkKeys = [
      { publicKey: "pk1", privateKey: "sk1", used: false, usedCount: 0 },
      { publicKey: "pk2", privateKey: "sk2", used: false, usedCount: 2 },
    ];

    expect(p2pk.haveThisKey("pk1")).toBe(true);
    expect(p2pk.haveThisKey("missing")).toBe(false);

    p2pk.setPrivateKeyUsed("sk1");
    expect(p2pk.p2pkKeys[0]).toMatchObject({ used: true, usedCount: 1 });

    p2pk.showKeyDetails("pk2");
    expect(p2pk.showP2PKDialog).toBe(true);
    expect(p2pk.showP2PKData).toEqual({
      publicKey: "pk2",
      privateKey: "sk2",
      used: false,
      usedCount: 2,
    });

    p2pk.showP2PKDialog = false;
    p2pk.showP2PKData = {} as any;
    p2pk.showLastKey();
    expect(p2pk.showP2PKDialog).toBe(true);
    expect(p2pk.showP2PKData.publicKey).toBe("pk2");
  });
});
