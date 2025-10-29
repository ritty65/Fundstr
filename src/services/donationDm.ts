import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

export type DonationRail = "cashu" | "lightning";

export interface DonationDmPayload {
  id: string;
  amount: number;
  rail: DonationRail;
  memo?: string;
  anonymous: boolean;
}

export interface DonationDmInput {
  browserId: string;
  amount: number;
  rail: DonationRail;
  memo?: string;
  anonymous: boolean;
  targetPubkey: string;
}

export interface DonationDmResult {
  success: boolean;
  payload: DonationDmPayload;
  event?: unknown;
  localId?: string;
  eventId?: string | null;
  confirmationPending?: boolean;
  error?: unknown;
}

export function createDonationDmPayload({
  browserId,
  amount,
  rail,
  memo,
  anonymous,
  targetPubkey,
}: DonationDmInput): DonationDmPayload {
  const normalizedMemo = typeof memo === "string" ? memo.trim() : undefined;
  const memoValue = normalizedMemo ? normalizedMemo : undefined;
  const identity = deriveIdentity(browserId, targetPubkey, anonymous);

  const payload: DonationDmPayload = {
    id: identity,
    amount,
    rail,
    anonymous,
  };

  if (memoValue) {
    payload.memo = memoValue;
  }

  return payload;
}

export async function sendDonationDm(
  sendFn: (
    targetPubkey: string,
    content: string,
  ) => Promise<{
    success?: boolean;
    event?: unknown;
    localId?: string;
    eventId?: string | null;
    confirmationPending?: boolean;
  }>,
  input: DonationDmInput,
): Promise<DonationDmResult> {
  const payload = createDonationDmPayload(input);
  try {
    const result = await sendFn(
      input.targetPubkey,
      JSON.stringify(payload),
    );
    return {
      success: !!result?.success,
      payload,
      event: result?.event,
      localId: result?.localId,
      eventId: (result as any)?.eventId ?? undefined,
      confirmationPending: result?.confirmationPending,
    };
  } catch (error) {
    return {
      success: false,
      payload,
      error,
    };
  }
}

function deriveIdentity(
  browserId: string,
  targetPubkey: string,
  anonymous: boolean,
): string {
  if (!anonymous) {
    return browserId;
  }

  const encoder = new TextEncoder();
  const hashInput = encoder.encode(`${targetPubkey}:${browserId}`);
  return bytesToHex(sha256(hashInput));
}
