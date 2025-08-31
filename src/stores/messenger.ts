import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { watch, computed } from "vue";
import { Event as NostrEvent } from "nostr-tools";
import { SignerType, useNostrStore, isNip44Ciphertext } from "./nostr";
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
import { NDKKind, NDKEvent } from "@nostr-dev-kit/ndk";
import { filterHealthyRelays } from "src/utils/relayHealth";

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

export type MessengerMessage = {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  outgoing: boolean;
  status?: "pending" | "sent" | "delivered" | "failed";
  attachment?: MessageAttachment;
  subscriptionPayment?: SubscriptionPayment;
  tokenPayload?: any;
  autoRedeem?: boolean;
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
    const unreadCounts = useLocalStorage<Record<string, number>>(
      storageKey("unread"),
      {} as Record<string, number>,
    );
    const pinned = useLocalStorage<Record<string, boolean>>(
      storageKey("pinned"),
      {} as Record<string, boolean>,
    );
    const aliases = useLocalStorage<Record<string, string>>(
      storageKey("aliases"),
      {} as Record<string, string>,
    );
    const eventLog = useLocalStorage<MessengerMessage[]>(
      storageKey("eventLog"),
      [] as MessengerMessage[],
    );
    const sendQueue = useLocalStorage<MessengerMessage[]>(
      storageKey("sendQueue"),
      [] as MessengerMessage[],
    );
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
        sendQueue.value = [] as any;
      },
    );

    return {
      relays,
      conversations,
      unreadCounts,
      pinned,
      aliases,
      eventLog,
      sendQueue,
      currentConversation: "",
      drawerOpen,
      drawerMini,
      started: false,
      watchInitialized: false,
      dmUnsub: null as null | (() => void),
      nip17DmUnsub: null as null | (() => void),
      retryTimer: null as ReturnType<typeof setInterval> | null,
    };
  },
  getters: {
    connected(): boolean {
      const nostr = useNostrStore();
      return nostr.connected;
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
      const nostr = useNostrStore();

      const { content: safeMessage } = generateContentTags(message);

      const userRelays = await nostr.fetchUserRelays(recipient);
      const targetRelays = relays || userRelays || (this.relays as any);
      const healthyRelays = await filterHealthyRelays(targetRelays);

      const msg = this.addOutgoingMessage(
        recipient,
        safeMessage,
        undefined,
        undefined,
        attachment,
        "pending",
        tokenPayload,
      );

      if (!healthyRelays.length) {
        msg.status = "failed";
        this.sendQueue.push(msg);
        return { success: false, event: null };
      }

      // We will now send the message using both NIP-17 and NIP-04 to ensure delivery.
      // We prioritize the result from the modern NIP-17 for the UI feedback.
      const nip17Result = await nostr.sendNip17DirectMessage(
        recipient,
        safeMessage,
        healthyRelays,
      );

      // Additionally, attempt legacy NIP-04 for compatibility and await the result.
      let nip04Result = { success: false, event: null as NDKEvent | null };
      try {
        nip04Result = await nostr.sendDirectMessageUnified(
          recipient,
          safeMessage,
          nostr.privKeyHex,
          nostr.pubkey,
          healthyRelays,
        );
      } catch (error) {
        console.error("Failed to send legacy NIP-04 DM:", error);
      }

      const success = nip17Result.success || nip04Result.success;
      const event = nip17Result.event || nip04Result.event || null;

      if (success) {
        msg.status = "sent";
      } else {
        msg.status = "failed";
        this.sendQueue.push(msg);
        notifyError("Failed to send DM");
      }

      return { success, event };
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
      await this.loadIdentity();
      const nostr = useNostrStore();
      let privKey: string | undefined = undefined;
      if (
        nostr.signerType !== SignerType.NIP07 &&
        nostr.signerType !== SignerType.NIP46
      ) {
        privKey = nostr.privKeyHex;
        if (!privKey) return;
      }
      if (!plaintext && !isNip44Ciphertext(event.content)) {
        notifyError("Invalid encrypted message format (missing iv)");
        return;
      }
      let decrypted: string;
      try {
        decrypted =
          plaintext ??
          (await nostr.decryptDmContent(privKey, event.pubkey, event.content));
      } catch (e) {
        notifyError(
          "Unable to decrypt message. Update your signer and ensure NIP-44 permissions are enabled.",
        );
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
      this.normalizeStoredConversations();
      if (!this.watchInitialized) {
        watch(
          () => [useNostrStore().pubkey, this.relays],
          () => {
            if (this.started) {
              this.started = false;
              this.start();
            }
          },
          { deep: true },
        );
        watch(
          () => useNostrStore().connected,
          (val) => {
            if (val) this.retryFailedMessages();
          },
          { immediate: true },
        );
        this.watchInitialized = true;
      }
      if (this.started) {
        return;
      }
      try {
        this.dmUnsub?.();
        this.nip17DmUnsub?.();
        await this.loadIdentity();
        const nostr = useNostrStore();
        const ext: any = (window as any)?.nostr;
        if (
          (nostr.signerType === SignerType.NIP07 ||
            nostr.signerType === SignerType.NIP46) &&
          !(ext?.nip44?.encrypt && ext?.nip44?.decrypt)
        ) {
          notifyWarning(
            "NIP-44 support missing in signer. Messages may fail; update your signer and enable NIP-44 permissions.",
          );
        }
        if (
          nostr.signerType !== SignerType.NIP07 &&
          nostr.signerType !== SignerType.NIP46 &&
          !nostr.privKeyHex
        ) {
          notifyError("Unable to decrypt messages: no private key");
        }

        const ndk = await useNdk();
        const since =
          this.eventLog[this.eventLog.length - 1]?.created_at || 0;

        const sub04 = ndk.subscribe(
          {
            kinds: [4],
            "#p": [nostr.pubkey],
            since,
          },
          { closeOnEose: false, groupable: false },
        );
        sub04.on("event", async (event: NDKEvent) => {
          const raw = await event.toNostrEvent();
          this.addIncomingMessage(raw as NostrEvent);
        });

        const sub17 = ndk.subscribe(
          {
            kinds: [1059 as NDKKind],
            "#p": [nostr.pubkey],
            since,
          },
          { closeOnEose: false, groupable: false },
        );
        sub17.on("event", async (event: NDKEvent) => {
          try {
            const sealJson = event.content;
            const seal = new NDKEvent(ndk, JSON.parse(sealJson));
            const rumorJson = await seal.decrypt(await nostr.signer.user());
            const rumor = new NDKEvent(ndk, JSON.parse(rumorJson));
            const raw = await rumor.toNostrEvent();
            this.addIncomingMessage(raw as NostrEvent);
          } catch (error) {
            console.error("Failed to decrypt NIP-17 message:", error);
          }
        });

        this.dmUnsub = () => {
          try {
            sub04.stop();
          } catch {}
        };
        this.nip17DmUnsub = () => {
          try {
            sub17.stop();
          } catch {}
        };
      } catch (e) {
        console.error("[messenger.start]", e);
      } finally {
        this.started = true;
        this.retryFailedMessages();
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
    },

    async retryFailedMessages() {
      const attempt = async () => {
        if (!this.isConnected() || !this.sendQueue.length) {
          if (this.retryTimer) {
            clearInterval(this.retryTimer);
            this.retryTimer = null;
          }
          return;
        }
        const nostr = useNostrStore();
        let privKey: string | undefined = undefined;
        if (nostr.signerType !== "NIP07" && nostr.signerType !== "NIP46") {
          privKey = nostr.privKeyHex;
          if (!privKey) return;
        }
        const list = this.relays as any;
        for (const msg of [...this.sendQueue]) {
          try {
            let sent = false;
            try {
              const { success, event } =
                await nostr.sendNip17DirectMessage(
                  msg.pubkey,
                  msg.content,
                  list,
                );
              if (success && event) {
                msg.id = event.id;
                msg.created_at =
                  event.created_at ?? Math.floor(Date.now() / 1000);
                msg.status = "sent";
                const chatStore = useDmChatsStore();
                chatStore.addOutgoing({
                  id: event.id,
                  content: msg.content,
                  created_at:
                    event.created_at ?? Math.floor(Date.now() / 1000),
                  tags: [["p", msg.pubkey]],
                } as any);
                this.pushOwnMessage({
                  id: event.id,
                  content: msg.content,
                } as any);
                const idx = this.sendQueue.indexOf(msg);
                if (idx >= 0) this.sendQueue.splice(idx, 1);
                sent = true;
              }
            } catch (e) {
              console.error("[messenger.retryFailedMessages] NIP-17", e);
            }
            if (!sent) {
              const { success, event } = await nostr.sendDirectMessageUnified(
                msg.pubkey,
                msg.content,
                privKey,
                nostr.pubkey,
                list,
              );
              if (success && event) {
                msg.id = event.id;
                msg.created_at =
                  event.created_at ?? Math.floor(Date.now() / 1000);
                msg.status = "sent";
                this.pushOwnMessage(event as any);
                const idx = this.sendQueue.indexOf(msg);
                if (idx >= 0) this.sendQueue.splice(idx, 1);
              } else if (msg.status !== "sent") {
                msg.status = "failed";
              }
            }
          } catch (e) {
            console.error("[messenger.retryFailedMessages]", e);
            if (msg.status !== "sent") msg.status = "failed";
          }
        }
        if (!this.sendQueue.length && this.retryTimer) {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
        }
      };

      await attempt();

      if (this.sendQueue.length && !this.retryTimer) {
        this.retryTimer = setInterval(() => {
          attempt();
        }, 5000);
      }
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
