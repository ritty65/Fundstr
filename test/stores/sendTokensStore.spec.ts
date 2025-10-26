import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { useSendTokensStore } from "@/stores/sendTokensStore";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

const prefillStore = (store: ReturnType<typeof useSendTokensStore>) => {
  store.showSendTokens = true;
  store.showLockInput = true;
  store.recipientPubkey = "npub1recipient";
  store.sendViaNostr = true;
  store.sendData.amount = 42;
  store.sendData.historyAmount = 21;
  store.sendData.memo = "Test memo";
  store.sendData.tokens = "encodedTokens";
  store.sendData.tokensBase64 = "base64Tokens";
  store.sendData.p2pkPubkey = "p2pkpubkey";
  store.sendData.locktime = 123456789;
  store.sendData.paymentRequest = {
    amount: 1,
    bolt11: "lnbc1...",
    description: "Test",
    hash: "hash",
    pubkey: "pubkey",
    tag: "payment_hash",
  } as unknown as typeof store.sendData.paymentRequest;
  store.sendData.historyToken = {
    id: "history-token-id",
    mint: "mint-url",
    amount: 1,
    memo: "memo",
    createdAt: new Date().toISOString(),
  };
  store.sendData.bucketId = "custom-bucket";
  store.sendData.anonymous = true;
};

describe("sendTokensStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("clearSendData restores defaults and clears external flags", () => {
    const store = useSendTokensStore();
    prefillStore(store);

    store.clearSendData();

    expect(store.showSendTokens).toBe(false);
    expect(store.showLockInput).toBe(false);
    expect(store.recipientPubkey).toBe("");
    expect(store.sendViaNostr).toBe(false);
    expect(store.sendData.amount).toBeNull();
    expect(store.sendData.historyAmount).toBeNull();
    expect(store.sendData.memo).toBe("");
    expect(store.sendData.tokens).toBe("");
    expect(store.sendData.tokensBase64).toBe("");
    expect(store.sendData.p2pkPubkey).toBe("");
    expect(store.sendData.locktime).toBeNull();
    expect(store.sendData.paymentRequest).toBeUndefined();
    expect(store.sendData.historyToken).toBeUndefined();
    expect(store.sendData.bucketId).toBe(DEFAULT_BUCKET_ID);
    expect(store.sendData.anonymous).toBe(false);
  });

  it("clearSendData resets future fields defined on sendData", () => {
    const store = useSendTokensStore();
    const defaultSnapshot = { ...store.sendData };
    const sendDataKeys = Object.keys(defaultSnapshot).sort();

    // Test guard: ensures expectations are updated whenever sendData gains new fields.
    expect(sendDataKeys).toEqual(Object.keys(store.sendData).sort());

    prefillStore(store);

    for (const key of sendDataKeys) {
      (store.sendData as Record<string, unknown>)[key] = `__modified_${key}__`;
    }

    store.clearSendData();

    for (const key of sendDataKeys) {
      expect((store.sendData as Record<string, unknown>)[key]).toEqual(
        (defaultSnapshot as Record<string, unknown>)[key],
      );
    }
  });
});
