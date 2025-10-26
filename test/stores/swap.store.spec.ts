import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import { useSwapStore } from "stores/swap";

const hoisted = vi.hoisted(() => {
  const walletStore = {
    mintWallet: vi.fn(),
    requestMint: vi.fn(),
    meltQuote: vi.fn(),
    melt: vi.fn(),
    checkInvoice: vi.fn(),
  } as any;
  const mintsStore = {
    activeUnit: "sat",
    mints: [] as any[],
    mintUnitProofs: vi.fn(),
  } as any;
  const proofsStore = {
    sumProofs: vi.fn(),
  } as any;
  const notifySpies = {
    notifyError: vi.fn(),
    notifyWarning: vi.fn(),
  };
  const tokenHelpers = {
    getMint: vi.fn(),
    getUnit: vi.fn(),
    getProofs: vi.fn(),
  };
  return { walletStore, mintsStore, proofsStore, notifySpies, tokenHelpers };
});

vi.mock("stores/wallet", () => ({
  useWalletStore: () => hoisted.walletStore,
}));

vi.mock("stores/mints", () => ({
  useMintsStore: () => hoisted.mintsStore,
}));

vi.mock("stores/proofs", () => ({
  useProofsStore: () => hoisted.proofsStore,
}));

vi.mock("src/js/notify", () => hoisted.notifySpies);

vi.mock("src/js/token", () => ({
  __esModule: true,
  default: hoisted.tokenHelpers,
  ...hoisted.tokenHelpers,
}));

vi.mock("src/boot/i18n", () => ({
  i18n: { global: { t: (key: string) => key } },
}));

const { walletStore, mintsStore, proofsStore, notifySpies, tokenHelpers } = hoisted;

const { notifyError, notifyWarning } = notifySpies;
const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

describe("swap store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mintsStore.activeUnit = "sat";
    mintsStore.mints = [];
    mintsStore.mintUnitProofs.mockReset();
    walletStore.mintWallet.mockReset();
    walletStore.requestMint.mockReset();
    walletStore.meltQuote.mockReset();
    walletStore.melt.mockReset();
    walletStore.checkInvoice.mockReset();
    proofsStore.sumProofs.mockReset();
    tokenHelpers.getMint.mockReset();
    tokenHelpers.getUnit.mockReset();
    tokenHelpers.getProofs.mockReset();
    consoleErrorSpy.mockImplementation(() => {});
  });

  describe("mintAmountSwap", () => {
    it("guards concurrent swaps with a warning", async () => {
      const store = useSwapStore();
      store.swapBlocking = true;

      await store.mintAmountSwap({ fromUrl: "https://from", toUrl: "https://to", amount: 5 });

      expect(notifyWarning).toHaveBeenCalledWith("swap.in_progress_warning_text");
      expect(walletStore.requestMint).not.toHaveBeenCalled();
      expect(store.swapBlocking).toBe(true);
    });

    it("rejects missing swap URLs", async () => {
      const store = useSwapStore();

      await store.mintAmountSwap({ fromUrl: undefined, toUrl: "https://to", amount: 5 });

      expect(notifyError).toHaveBeenCalledWith("swap.invalid_swap_data_error_text");
      expect(walletStore.requestMint).not.toHaveBeenCalled();
      expect(store.swapBlocking).toBe(false);
    });

    it("chooses proof bucket when available and clears blocking flag", async () => {
      const store = useSwapStore();
      const fromUrl = "https://from";
      const toUrl = "https://to";
      const proofs = [{ bucketId: "bucket-1" }];

      mintsStore.mints = [{ url: fromUrl }];
      mintsStore.mintUnitProofs.mockReturnValue(proofs);
      walletStore.mintWallet.mockImplementation((url: string, unit: string) => ({
        url,
        unit,
      }));
      walletStore.requestMint.mockResolvedValue({ request: "invoice", quote: "quote" });
      walletStore.meltQuote.mockResolvedValue({ id: "melt-quote" });
      walletStore.melt.mockResolvedValue(undefined);
      walletStore.checkInvoice.mockResolvedValue(undefined);

      await store.mintAmountSwap({ fromUrl, toUrl, amount: 10 });

      expect(walletStore.requestMint).toHaveBeenCalledWith(10, expect.objectContaining({ url: toUrl }));
      expect(walletStore.meltQuote).toHaveBeenCalledWith(
        expect.objectContaining({ url: fromUrl }),
        "invoice",
      );
      expect(walletStore.melt).toHaveBeenCalledWith(
        proofs,
        { id: "melt-quote" },
        expect.objectContaining({ url: fromUrl }),
      );
      expect(walletStore.checkInvoice).toHaveBeenCalledWith("quote", true, true, "bucket-1");
      expect(store.swapBlocking).toBe(false);
      expect(notifyError).not.toHaveBeenCalled();
    });

    it("falls back to the default bucket when no proofs are available", async () => {
      const store = useSwapStore();
      const fromUrl = "https://from";
      const toUrl = "https://to";

      mintsStore.mints = [{ url: fromUrl }];
      mintsStore.mintUnitProofs.mockReturnValue([]);
      walletStore.mintWallet.mockImplementation((url: string, unit: string) => ({ url, unit }));
      walletStore.requestMint.mockResolvedValue({ request: "invoice", quote: "quote" });
      walletStore.meltQuote.mockResolvedValue({ id: "melt-quote" });
      walletStore.melt.mockResolvedValue(undefined);
      walletStore.checkInvoice.mockResolvedValue(undefined);

      await store.mintAmountSwap({ fromUrl, toUrl, amount: 7 });

      expect(walletStore.checkInvoice).toHaveBeenCalledWith("quote", true, true, DEFAULT_BUCKET_ID);
      expect(store.swapBlocking).toBe(false);
    });

    it("clears swapBlocking and reports errors on failure", async () => {
      const store = useSwapStore();
      const fromUrl = "https://from";
      const toUrl = "https://to";

      mintsStore.mints = [{ url: fromUrl }];
      mintsStore.mintUnitProofs.mockReturnValue([{ bucketId: "bucket-1" }]);
      walletStore.mintWallet.mockImplementation((url: string, unit: string) => ({ url, unit }));
      walletStore.requestMint.mockRejectedValue(new Error("mint failure"));

      await store.mintAmountSwap({ fromUrl, toUrl, amount: 3 });

      expect(notifyError).toHaveBeenCalledWith("swap.swap_error_text");
      expect(store.swapBlocking).toBe(false);
    });
  });

  describe("meltToMintFees", () => {
    it("deducts base and per-proof fees when the mint wallet exists", () => {
      const store = useSwapStore();
      const proofs = [{ bucketId: "bucket" }];

      tokenHelpers.getMint.mockReturnValue("https://from");
      tokenHelpers.getUnit.mockReturnValue("sat");
      tokenHelpers.getProofs.mockReturnValue(proofs);
      proofsStore.sumProofs.mockReturnValue(200);
      walletStore.mintWallet.mockImplementation(() => ({
        getFeesForProofs: vi.fn(() => 6),
      }));

      const fees = store.meltToMintFees({} as any);

      expect(fees).toBe(10);
      expect(walletStore.mintWallet).toHaveBeenCalledWith("https://from", "sat");
    });

    it("falls back to only the base fee when the mint wallet is missing", () => {
      const store = useSwapStore();

      tokenHelpers.getMint.mockReturnValue("https://missing");
      tokenHelpers.getUnit.mockReturnValue("sat");
      tokenHelpers.getProofs.mockReturnValue([{ amount: 50 }]);
      proofsStore.sumProofs.mockReturnValue(50);
      walletStore.mintWallet.mockImplementation(() => {
        throw new Error("no wallet");
      });

      const fees = store.meltToMintFees({} as any);

      expect(fees).toBe(2);
      expect(notifyError).not.toHaveBeenCalled();
    });
  });

  describe("meltProofsToMint", () => {
    it("skips when a swap is already in progress", async () => {
      const store = useSwapStore();
      store.swapBlocking = true;

      await store.meltProofsToMint({} as any, { url: "https://to" } as any);

      expect(notifyWarning).toHaveBeenCalledWith("swap.in_progress_warning_text");
      expect(walletStore.requestMint).not.toHaveBeenCalled();
    });

    it("mints using the melt amount after fees and settles with the correct bucket", async () => {
      const store = useSwapStore();
      const tokenJson = {} as any;
      const proofs = [{ amount: 120, bucketId: "bucket-42" }];

      tokenHelpers.getMint.mockReturnValue("https://from");
      tokenHelpers.getUnit.mockReturnValue("sat");
      tokenHelpers.getProofs.mockReturnValue(proofs);
      proofsStore.sumProofs.mockReturnValue(200);
      walletStore.mintWallet.mockImplementation((url: string) => {
        if (url === "https://from") {
          return { url, unit: "sat", getFeesForProofs: vi.fn(() => 6) };
        }
        return { url, unit: "sat" };
      });
      walletStore.requestMint.mockResolvedValue({ request: "invoice", quote: "quote" });
      walletStore.meltQuote.mockResolvedValue({ id: "melt-quote" });
      walletStore.melt.mockResolvedValue(undefined);
      walletStore.checkInvoice.mockResolvedValue(undefined);

      await store.meltProofsToMint(tokenJson, { url: "https://to" } as any);

      expect(walletStore.requestMint).toHaveBeenCalledWith(190, expect.objectContaining({ url: "https://to" }));
      expect(walletStore.meltQuote).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://from" }),
        "invoice",
      );
      expect(walletStore.melt).toHaveBeenCalledWith(
        proofs,
        { id: "melt-quote" },
        expect.objectContaining({ url: "https://from" }),
      );
      expect(walletStore.checkInvoice).toHaveBeenCalledWith("quote", true, true, "bucket-42");
      expect(store.swapBlocking).toBe(false);
    });

    it("reports errors and releases the blocking flag when mint lookup fails", async () => {
      const store = useSwapStore();

      tokenHelpers.getMint.mockReturnValue("https://missing");
      tokenHelpers.getUnit.mockReturnValue("sat");
      tokenHelpers.getProofs.mockReturnValue([{ amount: 1 }]);
      proofsStore.sumProofs.mockReturnValue(10);
      walletStore.mintWallet.mockImplementation(() => {
        throw new Error("missing mint");
      });

      await store.meltProofsToMint({} as any, { url: "https://to" } as any);

      expect(notifyError).toHaveBeenCalledWith("swap.swap_error_text");
      expect(store.swapBlocking).toBe(false);
    });
  });
});
