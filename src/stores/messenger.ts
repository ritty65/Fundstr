import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { watch, computed } from "vue";
import { Event as NostrEvent, relayInit } from "nostr-tools";
import { SignerType, useNostrStore } from "./nostr";
import { v4 as uuidv4 } from "uuid";
import { useSettingsStore } from "./settings";
import { DEFAULT_RELAYS } from "src/config/relays";
import { sanitizeMessage } from "src/js/message-utils";
import { notifySuccess, notifyError } from "src/js/notify";
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
import { publishEventViaHttp, requestEventsViaHttp } from "@/utils/fundstrRelayHttp";
import {
  DM_RELAY_ALLOWLIST,
  DM_WS_ACK_TIMEOUT_MS,
  DM_HTTP_ACK_TIMEOUT_MS,
  DM_HTTP_EVENT_URL,
  DM_HTTP_REQ_URL,
  DM_HTTP_POLL_INTERVAL_MS,
  DM_REQUIRE_AUTH,
  DM_AUTH_CACHE_TTL_MS,
} from "@/config/dm";
import { resolveDmSigner, type DmSigner } from "src/nostr/dmSigner";

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

export type DmRelayAck = {
  ok: boolean;
  id?: string;
  message?: string;
  error?: string;
  elapsedMs?: number;
  via?: "ws" | "http";
};

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

export type MessengerMessage = {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  outgoing: boolean;
  status?: "pending" | "sent" | "delivered" | "failed";
  protocol?: "nip17" | "nip04";
  attachment?: MessageAttachment;
  subscriptionPayment?: SubscriptionPayment;
  tokenPayload?: any;
  autoRedeem?: boolean;
      relayResults?: Record<string, DmRelayAck>;
};

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
    const drawerOpen = useLocalStorage<boolean>(storageKey("drawerOpen"), true);
    const drawerMini = useLocalStorage<boolean>(
      storageKey("drawerMini"),
      false,
    );

    watch(
      () => nostrStore.pubkey,
      () => {
        conversations.value = {} as any;
        unreadCounts.value = {} as any;
        pinned.value = {} as any;
        aliases.value = {} as any;
        eventLog.value = [] as any;
      },
    );

    return {
      relays,
      conversations,
      unreadCounts,
      pinned,
      aliases,
      eventLog,
      currentConversation: "",
      drawerOpen,
      drawerMini,
      started: false,
      dmUnsub: null as null | (() => void),
      signerMode: "unknown" as "unknown" | "extension" | "software" | "unavailable",
      transportMode: "ws" as "ws" | "http" | "offline",
      lastTransportError: null as string | null,
      httpPollHandle: null as ReturnType<typeof setInterval> | null,
      relayDiagnostics: {} as Record<string, DmRelayAck>,
      authCache: {} as Record<string, number>,
      transportWatcherStop: null as null | (() => void),
    };
  },
  getters: {
    connected(): boolean {
      const nostr = useNostrStore();
      return nostr.connected;
    },
    signerBadge(): string {
      switch (this.signerMode) {
        case "extension":
          return "Extension signer";
        case "software":
          return "Software signer (nsec)";
        case "unavailable":
          return "No signer";
        default:
          return "Detecting signer";
      }
    },
    transportBadge(): string {
      switch (this.transportMode) {
        case "ws":
          return "WS online";
        case "http":
          return "Fallback (HTTP)";
        default:
          return "Offline";
      }
    },
    isHttpFallback(): boolean {
      return this.transportMode === "http";
    },
    sendQueue(): MessengerMessage[] {
      if (!Array.isArray(this.eventLog)) this.eventLog = [];
      return this.eventLog.filter(
        (m) => m.outgoing && m.status === "failed",
      );
    },
  },
  actions: {
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
    async loadIdentity() {
      const nostr = useNostrStore();
      try {
        await nostr.initSignerIfNotSet();
      } catch (e) {
        console.warn("[messenger] signer unavailable, continuing read-only", e);
      }
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
    setTransportMode(mode: "ws" | "http" | "offline") {
      if (this.transportMode !== mode) {
        this.transportMode = mode;
      }
    },
    startHttpPolling(pubkey: string | undefined) {
      if (this.httpPollHandle || !pubkey) return;
      const poll = async () => {
        try {
          const since = this.eventLog[this.eventLog.length - 1]?.created_at || 0;
          await this.syncDmViaHttp(pubkey, since);
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err ?? "error");
          console.warn("[messenger.startHttpPolling]", reason);
        }
      };
      void poll();
      this.httpPollHandle = setInterval(poll, DM_HTTP_POLL_INTERVAL_MS);
    },
    stopHttpPolling() {
      if (this.httpPollHandle) {
        clearInterval(this.httpPollHandle);
        this.httpPollHandle = null;
      }
    },
    clearTransportWatcher() {
      if (this.transportWatcherStop) {
        this.transportWatcherStop();
        this.transportWatcherStop = null;
      }
    },
    async detectSignerMode() {
      try {
        const signer = await resolveDmSigner();
        this.setSignerMode(signer ? signer.mode : "unavailable");
      } catch (err) {
        console.warn("[messenger.detectSignerMode]", err);
        this.setSignerMode("unavailable");
      }
    },
    setSignerMode(mode: "extension" | "software" | "unavailable" | "unknown") {
      if (this.signerMode !== mode) {
        this.signerMode = mode;
      }
    },
    isAuthError(reason?: string): boolean {
      if (!reason) return false;
      const lowered = reason.toLowerCase();
      return (
        lowered.includes("auth") ||
        lowered.includes("restricted") ||
        lowered.includes("challenge")
      );
    },
    async waitForAuthChallenge(relay: any): Promise<string | null> {
      const direct = typeof relay.challenge === "string" ? relay.challenge : "";
      if (direct) return direct;
      const started = Date.now();
      while (Date.now() - started < DM_WS_ACK_TIMEOUT_MS) {
        const current = typeof relay.challenge === "string" ? relay.challenge : "";
        if (current) return current;
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      return typeof relay.challenge === "string" ? relay.challenge : null;
    },
    async performRelayAuth(relay: any, signer: DmSigner, url: string) {
      const challenge = await this.waitForAuthChallenge(relay);
      if (!challenge) {
        throw new Error("AUTH challenge not received");
      }
      await relay.auth(async (authEvent: NostrEvent) => {
        const pubkey = await signer.getPubkeyHex();
        const eventToSign: NostrEvent = {
          ...authEvent,
          pubkey,
        } as NostrEvent;
        return await signer.signEvent(eventToSign);
      });
      this.authCache[url] = Date.now();
    },
    async publishOnceToRelay(
      relay: any,
      event: NostrEvent,
    ): Promise<DmRelayAck> {
      const started = Date.now();
      return await new Promise((resolve) => {
        let settled = false;
        const publishTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve({
            ok: false,
            error: "timeout",
            via: "ws",
            elapsedMs: Date.now() - started,
          });
        }, DM_WS_ACK_TIMEOUT_MS);
        let pub;
        try {
          pub = relay.publish(event);
        } catch (err) {
          clearTimeout(publishTimer);
          const error = err instanceof Error ? err.message : String(err ?? "error");
          resolve({
            ok: false,
            error,
            via: "ws",
            elapsedMs: Date.now() - started,
          });
          return;
        }
        pub.on("ok", (id?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(publishTimer);
          resolve({
            ok: true,
            id: id || event.id,
            via: "ws",
            elapsedMs: Date.now() - started,
          });
        });
        pub.on("failed", (reason: any) => {
          if (settled) return;
          settled = true;
          clearTimeout(publishTimer);
          const message =
            typeof reason === "string"
              ? reason
              : reason?.message
                ? String(reason.message)
                : JSON.stringify(reason ?? "error");
          resolve({
            ok: false,
            error: message,
            via: "ws",
            elapsedMs: Date.now() - started,
          });
        });
      });
    },
    async publishToRelay(
      url: string,
      event: NostrEvent,
      signer: DmSigner,
    ): Promise<DmRelayAck> {
      const relay = relayInit(url);
      const start = Date.now();
      try {
        await Promise.race([
          relay.connect(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("connect timeout")),
              DM_WS_ACK_TIMEOUT_MS,
            ),
          ),
        ]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err ?? "error");
        try {
          relay.close();
        } catch {}
        return {
          ok: false,
          error: message,
          via: "ws",
          elapsedMs: Date.now() - start,
        };
      }

      let ack = await this.publishOnceToRelay(relay, event);
      if (!ack.ok && DM_REQUIRE_AUTH && this.isAuthError(ack.error)) {
        try {
          await this.performRelayAuth(relay, signer, url);
          ack = await this.publishOnceToRelay(relay, event);
        } catch (authErr) {
          const message =
            authErr instanceof Error ? authErr.message : String(authErr ?? "error");
          ack = {
            ok: false,
            error: message,
            via: "ws",
            elapsedMs: Date.now() - start,
          };
        }
      }

      try {
        relay.close();
      } catch {}
      return ack;
    },
    async publishViaWebsocket(
      event: NostrEvent,
      signer: DmSigner,
      relays: string[],
    ): Promise<{ results: Record<string, DmRelayAck>; anyOk: boolean }> {
      const results: Record<string, DmRelayAck> = {};
      for (const url of relays) {
        try {
          const ack = await this.publishToRelay(url, event, signer);
          results[url] = ack;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err ?? "error");
          results[url] = { ok: false, error: message, via: "ws" };
        }
      }
      const anyOk = Object.values(results).some((ack) => ack?.ok);
      return { results, anyOk };
    },
    async sendDm(
      recipient: string,
      message: string,
      relays?: string[],
      attachment?: MessageAttachment,
      tokenPayload?: any,
    ) {
      recipient = this.normalizeKey(recipient);
      if (!recipient) return { success: false, event: null };
      await this.loadIdentity();
      const { content: safeMessage } = generateContentTags(message);
      const msg = this.addOutgoingMessage(
        recipient,
        safeMessage,
        undefined,
        undefined,
        attachment,
        "pending",
        tokenPayload,
      );

      let signer: DmSigner | null = null;
      try {
        signer = await resolveDmSigner();
      } catch (err) {
        console.error("[messenger.sendDm] failed to resolve signer", err);
      }

      if (!signer) {
        this.setSignerMode("unavailable");
        msg.status = "failed";
        msg.relayResults = { signer: { ok: false, error: "No signer" } };
        if (!this.eventLog.some((m) => m.id === msg.id)) {
          this.eventLog.push(msg);
        }
        notifyError("No signer available. Install a Nostr extension or import your nsec.");
        return { success: false, event: null };
      }

      this.setSignerMode(signer.mode);

      let ciphertext: string;
      try {
        ciphertext = await signer.nip04.encrypt(recipient, safeMessage);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        msg.status = "failed";
        msg.relayResults = { encrypt: { ok: false, error: reason } };
        if (!this.eventLog.some((m) => m.id === msg.id)) {
          this.eventLog.push(msg);
        }
        notifyError(`Failed to encrypt DM: ${reason}`);
        return { success: false, event: null };
      }

      let pubkey: string;
      try {
        pubkey = await signer.getPubkeyHex();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        msg.status = "failed";
        msg.relayResults = { signer: { ok: false, error: reason } };
        if (!this.eventLog.some((m) => m.id === msg.id)) {
          this.eventLog.push(msg);
        }
        notifyError(`Failed to resolve pubkey: ${reason}`);
        return { success: false, event: null };
      }

      const createdAt = Math.floor(Date.now() / 1000);
      const unsigned: NostrEvent = {
        kind: 4,
        pubkey,
        content: ciphertext,
        tags: [["p", recipient]],
        created_at: createdAt,
      } as NostrEvent;

      let signed: NostrEvent;
      try {
        signed = await signer.signEvent(unsigned);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err ?? "error");
        msg.status = "failed";
        msg.relayResults = { signer: { ok: false, error: reason } };
        if (!this.eventLog.some((m) => m.id === msg.id)) {
          this.eventLog.push(msg);
        }
        notifyError(`Failed to sign DM: ${reason}`);
        return { success: false, event: null };
      }

      const relayList = Array.from(
        new Set(relays?.length ? relays : DM_RELAY_ALLOWLIST),
      );
      const wsResults = await this.publishViaWebsocket(signed, signer, relayList);
      let relayResults: Record<string, DmRelayAck> = { ...wsResults.results };
      let delivered = wsResults.anyOk;
      let transport: "ws" | "http" | "failed" = delivered ? "ws" : "failed";

      if (!delivered) {
        try {
          const ack = await publishEventViaHttp(signed as any, {
            url: DM_HTTP_EVENT_URL,
            timeoutMs: DM_HTTP_ACK_TIMEOUT_MS,
          });
          relayResults[DM_HTTP_EVENT_URL] = {
            ok: ack.accepted,
            id: ack.id,
            message: ack.message,
            via: "http",
          };
          delivered = ack.accepted;
          transport = delivered ? "http" : "failed";
        } catch (httpErr) {
          const reason =
            httpErr instanceof Error ? httpErr.message : String(httpErr ?? "error");
          relayResults[DM_HTTP_EVENT_URL] = {
            ok: false,
            error: reason,
            via: "http",
          };
          this.lastTransportError = reason;
        }
      }

      this.relayDiagnostics = { ...this.relayDiagnostics, ...relayResults };

      if (transport === "ws") {
        this.stopHttpPolling();
        this.setTransportMode("ws");
      } else if (transport === "http") {
        this.setTransportMode("http");
        this.startHttpPolling(pubkey);
      } else if (!delivered) {
        this.setTransportMode("offline");
      }

      msg.relayResults = relayResults;

      if (delivered) {
        msg.id = signed.id;
        msg.created_at = signed.created_at ?? msg.created_at;
        msg.status = "sent";
        this.pushOwnMessage(signed);
        notifySuccess("DM sent");
        return { success: true, event: signed };
      }

      msg.status = "failed";
      if (!this.eventLog.some((m) => m.id === msg.id)) {
        this.eventLog.push(msg);
      }
      const failedRelays = Object.entries(relayResults).filter(([, ack]) => !ack?.ok);
      const summary = failedRelays
        .map(([url, ack]) => {
          const details = ack?.error || ack?.message;
          return details ? `${url}: ${details}` : url;
        })
        .join(", ");
      notifyError(summary ? `Failed to send DM: ${summary}` : "Failed to send DM");
      return { success: false, event: null };
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
    async retryMessage(msg: MessengerMessage) {
      const nostr = useNostrStore();
      const ext: any = (window as any).nostr;
      if (!ext?.nip04?.encrypt || !ext?.signEvent || !nostr.pubkey) {
        notifyError("Cannot retry – no Nostr extension");
        return;
      }
      try {
        const cipher = await ext.nip04.encrypt(msg.pubkey, msg.content);
        const evt: NostrEvent = {
          kind: 4,
          pubkey: nostr.pubkey!,
          content: cipher,
          tags: [["p", msg.pubkey]],
          created_at: Math.floor(Date.now() / 1000),
        } as any;
        const signed = await ext.signEvent(evt);
        const pool = new SimplePool();
        let sent = false;
        for (const r of this.relays as any) {
          try {
            await pool.publish([r], signed);
            sent = true;
          } catch {}
        }
        if (sent) {
          msg.id = signed.id;
          msg.created_at = signed.created_at ?? msg.created_at;
          msg.status = "sent";
          notifySuccess("Message retried and sent successfully");
        } else {
          notifyError("Retry failed – message not sent");
        }
      } catch (e) {
        console.error(e);
        notifyError("Could not resend message: " + (e as Error).message);
      }
    },
    async retryFailedMessages() {
      if (!Array.isArray(this.eventLog)) this.eventLog = [];
      for (const msg of this.sendQueue) {
        await this.retryMessage(msg);
      }
    },
    addOutgoingMessage(
      pubkey: string,
      content: string,
      created_at?: number,
      id?: string,
      attachment?: MessageAttachment,
      status: "pending" | "sent" | "delivered" | "failed" = "pending",
      tokenPayload?: any,
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
        status,
        tokenPayload,
      };
      if (!this.conversations[pubkey]) this.conversations[pubkey] = [];
      if (!this.conversations[pubkey].some((m) => m.id === messageId))
        this.conversations[pubkey].push(msg);
      this.eventLog.push(msg);
      return msg;
    },

    pushOwnMessage(event: NostrEvent) {
      const msg = this.eventLog.find((m) => m.id === event.id);
      if (!msg) return;
      if (event.kind) {
        msg.protocol = event.kind === 1059 ? "nip17" : "nip04";
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
      await this.loadIdentity();
      const nostr = useNostrStore();
      let privKey: string | undefined = undefined;
      if (nostr.signerType !== SignerType.NIP07) {
        privKey = nostr.privKeyHex;
        if (!privKey) return;
      }
      if (event.pubkey === nostr.pubkey) {
        return;
      }
      let decrypted: string;
      try {
        decrypted =
          plaintext ??
          (await nostr.decryptDmContent(privKey, event.pubkey, event.content));
      } catch (e) {
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
        } catch (e) {
          console.debug("[messenger.addIncomingMessage] invalid JSON", e);
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
      const existing = this.eventLog.find((m) => m.id === event.id);
      if (existing) {
        if (existing.outgoing) existing.status = "delivered";
        return;
      }
      const sanitized = sanitizeMessage(decrypted);
      const msg: MessengerMessage = {
        id: event.id,
        pubkey: event.pubkey,
        content: sanitized,
        created_at: event.created_at,
        outgoing: false,
        protocol: event.kind === 1059 ? "nip17" : "nip04",
      };
      if (/^data:[^;]+;base64,/.test(sanitized)) {
        const type = sanitized.substring(5, sanitized.indexOf(";"));
        msg.attachment = { type, name: "" };
      }
      if (subscriptionInfo) {
        msg.subscriptionPayment = subscriptionInfo;
        msg.autoRedeem = true;
      }
      if (tokenPayload) {
        msg.tokenPayload = tokenPayload;
      }
      if (!this.conversations[event.pubkey]) {
        this.conversations[event.pubkey] = [];
      }
      if (!this.conversations[event.pubkey].some((m) => m.id === event.id))
        this.conversations[event.pubkey].push(msg);
      this.unreadCounts[event.pubkey] =
        (this.unreadCounts[event.pubkey] || 0) + 1;
      this.eventLog.push(msg);
      if (this.currentConversation !== event.pubkey) {
        const snippet = msg.content.slice(0, 40);
        notifySuccess(snippet);
      }
    },

    async start() {
      if (this.started) return;
      this.normalizeStoredConversations();
      const nostr = useNostrStore();
      const since = this.eventLog[this.eventLog.length - 1]?.created_at || 0;
      let httpFallbackNeeded = false;
      let incomingSub: any = null;
      let outgoingSub: any = null;
      try {
        this.dmUnsub?.();
        await this.loadIdentity();
        await this.detectSignerMode();
        const ndk = await useNdk();
        httpFallbackNeeded = this.countConnectedRelays(ndk) === 0;
        if (!this.transportWatcherStop) {
          this.transportWatcherStop = watch(
            () => nostr.connected,
            (connected) => {
              if (!connected) {
                this.setTransportMode("http");
                this.startHttpPolling(nostr.pubkey);
              } else {
                this.stopHttpPolling();
                this.setTransportMode("ws");
              }
            },
          );
        }
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
          this.stopHttpPolling();
          this.setTransportMode("ws");
          httpFallbackNeeded = false;
        } else {
          this.dmUnsub = null;
        }
      } catch (e) {
        console.error("[messenger.start]", e);
        this.dmUnsub = null;
        httpFallbackNeeded = true;
      } finally {
        if (httpFallbackNeeded) {
          this.setTransportMode("http");
          this.startHttpPolling(nostr.pubkey);
          try {
            await this.syncDmViaHttp(nostr.pubkey, since);
          } catch (err) {
            console.error("[messenger.start] HTTP fallback failed", err);
          }
        } else {
          this.stopHttpPolling();
          if (this.transportMode !== "ws") this.setTransportMode("ws");
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
      this.clearTransportWatcher();
      this.setTransportMode("offline");
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
