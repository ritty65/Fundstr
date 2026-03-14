import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const lsStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in lsStore ? lsStore[k] : null),
  setItem: (k: string, v: string) => {
    lsStore[k] = String(v);
  },
  removeItem: (k: string) => {
    delete lsStore[k];
  },
  clear: () => {
    for (const k in lsStore) delete lsStore[k];
  },
  key: (i: number) => Object.keys(lsStore)[i] ?? null,
  get length() {
    return Object.keys(lsStore).length;
  },
};

const { notifySuccess, notifyWarning } = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock("../../../src/js/notify", () => ({
  notifyApiError: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess,
  notifyWarning,
  notify: vi.fn(),
}));

vi.mock("../../../src/js/logger", () => ({
  debug: vi.fn(),
}));

const cashuMocks = vi.hoisted(() => ({
  CashuWallet: null as any,
  CashuAuthWallet: null as any,
}));

vi.mock("@cashu/cashu-ts", () => {
  class MockCashuMint {
    mintUrl: string;
    authTokenGetter?: () => Promise<string>;
    constructor(url: string, _customRequest?: any, authTokenGetter?: () => Promise<string>) {
      this.mintUrl = url;
      this.authTokenGetter = authTokenGetter;
    }
  }

  class MockCashuWallet {
    static lastAuthToken: string | null = null;
    mint: any;
    unit: string;
    privkey = "wallet-priv";
    constructor(mint: any, options: any) {
      this.mint = mint;
      this.unit = options.unit;
    }
    async receive(_token: any, _options: any) {
      if (typeof this.mint.authTokenGetter === "function") {
        MockCashuWallet.lastAuthToken = await this.mint.authTokenGetter();
      } else {
        MockCashuWallet.lastAuthToken = null;
      }
      return [
        {
          amount: 5,
          id: "00abc",
          secret: "secret",
          C: "C",
        },
      ];
    }
  }

  class MockCashuAuthMint {
    mintUrl: string;
    constructor(url: string) {
      this.mintUrl = url;
    }
  }

  class MockCashuAuthWallet {
    static lastRequest: { amount: number; clearAuthToken: string; url: string } | null = null;
    mint: MockCashuAuthMint;
    keysets: any[];
    keys: Map<string, any>;
    constructor(mint: MockCashuAuthMint, options?: { keysets?: any[]; keys?: any[] }) {
      this.mint = mint;
      this.keysets = options?.keysets ?? [];
      this.keys = new Map();
      if (options?.keys) {
        for (const key of options.keys) {
          this.keys.set(key.id, key);
        }
      }
    }
    async loadMint() {
      this.keysets = [{ id: "auth-1", unit: "auth", active: true }];
      this.keys = new Map([["auth-1", { id: "auth-1", unit: "auth" }]]);
    }
    async mintProofs(amount: number, clearAuthToken: string) {
      MockCashuAuthWallet.lastRequest = {
        amount,
        clearAuthToken,
        url: this.mint.mintUrl,
      };
      return new Array(amount).fill(null).map((_, idx) => ({
        id: `auth-${idx}`,
        secret: `secret-${idx}`,
        C: `C-${idx}`,
      }));
    }
  }

  cashuMocks.CashuWallet = MockCashuWallet;
  cashuMocks.CashuAuthWallet = MockCashuAuthWallet;

  const getEncodedAuthToken = (proof: any) => `auth-token-${proof.id}`;

  return {
    CashuMint: MockCashuMint,
    CashuWallet: MockCashuWallet,
    CashuAuthMint: MockCashuAuthMint,
    CashuAuthWallet: MockCashuAuthWallet,
    getEncodedAuthToken,
    Proof: class {},
    MintQuotePayload: class {},
    MeltQuotePayload: class {},
    MeltQuoteResponse: class {},
    CheckStateEnum: {},
    MeltQuoteState: { PAID: "PAID" },
    MintQuoteState: { PAID: "PAID", UNPAID: "UNPAID", ISSUED: "ISSUED" },
    PaymentRequest: class {},
    PaymentRequestTransportType: {},
    PaymentRequestTransport: class {},
    decodePaymentRequest: vi.fn(),
    MintQuoteResponse: class {},
    ProofState: {},
    getEncodedToken: vi.fn((token: any) => token),
    __cashuMocks: cashuMocks,
  };
});

const { tokenDecode, tokenGetProofs } = vi.hoisted(() => {
  const tokenDecode = vi.fn(() => ({}));
  const tokenGetProofs = vi.fn(() => [
    {
      amount: 5,
      id: "00abc",
      secret: "secret",
      C: "C",
    },
  ]);
  return { tokenDecode, tokenGetProofs };
});

vi.mock("../../../src/js/token", () => ({
  default: {
    decode: tokenDecode,
    getProofs: tokenGetProofs,
    getMint: vi.fn(() => "https://nut22.example"),
    getUnit: vi.fn(() => "sat"),
  },
}));

const proofsStoreState = {
  proofs: [] as any[],
  addProofs: vi.fn(async (proofs: any[]) => {
    proofsStoreState.proofs.push(...proofs);
  }),
  removeProofs: vi.fn(),
  updateActiveProofs: vi.fn(),
};

vi.mock("../../../src/stores/proofs", () => ({
  useProofsStore: () => proofsStoreState,
}));

const tokensStoreState = {
  historyTokens: [] as any[],
  addPaidToken: vi.fn((token: any) => {
    tokensStoreState.historyTokens.push(token);
  }),
  setTokenPaid: vi.fn(),
};

vi.mock("../../../src/stores/tokens", () => ({
  useTokensStore: () => tokensStoreState,
  HistoryToken: class {},
}));

const receiveStoreState = {
  receiveData: {
    bucketId: "default",
    label: "",
    description: "",
    p2pkPrivateKey: "",
    tokensBase64: "",
  },
  showReceiveTokens: false,
};

vi.mock("../../../src/stores/receiveTokensStore", () => ({
  useReceiveTokensStore: () => receiveStoreState,
}));

vi.mock("../../../src/stores/p2pk", () => ({
  useP2PKStore: () => ({
    isValidPubkey: vi.fn(() => true),
    generateKeypair: vi.fn(),
    get p2pkKeys() {
      return [];
    },
    setPrivateKeyUsed: vi.fn(),
    getPrivateKeyForP2PKEncodedToken: vi.fn(() => ""),
    getTokenLocktime: vi.fn(() => 0),
  }),
}));

vi.mock("../../../src/stores/payment-request", () => ({
  usePRStore: () => ({ showPRKData: "" }),
}));

vi.mock("../../../src/boot/i18n", () => ({
  i18n: { global: { t: vi.fn((s: string) => s) } },
}));

vi.mock("../../../src/stores/mnemonic", () => ({
  useMnemonicStore: () => ({
    mnemonic: "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  }),
}));

vi.mock("../../../src/stores/ui", () => ({
  useUiStore: () => ({
    lockMutex: vi.fn(async () => undefined),
    unlockMutex: vi.fn(() => undefined),
    formatCurrency: (value: number, unit: string) => `${value} ${unit}`,
    vibrate: vi.fn(),
    t: (s: string, _params?: any) => s,
    showMissingSignerModal: false,
    setTab: vi.fn(),
  }),
}));

vi.mock("../../../src/stores/workers", () => ({
  useWorkersStore: () => ({
    signWithRemote: vi.fn(async () => []),
    clearAllWorkers: vi.fn(),
  }),
}));

vi.mock("../../../src/stores/signer", () => ({
  useSignerStore: () => ({
    reset: vi.fn(),
    method: "local",
  }),
}));

vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => ({
    activePrivkeyHex: "",
    privKeyHex: "",
  }),
}));

vi.mock("../../../src/stores/dexie", () => ({
  cashuDb: {},
}));

vi.mock("../../../src/nutzap/profileRepublish", () => ({
  maybeRepublishNutzapProfile: vi.fn(async () => undefined),
}));

vi.mock("../../../src/stores/creatorProfile", () => ({
  useCreatorProfileStore: () => ({ mints: [] as string[] }),
}));

import { useWalletStore } from "../../../src/stores/wallet";
import { useMintsStore } from "../../../src/stores/mints";

const MINT_URL = "https://nut22.example";

describe("wallet redemption with Nut-22", () => {
  beforeEach(() => {
    for (const key in lsStore) delete lsStore[key];
    setActivePinia(createPinia());

    cashuMocks.CashuWallet.lastAuthToken = null;
    cashuMocks.CashuAuthWallet.lastRequest = null;

    const mintsStore = useMintsStore();
    mintsStore.mints = [
      {
        url: MINT_URL,
        keys: [{ id: "00abc", unit: "sat" }],
        keysets: [{ id: "00abc", unit: "sat", active: true }],
        info: {
          nuts: {
            22: {
              protected_endpoints: [{ method: "POST", path: "/v1/swap" }],
              bat_max_mint: 5,
            },
          },
        },
      },
    ];
    mintsStore.activeMintUrl = MINT_URL;
    mintsStore.activeUnit = "sat";
    mintsStore.setMintClearAuthToken(MINT_URL, "clear-auth-token");
    if (!mintsStore.mintAuth[MINT_URL]) {
      mintsStore.mintAuth[MINT_URL] = { tokens: [], clearAuthToken: "clear-auth-token" } as any;
    }
    mintsStore.mintAuth[MINT_URL].tokens = [];
  });

  it("redeems tokens using blind auth token", async () => {
    const walletStore = useWalletStore();
    const mintsStore = useMintsStore();

    const result = await walletStore.attemptRedeem("encoded-token");

    expect(result).toBe(true);
    expect(cashuMocks.CashuAuthWallet.lastRequest).toBeTruthy();
    expect(cashuMocks.CashuAuthWallet.lastRequest?.clearAuthToken).toBe(
      "clear-auth-token",
    );
    expect(cashuMocks.CashuWallet.lastAuthToken).toBe("auth-token-auth-0");
    expect(notifySuccess).toHaveBeenCalled();
    expect(cashuMocks.CashuAuthWallet.lastRequest?.amount).toBe(5);
    expect(mintsStore.mintAuth[MINT_URL].tokens.length).toBe(4);
  });
});
