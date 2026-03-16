import { describe, it, expect, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

import {
  createDonationDmPayload,
  sendDonationDm,
} from "../../../src/services/donationDm";

describe("donation DM helpers", () => {
  it("returns browser identifier when anonymity is disabled", () => {
    const payload = createDonationDmPayload({
      browserId: "browser-123",
      amount: 2100,
      rail: "cashu",
      memo: "  Thank you!  ",
      anonymous: false,
      targetPubkey: "abcdef",
    });

    expect(payload.id).toBe("browser-123");
    expect(payload.anonymous).toBe(false);
    expect(payload.memo).toBe("Thank you!");
    expect(payload.amount).toBe(2100);
    expect(payload.rail).toBe("cashu");
  });

  it("hashes the identifier when anonymity is enabled", () => {
    const input = {
      browserId: "browser-123",
      amount: 5000,
      rail: "cashu" as const,
      memo: undefined,
      anonymous: true,
      targetPubkey: "target-pubkey",
    };

    const payload = createDonationDmPayload(input);
    const expected = bytesToHex(
      sha256(new TextEncoder().encode(`${input.targetPubkey}:${input.browserId}`)),
    );

    expect(payload.id).toBe(expected);
    expect(payload.anonymous).toBe(true);
    expect(payload.memo).toBeUndefined();
  });

  it("resolves with success metadata when DM send succeeds", async () => {
    const sendFn = vi.fn(async () => ({ success: true, event: { id: "evt" } }));

    const result = await sendDonationDm(sendFn, {
      browserId: "browser-123",
      amount: 100,
      rail: "lightning",
      memo: "hello",
      anonymous: false,
      targetPubkey: "pubkey",
    });

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(sendFn.mock.calls[0][0]).toBe("pubkey");
    expect(JSON.parse(sendFn.mock.calls[0][1])).toEqual(result.payload);
    expect(result.success).toBe(true);
    expect(result.event).toEqual({ id: "evt" });
  });

  it("handles send failures without throwing", async () => {
    const sendFn = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      sendDonationDm(sendFn, {
        browserId: "browser-123",
        amount: 75,
        rail: "cashu",
        memo: "",
        anonymous: true,
        targetPubkey: "pubkey",
      }),
    ).resolves.toMatchObject({ success: false });
  });
});
