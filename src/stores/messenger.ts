import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { watch, computed, ref } from "vue";
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

function ensureMap(ref: { value: any }) {
  if (
    !ref.value ||
    typeof ref.value !== "object" ||
    Array.isArray(ref.value) ||
    Object.getPrototypeOf(ref.value) !== Object.prototype
  ) {
    ref.value = {};
  }
}

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

function generateContentTags(
  content?: unknown,
  tags?: unknown,
): { content: string; tags: string[][] } {
  const safeContent =
    typeof content === "string" && content
      ? sanitizeMessage(content)
      : "";
  const safeTags: string[][] = Array.isArray(tags) ? (tags as string[][]) : [];
  return { content: safeContent, tags: safeTags };
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
    attachment?: MessageAttachment;
    tokenPayload?: any;
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
  autoRedeem?: boolean;
  relayResults?: Record<string, RelayAck>;
  localEcho?: LocalEchoMeta;
};

type SendDmResult = {
  success: boolean;
  event: NostrEvent | null;
  confirmationPending?: boolean;
  httpAck?: HttpPublishAck | null;
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

    const conversations = useLocalStorage<Record<string, MessengerMessage[]>>(
      storageKey("conversations"),
      {} as Record<string, MessengerMessage[]>,
    );
    ensureMap(conversations);
    const unreadCounts = useLocalStorage<Record<string, number>>(
      storageKey("unread"),
      {} as Record<string, number>,
    );
    ensureMap(unreadCounts);
    const pinned = useLocalStorage<Record<string, boolean>>(
      storageKey("pinned"),
      {} as Record<string, boolean>,
    );
    ensureMap(pinned);
    const aliases = useLocalStorage<Record<string, string>>(
      storageKey("aliases"),
      {} as Record<string, string>,
    );
    ensureMap(aliases);
    const eventLog = useLocalStorage<MessengerMessage[]>(
      storageKey("eventLog"),
      [] as MessengerMessage[],
    );
    if (!Array.isArray(eventLog.value)) eventLog.value = [];
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

    for (const message of eventLog.value) {
      if (!message || typeof message !== "object") continue;
      if (message.id) {
        eventMap[message.id] = message;
      }
      if (message.localEcho?.eventId) {
        eventMap[message.localEcho.eventId] = message;
      }
      if (message.localEcho?.localId) {
        localEchoIndex[message.localEcho.localId] = message;
      }
    }

    watch(
      () => nostrStore.pubkey,
      () => {
        conversations.value = {} as any;
        unreadCounts.value = {} as any;
        pinned.value = {} as any;
        aliases.value = {} as any;
        eventLog.value = [] as any;
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
        conversationSubscriptionRef.value = null;
        activeConversationSubscription?.stop();
        activeConversationSubscription = null;
        conversationWatchStop?.();
        conversationWatchStop = null;
        conversationRelayOff?.();
        conversationRelayOff = null;
        signerInitCache.value = null;
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
      meta.timerStartedAt = Date.now();
      meta.updatedAt = meta.timerStartedAt;
      if (!meta.createdAt) {
        meta.createdAt = meta.timerStartedAt;
      }
      meta.status = "pending";
      msg.localEcho = meta;
      msg.status = "pending";
      this.localEchoIndex[meta.localId] = msg;
      this.localEchoTimeouts[meta.localId] = setTimeout(() => {
        void this.handleLocalEchoTimeout(meta.localId);
      }, LOCAL_ECHO_TIMEOUT_MS);
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
        ndk.pool.on("relay:connect", onRelayConnect);
        conversationRelayOff = () => {
          ndk.pool.off?.("relay:connect", onRelayConnect);
        };
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
    ): Promise<SendDmResult> {
      recipient = this.normalizeKey(recipient);
      if (!recipient) return { success: false, event: null };

      const { content: safeMessage } = generateContentTags(message);
      const relayTargets = relays ? Array.from(new Set(relays)) : undefined;
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
          content: safeMessage,
          attachment,
          tokenPayload,
        },
      };

      const msg = this.addOutgoingMessage(
        recipient,
        safeMessage,
        undefined,
        undefined,
        attachment,
        "pending",
        tokenPayload,
        meta,
      );
      msg.relayResults = {};
      this.scheduleLocalEcho(meta, msg);

      return await this.executeSendWithMeta({
        msg,
        meta,
        recipient,
        safeMessage,
        attachment,
        tokenPayload,
        relayTargets,
      });
    },
    async executeSendWithMeta(options: {
      msg: MessengerMessage;
      meta: LocalEchoMeta;
      recipient: string;
      safeMessage: string;
      attachment?: MessageAttachment;
      tokenPayload?: any;
      relayTargets?: string[];
    }): Promise<SendDmResult> {
      const { msg, meta, recipient, safeMessage, attachment, tokenPayload } = options;
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
        event = await buildKind4Event(signerInfo.signer, recipient, safeMessage);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        const relayResults = { encryption: { ok: false, reason } } as Record<string, RelayAck>;
        this.markLocalEchoFailed(msg, meta, reason, relayResults);
        notifyError(`Failed to encrypt DM: ${reason}`);
        return { success: false, event: null };
      }

      const previousId = msg.id;
      msg.id = event.id;
      msg.created_at = event.created_at ?? msg.created_at;
      meta.eventId = event.id;
      meta.payload = {
        content: safeMessage,
        attachment,
        tokenPayload,
      };
      if (relayTargets?.length) {
        meta.relays = relayTargets;
      }
      if (event.kind) {
        msg.protocol = event.kind === 1059 ? "nip17" : "nip04";
      }
      if (previousId !== event.id) {
        const convo = this.conversations[recipient];
        if (Array.isArray(convo)) {
          const dupes = convo.filter((m) => m !== msg && m.id === event.id);
          for (const duplicate of dupes) {
            const idx = convo.indexOf(duplicate);
            if (idx >= 0) {
              convo.splice(idx, 1);
            }
          }
        }
        const dupes = this.eventLog.filter((m) => m !== msg && m.id === event.id);
        for (const duplicate of dupes) {
          const idx = this.eventLog.indexOf(duplicate);
          if (idx >= 0) {
            this.eventLog.splice(idx, 1);
          }
        }
      }
      this.registerMessage(msg, [previousId, meta.eventId, event.id]);

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
        void this.confirmMessageDelivery(msg.id, event.id);
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

        const { success, event } = await this.sendDm(
          recipient,
          JSON.stringify(payload),
          undefined,
          undefined,
          { token: tokenStr, amount: sendAmount, memo },
        );
        if (success && event) {
          if (subscription) {
            const msg = this.conversations[recipient]?.find(
              (m) => m.id === event.id,
            );
            const logMsg = this.eventLog.find((m) => m.id === event.id);
            const payment: SubscriptionPayment & { htlc_hash?: string } = {
              token: tokenStr,
              subscription_id: subscription.subscription_id,
              tier_id: subscription.tier_id,
              month_index: subscription.month_index,
              total_months: subscription.total_months,
              amount: sendAmount,
            };
            if (msg) msg.subscriptionPayment = payment;
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

        const { success, event } = await this.sendDm(
          recipient,
          JSON.stringify(payload),
          undefined,
          undefined,
          { token: tokenStr, amount: sendAmount, memo },
        );

        if (success && event) {
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
    async retrySend(localId: string): Promise<SendDmResult | void> {
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
      meta.attempt += 1;
      meta.status = "pending";
      meta.error = null;
      meta.updatedAt = Date.now();
      meta.timerStartedAt = null;
      meta.relayResults = {};
      msg.status = "pending";
      msg.relayResults = {};
      this.scheduleLocalEcho(meta, msg);
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
      const messageId = id || uuidv4();
      if (this.eventLog.some((m) => m.id === messageId))
        return this.eventLog.find((m) => m.id === messageId)!;
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
      const existingConversation = this.conversations[pubkey] || [];
      if (!existingConversation.some((m) => m.id === messageId)) {
        this.conversations[pubkey] = [...existingConversation, msg];
      }
      this.eventLog = [...this.eventLog, msg];
      this.registerMessage(msg);
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
      const sanitized = sanitizeMessage(decrypted);
      const baseMessage: MessengerMessage = {
        id: event.id,
        pubkey: event.pubkey,
        content: sanitized,
        created_at: event.created_at,
        outgoing: false,
        protocol: event.kind === 1059 ? "nip17" : "nip04",
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
      if (/^data:[^;]+;base64,/.test(sanitized)) {
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
          const snippet = target.content.slice(0, 40);
          notifySuccess(snippet);
        }
      } else if (mergeResult.deduped) {
        emitDmCounter("dm_dedup_drop", {
          eventId: event.id,
          pubkey: event.pubkey,
          reason: mergeResult.reason || "unknown",
          source: "incoming",
        });
      }
    },

    async start() {
      if (this.started) return;
      this.normalizeStoredConversations();
      this.setupTransportWatcher();
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

    disconnect() {
      const nostr = useNostrStore();
      nostr.disconnect();
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
    },


    createConversation(pubkey: string) {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return;
      if (!this.conversations[pubkey]) {
        this.conversations[pubkey] = [];
      }
      if (this.unreadCounts[pubkey] === undefined) {
        this.unreadCounts[pubkey] = 0;
      }
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
    },

    togglePin(pubkey: string) {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return;
      this.pinned[pubkey] = !this.pinned[pubkey];
    },

    deleteConversation(pubkey: string) {
      pubkey = this.normalizeKey(pubkey);
      if (!pubkey) return;
      delete this.conversations[pubkey];
      delete this.unreadCounts[pubkey];
      delete this.pinned[pubkey];
      delete this.aliases[pubkey];
      if (this.currentConversation === pubkey) {
        this.currentConversation = "";
      }
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
