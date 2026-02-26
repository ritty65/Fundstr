import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";

var publishMock: any;
vi.mock("nostr-tools", async (orig) => {
  const actual = await orig();
  publishMock = vi.fn(async () => {});
  return { ...actual, SimplePool: class { publish = publishMock } };
});

var walletSend: any;
var walletMintWallet: any;
var serializeProofs: any;
var addProofs: any;
var addPending: any;
var deleteToken: any;
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
  const store = {
    initSignerIfNotSet: vi.fn(),
    privKeyHex: "priv",
    pubkey: "pub",
    signerType: "NIP07",
    connected: true,
    fetchUserRelays: vi.fn(async () => []),
  } as any;
  return { ...actual, useNostrStore: () => store };
});

vi.mock("../../../src/stores/wallet", () => {
  walletSend = vi.fn(async () => ({
    sendProofs: [
      { secret: "s1", amount: 1, id: "id1", C: "C1" },
    ],
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
  addProofs = vi.fn();
  return { useProofsStore: () => ({ serializeProofs, addProofs }) };
});

vi.mock("../../../src/stores/settings", () => ({
  useSettingsStore: () => ({ includeFeesInSendAmount: false }),
}));

vi.mock("../../../src/stores/tokens", () => {
  addPending = vi.fn();
  deleteToken = vi.fn();
  return { useTokensStore: () => ({ addPendingToken: addPending, deleteToken }) };
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
  publishMock.mockClear();
  walletSend.mockClear();
  walletMintWallet.mockClear();
  serializeProofs.mockClear();
  addProofs.mockClear();
  addPending.mockClear();
  deleteToken.mockClear();
});

describe("messenger.sendToken", () => {
  it("sends token DM and logs message", async () => {
    const store = useMessengerStore();
    const sendDmMock = vi.fn(async () => ({
      success: true,
      event: null,
      localId: "local",
    }));
    (store as any).sendDm = sendDmMock;
    const success = await store.sendToken("receiver", 1, "b", "note");
    expect(success).toBe(true);
    expect(walletMintWallet).toHaveBeenCalledWith("mint", "sat");
    expect(walletSend).toHaveBeenCalled();
    expect(sendDmMock).toHaveBeenCalled();
    const [_, messageRaw, , , tokenPayload] = sendDmMock.mock.calls[0];
    expect(tokenPayload).toMatchObject({
      token: "TOKEN",
      amount: 1,
      memo: "note",
      bucketId: "b",
      recovery: {
        bucketId: "b",
        encodedProofs: "TOKEN",
        proofs: [expect.objectContaining({ secret: "s1", amount: 1, id: "id1" })],
        restored: false,
      },
      referenceId: expect.any(String),
    });
    const parsedMessage = JSON.parse(messageRaw);
    expect(parsedMessage.referenceId).toBe(tokenPayload.referenceId);
    expect(addPending).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: -1,
        tokenStr: "TOKEN",
        unit: "sat",
        mint: "mint",
        description: "note",
        bucketId: "b",
        referenceId: tokenPayload.referenceId,
      }),
    );
  });

  it("restores proofs and bucket balance when DM send fails", async () => {
    const store = useMessengerStore();
    (store as any).sendDm = vi.fn(async () => ({
      success: false,
      event: null,
      confirmationPending: false,
    }));

    const success = await store.sendToken("receiver", 1, "b", "note");

    expect(success).toBe(false);
    expect(addProofs).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ secret: "s1", amount: 1, id: "id1" }),
      ]),
      undefined,
      "b",
      "",
      "note",
    );
    expect(deleteToken).toHaveBeenCalledWith("TOKEN");
    expect(addPending).not.toHaveBeenCalled();
  });
});
