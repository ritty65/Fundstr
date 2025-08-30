import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

var sendNip04Dm: any;
var sendNip17Dm: any;
var canUseNip17: any;
var walletSend: any;
var walletMintWallet: any;
var serializeProofs: any;
var addPending: any;

vi.mock("../../../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  sendNip04Dm = vi.fn(async () => ({
    success: true,
    event: { id: "1", created_at: 0 },
  }));
  sendNip17Dm = vi.fn(async () => ({ id: "1", created_at: 0 }));
  canUseNip17 = vi.fn(async () => null);
  return {
    ...actual,
    useNostrStore: () => ({
      sendNip04DirectMessage: sendNip04Dm,
      sendNip17DirectMessage: sendNip17Dm,
      canUseNip17,
      initSignerIfNotSet: vi.fn(),
      privateKeySignerPrivateKey: "priv",
      seedSignerPrivateKey: "",
      pubkey: "pub",
      signerType: "seed",
      connected: true,
      lastError: null,
      relays: [] as string[],
      get privKeyHex() {
        return this.privateKeySignerPrivateKey;
      },
    }),
  };
});

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

var notifySpy: any;
var notifyErrorSpy: any;
vi.mock("../../../src/js/notify", () => {
  notifySpy = vi.fn();
  notifyErrorSpy = vi.fn();
  return { notifySuccess: notifySpy, notifyError: notifyErrorSpy };
});

import { useMessengerStore } from "../../../src/stores/messenger";

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setActivePinia(createPinia());
  const messenger = useMessengerStore();
  (messenger as any).eventLog = [];
});

describe("messenger.sendToken", () => {
  it("sends token DM and logs message", async () => {
    const store = useMessengerStore();
    const success = await store.sendToken("receiver", 1, "b", "note");
    expect(success).toBe(true);
    expect(walletMintWallet).toHaveBeenCalledWith("mint", "sat");
    expect(walletSend).toHaveBeenCalled();
    expect(sendNip04Dm).toHaveBeenCalledWith(
      "receiver",
      expect.stringContaining('"token":"TOKEN"'),
      "priv",
      "pub",
      expect.any(Array),
    );
    expect(addPending).toHaveBeenCalledWith({
      amount: -1,
      tokenStr: "TOKEN",
      unit: "sat",
      mint: "mint",
      bucketId: "b",
      description: "note",
    });
    expect(store.conversations.receiver.length).toBe(1);
  });
});
