import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const notifySpies = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@/js/notify", () => ({
  notifySuccess: notifySpies.success,
  notifyError: notifySpies.error,
  notifyWarning: notifySpies.warning,
}));

const notifySuccess = notifySpies.success;
const notifyError = notifySpies.error;
const notifyWarning = notifySpies.warning;

const httpMocks = vi.hoisted(() => ({
  publishEventViaHttp: vi.fn(),
  requestEventsViaHttp: vi.fn(),
}));
vi.mock("@/utils/fundstrRelayHttp", () => ({
  publishEventViaHttp: httpMocks.publishEventViaHttp,
  requestEventsViaHttp: httpMocks.requestEventsViaHttp,
}));
const publishEventViaHttp = httpMocks.publishEventViaHttp;

vi.mock("@/stores/settings", () => ({ useSettingsStore: () => ({}) }));
vi.mock("@/stores/wallet", () => ({ useWalletStore: () => ({}) }));
vi.mock("@/stores/mints", () => ({ useMintsStore: () => ({}) }));
vi.mock("@/stores/proofs", () => ({ useProofsStore: () => ({}) }));
vi.mock("@/stores/tokens", () => ({ useTokensStore: () => ({}) }));
vi.mock("@/stores/receiveTokensStore", () => ({ useReceiveTokensStore: () => ({}) }));
vi.mock("@/stores/buckets", () => ({ useBucketsStore: () => ({}) }));
vi.mock("@/stores/lockedTokens", () => ({ useLockedTokensStore: () => ({}) }));
vi.mock("@/stores/dmChats", () => ({ useDmChatsStore: () => ({}) }));
vi.mock("@/stores/creators", () => ({ useCreatorsStore: () => ({}) }));

vi.mock("@/stores/messengerDb", () => ({
  loadConversationState: vi.fn(),
  loadMessengerMessages: vi.fn(),
  messengerDb: {},
  removeConversationState: vi.fn(),
  saveMessengerMessage: vi.fn(),
  saveMessengerMessages: vi.fn(),
  getDueOutboxItems: vi.fn().mockResolvedValue([]),
  rankRelays: vi.fn(),
  recordRelayResult: vi.fn(),
  upsertOutbox: vi.fn(),
  updateOutboxStatus: vi.fn(),
  writeConversationMeta: vi.fn(),
}));

vi.mock("@/stores/dexie", () => ({ cashuDb: {} }));

vi.mock("@/utils/messengerFiles", () => ({
  buildEventContent: () => ({}),
  extractFilesFromContent: () => [],
  normalizeFileMeta: (input: any) => input,
  stripFileMetaLines: (input: string) => input,
}));

vi.mock("@/config/relays", () => ({ DEFAULT_RELAYS: [], FREE_RELAYS: [], VETTED_OPEN_WRITE_RELAYS: [] }));
vi.mock("@/js/message-utils", () => ({ sanitizeMessage: (value: string) => value }));
vi.mock("@/js/token", () => ({ default: {} }));
vi.mock("@/utils/receipt-utils", () => ({ subscriptionPayload: vi.fn() }));
vi.mock("@/constants/subscriptionFrequency", () => ({ frequencyToDays: vi.fn() }));
vi.mock("@/composables/useNdk", () => ({ useNdk: () => ({}) }));
vi.mock("@/nutzap/relayPublishing", () => ({ ensureFundstrRelayClient: vi.fn() }));
vi.mock("@/nutzap/relayClient", () => ({ useFundstrRelayStatus: () => ({}) }));

const nostrStore = { connected: false, privKeyHex: null, signer: undefined } as any;
vi.mock("@/stores/nostr", () => ({
  SignerType: { SEED: "seed", NIP07: "nip07", NIP46: "nip46", PRIVATEKEY: "private" },
  useNostrStore: () => nostrStore,
}));

const dmSignerMocks = vi.hoisted(() => ({
  getActiveDmSigner: vi.fn(),
}));
vi.mock("@/nostr/dmSigner", () => ({
  getActiveDmSigner: dmSignerMocks.getActiveDmSigner,
  buildAuthEvent: vi.fn(),
  buildKind4Event: vi.fn(),
}));
const getActiveDmSigner = dmSignerMocks.getActiveDmSigner;


import { useMessengerStore } from "@/stores/messenger";

const createMessage = () => ({
  id: "local",
  pubkey: "sender",
  content: "",
  created_at: Math.floor(Date.now() / 1000),
  outgoing: true,
  localEcho: undefined,
}) as any;

const createMeta = () => ({
  localId: "local",
  status: "pending",
  relayResults: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
  attempt: 0,
  payload: { content: "" },
}) as any;

describe("messenger send queue signer fallbacks", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    publishEventViaHttp.mockReset();
    publishEventViaHttp.mockResolvedValue({ accepted: true, message: "ok" });
    notifySuccess.mockReset();
    notifyError.mockReset();
    notifyWarning.mockReset();
    getActiveDmSigner.mockReset();
  });

  afterEach(() => {
    nostrStore.connected = false;
    nostrStore.signer = undefined;
    nostrStore.privKeyHex = null;
  });

  it("succeeds when only internal signer is available", async () => {
    const signer = {
      getPubkeyHex: vi.fn().mockResolvedValue("deadbeef"),
      signEvent: vi.fn().mockImplementation(async (event: any) => ({
        ...event,
        id: "signed",
        sig: "signature",
      })),
      nip04Encrypt: vi.fn().mockImplementation(async (_recipient: string, plaintext: string) => `enc:${plaintext}`),
      nip04Decrypt: vi.fn(),
    };
    getActiveDmSigner.mockResolvedValue({ mode: "software", signer });

    const store = useMessengerStore();
    store.loadIdentity = vi.fn().mockResolvedValue(undefined);
    store.refreshSignerMode = vi.fn().mockResolvedValue(undefined);
    store.markLocalEchoFailed = vi.fn();
    store.markLocalEchoSent = vi.fn();
    store.registerMessage = vi.fn();
    store.mergeRelayAckResults = vi.fn();
    store.confirmMessageDelivery = vi.fn();
    store.startHttpPolling = vi.fn();

    const msg = createMessage();
    const meta = createMeta();

    const result = await store.executeSendWithMeta({
      msg,
      meta,
      recipient: "cafebabe",
      contentToSend: "hello",
      textContent: "hello",
    });

    expect(result.success).toBe(true);
    expect(result.event?.id).toBe("signed");
    expect(store.signerMode).toBe("software");
    expect(notifySuccess).toHaveBeenCalledWith("DM sent");
    expect(store.markLocalEchoSent).toHaveBeenCalled();
  });

  it("fails gracefully when no signer is available", async () => {
    getActiveDmSigner.mockResolvedValue(null);

    const store = useMessengerStore();
    store.loadIdentity = vi.fn().mockResolvedValue(undefined);
    store.refreshSignerMode = vi.fn().mockResolvedValue(undefined);
    store.markLocalEchoFailed = vi.fn();
    store.markLocalEchoSent = vi.fn();
    store.registerMessage = vi.fn();
    store.mergeRelayAckResults = vi.fn();
    store.confirmMessageDelivery = vi.fn();
    store.startHttpPolling = vi.fn();

    const msg = createMessage();
    const meta = createMeta();

    const result = await store.executeSendWithMeta({
      msg,
      meta,
      recipient: "cafebabe",
      contentToSend: "hello",
      textContent: "hello",
    });

    expect(result.success).toBe(false);
    expect(result.event).toBeNull();
    expect(notifyError).toHaveBeenCalledWith("No signer available for direct messages");
    expect(store.markLocalEchoFailed).toHaveBeenCalledWith(
      msg,
      meta,
      "No signer available for direct messages",
      expect.objectContaining({ signer: expect.any(Object) }),
    );
  });
});
