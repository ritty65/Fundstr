import { describe, it, beforeEach, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { reactive } from "vue";
import { useWalletStore } from "stores/wallet";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

const mintWalletReceiveMock = vi.fn();
const signWithRemoteMock = vi.fn();
const addProofsMock = vi.fn(async () => {});
const setPrivateKeyUsedMock = vi.fn();
const lockMutexMock = vi.fn(async () => {});
const unlockMutexMock = vi.fn();
const signerResetMock = vi.fn();
const notifySuccessMock = vi.fn();
const notifyApiErrorMock = vi.fn();

const signerStoreMock = reactive({
  reset: signerResetMock,
  method: null as string | null,
});

const uiStoreMock = reactive({
  lockMutex: lockMutexMock,
  unlockMutex: unlockMutexMock,
  showMissingSignerModal: false,
  formatCurrency: vi.fn((_value: number, _unit: string) => "1"),
  vibrate: vi.fn(),
});

const receiveStoreMock = reactive({
  receiveData: {
    tokensBase64: "",
    p2pkPrivateKey: undefined as string | undefined,
    bucketId: DEFAULT_BUCKET_ID,
    label: "",
    description: "",
  },
  showReceiveTokens: false,
});

const proofsStoreMock = {
  addProofs: addProofsMock,
};

const p2pkStoreMock = {
  setPrivateKeyUsed: setPrivateKeyUsedMock,
};

const mintWalletMock = {
  privkey: "mint-privkey",
  receive: mintWalletReceiveMock,
};

const mintsStoreMock = reactive({
  mints: [
    {
      url: "https://mint.example",
      keysets: [{ id: "keyset-1" }],
    },
  ],
  mintUnitProofs: vi.fn(() => []),
});

const tokensStoreMock = reactive({
  historyTokens: [] as any[],
  addPaidToken: vi.fn(),
  setTokenPaid: vi.fn(),
});

const nostrStoreMock = reactive({
  activePrivkeyHex: undefined as string | undefined,
});

const decodedToken = {
  proofs: [[{ id: "keyset-1", amount: 1, secret: "" }]],
  mint: "https://mint.example",
  unit: "sat",
};

const decodeMock = vi.fn(() => decodedToken as any);
const getProofsMock = vi.fn();
const getMintMock = vi.fn(() => decodedToken.mint);
const getUnitMock = vi.fn(() => decodedToken.unit);

const getEncodedTokenMock = vi.fn(() => "encoded-with-witness");

vi.mock("src/js/token", () => ({
  default: {
    decode: (...args: any[]) => decodeMock(...args),
    getProofs: (...args: any[]) => getProofsMock(...args),
    getMint: (...args: any[]) => getMintMock(...args),
    getUnit: (...args: any[]) => getUnitMock(...args),
  },
}));

vi.mock("@cashu/cashu-ts", async () => {
  const actual = await vi.importActual<any>("@cashu/cashu-ts");
  return {
    ...actual,
    getEncodedToken: (...args: any[]) => getEncodedTokenMock(...args),
  };
});

vi.mock("stores/receiveTokensStore", () => ({
  useReceiveTokensStore: () => receiveStoreMock,
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => proofsStoreMock,
}));

vi.mock("stores/p2pk", () => ({
  useP2PKStore: () => p2pkStoreMock,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => mintsStoreMock,
}));

vi.mock("stores/tokens", () => ({
  useTokensStore: () => tokensStoreMock,
}));

vi.mock("stores/ui", () => ({
  useUiStore: () => uiStoreMock,
}));

vi.mock("stores/workers", () => ({
  useWorkersStore: () => ({
    signWithRemote: (...args: any[]) => signWithRemoteMock(...args),
  }),
}));

vi.mock("stores/signer", () => ({
  useSignerStore: () => signerStoreMock,
}));

vi.mock("stores/nostr", () => ({
  useNostrStore: () => nostrStoreMock,
}));

vi.mock("src/js/notify", () => ({
  notifySuccess: (...args: any[]) => notifySuccessMock(...args),
  notifyApiError: (...args: any[]) => notifyApiErrorMock(...args),
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
  notify: vi.fn(),
}));

describe("wallet store attemptRedeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signerStoreMock.method = null;
    mintWalletReceiveMock.mockReset();
    signWithRemoteMock.mockReset();
    addProofsMock.mockReset();
    setPrivateKeyUsedMock.mockReset();
    lockMutexMock.mockReset();
    unlockMutexMock.mockReset();
    signerResetMock.mockReset();
    notifySuccessMock.mockReset();
    notifyApiErrorMock.mockReset();
    receiveStoreMock.receiveData = {
      tokensBase64: "",
      p2pkPrivateKey: undefined,
      bucketId: DEFAULT_BUCKET_ID,
      label: "",
      description: "",
    };
    receiveStoreMock.showReceiveTokens = false;
    uiStoreMock.showMissingSignerModal = false;
    uiStoreMock.formatCurrency = vi.fn(() => "1");
    uiStoreMock.vibrate = vi.fn();
    nostrStoreMock.activePrivkeyHex = undefined;
    mintsStoreMock.mints = [
      {
        url: "https://mint.example",
        keysets: [{ id: "keyset-1" }],
      },
    ];
    tokensStoreMock.historyTokens = [];
    tokensStoreMock.addPaidToken = vi.fn();
    tokensStoreMock.setTokenPaid = vi.fn();
    setActivePinia(createPinia());
  });

  it("redeems with remote witness proofs and resets signer", async () => {
    const inputProofs = [
      {
        id: "keyset-1",
        amount: 1,
        secret:
          '["P2PK",{"data":"0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"}]',
        C: "C1",
      },
    ] as any[];

    const signedProofs = inputProofs.map((proof) => ({
      ...proof,
      witness: { signatures: ["sig"] },
    }));

    getProofsMock.mockReturnValue(inputProofs);
    signWithRemoteMock.mockResolvedValue(signedProofs);
    mintWalletReceiveMock.mockResolvedValue([{ amount: 1 } as any]);

    const walletStore = useWalletStore();
    walletStore.mintWallet = vi.fn(() => mintWalletMock as any);
    walletStore.getKeyset = vi.fn(() => "keyset-1");
    walletStore.keysetCounter = vi.fn(() => 0);
    walletStore.increaseKeysetCounter = vi.fn();

    const tokenString = "encoded-token";

    await walletStore.attemptRedeem(tokenString);

    expect(signWithRemoteMock).toHaveBeenCalledWith(inputProofs);
    expect(getEncodedTokenMock).toHaveBeenCalledWith({
      mint: "https://mint.example",
      unit: "sat",
      proofs: signedProofs,
    });
    expect(mintWalletReceiveMock).toHaveBeenCalledWith(
      "encoded-with-witness",
      expect.objectContaining({ privkey: mintWalletMock.privkey }),
    );
    expect(addProofsMock).toHaveBeenCalled();
    expect(signerResetMock).toHaveBeenCalled();

    const resolvedPrivkey =
      receiveStoreMock.receiveData.p2pkPrivateKey ??
      nostrStoreMock.activePrivkeyHex;
    expect(setPrivateKeyUsedMock).toHaveBeenCalledWith(resolvedPrivkey);
  });

  it("throws when remote witness missing and signer modal dismissed", async () => {
    const inputProofs = [
      {
        id: "keyset-1",
        amount: 1,
        secret:
          '["P2PK",{"data":"0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"}]',
        C: "C1",
      },
    ] as any[];

    getProofsMock.mockReturnValue(inputProofs);
    signWithRemoteMock.mockResolvedValue(inputProofs);

    const walletStore = useWalletStore();
    walletStore.mintWallet = vi.fn(() => mintWalletMock as any);
    walletStore.getKeyset = vi.fn(() => "keyset-1");
    walletStore.keysetCounter = vi.fn(() => 0);
    walletStore.increaseKeysetCounter = vi.fn();

    const attempt = walletStore.attemptRedeem("encoded-token");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(uiStoreMock.showMissingSignerModal).toBe(true);
    uiStoreMock.showMissingSignerModal = false;

    await expect(attempt).rejects.toThrow("User cancelled signer setup");

    expect(signerStoreMock.method).toBeNull();
    expect(signerResetMock).toHaveBeenCalledTimes(1);
    expect(mintWalletReceiveMock).not.toHaveBeenCalled();
    expect(setPrivateKeyUsedMock).not.toHaveBeenCalled();
  });
});
