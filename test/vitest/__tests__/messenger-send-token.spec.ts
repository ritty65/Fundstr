import { beforeEach, describe, expect, it, vi } from "vitest";

var walletSend: any;
var walletMintWallet: any;
var serializeProofs: any;
var addPending: any;

vi.mock("../../../src/stores/nostr", () => ({
  useNostrStore: () => ({ resolvePubkey: (pk: string) => pk }),
}));

vi.mock("../../../src/stores/wallet", () => {
  walletSend = vi.fn(async () => ({
    sendProofs: [{ secret: "s1", amount: 1 }],
  }));
  walletMintWallet = vi.fn(() => ({}));
  return {
    useWalletStore: () => ({ send: walletSend, mintWallet: walletMintWallet }),
  };
});

vi.mock("../../../src/stores/mints", () => ({
  useMintsStore: () => ({
    activeUnitCurrencyMultiplyer: 1,
    activeMintUrl: "mint",
    activeUnit: "sat",
    activeProofs: [{ secret: "a", amount: 1, id: "id", bucketId: "b" }],
  }),
}));

vi.mock("../../../src/stores/proofs", () => {
  serializeProofs = vi.fn(() => "TOKEN");
  return { useProofsStore: () => ({ serializeProofs }) };
});

vi.mock("../../../src/stores/settings", () => ({
  useSettingsStore: () => ({ includeFeesInSendAmount: false }),
}));

vi.mock("../../../src/stores/tokens", () => {
  addPending = vi.fn();
  return { useTokensStore: () => ({ addPendingToken: addPending }) };
});

vi.mock("../../../src/js/message-utils", () => ({
  sanitizeMessage: vi.fn((s: string) => s),
}));

import { useDmStore } from "../../../src/stores/dm";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("messenger.sendToken", () => {
  it("sends token DM and logs message", async () => {
    const store = useDmStore() as any;
    const sendDm = vi.fn(async () => ({ success: true, event: { id: "1", created_at: 0 } }));
    store.sendDm = sendDm;
    const success = await store.sendToken("receiver", 1, "b", "note");
    expect(success).toBe(true);
    expect(walletMintWallet).toHaveBeenCalledWith("mint", "sat");
    expect(walletSend).toHaveBeenCalled();
    expect(sendDm).toHaveBeenCalled();
    expect(addPending).toHaveBeenCalledWith({
      amount: -1,
      token: "TOKEN",
      unit: "sat",
      mint: "mint",
      bucketId: "b",
    });
    const conv = store.conversations.get("receiver");
    expect(conv?.messages.length).toBe(1);
  });
});
