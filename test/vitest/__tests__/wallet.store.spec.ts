import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useWalletStore } from "../../../src/stores/wallet";

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

let mintsState: any;
let validatePubkey: any;
let storedKeys: any[];
let receiveStore: any;
let prStore: any;

vi.mock("../../../src/stores/mints", () => ({
  useMintsStore: () => mintsState,
  MintClass: class {
    private mint: any;
    constructor(mint: any) {
      this.mint = mint;
    }
    get api() {
      return { mintUrl: this.mint.url };
    }
    unitBalance(unit: string) {
      return this.mint.balances?.[unit] ?? 0;
    }
    unitKeysets(unit: string) {
      return (this.mint.keysets ?? []).filter((k: any) => k.unit === unit);
    }
  },
  Mint: class {},
}));

vi.mock("../../../src/stores/receiveTokensStore", () => ({
  useReceiveTokensStore: () => receiveStore,
}));

vi.mock("../../../src/stores/p2pk", () => ({
  useP2PKStore: () => ({
    isValidPubkey: (...args: any[]) => validatePubkey(...args),
    generateKeypair: vi.fn(),
    get p2pkKeys() {
      return storedKeys;
    },
  }),
}));

vi.mock("../../../src/stores/payment-request", () => ({
  usePRStore: () => prStore,
}));

vi.mock("../../../src/boot/i18n", () => ({
  i18n: { global: { t: vi.fn((s: string) => s) } },
}));

vi.mock("../../../src/stores/mnemonic", () => ({
  useMnemonicStore: () => ({ mnemonic: "test mnemonic" }),
}));

beforeEach(() => {
  for (const key in lsStore) delete lsStore[key];
  lsStore["cashu.wallet.payInvoice"] = "{}";
  setActivePinia(createPinia());
  mintsState = {
    activeUnit: "sat",
    activeMintUrl: "https://mint-a",
    mints: [
      { url: "https://mint-a", balances: { sat: 200 } },
      { url: "https://mint-b", balances: { sat: 500 } },
    ],
    mintUnitKeysets: vi.fn(() => []),
    activeKeys: [],
    activeKeysets: [],
    activeInfo: null,
    mintHasProtectedEndpoints: vi.fn(() => false),
    ensureBlindAuthPrepared: vi.fn(() => false),
    finalizeBlindAuthToken: vi.fn(),
    getBlindAuthToken: vi.fn(),
  };
  validatePubkey = vi.fn(() => true);
  storedKeys = [];
  receiveStore = { receiveData: { p2pkPrivateKey: "" } };
  prStore = { showPRKData: "retain" };
});

describe("wallet store P2PK management", () => {
  it("resets active key when blank value is provided", () => {
    const wallet = useWalletStore();
    wallet.activeP2pk = { publicKey: "02ab", privateKey: "01cd" } as any;
    const resetSpy = vi.spyOn(wallet, "resetPointerDependentRequests");

    wallet.setActiveP2pk("   ");

    expect(wallet.activeP2pk.publicKey).toBe("");
    expect(wallet.activeP2pk.privateKey).toBe("");
    expect(receiveStore.receiveData.p2pkPrivateKey).toBe("");
    expect(resetSpy).toHaveBeenCalled();
    expect(prStore.showPRKData).toBe("");
  });

  it("ignores invalid pubkeys without mutating state", () => {
    const wallet = useWalletStore();
    wallet.activeP2pk = { publicKey: "existing", privateKey: "prev" } as any;
    validatePubkey = vi.fn(() => false);

    wallet.setActiveP2pk("bad-key");

    expect(wallet.activeP2pk.publicKey).toBe("existing");
    expect(wallet.activeP2pk.privateKey).toBe("prev");
    expect(receiveStore.receiveData.p2pkPrivateKey).toBe("");
  });

  it("hydrates private key from stored entries when not provided", () => {
    storedKeys = [
      { publicKey: "02ABC".toLowerCase(), privateKey: "deadbeef" },
    ];
    const wallet = useWalletStore();
    const resetSpy = vi.spyOn(wallet, "resetPointerDependentRequests");

    wallet.setActiveP2pk("02ABC");

    expect(wallet.activeP2pk.publicKey).toBe("02abc");
    expect(wallet.activeP2pk.privateKey).toBe("deadbeef");
    expect(receiveStore.receiveData.p2pkPrivateKey).toBe("deadbeef");
    expect(resetSpy).toHaveBeenCalled();
  });
});

describe("wallet store mint selection", () => {
  it("prefers trusted mint when balance suffices", () => {
    const wallet = useWalletStore();
    const preferred = wallet.findSpendableMint(100, ["https://mint-b"]);
    expect(preferred?.url).toBe("https://mint-b");
  });

  it("falls back to any mint with enough balance", () => {
    const wallet = useWalletStore();
    const mint = wallet.findSpendableMint(150, ["https://missing"]);
    expect(mint?.url).toBe("https://mint-b");
  });

  it("returns null when no mint has sufficient balance", () => {
    const wallet = useWalletStore();
    const mint = wallet.findSpendableMint(9999);
    expect(mint).toBeNull();
  });
});
