import { describe, it, beforeEach, expect, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useMnemonicStore } from "stores/mnemonic";
import { LOCAL_STORAGE_KEYS } from "src/constants/localStorageKeys";
import { nextTick } from "vue";

const hoisted = vi.hoisted(() => ({
  generateMnemonic: vi.fn(),
  mnemonicToSeedSync: vi.fn(() => new Uint8Array([1, 2, 3])),
}));

const { generateMnemonic, mnemonicToSeedSync } = hoisted;

vi.mock("@scure/bip39", () => ({
  generateMnemonic: (...args: any[]) => generateMnemonic(...args),
  mnemonicToSeedSync: (...args: any[]) => mnemonicToSeedSync(...args),
}));

vi.mock("@scure/bip39/wordlists/english", () => ({
  wordlist: ["word"],
}));

describe("mnemonic store", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
    generateMnemonic.mockReset();
    mnemonicToSeedSync.mockClear();
  });

  it("initializes a mnemonic when none exists", async () => {
    generateMnemonic.mockReturnValueOnce("seed-phrase-1");
    const store = useMnemonicStore();

    const mnemonic = store.initializeMnemonic();
    await nextTick();

    expect(generateMnemonic).toHaveBeenCalled();
    expect(mnemonic).toBe("seed-phrase-1");
    expect(store.mnemonic).toBe("seed-phrase-1");
    expect(
      localStorage.getItem(LOCAL_STORAGE_KEYS.CASHU_MNEMONIC),
    ).toContain("seed-phrase-1");
  });

  it("rotates the mnemonic and records old counters", async () => {
    generateMnemonic.mockReturnValueOnce("seed-phrase-1").mockReturnValueOnce(
      "seed-phrase-2",
    );
    const store = useMnemonicStore();
    store.initializeMnemonic();
    await nextTick();
    store.oldMnemonicCounters = [] as any;

    store.newMnemonic([{ id: "keyset", value: 1 }]);
    await nextTick();

    expect(store.oldMnemonicCounters).toEqual([
      { mnemonic: "seed-phrase-1", keysetCounters: [{ id: "keyset", value: 1 }] },
    ]);
    expect(store.mnemonic).toBe("seed-phrase-2");

    const persisted = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_KEYS.CASHU_OLDMNEMONICCOUNTERS) || "[]",
    );
    expect(persisted[0].mnemonic).toBe("seed-phrase-1");
    expect(persisted[0].keysetCounters[0]).toEqual({ id: "keyset", value: 1 });
  });
});
