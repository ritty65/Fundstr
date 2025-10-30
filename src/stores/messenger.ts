import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { watch, computed, ref, type Ref } from "vue";
import { liveQuery } from "dexie";
import { Event as NostrEvent } from "nostr-tools";
import { SignerType, useNostrStore, type RelayAck } from "./nostr";
import { v4 as uuidv4 } from "uuid";
import { useSettingsStore } from "./settings";
import { DEFAULT_RELAYS } from "src/config/relays";
import { sanitizeMessage } from "src/js/message-utils";
import { notifySuccess, notifyError, notifyWarning } from "src/js/notify";
import { useWalletStore } from "./wallet";
import { useMintsStore } from "./mints";
import { useProofsStore } from "./proofs";
import { useTokensStore } from "./tokens";
import type { WalletProof } from "src/types/proofs";
import { useReceiveTokensStore } from "./receiveTokensStore";
import { useBucketsStore } from "./buckets";
import { useLockedTokensStore } from "./lockedTokens";
import { useDmChatsStore } from "./dmChats";
import { cashuDb, type LockedToken } from "./dexie";
import {
  loadConversationState,
  loadMessengerMessages,
  messengerDb,
  removeConversationState,
  saveMessengerMessage,
  saveMessengerMessages,
  getDueOutboxItems,
  rankRelays,
  recordRelayResult,
  upsertOutbox,
  updateOutboxStatus,
  type MessengerOutboxRecord,
  writeConversationMeta,
  type ConversationMetaKey,
  type ConversationMetaValue,
} from "./messengerDb";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import tokenUtil from "src/js/token";
import { subscriptionPayload } from "src/utils/receipt-utils";
import { useCreatorsStore } from "./creators";
import { frequencyToDays } from "src/constants/subscriptionFrequency";
import { useNdk } from "src/composables/useNdk";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import {
  publishEventViaHttp,
  requestEventsViaHttp,
  type HttpPublishAck,
} from "@/utils/fundstrRelayHttp";
import {
  DM_RELAYS,
  DM_HTTP_EVENT_URL,
  DM_HTTP_REQ_URL,
  DM_HTTP_ACK_TIMEOUT_MS,
  DM_POLL_INTERVAL_MS,
  DM_REQUIRE_AUTH,
  DM_AUTH_CACHE_MS,
  type DmSignerMode,
  type DmTransportMode,
} from "@/config/dm";
import {
  getActiveDmSigner,
  buildKind4Event,
  buildAuthEvent,
} from "@/nostr/dmSigner";
import { ensureFundstrRelayClient } from "@/nutzap/relayPublishing";
import {
  useFundstrRelayStatus,
  type FundstrRelayAuthOptions,
} from "@/nutzap/relayClient";
import {
  buildEventContent,
  extractFilesFromContent,
  normalizeFileMeta,
  stripFileMetaLines,
} from "src/utils/messengerFiles";
import type { FileMeta } from "src/utils/messengerFiles";

export type DedupMergeReason =
  | "event-map"
  | "conversation"
  | "event-log"
  | "local-echo";

export interface DedupMergeResult {
  message: MessengerMessage;
  created: boolean;
  deduped: boolean;
  reason?: DedupMergeReason;
}

export interface DedupMergeParams {
  eventId?: string | null;
  eventMap: Record<string, MessengerMessage>;
  eventLog: MessengerMessage[];
  conversation: MessengerMessage[];
  localEchoIndex: Record<string, MessengerMessage>;
  createMessage: () => MessengerMessage;
  onRegister?: (message: MessengerMessage) => void;
}

function insertUniqueMessage(
  list: MessengerMessage[],
  message: MessengerMessage,
) {
  let exists = false;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const entry = list[i];
    if (entry === message) {
      exists = true;
      continue;
    }
    if (entry.id === message.id) {
      list.splice(i, 1);
    }
  }
  if (!exists) {
    list.push(message);
  }
}

export function mergeMessengerEvent(params: DedupMergeParams): DedupMergeResult {
  const {
    eventId,
    eventMap,
    eventLog,
    conversation,
    localEchoIndex,
    createMessage,
    onRegister,
  } = params;

  const lookupLocalEcho = () =>
    Object.values(localEchoIndex).find((entry) => {
      const echo = entry.localEcho;
      if (!echo) return false;
      return echo.eventId === eventId || entry.id === eventId;
    });

  let existing: MessengerMessage | undefined;
  let reason: DedupMergeReason | undefined;
  if (eventId && eventMap[eventId]) {
    existing = eventMap[eventId];
    reason = "event-map";
  } else if (eventId) {
    existing = conversation.find((m) => m.id === eventId);
    if (existing) {
      reason = "conversation";
    }
  }

  if (!existing && eventId) {
    existing = eventLog.find((m) => m.id === eventId);
    if (existing) {
      reason = "event-log";
    }
  }

  if (!existing && eventId) {
    existing = lookupLocalEcho();
    if (existing) {
      reason = "local-echo";
    }
  }

  if (existing) {
    insertUniqueMessage(conversation, existing);
    insertUniqueMessage(eventLog, existing);
    if (eventId) {
      eventMap[eventId] = existing;
    }
    if (existing.id) {
      eventMap[existing.id] = existing;
    }
    const echo = existing.localEcho;
    if (echo?.eventId) {
      eventMap[echo.eventId] = existing;
    }
    if (echo?.localId) {
      localEchoIndex[echo.localId] = existing;
    }
    onRegister?.(existing);
    return {
      message: existing,
      created: false,
      deduped: true,
      reason,
    };
  }

  const message = createMessage();
  insertUniqueMessage(conversation, message);
  insertUniqueMessage(eventLog, message);
  if (message.id) {
    eventMap[message.id] = message;
  }
  if (eventId) {
    eventMap[eventId] = message;
  }
  const echo = message.localEcho;
  if (echo?.eventId) {
    eventMap[echo.eventId] = message;
  }
  if (echo?.localId) {
    localEchoIndex[echo.localId] = message;
  }
  onRegister?.(message);
  return {
    message,
    created: true,
    deduped: false,
    reason: undefined,
  };
}

interface ConversationSubscriptionHandle {
  pubkey: string;
  stop: () => void;
  fetchEvent: (eventId: string, meta?: { reason?: string }) => Promise<boolean>;
}

let activeConversationSubscription: ConversationSubscriptionHandle | null = null;
let conversationWatchStop: null | (() => void) = null;
let conversationRelayOff: null | (() => void) = null;

let lastDecryptError = 0;

const SIGNER_INIT_RETRY_WINDOW_MS = 30_000;

interface SignerInitOutcome {
  timestamp: number;
  success: boolean;
}

function parseSubscriptionPaymentPayload(obj: any):
  | {
      token: string;
      unlock_time?: number;
      htlc_hash?: string;
      htlc_secret?: string;
    }
  | undefined {
  if (obj?.type !== "cashu_subscription_payment" || !obj.token) return;
  return {
    token: obj.token,
    unlock_time: obj.unlock_time,
    htlc_hash: obj.htlc_hash,
    htlc_secret: obj.htlc_secret,
  };
}

export interface SubscriptionPayment {
  token: string;
  subscription_id: string;
  tier_id: string;
  month_index: number;
  total_months: number;
  amount: number;
  unlock_time?: number;
}

export interface MessageAttachment {
  type: string;
  name: string;
}

export type LocalEchoStatus = "pending" | "sent" | "failed";

export interface LocalEchoMeta {
  localId: string;
  eventId?: string | null;
  status: LocalEchoStatus;
  relayResults: Record<string, RelayAck>;
  createdAt: number;
  updatedAt: number;
  lastAckAt?: number | null;
  timerStartedAt?: number | null;
  error?: string | null;
  relays?: string[];
  attempt: number;
  payload: {
    content: string;
    text?: string;
    attachment?: MessageAttachment;
    tokenPayload?: any;
    filesPayload?: FileMeta[];
  };
}

export type MessengerMessageStatus = LocalEchoStatus | "confirmed";

export type MessengerMessage = {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  outgoing: boolean;
  status?: MessengerMessageStatus;
  protocol?: "nip17" | "nip04";
  attachment?: MessageAttachment;
  subscriptionPayment?: SubscriptionPayment;
  tokenPayload?: any;
  filesPayload?: FileMeta[];
  autoRedeem?: boolean;
  relayResults?: Record<string, RelayAck>;
  localEcho?: LocalEchoMeta;
};

type SendDmResult = {
  success: boolean;
  event: NostrEvent | null;
  confirmationPending?: boolean;
  httpAck?: HttpPublishAck | null;
  localId?: string;
  eventId?: string | null;
};

const NON_RETRYABLE_ACK_PATTERNS = [
  /malformed/i,
  /invalid/i,
  /unauthori[sz]ed/i,
  /forbidden/i,
  /denied/i,
  /duplicate/i,
  /policy/i,
  /signature/i,
];

const LOCAL_ECHO_TIMEOUT_MS = 5_000;

const MESSENGER_OUTBOX_ENABLED = true;
const OUTBOX_DELIVERY_QUORUM = 2;
const OUTBOX_BACKOFF_BASE_MS = 2_000;
const OUTBOX_BACKOFF_MAX_MS = 120_000;
const OUTBOX_BACKOFF_JITTER_RATIO = 0.25;
const OUTBOX_MAX_ATTEMPTS = 6;
const IS_TEST_ENV =
  typeof process !== "undefined" && process?.env?.VITEST === "true";

function isNonRetryableHttpAck(ack: HttpPublishAck | null | undefined): boolean {
  if (!ack?.message) return false;
  return NON_RETRYABLE_ACK_PATTERNS.some((pattern) => pattern.test(ack.message!));
}

function emitDmCounter(
  name: string,
  detail: Record<string, unknown> = {},
): void {
  const payload = { name, timestamp: Date.now(), ...detail };
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    try {
      window.dispatchEvent(new CustomEvent("fundstr:dm-counter", { detail: payload }));
    } catch (err) {
      console.debug("[messenger.telemetry] dispatch failed", err);
    }
  }
  console.info(`[messenger.telemetry] ${name}`, payload);
}

export const useMessengerStore = defineStore("messenger", {
  state: () => {
    const settings = useSettingsStore();
    const nostrStore = useNostrStore();
    const storageKey = (suffix: string) =>
      computed(
        () => `cashu.messenger.${nostrStore.pubkey || "anon"}.${suffix}`,
      );
    if (!Array.isArray(settings.defaultNostrRelays)) {
      settings.defaultNostrRelays = Array.from(new Set(DEFAULT_RELAYS));
    }
    const userRelays = Array.isArray(settings.defaultNostrRelays)
      ? Array.from(new Set(settings.defaultNostrRelays))
      : [];
    const relays = Array.from(
      new Set(userRelays.length ? userRelays : DEFAULT_RELAYS),
    );

    const conversations = ref<Record<string, MessengerMessage[]>>({});
    const unreadCounts = ref<Record<string, number>>({});
    const pinned = ref<Record<string, boolean>>({});
    const aliases = ref<Record<string, string>>({});
    const eventLog = ref<MessengerMessage[]>([]);
    const eventMap: Record<string, MessengerMessage> = {};
    const localEchoTimeouts: Record<string, ReturnType<typeof setTimeout> | null> = {};
    const localEchoIndex: Record<string, MessengerMessage> = {};
    const conversationSubscriptionRef = ref<ConversationSubscriptionHandle | null>(null);
    const drawerOpen = useLocalStorage<boolean>(storageKey("drawerOpen"), true);
    const drawerMini = useLocalStorage<boolean>(
      storageKey("drawerMini"),
      false,
    );
    const signerInitCache = ref<SignerInitOutcome | null>(null);
    const failedOutboxCount = ref(0);

    let loadGenerationCounter = 0;
    let mutationGenerationCounter = 0;

    const recordMutation = () => {
      mutationGenerationCounter += 1;
    };

    const rebuildIndexes = (messages: MessengerMessage[] = []) => {
      Object.values(localEchoTimeouts).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      for (const key of Object.keys(localEchoTimeouts)) {
        delete localEchoTimeouts[key];
      }
      for (const key of Object.keys(localEchoIndex)) {
        delete localEchoIndex[key];
      }
      for (const key of Object.keys(eventMap)) {
        delete eventMap[key];
      }
      for (const message of messages) {
        if (!message || typeof message !== "object") continue;
        if (message.id) {
          eventMap[message.id] = message;
        }
        const echo = message.localEcho;
        if (echo?.eventId) {
          eventMap[echo.eventId] = message;
        }
        if (echo?.localId) {
          localEchoIndex[echo.localId] = message;
        }
      }
    };

    const migrateLegacyStorage = async () => {
      if (messengerDb.migrationVersion) return;
      const legacy: Record<
        string,
        {
          conversations: Record<string, MessengerMessage[]>;
          eventLog: MessengerMessage[];
          unread: Record<string, number>;
          pinned: Record<string, boolean>;
          aliases: Record<string, string>;
        }
      > = {};
      const prefix = "cashu.messenger.";
      for (let idx = 0; idx < localStorage.length; idx += 1) {
        const key = localStorage.key(idx);
        if (!key || !key.startsWith(prefix)) continue;
        const remainder = key.slice(prefix.length);
        const dotIndex = remainder.indexOf(".");
        if (dotIndex <= 0) continue;
        const ownerKey = remainder.slice(0, dotIndex);
        const suffix = remainder.slice(dotIndex + 1);
        try {
          const raw = localStorage.getItem(key);
          if (raw === null) continue;
          const parsed = JSON.parse(raw);
          if (!legacy[ownerKey]) {
            legacy[ownerKey] = {
              conversations: {},
              eventLog: [],
              unread: {},
              pinned: {},
              aliases: {},
            };
          }
          const bucket = legacy[ownerKey];
          switch (suffix) {
            case "conversations":
              if (parsed && typeof parsed === "object") {
                bucket.conversations = parsed as Record<
                  string,
                  MessengerMessage[]
                >;
              }
              break;
            case "eventLog":
              if (Array.isArray(parsed)) {
                bucket.eventLog = parsed as MessengerMessage[];
              }
              break;
            case "unread":
              if (parsed && typeof parsed === "object") {
                bucket.unread = parsed as Record<string, number>;
              }
              break;
            case "pinned":
              if (parsed && typeof parsed === "object") {
                bucket.pinned = parsed as Record<string, boolean>;
              }
              break;
            case "aliases":
              if (parsed && typeof parsed === "object") {
                bucket.aliases = parsed as Record<string, string>;
              }
              break;
            default:
              break;
          }
        } catch (err) {
          console.warn("[messenger.migration] failed to parse", key, err);
        }
      }

      const ownerKeys = Object.keys(legacy);
      for (const ownerKey of ownerKeys) {
        const data = legacy[ownerKey];
        const messageMap = new Map<string, MessengerMessage>();
        const addMessage = (msg: MessengerMessage) => {
          if (!msg || typeof msg !== "object") return;
          const id = msg.id || `${Date.now()}-${Math.random()}`;
          msg.id = id;
          messageMap.set(id, msg);
        };
        if (Array.isArray(data.eventLog)) {
          for (const msg of data.eventLog) addMessage(msg);
        }
        if (data.conversations && typeof data.conversations === "object") {
          for (const msgs of Object.values(data.conversations)) {
            if (!Array.isArray(msgs)) continue;
            for (const msg of msgs) addMessage(msg);
          }
        }
        const allMessages = Array.from(messageMap.values());
        if (allMessages.length) {
          await saveMessengerMessages(ownerKey, allMessages);
        }
        if (data.conversations) {
          for (const [pubkey, list] of Object.entries(data.conversations)) {
            const ids = Array.isArray(list)
              ? list
                  .map((msg) => {
                    const id = msg?.id;
                    return id ? String(id) : null;
                  })
                  .filter((id): id is string => !!id)
              : [];
            if (ids.length) {
              await writeConversationMeta(ownerKey, pubkey, "conversation", ids);
            }
          }
        }
        for (const [pubkey, value] of Object.entries(data.unread || {})) {
          if (typeof value === "number") {
            await writeConversationMeta(ownerKey, pubkey, "unread", value);
          }
        }
        for (const [pubkey, value] of Object.entries(data.pinned || {})) {
          if (typeof value === "boolean") {
            await writeConversationMeta(ownerKey, pubkey, "pinned", value);
          }
        }
        for (const [pubkey, value] of Object.entries(data.aliases || {})) {
          if (typeof value === "string") {
            await writeConversationMeta(ownerKey, pubkey, "alias", value);
          }
        }
      }
      messengerDb.markMigrationComplete(1);
    };

    let outboxFailureSubscription: { unsubscribe(): void } | null = null;

    const subscribeOutboxFailures = (owner: string) => {
      if (!MESSENGER_OUTBOX_ENABLED || IS_TEST_ENV || !owner) {
        outboxFailureSubscription?.unsubscribe();
        outboxFailureSubscription = null;
        failedOutboxCount.value = 0;
        return;
      }

      outboxFailureSubscription?.unsubscribe();
      outboxFailureSubscription = liveQuery(() =>
        messengerDb.outbox
          .where("[owner+status]")
          .equals([owner, "failed_perm"])
          .count(),
      ).subscribe({
        next: (count) => {
          failedOutboxCount.value = count;
        },
        error: (err) => {
          console.error("[messenger.outboxFailures] subscription failed", err);
          failedOutboxCount.value = 0;
        },
      });
    };

    const loadOwnerState = async (owner: string) => {
      try {
        const loadToken = ++loadGenerationCounter;
        const mutationToken = mutationGenerationCounter;
        await migrateLegacyStorage();
        const [messages, meta] = await Promise.all([
          loadMessengerMessages(owner),
          loadConversationState(owner),
        ]);
        if (loadToken !== loadGenerationCounter) {
          return;
        }
        if (mutationGenerationCounter !== mutationToken) {
          return;
        }
        const grouped: Record<string, MessengerMessage[]> = {};
        const byId = new Map<string, MessengerMessage>();
        messages.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
        for (const msg of messages) {
          if (!msg || typeof msg !== "object") continue;
          if (!msg.id) {
            msg.id = `${Date.now()}-${Math.random()}`;
          }
          byId.set(msg.id, msg);
        }
        for (const [pubkey, ids] of Object.entries(meta.conversations)) {
          const arr: MessengerMessage[] = [];
          for (const id of ids) {
            const found = byId.get(id);
            if (found) arr.push(found);
          }
          if (arr.length) {
            grouped[pubkey] = arr;
          }
        }
        for (const msg of messages) {
          const key = msg.pubkey;
          if (!grouped[key]) grouped[key] = [];
          if (!grouped[key].includes(msg)) {
            grouped[key].push(msg);
          }
        }
        conversations.value = grouped;
        eventLog.value = messages;
        unreadCounts.value = { ...meta.unread };
        pinned.value = { ...meta.pinned };
        aliases.value = { ...meta.aliases };
        rebuildIndexes(messages);
        mutationGenerationCounter += 1;
      } catch (err) {
        console.error("[messenger] failed to load state", err);
      }
    };

    const ownerComputed = computed(() => nostrStore.pubkey || "anon");

    void loadOwnerState(ownerComputed.value);
    subscribeOutboxFailures(ownerComputed.value);

    watch(
      () => nostrStore.pubkey,
      () => {
        conversations.value = {} as any;
        unreadCounts.value = {} as any;
        pinned.value = {} as any;
        aliases.value = {} as any;
        eventLog.value = [] as any;
        rebuildIndexes([]);
        conversationSubscriptionRef.value = null;
        activeConversationSubscription?.stop();
        activeConversationSubscription = null;
        conversationWatchStop?.();
        conversationWatchStop = null;
        conversationRelayOff?.();
        conversationRelayOff = null;
        signerInitCache.value = null;
        failedOutboxCount.value = 0;
        subscribeOutboxFailures(ownerComputed.value);
        void loadOwnerState(ownerComputed.value);
      },
    );

    return {
      relays,
      conversations,
      unreadCounts,
      pinned,
      aliases,
      eventLog,
      eventMap,
      currentConversation: "",
      drawerOpen,
      drawerMini,
      started: false,
      dmUnsub: null as null | (() => void),
      signerMode: "none" as DmSignerMode,
      transportMode: "offline" as DmTransportMode,
      httpFallbackEnabled: true,
      httpPollTimer: null as ReturnType<typeof setInterval> | null,
      httpFallbackActive: false,
      signerInitCache,
      relayStatusStop: null as null | (() => void),
      lastHttpSyncAt: 0,
      httpSyncInFlight: false,
      dmRequireAuth: DM_REQUIRE_AUTH,
      localEchoTimeouts,
      localEchoIndex,
      conversationSubscription: conversationSubscriptionRef,
      outboxEnabled: MESSENGER_OUTBOX_ENABLED && !IS_TEST_ENV,
      outboxQuorum: OUTBOX_DELIVERY_QUORUM,
      outboxPumpActive: false,
      outboxPumpRequested: false,
      failedOutboxCount,
      rebuildIndexes,
      loadOwnerState,
      recordMutation,
    };
  },
  getters: {
    connected(): boolean {
      const nostr = useNostrStore();
      return nostr.connected;
    },
    sendQueue(): MessengerMessage[] {
      if (!Array.isArray(this.eventLog)) this.eventLog = [];
      return this.eventLog.filter((m) => {
        if (!m.outgoing) return false;
        if (m.localEcho) {
          return m.localEcho.status === "failed";
        }
        return m.status === "failed";
      });
    },
  },
  actions: {
    getOwnerKey(): string {
      const nostr = useNostrStore();
      return nostr?.pubkey || "anon";
    },
    computeBackoffMs(attempt: number): number {
      const normalizedAttempt = Number.isFinite(attempt) ? Math.max(1, Math.floor(attempt)) : 1;
      const exponential = OUTBOX_BACKOFF_BASE_MS * Math.pow(2, normalizedAttempt - 1);
      const capped = Math.min(OUTBOX_BACKOFF_MAX_MS, exponential);
      const jitterRange = capped * OUTBOX_BACKOFF_JITTER_RATIO;
      const jitterOffset = jitterRange * (Math.random() * 2 - 1);
      const value = Math.max(OUTBOX_BACKOFF_BASE_MS, Math.round(capped + jitterOffset));
      return value;
    },
    async persistMessage(msg: MessengerMessage) {
      if (!msg) return;
      try {
        await saveMessengerMessage(this.getOwnerKey(), msg);
      } catch (err) {
        console.error("[messenger.persistMessage] failed", err);
      }
    },
    async persistConversationMeta(pubkey: string, key: ConversationMetaKey) {
      const normalized = this.normalizeKey(pubkey);
      if (!normalized) return;
      const owner = this.getOwnerKey();
      try {
        let value: ConversationMetaValue = null;
        if (key === "unread") {
          value = this.unreadCounts?.[normalized] ?? 0;
        } else if (key === "pinned") {
          const pinnedValue = this.pinned?.[normalized];
          value = typeof pinnedValue === "boolean" ? pinnedValue : null;
        } else if (key === "alias") {
          const aliasValue = this.aliases?.[normalized];
          value = aliasValue && aliasValue.trim() ? aliasValue : null;
        } else if (key === "conversation") {
          const conv = this.conversations?.[normalized] ?? [];
          value = Array.isArray(conv)
            ? conv
                .map((entry) => entry?.id)
                .filter((id): id is string => typeof id === "string" && id.length > 0)
            : [];
        }
        if (value === null || value === undefined || value === "") {
          await writeConversationMeta(owner, normalized, key, null);
        } else {
          await writeConversationMeta(owner, normalized, key, value);
        }
      } catch (err) {
        console.error(
          "[messenger.persistConversationMeta] failed",
          { pubkey: normalized, key },
          err,
        );
      }
    },
    async persistConversationSnapshot(pubkey: string) {
      await this.persistConversationMeta(pubkey, "conversation");
    },
    async removeConversationStorage(pubkey: string) {
      const normalized = this.normalizeKey(pubkey);
      if (!normalized) return;
      try {
        await removeConversationState(this.getOwnerKey(), normalized);
      } catch (err) {
        console.error("[messenger.removeConversationStorage] failed", err);
      }
    },
    findMessageByLocalId(localId: string): MessengerMessage | undefined {
      if (!localId) return undefined;
      const indexed = this.localEchoIndex?.[localId];
      if (indexed) return indexed;
      if (!Array.isArray(this.eventLog)) this.eventLog = [];
      const found = this.eventLog.find((entry) => entry.localEcho?.localId === localId);
      if (found) {
        this.localEchoIndex[localId] = found;
      }
      return found;
    },
    clearLocalEchoTimer(localId: string) {
      const handle = this.localEchoTimeouts[localId];
      if (handle) {
        clearTimeout(handle);
      }
      delete this.localEchoTimeouts[localId];
    },
    scheduleLocalEcho(meta: LocalEchoMeta, msg: MessengerMessage) {
      this.clearLocalEchoTimer(meta.localId);
      const now = Date.now();
      const shouldStartTimer = !this.outboxEnabled;
      meta.timerStartedAt = shouldStartTimer ? now : null;
      meta.updatedAt = now;
      if (!meta.createdAt) {
        meta.createdAt = now;
      }
      meta.status = "pending";
      msg.localEcho = meta;
      msg.status = "pending";
      this.localEchoIndex[meta.localId] = msg;
      if (shouldStartTimer) {
        this.localEchoTimeouts[meta.localId] = setTimeout(() => {
          void this.handleLocalEchoTimeout(meta.localId);
        }, LOCAL_ECHO_TIMEOUT_MS);
      }
      this.recordMutation();
      void this.persistMessage(msg);
    },
    registerMessage(
      msg: MessengerMessage,
      extraIds: Array<string | null | undefined> = [],
    ) {
      if (!msg) return;
      const ids = new Set<string>();
      if (msg.id) ids.add(msg.id);
      for (const id of extraIds) {
        if (id) ids.add(id);
      }
      const echo = msg.localEcho;
      if (echo?.eventId) ids.add(echo.eventId);
      if (echo?.localId) {
        this.localEchoIndex[echo.localId] = msg;
      }
      for (const id of ids) {
        this.eventMap[id] = msg;
      }
      this.recordMutation();
      void this.persistMessage(msg);
      void this.persistConversationSnapshot(msg.pubkey);
    },
    async createConversationSubscription(
      pubkey: string,
      opts: { reason?: string } = {},
    ): Promise<ConversationSubscriptionHandle | null> {
      const normalized = this.normalizeKey(pubkey);
      if (!normalized) return null;
      const nostr = useNostrStore();
      if (!nostr.pubkey) return null;
      try {
        const ndk = await useNdk({ requireSigner: false });
        const unsubscribers: Array<() => void> = [];
        const subscribe = (
          filter: Record<string, any>,
          source: "incoming" | "outgoing",
        ) => {
          try {
            const sub = ndk.subscribe(filter, {
              closeOnEose: false,
              groupable: false,
            });
            sub.on("event", async (ndkEvent: NDKEvent) => {
              try {
                const raw = await ndkEvent.toNostrEvent();
                if ((raw as NostrEvent).pubkey === nostr.pubkey) {
                  this.pushOwnMessage(raw as NostrEvent);
                } else {
                  await this.addIncomingMessage(raw as NostrEvent);
                }
              } catch (err) {
                console.error(
                  "[messenger.conversationSubscription] handler failed",
                  { filter, source },
                  err,
                );
              }
            });
            unsubscribers.push(() => {
              try {
                sub.stop();
              } catch {}
            });
          } catch (err) {
            console.error(
              "[messenger.conversationSubscription] failed to subscribe",
              { filter, source },
              err,
            );
          }
        };

        subscribe(
          { kinds: [4], authors: [nostr.pubkey], "#p": [normalized] },
          "outgoing",
        );
        subscribe(
          { kinds: [4], authors: [normalized], "#p": [nostr.pubkey] },
          "incoming",
        );

        const reason = opts.reason ?? "unknown";
        emitDmCounter("dm_conversation_subscription_start", {
          pubkey: normalized,
          reason,
        });
        console.info("[messenger.subscription] conversation start", {
          pubkey: normalized,
          reason,
        });

        const handle: ConversationSubscriptionHandle = {
          pubkey: normalized,
          stop: () => {
            for (const stop of unsubscribers) {
              try {
                stop();
              } catch {}
            }
          },
          fetchEvent: async (eventId: string, meta?: { reason?: string }) => {
            if (!eventId) return false;
            const fetchReason = meta?.reason ?? "manual";
            try {
              const ndkEvent = (await ndk.fetchEvent(
                { ids: [eventId] },
                { closeOnEose: true, groupable: false },
              )) as NDKEvent | null;
              if (!ndkEvent) {
                emitDmCounter("dm_fallback_fetch_failure", {
                  pubkey: normalized,
                  eventId,
                  reason: fetchReason,
                  result: "not_found",
                });
                console.info(
                  "[messenger.subscription] fallback fetch missing",
                  { pubkey: normalized, eventId, reason: fetchReason },
                );
                return false;
              }
              const nostrEvent = await ndkEvent.toNostrEvent();
              if ((nostrEvent as NostrEvent).pubkey === nostr.pubkey) {
                this.pushOwnMessage(nostrEvent as NostrEvent);
              } else {
                await this.addIncomingMessage(nostrEvent as NostrEvent);
              }
              emitDmCounter("dm_fallback_fetch_success", {
                pubkey: normalized,
                eventId,
                reason: fetchReason,
              });
              console.info("[messenger.subscription] fallback fetch success", {
                pubkey: normalized,
                eventId,
                reason: fetchReason,
              });
              return true;
            } catch (err) {
              emitDmCounter("dm_fallback_fetch_failure", {
                pubkey: normalized,
                eventId,
                reason: fetchReason,
                error:
                  err instanceof Error ? err.message : String(err ?? "unknown"),
              });
              console.warn("[messenger.subscription] fallback fetch failed", {
                pubkey: normalized,
                eventId,
                reason: fetchReason,
                error: err,
              });
              return false;
            }
          },
        };

        return handle;
      } catch (err) {
        console.warn(
          "[messenger.conversationSubscription] failed to initialize",
          err,
        );
        return null;
      }
    },
    teardownActiveConversationSubscription() {
      if (activeConversationSubscription) {
        try {
          activeConversationSubscription.stop();
        } catch (err) {
          console.warn(
            "[messenger.conversationSubscription] failed to teardown",
            err,
          );
        }
      }
      activeConversationSubscription = null;
      this.conversationSubscription = null;
    },
    async ensureConversationSubscription(
      pubkey: string | null | undefined,
      reason = "manual",
      opts: { force?: boolean } = {},
    ) {
      if (!pubkey) {
        this.teardownActiveConversationSubscription();
        return;
      }
      const normalized = this.normalizeKey(pubkey);
      if (!normalized) {
        this.teardownActiveConversationSubscription();
        return;
      }
      if (!opts.force && activeConversationSubscription?.pubkey === normalized) {
        return;
      }
      this.teardownActiveConversationSubscription();
      const handle = await this.createConversationSubscription(normalized, {
        reason,
      });
      if (handle) {
        activeConversationSubscription = handle;
        this.conversationSubscription = handle;
      } else {
        activeConversationSubscription = null;
        this.conversationSubscription = null;
      }
    },
    async initializeConversationSubscriptionWatcher() {
      if (conversationWatchStop) return;
      try {
        const ndk = await useNdk({ requireSigner: false });
        const onRelayConnect = (relay: any) => {
          if (!this.currentConversation) return;
          emitDmCounter("dm_conversation_subscription_reconnect", {
            pubkey: this.currentConversation,
            relay: relay?.url ?? "unknown",
          });
          console.info("[messenger.subscription] relay reconnect", {
            pubkey: this.currentConversation,
            relay: relay?.url,
          });
          void this.ensureConversationSubscription(
            this.currentConversation,
            "relay-connect",
            { force: true },
          );
        };
        if (typeof ndk?.pool?.on === "function") {
          ndk.pool.on("relay:connect", onRelayConnect);
          conversationRelayOff = () => {
            ndk.pool.off?.("relay:connect", onRelayConnect);
          };
        }
        conversationWatchStop = watch(
          () => this.currentConversation,
          (next, prev) => {
            if (next === prev) return;
            void this.ensureConversationSubscription(next, "current-change");
          },
          { immediate: true },
        );
      } catch (err) {
        console.warn(
          "[messenger.conversationSubscription] failed to setup watcher",
          err,
        );
      }
    },
    async fetchConversationEvent(
      pubkey: string,
      eventId: string,
      reason = "manual",
    ): Promise<boolean> {
      if (!eventId) return false;
      const normalized = this.normalizeKey(pubkey);
      if (!normalized) return false;
      let handle = activeConversationSubscription;
      let temporary: ConversationSubscriptionHandle | null = null;
      if (!handle || handle.pubkey !== normalized) {
        temporary = await this.createConversationSubscription(normalized, {
          reason: `${reason}-temp`,
        });
        handle = temporary;
      }
      if (!handle) {
        return false;
      }
      try {
        return await handle.fetchEvent(eventId, { reason });
      } finally {
        if (temporary) {
          try {
            temporary.stop();
          } catch {}
        }
      }
    },
    pauseConversationSubscription() {
      this.teardownActiveConversationSubscription();
    },
    async resumeConversationSubscription(reason = "manual") {
      if (!this.currentConversation) return false;
      await this.ensureConversationSubscription(
        this.currentConversation,
        reason,
        { force: true },
      );
      return activeConversationSubscription !== null;
    },
    async deliverDmEventForTesting(event: NostrEvent) {
      const nostr = useNostrStore();
      if (event.pubkey === nostr.pubkey) {
        this.pushOwnMessage(event);
      } else {
        await this.addIncomingMessage(event);
      }
    },
    mergeRelayAckResults(
      msg: MessengerMessage,
      meta: LocalEchoMeta,
      updates: Record<string, RelayAck> | undefined,
    ) {
      if (!updates || !Object.keys(updates).length) return;
      const next = { ...(msg.relayResults ?? {}) } as Record<string, RelayAck>;
      const metaNext = { ...(meta.relayResults ?? {}) } as Record<string, RelayAck>;
      for (const [relay, ack] of Object.entries(updates)) {
        next[relay] = ack;
        metaNext[relay] = ack;
      }
      msg.relayResults = next;
      meta.relayResults = metaNext;
      this.recordMutation();
      void this.persistMessage(msg);
    },
    markLocalEchoSent(
      msg: MessengerMessage,
      meta: LocalEchoMeta,
      relayResults?: Record<string, RelayAck>,
      source: string = "unknown",
    ) {
      if (meta.status === "sent") {
        this.mergeRelayAckResults(msg, meta, relayResults);
        return;
      }
      this.clearLocalEchoTimer(meta.localId);
      meta.status = "sent";
      meta.updatedAt = Date.now();
      meta.lastAckAt = meta.updatedAt;
      msg.status = "sent";
      this.mergeRelayAckResults(msg, meta, relayResults);
      const latency =
        typeof meta.timerStartedAt === "number"
          ? meta.updatedAt - meta.timerStartedAt
          : undefined;
      delete this.localEchoIndex[meta.localId];
      emitDmCounter("dm_sent", {
        localId: meta.localId,
        attempt: meta.attempt,
        source,
      });
      if (typeof latency === "number") {
        emitDmCounter("dm_ack_first_ms", {
          localId: meta.localId,
          latency,
        });
      }
      this.recordMutation();
      void this.persistMessage(msg);
    },
    markLocalEchoFailed(
      msg: MessengerMessage,
      meta: LocalEchoMeta,
      reason: string,
      relayResults?: Record<string, RelayAck>,
    ) {
      if (meta.status === "failed") {
        this.mergeRelayAckResults(msg, meta, relayResults);
        return;
      }
      this.clearLocalEchoTimer(meta.localId);
      meta.status = "failed";
      meta.updatedAt = Date.now();
      meta.error = reason;
      msg.status = "failed";
      this.mergeRelayAckResults(msg, meta, relayResults);
      this.recordMutation();
      void this.persistMessage(msg);
    },
    async handleLocalEchoTimeout(localId: string) {
      const msg = this.findMessageByLocalId(localId);
      if (!msg || !msg.localEcho) return;
      const meta = msg.localEcho;
      if (meta.status !== "pending") return;
      this.markLocalEchoFailed(
        msg,
        meta,
        "Timed out waiting for relay acknowledgement",
      );
      emitDmCounter("dm_failed_timeout", {
        localId: meta.localId,
        attempt: meta.attempt,
      });
      notifyError("Direct message delivery timed out");
      if (!meta.eventId) {
        return;
      }
      const recovered = await this.recoverLocalEchoFromRelays(
        meta.localId,
        meta.eventId,
        msg.pubkey,
      );
      if (recovered) {
        emitDmCounter("dm_dedup_hits", {
          localId: meta.localId,
          source: "timeout-recovery",
        });
      }
    },
    async recoverLocalEchoFromRelays(
      localId: string,
      eventId: string,
      pubkey: string,
    ): Promise<boolean> {
      try {
        return await this.fetchConversationEvent(pubkey, eventId, "timeout-recovery");
      } catch (err) {
        console.warn("[messenger.recoverLocalEchoFromRelays]", err);
        return false;
      }
    },
    setSignerMode(mode: DmSignerMode) {
      this.signerMode = mode;
    },
    setTransportMode(mode: DmTransportMode) {
      this.transportMode = mode;
    },
    setDmRequireAuth(enabled: boolean) {
      this.dmRequireAuth = enabled;
    },
    setHttpFallbackEnabled(enabled: boolean) {
      this.httpFallbackEnabled = enabled;
      const statusRef = useFundstrRelayStatus();
      if (!enabled) {
        this.stopHttpPolling();
        return;
      }
      if (statusRef.value === "disconnected") {
        this.startHttpPolling();
      }
    },
    async refreshSignerMode() {
      try {
        const active = await getActiveDmSigner();
        this.signerMode = active?.mode ?? "none";
      } catch (err) {
        console.warn("[messenger.refreshSignerMode]", err);
        this.signerMode = "none";
      }
    },
    setupTransportWatcher() {
      if (this.relayStatusStop) return;
      const statusRef = useFundstrRelayStatus();
      this.relayStatusStop = watch(
        () => statusRef.value,
        (status) => {
          if (status === "connected") {
            this.stopHttpPolling();
            this.transportMode = "ws";
            return;
          }

          if (status === "disconnected") {
            if (this.httpFallbackEnabled) {
              this.startHttpPolling();
              this.transportMode = this.httpFallbackActive ? "http" : "offline";
            } else {
              this.stopHttpPolling();
              this.transportMode = "offline";
            }
            return;
          }

          if (this.httpFallbackActive) {
            this.transportMode = "http";
          } else {
            this.transportMode = "offline";
          }
        },
        { immediate: true },
      );
    },
    startHttpPolling() {
      if (!this.httpFallbackEnabled) return;
      const statusRef = useFundstrRelayStatus();
      if (statusRef.value !== "disconnected") return;
      if (this.httpPollTimer) return;
      const interval = Math.max(5000, DM_POLL_INTERVAL_MS);
      const tick = async () => {
        if (statusRef.value !== "disconnected") {
          this.stopHttpPolling();
          return;
        }
        if (this.httpSyncInFlight) return;
        this.httpSyncInFlight = true;
        try {
          await this.performHttpSync();
        } catch (err) {
          console.warn("[messenger.startHttpPolling]", err);
        } finally {
          this.httpSyncInFlight = false;
        }
      };
      this.httpFallbackActive = true;
      if (this.transportMode !== "ws") {
        this.transportMode = "http";
      }
      void tick();
      this.httpPollTimer = setInterval(() => {
        void tick();
      }, interval);
    },
    stopHttpPolling() {
      if (this.httpPollTimer) {
        clearInterval(this.httpPollTimer);
        this.httpPollTimer = null;
      }
      this.httpFallbackActive = false;
      if (this.transportMode === "http") {
        const status = useFundstrRelayStatus();
        this.transportMode = status.value === "connected" ? "ws" : "offline";
      }
    },
    async performHttpSync() {
      const nostr = useNostrStore();
      const pubkey = nostr.pubkey;
      if (!pubkey) return;
      const since = this.eventLog[this.eventLog.length - 1]?.created_at || 0;
      try {
        await this.syncDmViaHttp(pubkey, since);
        this.lastHttpSyncAt = Date.now();
      } catch (err) {
        console.warn("[messenger.performHttpSync]", err);
      }
    },
    normalizeKey(pk: string): string {
      const ns: any = useNostrStore();
      const resolved =
        typeof ns?.resolvePubkey === "function" ? ns.resolvePubkey(pk) : pk;
      if (!resolved) {
        console.warn("[messenger] invalid pubkey", pk);
        return "";
      }
      return resolved;
    },
    normalizeStoredConversations() {
      // normalize conversation keys and merge duplicates
      const keyRegex = /[0-9a-fA-F]{64}|npub1|nprofile1/;

      for (const key of Object.keys(this.conversations)) {
        if (!keyRegex.test(key)) {
          delete this.conversations[key];
          continue;
        }
        const normalized = this.normalizeKey(key);
        const msgs = this.conversations[key];
        if (!normalized || !msgs) {
          delete this.conversations[key];
          continue;
        }
        if (!this.conversations[normalized])
          this.conversations[normalized] = [];
        for (const msg of msgs) {
          msg.pubkey = normalized;
          if (!this.conversations[normalized].some((m) => m.id === msg.id)) {
            this.conversations[normalized].push(msg);
          }
        }
        if (normalized !== key) delete this.conversations[key];
      }

      for (const key of Object.keys(this.unreadCounts)) {
        if (!keyRegex.test(key)) {
          delete this.unreadCounts[key];
          continue;
        }
        const normalized = this.normalizeKey(key);
        if (!normalized) {
          delete this.unreadCounts[key];
          continue;
        }
        if (normalized !== key) {
          this.unreadCounts[normalized] =
            (this.unreadCounts[normalized] || 0) + this.unreadCounts[key];
          delete this.unreadCounts[key];
        }
      }

      for (const key of Object.keys(this.pinned)) {
        if (!keyRegex.test(key)) {
          delete this.pinned[key];
          continue;
        }
        const normalized = this.normalizeKey(key);
        if (!normalized) {
          delete this.pinned[key];
          continue;
        }
        if (normalized !== key) {
          this.pinned[normalized] = this.pinned[normalized] || this.pinned[key];
          delete this.pinned[key];
        }
      }

      for (const key of Object.keys(this.aliases)) {
        if (!keyRegex.test(key)) {
          delete this.aliases[key];
          continue;
        }
        const normalized = this.normalizeKey(key);
        if (!normalized) {
          delete this.aliases[key];
          continue;
        }
        if (normalized !== key) {
          this.aliases[normalized] = this.aliases[key];
          delete this.aliases[key];
        }
      }

      // normalize event log entries
      this.eventLog = this.eventLog.filter((msg) => {
        if (!keyRegex.test(msg.pubkey)) return false;
        const normalized = this.normalizeKey(msg.pubkey);
        if (!normalized) return false;
        msg.pubkey = normalized;
        return true;
      });
      for (const key of Object.keys(this.conversations)) {
        void this.persistConversationSnapshot(key);
      }
      for (const key of Object.keys(this.unreadCounts)) {
        void this.persistConversationMeta(key, "unread");
      }
      for (const key of Object.keys(this.pinned)) {
        void this.persistConversationMeta(key, "pinned");
      }
      for (const key of Object.keys(this.aliases)) {
        void this.persistConversationMeta(key, "alias");
      }
      this.rebuildIndexes(this.eventLog);
      this.recordMutation();
    },
    async loadIdentity(options: { refresh?: boolean } = {}) {
      const { refresh = false } = options;
      const nostr = useNostrStore();
      if (refresh) {
        this.signerInitCache = null;
      }
      const now = Date.now();
      const shouldInitSigner = refresh || !this.started || !nostr.signer;
      if (shouldInitSigner) {
        const lastAttempt = this.signerInitCache;
        const recentFailedAttempt =
          !refresh &&
          !nostr.signer &&
          !!lastAttempt &&
          !lastAttempt.success &&
          now - lastAttempt.timestamp < SIGNER_INIT_RETRY_WINDOW_MS;
        if (!recentFailedAttempt) {
          try {
            await nostr.initSignerIfNotSet();
          } catch (e) {
            console.warn("[messenger] signer unavailable, continuing read-only", e);
          }
          this.signerInitCache = {
            timestamp: Date.now(),
            success: Boolean(nostr.signer),
          };
        }
      }
      await this.refreshSignerMode();
    },
    countConnectedRelays(ndk: any): number {
      try {
        const relays = ndk?.pool?.relays;
        if (!relays) return 0;
        if (typeof relays.values === "function") {
          let count = 0;
          for (const relay of relays.values()) {
            if (relay?.connected) count++;
          }
          return count;
        }
        if (Array.isArray(relays)) {
          return relays.reduce(
            (acc, relay) => acc + (relay?.connected ? 1 : 0),
            0,
          );
        }
        if (typeof relays === "object") {
          return Object.values(relays).reduce(
            (acc, relay) => acc + ((relay as any)?.connected ? 1 : 0),
            0,
          );
        }
      } catch (err) {
        console.warn("[messenger.countConnectedRelays]", err);
      }
      return 0;
    },
    async syncDmViaHttp(pubkey: string | undefined, since: number) {
      if (!pubkey) return;
      if (!this.httpFallbackEnabled) return;
      const sinceFilter = since > 0 ? { since } : {};
      const filters = [
        { kinds: [4], "#p": [pubkey], ...sinceFilter },
        { kinds: [4], authors: [pubkey], ...sinceFilter },
      ];
      try {
        const events = await requestEventsViaHttp(filters, {
          url: DM_HTTP_REQ_URL,
          timeoutMs: DM_HTTP_ACK_TIMEOUT_MS,
        });
        if (!Array.isArray(events) || events.length === 0) {
          return;
        }
        const sorted = events
          .filter((e) => e && typeof e === "object")
          .sort((a, b) => (a?.created_at || 0) - (b?.created_at || 0));
        const seen = new Set<string>();
        for (const raw of sorted) {
          const event = raw as NostrEvent;
          if (event.id && seen.has(event.id)) continue;
          if (event.id) seen.add(event.id);
          if (event.pubkey === pubkey) {
            this.pushOwnMessage(event);
          } else {
            await this.addIncomingMessage(event);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err ?? "error");
        console.error("[messenger.syncDmViaHttp]", err);
        notifyError(`Failed to sync DMs via HTTP fallback: ${message}`);
        throw err instanceof Error ? err : new Error(message);
      }
    },
    async sendDm(
      recipient: string,
      message: string,
      relays?: string[],
      attachment?: MessageAttachment,
      tokenPayload?: any,
      filesPayload?: FileMeta[],
    ): Promise<SendDmResult> {
      recipient = this.normalizeKey(recipient);
      if (!recipient) return { success: false, event: null };

      const relayTargets = relays ? Array.from(new Set(relays)) : undefined;
      const baseMessage = typeof message === "string" ? message : "";
      const textContent = sanitizeMessage(baseMessage);
      const normalizedFiles = Array.isArray(filesPayload)
        ? filesPayload
            .map((file) => normalizeFileMeta(file))
            .filter((file): file is FileMeta => !!file)
        : [];

      const sendSingle = async (options: {
        text: string;
        contentOverride?: string;
        attachment?: MessageAttachment;
        tokenPayload?: any;
        files?: FileMeta[];
      }): Promise<SendDmResult> => {
        const { text, contentOverride, attachment: attach, tokenPayload: token, files } = options;
        const normalized = Array.isArray(files)
          ? files
              .map((file) => normalizeFileMeta(file))
              .filter((file): file is FileMeta => !!file)
          : [];
        const eventContent =
          typeof contentOverride === "string"
            ? contentOverride
            : buildEventContent(text, normalized);

        if (!eventContent && !attach && !token) {
          return { success: false, event: null };
        }

        const now = Date.now();
        const meta: LocalEchoMeta = {
          localId: uuidv4(),
          eventId: null,
          status: "pending",
          relayResults: {},
          createdAt: now,
          updatedAt: now,
          lastAckAt: null,
          timerStartedAt: null,
          error: null,
          relays: relayTargets,
          attempt: 1,
          payload: {
            content: eventContent,
            text,
            attachment: attach,
            tokenPayload: token,
            filesPayload: normalized.length ? normalized : undefined,
          },
        };

        const msg = this.addOutgoingMessage(
          recipient,
          text,
          undefined,
          undefined,
          attach,
          "pending",
          token,
          meta,
        );
        msg.relayResults = {};
        msg.content = text;
        msg.tokenPayload = token;
        msg.filesPayload = normalized.length ? normalized : undefined;
        this.scheduleLocalEcho(meta, msg);

        if (!this.outboxEnabled) {
          return await this.executeSendWithMeta({
            msg,
            meta,
            recipient,
            contentToSend: eventContent,
            textContent: text,
            attachment: attach,
            tokenPayload: token,
            filesPayload: normalized,
            relayTargets,
          });
        }

        const outboxPayload = {
          recipient,
          content: eventContent,
          text,
          attachment: attach,
          tokenPayload: token,
          filesPayload: normalized.length ? normalized : undefined,
          created_at: msg.created_at,
        };

        const record: MessengerOutboxRecord = {
          id: meta.localId,
          owner: this.getOwnerKey(),
          messageId: msg.id,
          localId: meta.localId,
          recipient,
          status: "queued",
          nextAttemptAt: now,
          attemptCount: 0,
          payload: outboxPayload,
          relays: relayTargets,
          lastError: null,
          relayResults: {},
          ackCount: 0,
          firstAckAt: null,
          lastAckAt: null,
          createdAt: now,
          updatedAt: now,
        };

        try {
          await upsertOutbox(record);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err ?? "error");
          this.markLocalEchoFailed(msg, meta, reason);
          notifyError(`Failed to queue DM: ${reason}`);
          return { success: false, event: null };
        }

        emitDmCounter("dm_outbox_queued", { localId: meta.localId });
        void this.outboxPump();

        return {
          success: true,
          event: null,
          confirmationPending: true,
          localId: meta.localId,
          eventId: null,
        };
      };

      let lastResult: SendDmResult = { success: false, event: null };

      for (const file of normalizedFiles) {
        const fileJson = JSON.stringify(file);
        const result = await sendSingle({
          text: fileJson,
          contentOverride: fileJson,
          attachment: { type: file.mime, name: file.name },
          tokenPayload: undefined,
          files: [file],
        });
        lastResult = result;
        if (!result.success) {
          return result;
        }
      }

      const shouldSendText =
        textContent.length > 0 ||
        !!attachment ||
        !!tokenPayload ||
        normalizedFiles.length === 0;

      if (shouldSendText) {
        const textResult = await sendSingle({
          text: textContent,
          attachment,
          tokenPayload,
          files: normalizedFiles.length ? [] : undefined,
        });
        lastResult = textResult;
        return textResult;
      }

      return lastResult;
    },
    async executeSendWithMeta(options: {
      msg: MessengerMessage;
      meta: LocalEchoMeta;
      recipient: string;
      contentToSend: string;
      textContent: string;
      attachment?: MessageAttachment;
      tokenPayload?: any;
      filesPayload?: FileMeta[];
      relayTargets?: string[];
    }): Promise<SendDmResult> {
      const {
        msg,
        meta,
        recipient,
        contentToSend,
        textContent,
        attachment,
        tokenPayload,
        filesPayload,
      } = options;
      const relayTargets = options.relayTargets;

      try {
        await this.loadIdentity({ refresh: false });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        this.markLocalEchoFailed(msg, meta, reason, {
          identity: { ok: false, reason },
        });
        notifyError(`Failed to prepare DM signer: ${reason}`);
        return { success: false, event: null };
      }

      await this.refreshSignerMode();
      const signerInfo = await getActiveDmSigner();
      if (!signerInfo) {
        this.markLocalEchoFailed(msg, meta, "No signer available for direct messages", {
          signer: { ok: false, reason: "No signer available" },
        });
        notifyError("No signer available for direct messages");
        return { success: false, event: null };
      }
      this.signerMode = signerInfo.mode;

      let event: NostrEvent;
      try {
        event = await buildKind4Event(signerInfo.signer, recipient, contentToSend);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        const relayResults = { encryption: { ok: false, reason } } as Record<string, RelayAck>;
        this.markLocalEchoFailed(msg, meta, reason, relayResults);
        notifyError(`Failed to encrypt DM: ${reason}`);
        return { success: false, event: null };
      }

      msg.created_at = event.created_at ?? msg.created_at;
      meta.eventId = event.id;
      meta.payload = {
        content: contentToSend,
        text: textContent,
        attachment,
        tokenPayload,
        filesPayload: filesPayload?.length ? filesPayload : undefined,
      };
      if (relayTargets?.length) {
        meta.relays = relayTargets;
      }
      if (event.kind) {
        msg.protocol = event.kind === 1059 ? "nip17" : "nip04";
      }
      const previousId = msg.id;
      if (event.id) {
        msg.id = event.id;
      }
      msg.content = textContent;
      msg.filesPayload = filesPayload?.length ? filesPayload : undefined;
      this.registerMessage(msg, [meta.eventId, event.id, previousId, meta.localId]);

      let relayResults: Record<string, RelayAck> = {};
      let delivered = false;
      let sentVia: DmTransportMode | null = null;
      let lastFailureReason: string | undefined;
      let confirmationTriggered = false;
      let httpAck: HttpPublishAck | null = null;
      let httpAckNonRetryable = false;

      const ensureConfirmation = () => {
        if (confirmationTriggered) return;
        confirmationTriggered = true;
        const confirmId = meta.eventId || msg.id;
        void this.confirmMessageDelivery(confirmId, event.id);
      };

      try {
        const nostr = useNostrStore();
        const useFundstrRelay = nostr.connected;

        if (useFundstrRelay) {
          const fundstrRelays = relayTargets?.length
            ? relayTargets
            : Array.isArray(this.relays)
              ? this.relays
              : Array.from(new Set([...DM_RELAYS]));
          for (const relayUrl of fundstrRelays) {
            if (!relayUrl) continue;
            let client: Awaited<ReturnType<typeof ensureFundstrRelayClient>> | null = null;
            try {
              client = await ensureFundstrRelayClient(relayUrl);
            } catch (err) {
              const reason = err instanceof Error ? err.message : String(err ?? "error");
              relayResults[relayUrl] = { ok: false, reason };
              lastFailureReason = reason;
              continue;
            }

            const authOptions: FundstrRelayAuthOptions = this.dmRequireAuth
              ? {
                  enabled: true,
                  cacheMs: DM_AUTH_CACHE_MS,
                  handler: async (challenge, url) =>
                    await buildAuthEvent(signerInfo.signer, challenge, url),
                }
              : { enabled: false };
            client.setAuthOptions(authOptions);

            try {
              const result = await client.publishSigned(event);
              const ack = result.ack;
              const ackRecord: RelayAck = {
                ok: ack.accepted,
                reason: ack.message,
              };
              relayResults[relayUrl] = ackRecord;
              if (ack.accepted) {
                delivered = true;
                sentVia = "ws";
                this.markLocalEchoSent(msg, meta, { [relayUrl]: ackRecord }, "ws");
                ensureConfirmation();
                break;
              }
              lastFailureReason = ack.message ?? lastFailureReason;
            } catch (err) {
              const reason = err instanceof Error ? err.message : String(err ?? "error");
              relayResults[relayUrl] = { ok: false, reason };
              lastFailureReason = reason;
              continue;
            }
          }
        }

        if (!delivered) {
          try {
            const ack = await publishEventViaHttp(event, {
              url: DM_HTTP_EVENT_URL,
              timeoutMs: DM_HTTP_ACK_TIMEOUT_MS,
            });
            const ackRecord: RelayAck = {
              ok: ack.accepted,
              reason: ack.message,
            };
            relayResults[DM_HTTP_EVENT_URL] = ackRecord;
            if (ack.accepted) {
              delivered = true;
              sentVia = "http";
              this.markLocalEchoSent(
                msg,
                meta,
                { [DM_HTTP_EVENT_URL]: ackRecord },
                "http",
              );
              ensureConfirmation();
            } else {
              httpAck = ack;
              httpAckNonRetryable = isNonRetryableHttpAck(ack);
              lastFailureReason = ack.message ?? lastFailureReason;
              this.mergeRelayAckResults(msg, meta, {
                [DM_HTTP_EVENT_URL]: ackRecord,
              });
            }
          } catch (httpErr) {
            const reason =
              httpErr instanceof Error ? httpErr.message : String(httpErr ?? "error");
            relayResults[DM_HTTP_EVENT_URL] = { ok: false, reason };
            console.error("[messenger.executeSendWithMeta] HTTP fallback failed", httpErr);
            lastFailureReason = reason;
          }
        }

        if (!delivered && !httpAck) {
          const failedRelays = Object.entries(relayResults).filter(
            ([, ack]) => !ack?.ok,
          );
          const summary = failedRelays
            .map(([url, ack]) => (ack?.reason ? `${url}: ${ack.reason}` : url))
            .join(", ");
          const reason = summary || lastFailureReason;
          throw new Error(
            reason ? `Failed to send DM: ${reason}` : "Failed to send DM",
          );
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        this.markLocalEchoFailed(msg, meta, reason, relayResults);
        notifyError(
          reason && reason.startsWith("Failed to send DM")
            ? reason
            : `Failed to send DM: ${reason}`,
        );
        return { success: false, event };
      }

      this.mergeRelayAckResults(msg, meta, relayResults);

      if (delivered) {
        if (sentVia === "ws") {
          this.transportMode = "ws";
        } else if (sentVia === "http") {
          this.transportMode = "http";
          this.startHttpPolling();
        }
        notifySuccess("DM sent");
        return { success: true, event };
      }

      if (httpAck) {
        const ackMessage = httpAck.message?.trim();
        ensureConfirmation();
        if (httpAckNonRetryable) {
          const reason = ackMessage || lastFailureReason;
          this.markLocalEchoFailed(
            msg,
            meta,
            reason || "Failed to send DM",
            relayResults,
          );
          notifyError(
            reason && reason.startsWith("Failed to send DM")
              ? reason
              : reason
              ? `Failed to send DM: ${reason}`
              : "Failed to send DM",
          );
          return {
            success: false,
            event,
            confirmationPending: false,
            httpAck,
          };
        }

        const caption =
          ackMessage || lastFailureReason || "The relay has not confirmed receipt yet.";
        notifyWarning("DM delivery pending confirmation", caption, 7000);

        return {
          success: false,
          event,
          confirmationPending: true,
          httpAck,
        };
      }

      return { success: false, event };
    },
    async publishWithQuorum(options: {
      event: NostrEvent;
      relays?: string[];
      signer: SignerType;
      allowHttpFallback?: boolean;
    }): Promise<{
      ackMap: Record<string, RelayAck>;
      acceptedCount: number;
      firstAck: { transport: DmTransportMode; relay: string; ack: RelayAck } | null;
      httpAck: HttpPublishAck | null;
      nonRetryableHttpAck: boolean;
      lastError?: string;
    }> {
      const {
        event,
        relays,
        signer,
        allowHttpFallback = this.httpFallbackEnabled,
      } = options;
      const ackMap: Record<string, RelayAck> = {};
      let acceptedCount = 0;
      let firstAck: {
        transport: DmTransportMode;
        relay: string;
        ack: RelayAck;
      } | null = null;
      let httpAck: HttpPublishAck | null = null;
      let nonRetryableHttpAck = false;
      let lastError: string | undefined;

      const relayCandidates = Array.isArray(relays) && relays.length
        ? relays
        : Array.isArray(this.relays) && this.relays.length
          ? Array.from(new Set(this.relays))
          : Array.from(new Set([...DM_RELAYS]));

      for (const relayUrl of relayCandidates) {
        if (!relayUrl) continue;
        if (acceptedCount >= this.outboxQuorum) break;
        let ackRecord: RelayAck;
        try {
          const client = await ensureFundstrRelayClient(relayUrl);
          const authOptions: FundstrRelayAuthOptions = this.dmRequireAuth
            ? {
                enabled: true,
                cacheMs: DM_AUTH_CACHE_MS,
                handler: async (challenge, url) =>
                  await buildAuthEvent(signer, challenge, url),
              }
            : { enabled: false };
          client.setAuthOptions(authOptions);
          const result = await client.publishSigned(event);
          const ack = result.ack;
          ackRecord = {
            ok: ack.accepted,
            reason: ack.message,
          };
          ackMap[relayUrl] = ackRecord;
          await recordRelayResult(relayUrl, ack.accepted);
          if (ack.accepted) {
            acceptedCount += 1;
            if (!firstAck) {
              firstAck = { transport: "ws", relay: relayUrl, ack: ackRecord };
            }
          } else if (ack.message) {
            lastError = ack.message;
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err ?? "error");
          ackRecord = { ok: false, reason };
          ackMap[relayUrl] = ackRecord;
          await recordRelayResult(relayUrl, false);
          lastError = reason;
        }
      }

      if (acceptedCount >= this.outboxQuorum) {
        return { ackMap, acceptedCount, firstAck, httpAck, nonRetryableHttpAck, lastError };
      }

      if (allowHttpFallback) {
        try {
          const ack = await publishEventViaHttp(event, {
            url: DM_HTTP_EVENT_URL,
            timeoutMs: DM_HTTP_ACK_TIMEOUT_MS,
          });
          const ackRecord: RelayAck = {
            ok: ack.accepted,
            reason: ack.message,
          };
          ackMap[DM_HTTP_EVENT_URL] = ackRecord;
          httpAck = ack;
          if (ack.accepted) {
            acceptedCount += 1;
            if (!firstAck) {
              firstAck = {
                transport: "http",
                relay: DM_HTTP_EVENT_URL,
                ack: ackRecord,
              };
            }
          } else {
            nonRetryableHttpAck = isNonRetryableHttpAck(ack);
            if (ack.message) {
              lastError = ack.message;
            }
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err ?? "error");
          ackMap[DM_HTTP_EVENT_URL] = { ok: false, reason };
          lastError = reason;
        }
      }

      return { ackMap, acceptedCount, firstAck, httpAck, nonRetryableHttpAck, lastError };
    },
    async deliverOutboxItem(record: MessengerOutboxRecord): Promise<void> {
      if (!this.outboxEnabled) return;
      if (!record) return;
      const localId = record.localId || record.id;
      const existingByLocal = localId ? this.findMessageByLocalId(localId) : undefined;
      const existingByMessage = record.messageId
        ? (this.eventMap?.[record.messageId] as MessengerMessage | undefined)
        : undefined;
      const msg = existingByLocal || existingByMessage;
      if (!msg) {
        await updateOutboxStatus(record.id, "failed_perm", {
          lastError: "Message no longer available",
        });
        return;
      }
      const meta = msg.localEcho;
      if (!meta) {
        await updateOutboxStatus(record.id, "failed_perm", {
          lastError: "Message metadata missing",
        });
        return;
      }

      const now = Date.now();
      const attemptNumber = (record.attemptCount ?? 0) + 1;
      const ackMapAll: Record<string, RelayAck> = {
        ...(record.relayResults ?? {}),
      };
      let ackCount = record.ackCount ?? 0;

      if (Object.keys(ackMapAll).length) {
        this.mergeRelayAckResults(msg, meta, ackMapAll);
      }

      const payloadSource = (record.payload ?? {}) as Record<string, any>;
      const sourceFiles = Array.isArray(payloadSource.filesPayload)
        ? payloadSource.filesPayload
        : meta.payload?.filesPayload ?? msg.filesPayload ?? [];
      const normalizedFiles = Array.isArray(sourceFiles)
        ? sourceFiles
            .map((entry: unknown) => normalizeFileMeta(entry))
            .filter((entry): entry is FileMeta => !!entry)
        : [];
      const contentCandidate =
        typeof payloadSource.content === "string"
          ? payloadSource.content
          : meta.payload?.content ??
            buildEventContent(
              meta.payload?.text ?? msg.content ?? "",
              normalizedFiles,
            );
      const textCandidate =
        typeof payloadSource.text === "string"
          ? payloadSource.text
          : meta.payload?.text ?? stripFileMetaLines(contentCandidate);
      const payload = {
        content: contentCandidate,
        text: textCandidate,
        attachment:
          payloadSource.attachment ?? meta.payload?.attachment ?? msg.attachment,
        tokenPayload:
          payloadSource.tokenPayload ?? meta.payload?.tokenPayload ?? msg.tokenPayload,
        filesPayload: normalizedFiles,
      };

      const recipientKey = this.normalizeKey(
        record.recipient ||
          (typeof payloadSource.recipient === "string"
            ? payloadSource.recipient
            : msg.pubkey),
      );
      if (!recipientKey) {
        await updateOutboxStatus(record.id, "failed_perm", {
          lastError: "Invalid recipient",
        });
        this.markLocalEchoFailed(msg, meta, "Invalid recipient", ackMapAll);
        return;
      }

      const commitRelayResults = (updates?: Record<string, RelayAck>) => {
        if (!updates) return;
        for (const [relayUrl, ack] of Object.entries(updates)) {
          ackMapAll[relayUrl] = ack;
        }
      };

      const handlePermanentFailure = async (reason: string) => {
        commitRelayResults();
        this.mergeRelayAckResults(msg, meta, ackMapAll);
        await updateOutboxStatus(record.id, "failed_perm", {
          lastError: reason,
          relayResults: ackMapAll,
          messageId: msg.id,
          ackCount,
          lastAckAt: ackCount > 0 ? Date.now() : record.lastAckAt ?? null,
        });
        this.markLocalEchoFailed(msg, meta, reason, ackMapAll);
        notifyError(
          reason.startsWith("Failed to send DM") ? reason : `Failed to send DM: ${reason}`,
        );
      };

      const scheduleRetry = async (
        reason: string,
        opts: { nonRetryable?: boolean } = {},
      ) => {
        if (opts.nonRetryable || attemptNumber >= OUTBOX_MAX_ATTEMPTS) {
          await handlePermanentFailure(reason);
          return;
        }
        const backoffMs = this.computeBackoffMs(attemptNumber);
        const nextAttemptAt = Date.now() + backoffMs;
        commitRelayResults();
        this.mergeRelayAckResults(msg, meta, ackMapAll);
        meta.error = reason;
        meta.updatedAt = Date.now();
        meta.attempt = attemptNumber + 1;
        await updateOutboxStatus(record.id, "retry_scheduled", {
          lastError: reason,
          relayResults: ackMapAll,
          nextAttemptAt,
          ackCount,
          messageId: msg.id,
          lastAckAt: ackCount > 0 ? Date.now() : record.lastAckAt ?? null,
        });
        emitDmCounter("dm_retry", {
          localId: meta.localId,
          attempt: meta.attempt,
          backoffMs,
        });
      };

      meta.payload = payload;
      meta.attempt = attemptNumber;
      meta.error = null;
      meta.updatedAt = now;
      if (!meta.timerStartedAt) {
        meta.timerStartedAt = now;
      }
      msg.status = meta.status;

      await updateOutboxStatus(record.id, "delivering", {
        attemptCount: attemptNumber,
        nextAttemptAt: now,
        lastError: null,
      });

      try {
        await this.loadIdentity({ refresh: false });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        await scheduleRetry(`Failed to prepare DM signer: ${reason}`);
        return;
      }

      await this.refreshSignerMode();
      const signerInfo = await getActiveDmSigner();
      if (!signerInfo) {
        await handlePermanentFailure("No signer available for direct messages");
        return;
      }
      this.signerMode = signerInfo.mode;

      let event = (payloadSource.event as NostrEvent | undefined) || undefined;
      try {
        if (!event) {
          event = await buildKind4Event(signerInfo.signer, recipientKey, payload.content ?? "");
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        await handlePermanentFailure(`Failed to encrypt DM: ${reason}`);
        return;
      }
      if (!event) {
        await handlePermanentFailure("Failed to build DM event");
        return;
      }

      msg.content = payload.text ?? payload.content ?? "";
      msg.attachment = payload.attachment;
      msg.tokenPayload = payload.tokenPayload;
      msg.filesPayload = payload.filesPayload.length
        ? payload.filesPayload
        : undefined;
      msg.created_at = event.created_at ?? msg.created_at ?? Math.floor(now / 1000);
      if (event.kind) {
        msg.protocol = event.kind === 1059 ? "nip17" : "nip04";
      }
      meta.eventId = event.id;
      const previousId = msg.id;
      if (event.id && previousId !== event.id) {
        msg.id = event.id;
      }
      if (Array.isArray(record.relays) && record.relays.length) {
        meta.relays = record.relays.slice();
      }
      this.registerMessage(msg, [meta.eventId, event.id, previousId, meta.localId]);

      const relayCandidates = Array.isArray(record.relays) && record.relays.length
        ? record.relays
        : Array.isArray(meta.relays) && meta.relays.length
          ? meta.relays
          : Array.isArray(this.relays) && this.relays.length
            ? this.relays
            : Array.from(new Set([...DM_RELAYS]));
      const uniqueRelays = Array.from(new Set(relayCandidates.filter(Boolean)));
      const rankedRelays = uniqueRelays.length ? await rankRelays(uniqueRelays) : [];
      if (rankedRelays.length) {
        meta.relays = rankedRelays.slice();
      }

      const updatedPayload = {
        ...payloadSource,
        ...payload,
        event,
      };
      const baseRecord: MessengerOutboxRecord = {
        ...record,
        status: "delivering",
        attemptCount: attemptNumber,
        nextAttemptAt: now,
        messageId: event.id,
        payload: updatedPayload,
        relays: rankedRelays.length ? rankedRelays : record.relays,
        relayResults: ackMapAll,
        ackCount,
        createdAt: record.createdAt,
        updatedAt: now,
      };
      if (record.firstAckAt) baseRecord.firstAckAt = record.firstAckAt;
      if (record.lastAckAt) baseRecord.lastAckAt = record.lastAckAt;
      await upsertOutbox(baseRecord);

      let publishResult: Awaited<ReturnType<typeof this.publishWithQuorum>>;
      try {
        publishResult = await this.publishWithQuorum({
          event,
          relays: rankedRelays,
          signer: signerInfo.signer,
          allowHttpFallback: this.httpFallbackEnabled,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        await scheduleRetry(reason);
        return;
      }

      const ackUpdates = publishResult.ackMap ?? {};
      commitRelayResults(ackUpdates);
      this.mergeRelayAckResults(msg, meta, ackUpdates);
      ackCount = Math.max(ackCount, publishResult.acceptedCount);
      if (publishResult.firstAck) {
        const { transport, relay, ack } = publishResult.firstAck;
        if (transport === "http") {
          this.transportMode = "http";
          this.startHttpPolling();
        } else if (transport === "ws") {
          this.transportMode = "ws";
        }
        this.markLocalEchoSent(msg, meta, { [relay]: ack }, transport);
        ackCount = Math.max(ackCount, 1);
        baseRecord.firstAckAt = baseRecord.firstAckAt ?? Date.now();
      }
      if (publishResult.acceptedCount > 0) {
        baseRecord.lastAckAt = Date.now();
      }
      baseRecord.ackCount = ackCount;
      baseRecord.relayResults = { ...ackMapAll };
      await upsertOutbox(baseRecord);

      if (ackCount >= this.outboxQuorum) {
        await updateOutboxStatus(record.id, "delivered", {
          relayResults: ackMapAll,
          ackCount,
          lastAckAt: baseRecord.lastAckAt ?? Date.now(),
          firstAckAt: baseRecord.firstAckAt ?? baseRecord.lastAckAt ?? Date.now(),
          lastError: null,
          messageId: event.id,
        });
        msg.status = "confirmed";
        this.recordMutation();
        void this.persistMessage(msg);
        emitDmCounter("dm_outbox_delivered", {
          localId: meta.localId,
          attempt: attemptNumber,
          ackCount,
        });
        notifySuccess("DM sent");
        void this.confirmMessageDelivery(meta.eventId || msg.id, event.id);
        return;
      }

      const reason = publishResult.lastError
        ? publishResult.lastError
        : ackCount > 0
          ? "Awaiting relay quorum"
          : "Failed to send DM";
      const nonRetryable =
        (publishResult.nonRetryableHttpAck && ackCount === 0) || attemptNumber >= OUTBOX_MAX_ATTEMPTS;
      await scheduleRetry(reason, { nonRetryable });
    },
    async outboxPump(): Promise<void> {
      if (!this.outboxEnabled) return;
      if (this.outboxPumpActive) {
        this.outboxPumpRequested = true;
        return;
      }
      this.outboxPumpActive = true;
      this.outboxPumpRequested = false;
      try {
        let safety = 0;
        while (this.outboxEnabled) {
          const owner = this.getOwnerKey();
          const due = await getDueOutboxItems(owner, Date.now());
          if (!due.length) break;
          emitDmCounter("dm_outbox_pump", { owner, size: due.length });
          for (const item of due) {
            await this.deliverOutboxItem(item);
          }
          safety += 1;
          if (safety > 50) {
            console.warn("[messenger.outboxPump] breaking after 50 batches");
            break;
          }
        }
      } catch (err) {
        console.error("[messenger.outboxPump] failed", err);
      } finally {
        this.outboxPumpActive = false;
        if (this.outboxPumpRequested) {
          this.outboxPumpRequested = false;
          void this.outboxPump();
        }
      }
    },
    async sendToken(
      recipient: string,
      amount: number,
      bucketId: string,
      memo?: string,
      subscription?: {
        subscription_id: string;
        tier_id: string;
        month_index: number;
        total_months: number;
      },
    ) {
      try {
        recipient = this.normalizeKey(recipient);
        if (!recipient) return false;
        const wallet = useWalletStore();
        const mints = useMintsStore();
        const proofsStore = useProofsStore();
        const settings = useSettingsStore();
        const tokens = useTokensStore();

        const sendAmount = Math.floor(
          amount * mints.activeUnitCurrencyMultiplyer,
        );

        const mintWallet = wallet.mintWallet(
          mints.activeMintUrl,
          mints.activeUnit,
        );
        const proofsForBucket = mints.activeProofs.filter(
          (p) => p.bucketId === bucketId,
        );

        if (!proofsForBucket.length) {
          notifyError("No tokens available in the selected bucket.");
          return false;
        }

        const { sendProofs } = await wallet.send(
          proofsForBucket,
          mintWallet,
          sendAmount,
          true,
          settings.includeFeesInSendAmount,
          bucketId,
        );

        const tokenStr = proofsStore.serializeProofs(sendProofs);
        const payload = subscription
          ? subscriptionPayload(tokenStr, null, {
              subscription_id: subscription.subscription_id,
              tier_id: subscription.tier_id,
              month_index: subscription.month_index,
              total_months: subscription.total_months,
            })
          : {
              token: tokenStr,
              amount: sendAmount,
              unlockTime: null,
              referenceId: uuidv4(),
            };

        const { success, event, localId } = await this.sendDm(
          recipient,
          JSON.stringify(payload),
          undefined,
          undefined,
          { token: tokenStr, amount: sendAmount, memo },
        );
        if (success) {
          if (subscription) {
            const payment: SubscriptionPayment & { htlc_hash?: string } = {
              token: tokenStr,
              subscription_id: subscription.subscription_id,
              tier_id: subscription.tier_id,
              month_index: subscription.month_index,
              total_months: subscription.total_months,
              amount: sendAmount,
            };
            const target = localId ? this.findMessageByLocalId(localId) : null;
            const fallbackId = event?.id;
            const logMsg = fallbackId
              ? this.eventLog.find((m) => m.id === fallbackId) || target
              : target;
            if (target) target.subscriptionPayment = payment;
            if (logMsg) logMsg.subscriptionPayment = payment;
          }
          tokens.addPendingToken({
            amount: -sendAmount,
            tokenStr: tokenStr,
            unit: mints.activeUnit,
            mint: mints.activeMintUrl,
            description: memo ?? "",
            bucketId,
          });
        }
        return success;
      } catch (e) {
        console.error(e);
        notifyError("Failed to send token");
        return false;
      }
    },

    async sendTokenFromProofs(
      recipient: string,
      proofs: WalletProof[],
      bucketId: string,
      memo?: string,
    ) {
      try {
        recipient = this.normalizeKey(recipient);
        if (!recipient) return false;
        const wallet = useWalletStore();
        const mints = useMintsStore();
        const proofsStore = useProofsStore();
        const settings = useSettingsStore();
        const tokens = useTokensStore();

        const sendAmount = proofs.reduce((sum, p) => sum + p.amount, 0);

        const mintWallet = wallet.mintWallet(
          mints.activeMintUrl,
          mints.activeUnit,
        );

        const { sendProofs } = await wallet.send(
          proofs,
          mintWallet,
          sendAmount,
          true,
          settings.includeFeesInSendAmount,
          bucketId,
        );

        const tokenStr = proofsStore.serializeProofs(sendProofs);
        const payload = {
          token: tokenStr,
          amount: sendAmount,
          unlockTime: null,
          referenceId: uuidv4(),
          memo: memo || undefined,
        };

        const { success } = await this.sendDm(
          recipient,
          JSON.stringify(payload),
          undefined,
          undefined,
          { token: tokenStr, amount: sendAmount, memo },
        );

        if (success) {
          tokens.addPendingToken({
            amount: -sendAmount,
            tokenStr: tokenStr,
            unit: mints.activeUnit,
            mint: mints.activeMintUrl,
            description: memo ?? "",
            bucketId,
          });
        }
        return success;
      } catch (e) {
        console.error(e);
        notifyError("Failed to send token");
        return false;
      }
    },
    async retryOutboxItem(
      localId: string,
      existingRecord?: MessengerOutboxRecord | null,
    ): Promise<SendDmResult | void> {
      if (!this.outboxEnabled) return;
      if (!localId) return { success: false, event: null };
      const msg =
        this.findMessageByLocalId(localId) ||
        (existingRecord?.messageId
          ? (this.eventMap?.[existingRecord.messageId] as
              | MessengerMessage
              | undefined)
          : undefined);
      if (!msg || !msg.localEcho) {
        notifyError("Retry failed – message not found");
        return { success: false, event: null };
      }
      const meta = msg.localEcho;
      const payloadSource = meta.payload ?? {
        content: buildEventContent(msg.content ?? "", msg.filesPayload ?? []),
        text: msg.content ?? "",
        attachment: msg.attachment,
        tokenPayload: msg.tokenPayload,
        filesPayload: msg.filesPayload,
      };
      meta.error = null;
      meta.relayResults = {};
      msg.relayResults = {};
      meta.payload = {
        content: payloadSource.content,
        text: payloadSource.text,
        attachment: payloadSource.attachment,
        tokenPayload: payloadSource.tokenPayload,
        filesPayload: payloadSource.filesPayload,
      };
      this.scheduleLocalEcho(meta, msg);

      try {
        const now = Date.now();
        const existing = existingRecord ?? (await messengerDb.outbox.get(localId));
        const basePayload = {
          content: payloadSource.content,
          text: payloadSource.text,
          attachment: payloadSource.attachment,
          tokenPayload: payloadSource.tokenPayload,
          filesPayload: payloadSource.filesPayload,
          created_at: msg.created_at,
        };
        const nextRecord: MessengerOutboxRecord = existing
          ? {
              ...existing,
              status: "queued",
              payload: { ...existing.payload, ...basePayload },
              relays: Array.isArray(meta.relays) ? meta.relays.slice() : existing.relays,
              nextAttemptAt: now,
              lastError: null,
              relayResults: {},
              updatedAt: now,
            }
          : {
              id: localId,
              owner: this.getOwnerKey(),
              messageId: msg.id,
              localId,
              recipient: msg.pubkey,
              status: "queued",
              nextAttemptAt: now,
              attemptCount: 0,
              payload: { ...basePayload },
              relays: Array.isArray(meta.relays) ? meta.relays.slice() : undefined,
              lastError: null,
              relayResults: {},
              ackCount: 0,
              firstAckAt: null,
              lastAckAt: null,
              createdAt: now,
              updatedAt: now,
            };
        await upsertOutbox(nextRecord);
        meta.attempt = (nextRecord.attemptCount ?? 0) + 1;
        emitDmCounter("dm_retry", { localId: meta.localId, attempt: meta.attempt });
        void this.outboxPump();
        return {
          success: true,
          event: null,
          confirmationPending: true,
          localId: meta.localId,
          eventId: nextRecord.messageId ?? null,
        };
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        this.markLocalEchoFailed(msg, meta, reason);
        notifyError(`Failed to queue DM retry: ${reason}`);
        return { success: false, event: null };
      }
    },
    async retrySend(localId: string): Promise<SendDmResult | void> {
      if (this.outboxEnabled) {
        return await this.retryOutboxItem(localId);
      }
      const msg = this.findMessageByLocalId(localId);
      if (!msg || !msg.localEcho) {
        notifyError("Retry failed – message not found");
        return;
      }
      const meta = msg.localEcho;
      const payload = meta.payload ?? {
        content: msg.content,
        attachment: msg.attachment,
        tokenPayload: msg.tokenPayload,
      };
      meta.error = null;
      meta.relayResults = {};
      msg.relayResults = {};
      this.scheduleLocalEcho(meta, msg);
      meta.attempt += 1;
      emitDmCounter("dm_retry", { localId: meta.localId, attempt: meta.attempt });
      return await this.executeSendWithMeta({
        msg,
        meta,
        recipient: msg.pubkey,
        safeMessage: payload.content,
        attachment: payload.attachment,
        tokenPayload: payload.tokenPayload,
        relayTargets: meta.relays,
      });
    },
    async outboxRetryAll(): Promise<number> {
      if (!this.outboxEnabled) {
        const queue = Array.isArray(this.sendQueue) ? this.sendQueue.slice() : [];
        let retried = 0;
        for (const msg of queue) {
          const localId = msg?.localEcho?.localId;
          if (!localId) continue;
          const result = await this.retrySend(localId);
          if (result && typeof result === "object" && "success" in result) {
            if (result.success) retried += 1;
          } else {
            retried += 1;
          }
        }
        return retried;
      }

      const owner = this.getOwnerKey();
      const records = await messengerDb.outbox
        .where("[owner+status]")
        .equals([owner, "failed_perm"])
        .toArray();
      let retried = 0;
      for (const record of records) {
        const localId = record.localId || record.id;
        if (!localId) continue;
        const result = await this.retryOutboxItem(localId, record);
        if (result && typeof result === "object" && "success" in result && result.success) {
          retried += 1;
        }
      }
      return retried;
    },
    addOutgoingMessage(
      pubkey: string,
      content: string,
      created_at?: number,
      id?: string,
      attachment?: MessageAttachment,
      status: MessengerMessageStatus = "pending",
      tokenPayload?: any,
      localEcho?: LocalEchoMeta,
    ): MessengerMessage {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) throw new Error("Invalid pubkey");
      const eventLogRef = this.eventLog as Ref<MessengerMessage[]>;
      if (!Array.isArray(eventLogRef.value)) {
        eventLogRef.value = [];
      }
      const messageId = localEcho?.localId || id || uuidv4();
      const existingMessage = eventLogRef.value.find((m) => m.id === messageId);
      if (existingMessage) {
        return existingMessage;
      }
      const msg: MessengerMessage = {
        id: messageId,
        pubkey,
        content: sanitizeMessage(content),
        created_at: created_at ?? Math.floor(Date.now() / 1000),
        outgoing: true,
        attachment,
        status: localEcho ? localEcho.status : status,
        tokenPayload,
      };
      if (localEcho) {
        msg.localEcho = localEcho;
        msg.status = localEcho.status;
      }
      const conversationsRef =
        this.conversations as Ref<Record<string, MessengerMessage[]>>;
      let conversationMap = conversationsRef.value;
      if (
        !conversationMap ||
        typeof conversationMap !== "object" ||
        Array.isArray(conversationMap)
      ) {
        conversationMap = {} as Record<string, MessengerMessage[]>;
        conversationsRef.value = conversationMap;
      }
      let existingConversation = conversationMap[pubkey];
      if (!Array.isArray(existingConversation)) {
        existingConversation = [];
        conversationMap[pubkey] = existingConversation;
      }
      if (!existingConversation.some((m) => m.id === messageId)) {
        existingConversation.push(msg);
      }
      eventLogRef.value.push(msg);
      this.registerMessage(msg);
      this.recordMutation();
      void this.persistConversationSnapshot(pubkey);
      return msg;
    },

    async confirmMessageDelivery(messageId: string, eventId: string) {
      const targetId = eventId || messageId;
      if (!targetId) return;
      const timeoutMs = 8_000;
      try {
        const ndk = await useNdk({ requireSigner: false });
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<null>((resolve) => {
          timeoutHandle = setTimeout(() => resolve(null), timeoutMs);
        });
        const ndkEvent = (await Promise.race([
          ndk.fetchEvent({ ids: [targetId] }, { closeOnEose: true, groupable: false }),
          timeoutPromise,
        ])) as NDKEvent | null | undefined;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        if (!ndkEvent) return;

        let msg =
          this.eventLog.find((m) => m.id === messageId) ||
          this.eventLog.find((m) => m.id === targetId);
        if (!msg) {
          msg = Object.values(this.localEchoIndex).find((entry) => {
            const metaId = entry.localEcho?.eventId;
            return entry.id === targetId || metaId === targetId || entry.id === messageId;
          });
          if (msg) {
            if (!this.eventLog.some((existing) => existing === msg)) {
              this.eventLog = [...this.eventLog, msg];
            }
            if (msg.localEcho?.localId) {
              this.localEchoIndex[msg.localEcho.localId] = msg;
            }
          }
        }
        if (!msg) return;

        try {
          const nostrEvent = await ndkEvent.toNostrEvent();
          this.pushOwnMessage(nostrEvent as NostrEvent);
        } catch (conversionErr) {
          console.error(
            "[messenger.confirmMessageDelivery] failed to convert event",
            conversionErr,
          );
        }

        if (msg.outgoing) {
          const meta = msg.localEcho;
          const relayUpdate: Record<string, RelayAck> = {
            ndk: {
              ok: true,
              reason: "Fetched via relay confirmation",
            },
          };
          if (meta) {
            this.markLocalEchoSent(msg, meta, relayUpdate, "ndk-confirmation");
            emitDmCounter("dm_dedup_hits", {
              localId: meta.localId,
              source: "ndk-confirmation",
            });
          } else if (msg.status !== "sent") {
            msg.status = "sent";
            msg.relayResults = {
              ...(msg.relayResults ?? {}),
              ...relayUpdate,
            };
          }
        }
      } catch (err) {
        console.error("[messenger.confirmMessageDelivery] failed", err);
      }
    },
    pushOwnMessage(event: NostrEvent) {
      if (!Array.isArray(this.eventLog)) this.eventLog = [];
      const eventId = event.id;
      let msg = (eventId ? this.eventMap[eventId] : undefined) as
        | MessengerMessage
        | undefined;
      if (!msg) {
        msg = this.eventLog.find((m) => m.id === eventId);
      }
      if (!msg) {
        msg = Object.values(this.localEchoIndex).find(
          (entry) => entry.localEcho?.eventId === eventId,
        );
        if (msg) {
          if (!this.eventLog.some((existing) => existing === msg)) {
            this.eventLog = [...this.eventLog, msg];
          }
          if (msg.localEcho?.localId) {
            this.localEchoIndex[msg.localEcho.localId] = msg;
          }
        }
      }
      if (!msg) return;
      const outboundFiles = extractFilesFromContent(event.content || msg.content || "");
      msg.filesPayload = outboundFiles.length ? outboundFiles : msg.filesPayload;
      if (!this.conversations[msg.pubkey]) {
        this.conversations[msg.pubkey] = [];
      }
      insertUniqueMessage(this.conversations[msg.pubkey], msg);
      insertUniqueMessage(this.eventLog, msg);
      this.registerMessage(msg, [eventId]);
      if (event.kind) {
        msg.protocol = event.kind === 1059 ? "nip17" : "nip04";
      }
      msg.created_at = event.created_at ?? msg.created_at;
      if (msg.outgoing) {
        const meta = msg.localEcho;
        const relayUpdate: Record<string, RelayAck> = {
          subscription: {
            ok: true,
            reason: "Received via relay subscription",
          },
        };
        if (meta) {
          this.markLocalEchoSent(msg, meta, relayUpdate, "subscription");
          emitDmCounter("dm_dedup_hits", {
            localId: meta.localId,
            source: "subscription",
          });
        } else {
          msg.status = "sent";
          msg.relayResults = { ...(msg.relayResults ?? {}), ...relayUpdate };
        }
      }
      try {
        const payload = JSON.parse(msg.content);
        const sub = parseSubscriptionPaymentPayload(payload);
        if (sub) {
          const decoded = tokenUtil.decode(sub.token);
          const amount = decoded
            ? tokenUtil.getProofs(decoded).reduce((s, p) => s + p.amount, 0)
            : 0;
          msg.subscriptionPayment = {
            tokenString: sub.token,
            subscription_id: payload.subscription_id,
            tier_id: payload.tier_id,
            month_index: payload.month_index,
            total_months: payload.total_months,
            amount,
            unlock_time: sub.unlock_time,
            ...({ htlc_hash: sub.htlc_hash } as any),
            htlc_secret: sub.htlc_secret,
          };
        }
      } catch {}
      void this.persistConversationSnapshot(msg.pubkey);
      void this.persistMessage(msg);
      this.recordMutation();
    },
    async addIncomingMessage(event: NostrEvent, plaintext?: string) {
      if (!Array.isArray(this.eventLog)) this.eventLog = [];
      const nostr = useNostrStore();
      if (event.pubkey === nostr.pubkey) {
        return;
      }
      const lastSignerAttempt = this.signerInitCache;
      const shouldSkipIdentityLoad =
        !nostr.signer &&
        !!lastSignerAttempt &&
        !lastSignerAttempt.success &&
        Date.now() - lastSignerAttempt.timestamp < SIGNER_INIT_RETRY_WINDOW_MS &&
        this.signerMode === "none";
      if (shouldSkipIdentityLoad) {
        await this.refreshSignerMode();
      } else {
        await this.loadIdentity({ refresh: false });
      }
      let privKey: string | undefined = undefined;
      if (nostr.signerType !== SignerType.NIP07) {
        privKey = nostr.privKeyHex;
        if (!privKey) return;
      }
      const signerInfo = await getActiveDmSigner();
      if (signerInfo) {
        this.signerMode = signerInfo.mode;
      }
      let decrypted: string;
      try {
        if (plaintext) {
          decrypted = plaintext;
        } else if (signerInfo) {
          decrypted = await signerInfo.signer.nip04Decrypt(
            event.pubkey,
            event.content,
          );
        } else {
          decrypted = await nostr.decryptDmContent(
            privKey,
            event.pubkey,
            event.content,
          );
        }
      } catch (e) {
        if (!plaintext && signerInfo) {
          try {
            decrypted = await nostr.decryptDmContent(
              privKey,
              event.pubkey,
              event.content,
            );
          } catch (fallbackErr) {
            const now = Date.now();
            if (now - lastDecryptError > 30000) {
              notifyError(
                "Failed to decrypt message – ensure your Nostr extension is unlocked",
              );
              lastDecryptError = now;
            } else {
              console.warn(
                "Failed to decrypt message – ensure your Nostr extension is unlocked",
                fallbackErr,
              );
            }
            return;
          }
        } else {
          const now = Date.now();
          if (now - lastDecryptError > 30000) {
            notifyError(
              "Failed to decrypt message – ensure your Nostr extension is unlocked",
            );
            lastDecryptError = now;
          } else {
            console.warn(
              "Failed to decrypt message – ensure your Nostr extension is unlocked",
              e,
            );
          }
          return;
        }
      }
      let subscriptionInfo: SubscriptionPayment | undefined;
      let tokenPayload: any | undefined;
      const filePayloads: FileMeta[] = [];
      const lines = decrypted.split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
          continue;
        }
        let payload: any;
        try {
          payload = JSON.parse(trimmed);
        } catch (parseErr) {
          console.debug("[messenger.addIncomingMessage] invalid JSON", parseErr);
          continue;
        }
        const fileMeta = normalizeFileMeta(payload);
        if (fileMeta) {
          filePayloads.push(fileMeta);
          continue;
        }
        const sub = parseSubscriptionPaymentPayload(payload);
        if (sub) {
          const decoded = tokenUtil.decode(sub.token);
          const amount = decoded
            ? tokenUtil.getProofs(decoded).reduce((s, p) => s + p.amount, 0)
            : 0;
          subscriptionInfo = {
            tokenString: sub.token,
            subscription_id: payload.subscription_id,
            tier_id: payload.tier_id,
            month_index: payload.month_index,
            total_months: payload.total_months,
            amount,
            unlock_time: sub.unlock_time,
            ...({ htlc_hash: sub.htlc_hash } as any),
            htlc_secret: sub.htlc_secret,
          };
          const unlockTs = sub.unlock_time ?? payload.unlockTime ?? 0;
          const creatorsStore = useCreatorsStore();
          const myPubkey = useNostrStore().pubkey;
          const tierName = creatorsStore.tiersMap[myPubkey || ""]?.find(
            (t) => t.id === payload.tier_id,
          )?.name;
          const entry: LockedToken = {
            id: uuidv4(),
            tokenString: sub.token,
            amount,
            owner: "creator",
            creatorNpub: myPubkey,
            subscriberNpub: event.pubkey,
            tierId: payload.tier_id ?? "",
            ...(tierName ? { tierName } : {}),
            intervalKey: payload.subscription_id ?? "",
            unlockTs,
            autoRedeem: true,
            htlcHash: sub.htlc_hash ?? null,
            status:
              unlockTs && unlockTs > Math.floor(Date.now() / 1000)
                ? "pending"
                : "unlockable",
            subscriptionEventId: null,
            subscriptionId: payload.subscription_id,
            monthIndex: payload.month_index,
            totalPeriods: payload.total_months,
            frequency: (payload as any).frequency || "monthly",
            intervalDays:
              (payload as any).interval_days ||
              frequencyToDays(((payload as any).frequency as any) || "monthly"),
            label: "Subscription payment",
          };
          await cashuDb.lockedTokens.put(entry);

          const receiveStore = useReceiveTokensStore();
          receiveStore.receiveData.tokensBase64 = sub.token;
          await receiveStore.enqueue(() =>
            receiveStore.receiveToken(sub.token, DEFAULT_BUCKET_ID),
          );
        } else if (payload && payload.type === "cashu_subscription_claimed") {
          const sub = await cashuDb.subscriptions.get(payload.subscription_id);
          const idx = sub?.intervals.findIndex(
            (i) => i.monthIndex === payload.month_index,
          );
          if (sub && idx !== undefined && idx >= 0) {
            sub.intervals[idx].status = "claimed";
            await cashuDb.subscriptions.update(sub.id, {
              intervals: sub.intervals,
            });
            notifySuccess("Subscription payment claimed");
          }
        } else if (payload && payload.token) {
          const tokensStore = useTokensStore();
          tokenPayload = payload;
          const decoded = tokensStore.decodeToken(payload.token);
          if (decoded) {
            const proofs = tokenUtil.getProofs(decoded);
            if (proofs.some((p) => p.secret.startsWith("P2PK:"))) {
              const buckets = useBucketsStore();
              let bucket = buckets.bucketList.find(
                (b) => b.name === "Subscriptions",
              );
              if (!bucket) {
                bucket = buckets.addBucket({ name: "Subscriptions" });
              }
              if (bucket) {
                const amount =
                  payload.amount !== undefined
                    ? payload.amount
                    : proofs.reduce((s, p) => s + p.amount, 0);
                useLockedTokensStore().addLockedToken({
                  amount,
                  tokenString: payload.token,
                  token: payload.token,
                  pubkey: event.pubkey,
                  locktime: payload.unlock_time ?? payload.unlockTime,
                  bucketId: bucket.id,
                });
              }
              // don't auto-receive locked tokens
            } else {
              const receiveStore = useReceiveTokensStore();
              receiveStore.receiveData.tokensBase64 = payload.token;
              receiveStore.receiveData.bucketId = DEFAULT_BUCKET_ID;
              await receiveStore.enqueue(() =>
                receiveStore.receiveToken(payload.token, DEFAULT_BUCKET_ID),
              );
            }
          }
        }
      }
      const primaryFile = filePayloads[0];
      const sanitized = primaryFile
        ? sanitizeMessage(decrypted, Math.max(1000, decrypted.length))
        : sanitizeMessage(decrypted);
      const baseMessage: MessengerMessage = {
        id: event.id,
        pubkey: event.pubkey,
        content: sanitized,
        created_at: event.created_at,
        outgoing: false,
        protocol: event.kind === 1059 ? "nip17" : "nip04",
        filesPayload: filePayloads.length ? filePayloads : undefined,
        attachment: primaryFile
          ? { type: primaryFile.mime, name: primaryFile.name }
          : undefined,
      };
      if (!this.conversations[event.pubkey]) {
        this.conversations[event.pubkey] = [];
      }
      const conversation = this.conversations[event.pubkey]!;
      const mergeResult = mergeMessengerEvent({
        eventId: event.id,
        eventMap: this.eventMap,
        eventLog: this.eventLog,
        conversation,
        localEchoIndex: this.localEchoIndex,
        createMessage: () => baseMessage,
        onRegister: (message) => this.registerMessage(message, [event.id]),
      });
      const target = mergeResult.message;
      target.content = sanitized;
      target.created_at = event.created_at ?? target.created_at;
      target.outgoing = false;
      target.protocol = event.kind === 1059 ? "nip17" : "nip04";
      target.filesPayload = filePayloads.length ? filePayloads : undefined;
      if (primaryFile) {
        target.attachment = { type: primaryFile.mime, name: primaryFile.name };
      } else if (/^data:[^;]+;base64,/.test(sanitized)) {
        const type = sanitized.substring(5, sanitized.indexOf(";"));
        target.attachment = { type, name: "" };
      }
      if (subscriptionInfo) {
        target.subscriptionPayment = subscriptionInfo;
        target.autoRedeem = true;
      }
      if (tokenPayload) {
        target.tokenPayload = tokenPayload;
      }
      if (mergeResult.created) {
        this.unreadCounts[event.pubkey] =
          (this.unreadCounts[event.pubkey] || 0) + 1;
        if (this.currentConversation !== event.pubkey) {
          let snippet = "New message";
          if (primaryFile) {
            const name = primaryFile.name?.trim();
            snippet = name ? `Received file: ${name}` : "Received file";
          } else {
            const cleaned = stripFileMetaLines(target.content ?? "").slice(0, 40);
            if (cleaned) {
              snippet = cleaned;
            }
          }
          notifySuccess(snippet);
        }
        void this.persistConversationMeta(event.pubkey, "unread");
      } else if (mergeResult.deduped) {
        emitDmCounter("dm_dedup_drop", {
          eventId: event.id,
          pubkey: event.pubkey,
          reason: mergeResult.reason || "unknown",
          source: "incoming",
        });
      }
      void this.persistConversationSnapshot(event.pubkey);
      void this.persistMessage(target);
      this.recordMutation();
    },

    async start() {
      if (this.started) return;
      this.normalizeStoredConversations();
      this.setupTransportWatcher();
      if (this.outboxEnabled) {
        void this.outboxPump();
      }
      const nostr = useNostrStore();
      const since = this.eventLog[this.eventLog.length - 1]?.created_at || 0;
      let httpFallbackNeeded = false;
      let incomingSub: any = null;
      let outgoingSub: any = null;
      try {
        this.dmUnsub?.();
        await this.loadIdentity({ refresh: true });
        const ndk = await useNdk();
        httpFallbackNeeded = this.countConnectedRelays(ndk) === 0;
        const sinceFilter = since > 0 ? { since } : {};
        const subscribeSafe = (
          filter: Record<string, any>,
          handler: (event: NDKEvent) => Promise<void> | void,
        ) => {
          try {
            const sub = ndk.subscribe(filter, {
              closeOnEose: false,
              groupable: false,
            });
            sub.on("event", async (event: NDKEvent) => {
              try {
                await handler(event);
              } catch (err) {
                console.error("[messenger.start] subscription handler failed", err);
              }
            });
            return sub;
          } catch (err) {
            console.error("[messenger.start] failed to subscribe", err);
            return null;
          }
        };

        incomingSub = subscribeSafe(
          { kinds: [4], "#p": [nostr.pubkey], ...sinceFilter },
          async (event: NDKEvent) => {
            const raw = await event.toNostrEvent();
            this.addIncomingMessage(raw as NostrEvent);
          },
        );

        if (!incomingSub) {
          httpFallbackNeeded = true;
        }

        outgoingSub = subscribeSafe(
          { kinds: [4], authors: [nostr.pubkey], ...sinceFilter },
          async (event: NDKEvent) => {
            const raw = await event.toNostrEvent();
            this.pushOwnMessage(raw as NostrEvent);
          },
        );

        if (incomingSub || outgoingSub) {
          this.dmUnsub = () => {
            try {
              incomingSub?.stop();
            } catch {}
            try {
              outgoingSub?.stop();
            } catch {}
          };
        } else {
          this.dmUnsub = null;
        }
      } catch (e) {
        console.error("[messenger.start]", e);
        this.dmUnsub = null;
        httpFallbackNeeded = true;
      } finally {
        if (httpFallbackNeeded) {
          this.startHttpPolling();
          try {
            await this.syncDmViaHttp(nostr.pubkey, since);
          } catch (err) {
            console.error("[messenger.start] HTTP fallback failed", err);
          }
        }
        try {
          await this.initializeConversationSubscriptionWatcher();
          if (this.currentConversation) {
            await this.ensureConversationSubscription(
              this.currentConversation,
              "start",
              { force: true },
            );
          }
        } catch (err) {
          console.warn(
            "[messenger.start] failed to initialize conversation subscription",
            err,
          );
        }
        this.started = true;
      }
    },

    isConnected(): boolean {
      const nostr = useNostrStore();
      return nostr.connected;
    },

    async connect(relays: string[]) {
      const nostr = useNostrStore();
      const unique = Array.from(new Set(relays));
      this.relays = unique as any;
      // Reconnect the nostr store with the updated relays
      await nostr.connect(unique as any);
    },

    removeRelay(relay: string) {
      const updated = (this.relays as any).filter((r: string) => r !== relay);
      this.relays = Array.from(new Set(updated));
      const nostr = useNostrStore();
      nostr.connect(this.relays as any);
    },

    async disconnect() {
      const nostr = useNostrStore();
      await nostr.disconnect();
      this.stopHttpPolling();
      if (this.relayStatusStop) {
        this.relayStatusStop();
        this.relayStatusStop = null;
      }
      this.teardownActiveConversationSubscription();
      conversationWatchStop?.();
      conversationWatchStop = null;
      conversationRelayOff?.();
      conversationRelayOff = null;
      this.started = false;
    },


    createConversation(pubkey: string) {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return;
      if (!this.conversations[pubkey]) {
        this.conversations[pubkey] = [];
        void this.persistConversationSnapshot(pubkey);
      }
      if (this.unreadCounts[pubkey] === undefined) {
        this.unreadCounts[pubkey] = 0;
        void this.persistConversationMeta(pubkey, "unread");
      }
      this.recordMutation();
    },

    startChat(pubkey: string) {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return;
      this.createConversation(pubkey);
      this.markRead(pubkey);
      this.setCurrentConversation(pubkey);
      void this.ensureConversationSubscription(pubkey, "start-chat");
    },

    markRead(pubkey: string) {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return;
      this.unreadCounts[pubkey] = 0;
      void this.persistConversationMeta(pubkey, "unread");
      this.recordMutation();
    },

    togglePin(pubkey: string) {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return;
      this.pinned[pubkey] = !this.pinned[pubkey];
      void this.persistConversationMeta(pubkey, "pinned");
      this.recordMutation();
    },

    deleteConversation(pubkey: string) {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return;
      delete this.conversations[pubkey];
      delete this.unreadCounts[pubkey];
      delete this.pinned[pubkey];
      delete this.aliases[pubkey];
      void this.removeConversationStorage(pubkey);
      if (this.currentConversation === pubkey) {
        this.currentConversation = "";
      }
      this.recordMutation();
    },

    setAlias(pubkey: string, alias: string) {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return;
      if (typeof alias !== "string") {
        console.warn("[messenger] alias must be string", alias);
        return;
      }
      if (alias.trim()) {
        this.aliases[pubkey] = alias.trim();
      } else {
        delete this.aliases[pubkey];
      }
      void this.persistConversationMeta(pubkey, "alias");
      this.recordMutation();
    },

    getAlias(pubkey: string): string | undefined {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return undefined;
      return this.aliases[pubkey];
    },

    setCurrentConversation(pubkey: string) {
      if (!pubkey) {
        this.currentConversation = "";
        return;
      }
      const normalized = this.normalizeKey(pubkey);
      this.currentConversation = normalized || "";
    },

    toggleDrawer() {
      this.drawerMini = !this.drawerMini;
    },

    setDrawer(open: boolean) {
      this.drawerOpen = open;
    },
  },
});
