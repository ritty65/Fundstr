import type { Proof } from "@cashu/cashu-ts";
import type { WalletProof } from "src/types/proofs";
import type { HistoryToken } from "@/stores/tokens";

type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export const createProof = (overrides: Partial<Proof> = {}): Proof => ({
  amount: 1,
  secret: "secret-1",
  id: "keyset-1",
  C: "C-secret-1",
  ...overrides,
}) as Proof;

export const createWalletProof = (
  overrides: PartialExcept<WalletProof, "secret"> = { secret: "wallet-secret-1" },
): WalletProof => ({
  ...createProof(overrides),
  reserved: false,
  bucketId: "unassigned",
  label: "",
  description: "",
  ...overrides,
});

export const createHistoryToken = (
  overrides: Partial<HistoryToken> = {},
): HistoryToken => ({
  status: "paid",
  amount: 42,
  date: "2024-01-01 00:00:00",
  token: "cashuAexample",
  mint: "https://mint",
  unit: "sat",
  label: undefined,
  description: undefined,
  color: "#7E22CE",
  bucketId: "unassigned",
  ...overrides,
});
