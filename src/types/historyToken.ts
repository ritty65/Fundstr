import type { PaymentRequest } from "@cashu/cashu-ts";

export interface HistoryToken {
  id?: string;
  status: "paid" | "pending";
  amount: number;
  date: string;
  token: string;
  mint: string;
  unit: string;
  label?: string;
  color?: string;
  description?: string;
  paymentRequest?: PaymentRequest;
  fee?: number;
  bucketId: string;
  referenceId?: string;
  archived?: boolean;
  archivedAt?: string | null;
  createdAt?: number;
}
