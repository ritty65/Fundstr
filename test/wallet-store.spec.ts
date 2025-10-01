import { describe, it, expect, vi, beforeEach } from "vitest";
import { useWalletStore } from "stores/wallet";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { bytesToHex } from "@noble/hashes/utils";
import { getPublicKey } from "@noble/secp256k1";

const proofsStoreMock: any = {};
const uiStoreMock: any = {};
const receiveStoreMock: any = {};
const prStoreMock: any = {};
const p2pkStoreMock: any = {};

vi.mock("stores/receiveTokensStore", () => ({
  useReceiveTokensStore: () => receiveStoreMock,
}));

vi.mock("stores/payment-request", () => ({
  usePRStore: () => prStoreMock,
}));

vi.mock("stores/p2pk", () => ({
  useP2PKStore: () => p2pkStoreMock,
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => proofsStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => ({
    activeUnit: "sat",
    activeMintUrl: "mint",
    mints: [{ url: "mint", keys: [], keysets: [] }],
    activeKeys: [],
    activeKeysets: [],
    mintUnitProofs: () => [],
  }),
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => uiStoreMock,
}));

vi.mock("stores/signer", () => ({
  useSignerStore: () => ({ reset: vi.fn(), method: null }),
}));
vi.mock("src/js/notify", () => ({
  notifyApiError: vi.fn(),
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
  notify: vi.fn(),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  Object.assign(receiveStoreMock, {
    receiveData: {
      tokensBase64: "",
      p2pkPrivateKey: "",
      bucketId: DEFAULT_BUCKET_ID,
      label: "",
      description: "",
    },
    showReceiveTokens: false,
  });
  Object.assign(prStoreMock, { showPRKData: "" });
  Object.assign(p2pkStoreMock, {
    p2pkKeys: [] as any[],
    isValidPubkey: vi.fn(() => true),
    getPrivateKeyForP2PKEncodedToken: vi.fn(() => "priv"),
    setPrivateKeyUsed: vi.fn(),
  });
  Object.assign(proofsStoreMock, {
    addProofs: vi.fn(),
    removeProofs: vi.fn(),
    setReserved: vi.fn(),
  });
  Object.assign(uiStoreMock, {
    lockMutex: vi.fn(async () => {}),
    unlockMutex: vi.fn(),
  });
});

describe("wallet store", () => {
  it("calls wallet.send with selected proofs", async () => {
    const walletStore = useWalletStore();
    const proofs = [
      { secret: "s1", amount: 1, id: "a", C: "c1" } as any,
      { secret: "s2", amount: 1, id: "b", C: "c2" } as any,
    ];

    walletStore.spendableProofs = vi.fn(() => proofs);
    walletStore.coinSelect = vi.fn(() => proofs);
    walletStore.signP2PKIfNeeded = vi.fn((p: any) => p);
    walletStore.getKeyset = vi.fn(() => "kid");
    walletStore.keysetCounter = vi.fn(() => 1);
    walletStore.increaseKeysetCounter = vi.fn();

    const wallet = {
      mint: { mintUrl: "mint" },
      unit: "sat",
      getFeesForProofs: vi.fn(() => 0),
      send: vi.fn(async (_a: number, _p: any, _opts: any) => ({
        keep: [],
        send: [],
      })),
    } as any;

    await walletStore.send(proofs, wallet, 1, false, false, DEFAULT_BUCKET_ID);

    expect(wallet.send).toHaveBeenCalledWith(1, proofs, {
      counter: 1,
      keysetId: "kid",
      proofsWeHave: proofs,
    });
    expect(proofsStoreMock.setReserved).toHaveBeenCalled();
  });

  it("retries redeem until attemptRedeem succeeds", async () => {
    const walletStore = useWalletStore();
    const attempt = vi
      .spyOn(walletStore, "attemptRedeem")
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    await walletStore.redeem("token");

    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("sets active P2PK pointer and refreshes dependent caches", () => {
    const walletStore = useWalletStore();
    const priv = "1".repeat(64);
    const pub = bytesToHex(getPublicKey(priv, true));

    walletStore.payInvoiceData.bucketId = "custom-bucket" as any;
    walletStore.payInvoiceData.input.request = "pending";
    walletStore.payInvoiceData.meltQuote.payload.request = "old";
    walletStore.payInvoiceData.meltQuote.response.quote = "quoted";
    walletStore.payInvoiceData.meltQuote.response.amount = 42;
    walletStore.payInvoiceData.meltQuote.response.fee_reserve = 2;
    walletStore.payInvoiceData.meltQuote.error = "err";
    walletStore.payInvoiceData.bolt11 = "bolt";
    receiveStoreMock.receiveData.p2pkPrivateKey = "legacy";
    prStoreMock.showPRKData = "encoded";
    p2pkStoreMock.p2pkKeys = [
      { publicKey: pub, privateKey: priv, used: false, usedCount: 0 },
    ];

    walletStore.setActiveP2pk(pub, priv);

    expect(walletStore.activeP2pk.publicKey).toBe(pub);
    expect(walletStore.activeP2pk.privateKey).toBe(priv);
    expect(receiveStoreMock.receiveData.p2pkPrivateKey).toBe(priv);
    expect(walletStore.payInvoiceData.bucketId).toBe("custom-bucket");
    expect(walletStore.payInvoiceData.input.request).toBe("");
    expect(walletStore.payInvoiceData.meltQuote.payload.request).toBe("");
    expect(walletStore.payInvoiceData.meltQuote.response.quote).toBe("");
    expect(walletStore.payInvoiceData.meltQuote.response.amount).toBe(0);
    expect(walletStore.payInvoiceData.meltQuote.response.fee_reserve).toBe(0);
    expect(walletStore.payInvoiceData.meltQuote.error).toBe("");
    expect(walletStore.payInvoiceData.bolt11).toBe("");
    expect(prStoreMock.showPRKData).toBe("");

    walletStore.payInvoiceData.input.request = "again";
    prStoreMock.showPRKData = "again";
    walletStore.setActiveP2pk("", "");

    expect(walletStore.activeP2pk.publicKey).toBe("");
    expect(walletStore.activeP2pk.privateKey).toBe("");
    expect(receiveStoreMock.receiveData.p2pkPrivateKey).toBe("");
    expect(walletStore.payInvoiceData.bucketId).toBe("custom-bucket");
    expect(walletStore.payInvoiceData.input.request).toBe("");
    expect(prStoreMock.showPRKData).toBe("");

    prStoreMock.showPRKData = "again";
    walletStore.setActiveP2pk(pub, "");

    expect(walletStore.activeP2pk.publicKey).toBe(pub);
    expect(walletStore.activeP2pk.privateKey).toBe(priv);
    expect(receiveStoreMock.receiveData.p2pkPrivateKey).toBe(priv);
    expect(prStoreMock.showPRKData).toBe("");
  });
});
