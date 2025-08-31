import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

var sendNip17: any;
var sendDmLegacy: any;
var walletSend: any;
var walletMintWallet: any;
var serializeProofs: any;
var addPending: any;
const lsStore: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (k: string) => (k in lsStore ? lsStore[k] : null),
  setItem: (k: string, v: string) => {
    lsStore[k] = String(v);
  },
  removeItem: (k: string) => {
    delete lsStore[k];
  },
  clear: () => {
    for (const k in lsStore) delete lsStore[k];
  },
  key: (i: number) => Object.keys(lsStore)[i] ?? null,
  get length() {
    return Object.keys(lsStore).length;
  },
};

vi.mock("../../../src/stores/nostr", async (importOriginal) => {
  const actual = await importOriginal();
  sendNip17 = vi.fn(async () => ({
    success: true,
    event: { id: "1", created_at: 0 },
  }));
  sendDmLegacy = vi.fn(async () => ({
    success: true,
    event: { id: "1", created_at: 0 },
  }));
  return {
    ...actual,
    useNostrStore: () => ({
      sendNip17DirectMessage: sendNip17,
      sendDirectMessageUnified: sendDmLegacy,
      initSignerIfNotSet: vi.fn(),
      privateKeySignerPrivateKey: "priv",
      seedSignerPrivateKey: "",
      pubkey: "pub",
      signerType: "seed",
      connected: true,
      lastError: null,
      relays: [] as string[],
      fetchUserRelays: vi.fn(async () => []),
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

vi.mock("../../../src/js/notify", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

import { useMessengerStore } from "../../../src/stores/messenger";

beforeEach(() => {
  setActivePinia(createPinia());
  for (const k in lsStore) delete lsStore[k];
  const m = useMessengerStore();
  (m as any).eventLog = [];
  (m as any).conversations = {};
  vi.clearAllMocks();
});

describe("messenger.sendToken", () => {
  it("sends token DM and logs message", async () => {
    const store = useMessengerStore();
    const success = await store.sendToken("receiver", 1, "b", "note");
    expect(success).toBe(true);
    expect(walletMintWallet).toHaveBeenCalledWith("mint", "sat");
    expect(walletSend).toHaveBeenCalled();
    expect(sendNip17).toHaveBeenCalledWith(
      "receiver",
      expect.stringContaining('"token":"TOKEN"'),
      expect.anything(),
    );
    expect(sendDmLegacy).not.toHaveBeenCalled();
    expect(addPending).toHaveBeenCalledWith({
      amount: -1,
      tokenStr: "TOKEN",
      unit: "sat",
      mint: "mint",
      description: "note",
      bucketId: "b",
    });
    expect(store.conversations.receiver.length).toBe(1);
  });
});
