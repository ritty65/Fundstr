import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useReceiveTokensStore } from "@/stores/receiveTokensStore";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { createProof } from "../utils/factories";

const hoisted = vi.hoisted(() => {
  const notifyModule = {
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
    notifyWarning: vi.fn(),
    notify: vi.fn(),
  };

  const tokenModule = {
    decode: vi.fn(),
    getProofs: vi.fn(),
    getMint: vi.fn(),
  };

  const mintsStore = {
    mints: [] as Array<{ url: string; keysets: Array<{ id: string }> }>,
    addMint: vi.fn(async () => {}),
  };

  const uiStore = {
    closeDialogs: vi.fn(),
    pasteFromClipboard: vi.fn(async () => ""),
  };

  const p2pkStore = {
    getPrivateKeyForP2PKEncodedToken: vi.fn(() => "priv-key"),
  };

  const walletStore = {
    redeem: vi.fn(async () => {}),
  };

  const tokensStore = {
    tokenAlreadyInHistory: vi.fn(() => undefined as
      | { amount: number; status: "paid" | "pending" }
      | undefined),
  };

  const swapStore = {
    meltProofsToMint: vi.fn(async () => {}),
  };

  const lockedTokensRecords: Array<{ tokenString: string }> = [];
  const lockedTokensTable = {
    where: vi.fn((field: string) => ({
      equals: (value: string) => ({
        delete: vi.fn(async () => {
          for (let index = lockedTokensRecords.length - 1; index >= 0; index -= 1) {
            if ((lockedTokensRecords[index] as any)[field] === value) {
              lockedTokensRecords.splice(index, 1);
            }
          }
        }),
      }),
    })),
  };

  const cashuDb = {
    lockedTokens: lockedTokensTable,
    proofs: { where: vi.fn(), toArray: vi.fn() },
  };

  return {
    notifyModule,
    tokenModule,
    mintsStore,
    uiStore,
    p2pkStore,
    walletStore,
    tokensStore,
    swapStore,
    lockedTokensRecords,
    lockedTokensTable,
    cashuDb,
  };
});

vi.mock("src/js/notify", () => ({
  __esModule: true,
  ...hoisted.notifyModule,
}));

vi.mock("src/js/token", () => ({
  __esModule: true,
  default: hoisted.tokenModule,
}));

vi.mock("stores/mints", () => ({
  __esModule: true,
  useMintsStore: () => hoisted.mintsStore,
}));

vi.mock("stores/ui", () => ({
  __esModule: true,
  useUiStore: () => hoisted.uiStore,
}));

vi.mock("stores/p2pk", () => ({
  __esModule: true,
  useP2PKStore: () => hoisted.p2pkStore,
}));

vi.mock("stores/wallet", () => ({
  __esModule: true,
  useWalletStore: () => hoisted.walletStore,
}));

vi.mock("stores/tokens", () => ({
  __esModule: true,
  useTokensStore: () => hoisted.tokensStore,
}));

vi.mock("stores/swap", () => ({
  __esModule: true,
  useSwapStore: () => hoisted.swapStore,
}));

vi.mock("stores/dexie", () => ({
  __esModule: true,
  cashuDb: hoisted.cashuDb,
  CashuDexie: class {},
  useDexieStore: () => ({}),
}));

vi.mock("src/js/logger", () => ({
  __esModule: true,
  debug: vi.fn(),
}));

const {
  notifyModule,
  tokenModule,
  mintsStore,
  uiStore,
  p2pkStore,
  walletStore,
  tokensStore,
  swapStore,
  lockedTokensRecords,
  lockedTokensTable,
} = hoisted;

const { notifyError, notify, notifyWarning } = notifyModule;

let store: ReturnType<typeof useReceiveTokensStore>;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

const sampleToken = { proofs: [createProof({ secret: "secret-1" })] } as any;

describe("receiveTokensStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    store = useReceiveTokensStore();

    notifyError.mockReset();
    notify.mockReset();
    notifyWarning.mockReset();
    tokenModule.decode.mockReset();
    tokenModule.getProofs.mockReset();
    tokenModule.getMint.mockReset();
    mintsStore.mints = [];
    mintsStore.addMint.mockReset();
    uiStore.closeDialogs.mockReset();
    uiStore.pasteFromClipboard.mockReset();
    p2pkStore.getPrivateKeyForP2PKEncodedToken.mockClear();
    walletStore.redeem.mockReset();
    tokensStore.tokenAlreadyInHistory.mockReset();
    swapStore.meltProofsToMint.mockReset();
    lockedTokensRecords.splice(0, lockedTokensRecords.length);
    lockedTokensTable.where.mockClear();

    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("decodeToken", () => {
    it("rejects invalid strings", () => {
      const result = store.decodeToken("invalid");

      expect(result).toBeUndefined();
      expect(notifyError).toHaveBeenCalledWith("Invalid token string");
      expect(consoleErrorSpy).toHaveBeenCalledWith("Invalid token string");
    });

    it("rejects tokens without proofs", () => {
      tokenModule.decode.mockReturnValue(sampleToken);
      tokenModule.getProofs.mockReturnValue([]);

      const result = store.decodeToken("cashuAToken");

      expect(result).toBeUndefined();
      expect(notifyError).toHaveBeenCalledWith("Decoded token contains no proofs");
      expect(consoleErrorSpy).toHaveBeenCalledWith("Decoded token contains no proofs");
    });

    it("handles decoder errors", () => {
      tokenModule.decode.mockImplementation(() => {
        throw new Error("boom");
      });

      const result = store.decodeToken("cashuAToken");

      expect(result).toBeUndefined();
      expect(notifyError).toHaveBeenCalledWith("Failed to decode token");
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(Error));
    });

    it("returns decoded tokens when valid", () => {
      tokenModule.decode.mockReturnValue(sampleToken);
      tokenModule.getProofs.mockReturnValue(sampleToken.proofs);

      const result = store.decodeToken("cashuAToken");

      expect(result).toBe(sampleToken);
    });
  });

  it("determines whether the mint is already known", () => {
    tokenModule.getMint.mockReturnValue("https://mint-a");
    tokenModule.getProofs.mockReturnValue(sampleToken.proofs);
    mintsStore.mints = [
      { url: "https://mint-a", keysets: [{ id: "keyset-1" }] },
    ];

    const result = store.knowThisMintOfTokenJson(sampleToken);

    expect(result).toBe(true);
  });

  it("throws when no tokens are staged for redemption", async () => {
    await expect(store.receiveToken("cashuAToken")).rejects.toThrow("no tokens provided.");
  });

  it("receives tokens, ensuring mint discovery and cleanup", async () => {
    tokenModule.decode.mockReturnValue(sampleToken);
    tokenModule.getProofs.mockReturnValue(sampleToken.proofs);
    tokenModule.getMint.mockReturnValue("https://mint-a");
    mintsStore.mints = [];
    lockedTokensRecords.push({ tokenString: "cashuAToken" });

    store.receiveData.tokensBase64 = "cashuAToken";
    store.receiveData.bucketId = DEFAULT_BUCKET_ID;

    await store.receiveToken("cashuAToken");

    expect(p2pkStore.getPrivateKeyForP2PKEncodedToken).toHaveBeenCalledWith(
      "cashuAToken",
    );
    expect(walletStore.redeem).toHaveBeenCalledWith("cashuAToken");
    expect(lockedTokensRecords).toHaveLength(0);
    expect(mintsStore.addMint).toHaveBeenCalledWith({ url: "https://mint-a" });
    expect(store.showReceiveTokens).toBe(false);
    expect(uiStore.closeDialogs).toHaveBeenCalled();
  });

  it("receives tokens when mint already known without adding mint", async () => {
    tokenModule.decode.mockReturnValue(sampleToken);
    tokenModule.getProofs.mockReturnValue(sampleToken.proofs);
    tokenModule.getMint.mockReturnValue("https://mint-a");
    mintsStore.mints = [{ url: "https://mint-a", keysets: [{ id: "keyset-1" }] }];

    store.receiveData.tokensBase64 = "cashuAToken";

    await store.receiveToken("cashuAToken");

    expect(mintsStore.addMint).not.toHaveBeenCalled();
  });

  it("keeps locked token rows when redemption fails", async () => {
    tokenModule.decode.mockReturnValue(sampleToken);
    tokenModule.getProofs.mockReturnValue(sampleToken.proofs);
    tokenModule.getMint.mockReturnValue("https://mint-a");
    mintsStore.mints = [{ url: "https://mint-a", keysets: [{ id: "keyset-1" }] }];
    lockedTokensRecords.push({ tokenString: "cashuAToken" });
    walletStore.redeem.mockRejectedValueOnce(new Error("redeem failed"));

    store.receiveData.tokensBase64 = "cashuAToken";

    await expect(store.receiveToken("cashuAToken")).rejects.toThrow("redeem failed");
    expect(lockedTokensRecords).toHaveLength(1);
  });

  it("receives tokens only when decoding succeeds", async () => {
    const decodeSpy = vi.spyOn(store, "decodeToken").mockReturnValue(undefined);
    store.receiveData.tokensBase64 = "cashuAToken";

    await expect(store.receiveToken("cashuAToken")).rejects.toThrow("no tokens provided.");
    expect(decodeSpy).toHaveBeenCalled();
  });

  it("queues redemption when decode succeeds", async () => {
    const receiveTokenSpy = vi.spyOn(store, "receiveToken").mockResolvedValue();
    const decodeSpy = vi.spyOn(store, "decodeToken").mockReturnValue(sampleToken);
    store.receiveData.tokensBase64 = "cashuAToken";

    const result = await store.receiveIfDecodes();

    expect(result).toBe(true);
    expect(decodeSpy).toHaveBeenCalled();
    expect(receiveTokenSpy).toHaveBeenCalled();
  });

  it("returns false when decode fails in receiveIfDecodes", async () => {
    const decodeSpy = vi.spyOn(store, "decodeToken").mockReturnValue(undefined);
    store.receiveData.tokensBase64 = "cashuAToken";

    const result = await store.receiveIfDecodes();

    expect(result).toBeUndefined();
    expect(decodeSpy).toHaveBeenCalled();
  });

  it("melts tokens to another mint and closes dialogs", async () => {
    tokenModule.decode.mockReturnValue(sampleToken);
    tokenModule.getProofs.mockReturnValue(sampleToken.proofs);
    tokenModule.getMint.mockReturnValue("https://mint-a");
    mintsStore.mints = [];

    await store.meltTokenToMint("cashuAToken", { url: "https://mint-b" } as any);

    expect(swapStore.meltProofsToMint).toHaveBeenCalledWith(sampleToken, { url: "https://mint-b" });
    expect(uiStore.closeDialogs).toHaveBeenCalled();
  });

  describe("pasteToParseDialog", () => {
    it("populates tokens when decode succeeds and not a duplicate", async () => {
      uiStore.pasteFromClipboard.mockResolvedValue(" cashuAToken \n");
      const decodeSpy = vi.spyOn(store, "decodeToken").mockReturnValue(sampleToken);
      tokensStore.tokenAlreadyInHistory.mockReturnValue(undefined);

      const result = await store.pasteToParseDialog();

      expect(result).toBe(true);
      expect(decodeSpy).toHaveBeenCalledWith(" cashuAToken \n");
      expect(store.receiveData.tokensBase64).toBe(" cashuAToken \n");
    });

    it("rejects tokens already in history", async () => {
      uiStore.pasteFromClipboard.mockResolvedValue("cashuAToken");
      vi.spyOn(store, "decodeToken").mockReturnValue(sampleToken);
      tokensStore.tokenAlreadyInHistory.mockReturnValue({ amount: 1, status: "paid" });

      const result = await store.pasteToParseDialog(true);

      expect(result).toBe(false);
      expect(notify).toHaveBeenCalledWith("Token already in history.");
    });

    it("returns false when decode fails", async () => {
      uiStore.pasteFromClipboard.mockResolvedValue("cashuAToken");
      vi.spyOn(store, "decodeToken").mockReturnValue(undefined);

      const result = await store.pasteToParseDialog();

      expect(result).toBe(false);
    });
  });
});
