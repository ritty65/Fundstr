import { describe, it, expect } from "vitest";

import { getAmountForTokenSet, getTokenAmounts } from "src/js/wallet-helpers";

describe("wallet helper utilities", () => {
  const makeToken = (overrides = {}) => ({
    mint: "https://example.com", 
    unit: "sat",
    proofs: [],
    ...overrides,
  });

  const makeProof = (amount) => ({ amount });

  describe("getAmountForTokenSet", () => {
    it("returns 0 when no proofs exist", () => {
      expect(getAmountForTokenSet(makeToken())).toBe(0);
      expect(getAmountForTokenSet(null)).toBe(0);
      expect(getAmountForTokenSet(undefined)).toBe(0);
    });

    it("sums amounts across nested proof arrays", () => {
      const token = makeToken({
        proofs: [
          [makeProof(2), makeProof(3)],
          [makeProof(5)],
        ],
      });
      expect(getAmountForTokenSet(token)).toBe(10);
    });

    it("ignores non-numeric proof amounts", () => {
      const token = makeToken({
        proofs: [[makeProof(2), { amount: "4" }, { amount: "not-a-number" }]],
      });
      expect(getAmountForTokenSet(token)).toBe(6);
    });
  });

  describe("getTokenAmounts", () => {
    it("returns empty array for invalid inputs", () => {
      expect(getTokenAmounts()).toEqual([]);
      expect(getTokenAmounts(null)).toEqual([]);
      expect(getTokenAmounts([])).toEqual([]);
    });

    it("groups balances by mint and unit", () => {
      const tokens = [
        makeToken({ mint: "https://a", unit: "sat", proofs: [[makeProof(5)]] }),
        makeToken({ mint: "https://a", unit: "sat", proofs: [[makeProof(10)]] }),
        makeToken({ mint: "https://a", unit: "usd", proofs: [[makeProof(3)]] }),
        makeToken({ mint: "https://b", unit: "sat", proofs: [[makeProof(8)]] }),
      ];

      expect(getTokenAmounts(tokens)).toEqual([
        { mint: "https://a", unit: "sat", amount: 15 },
        { mint: "https://a", unit: "usd", amount: 3 },
        { mint: "https://b", unit: "sat", amount: 8 },
      ]);
    });

    it("defaults missing units to sat and skips malformed entries", () => {
      const tokens = [
        makeToken({ mint: "https://mint", unit: "", proofs: [[makeProof(7)]] }),
        { mint: "https://mint", proofs: [[makeProof(1), makeProof(2)]] },
        { mint: "https://mint", unit: "sat" },
        { unit: "sat", proofs: [[makeProof(4)]] },
      ];

      expect(getTokenAmounts(tokens)).toEqual([
        { mint: "https://mint", unit: "sat", amount: 10 },
        { mint: "", unit: "sat", amount: 4 },
      ]);
    });
  });
});
