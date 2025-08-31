import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { NDKSubscription, NDKEvent } from "@nostr-dev-kit/ndk";
import { NDKKind } from "@nostr-dev-kit/ndk";
import { useNdk } from "src/composables/useNdk";
import { useNostrStore } from "./nostr";
import { useWalletStore } from "./wallet";
import { useMintsStore } from "./mints";
import { useProofsStore } from "./proofs";
import { useSettingsStore } from "./settings";
import { useTokensStore } from "./tokens";
import { v4 as uuidv4 } from "uuid";
import { subscriptionPayload } from "src/utils/receipt-utils";
import { notifyError } from "src/js/notify";
import { stickyDmSubscription } from "src/js/nostr-runtime";

export interface NostrMessage {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  outgoing: boolean;
}

export interface NostrConversation {
  pubkey: string;
  messages: NostrMessage[];
  unreadCount: number;
}

export const useDmStore = defineStore("dm", () => {
  const conversations = ref(new Map<string, NostrConversation>());
  const isInitialized = ref(false);
  const isLoading = ref(false);
  const dmSubscription = ref<NDKSubscription | null>(null);
  const eventLog = ref<NostrMessage[]>([]);

  const sortedConversations = computed(() => {
    return Array.from(conversations.value.values()).sort((a, b) => {
      const tsA = a.messages[a.messages.length - 1]?.created_at || 0;
      const tsB = b.messages[b.messages.length - 1]?.created_at || 0;
      return tsB - tsA;
    });
  });

  const totalUnreadCount = computed(() => {
    let total = 0;
    conversations.value.forEach((c) => (total += c.unreadCount));
    return total;
  });

  async function initialize() {
    if (isInitialized.value) return;
    isLoading.value = true;
    const ndk = await useNdk();
    const nostr = useNostrStore();
    const sub = ndk.subscribe(
      { kinds: [NDKKind.EncryptedDirectMessage], "#p": [nostr.pubkey] },
      { closeOnEose: false },
    );
    sub.on("event", handleEncryptedDmEvent);
    dmSubscription.value = sub;
    isInitialized.value = true;
    isLoading.value = false;
  }

  async function handleEncryptedDmEvent(event: NDKEvent) {
    const nostr = useNostrStore();
    let content = event.content;
    try {
      if (typeof (nostr as any).decryptDmContent === "function") {
        content = await (nostr as any).decryptDmContent(
          (nostr as any).privKeyHex,
          event.pubkey,
          event.content,
        );
      }
    } catch {
      // ignore decrypt errors
    }
    const recipient = event.pubkey === nostr.pubkey
      ? event.tags.find((t) => t[0] === "p")?.[1] || event.pubkey
      : event.pubkey;
    const msg: NostrMessage = {
      id: event.id,
      pubkey: recipient,
      content,
      created_at: event.created_at || Math.floor(Date.now() / 1000),
      outgoing: event.pubkey === nostr.pubkey,
    };
    let conv = conversations.value.get(recipient);
    if (!conv) {
      conv = { pubkey: recipient, messages: [], unreadCount: 0 };
      conversations.value.set(recipient, conv);
    }
    conv.messages.push(msg);
    if (!msg.outgoing) conv.unreadCount += 1;
    eventLog.value.push(msg);
  }

  async function sendMessage(
    pubkey: string,
    content: string,
  ): Promise<{ success: boolean; event?: NDKEvent }> {
    const ndk = await useNdk();
    const nostr = useNostrStore();
    const ev = new ndk.eventClass(ndk); // NDKEvent
    ev.kind = NDKKind.EncryptedDirectMessage;
    ev.content = content;
    ev.tags = [["p", pubkey]];
    try {
      await ev.encrypt(nostr.pubkey, pubkey);
      await ev.publish();
      await handleEncryptedDmEvent(ev);
      return { success: true, event: ev };
    } catch {
      return { success: false };
    }
  }

  function markConversationAsRead(pubkey: string) {
    const conv = conversations.value.get(pubkey);
    if (conv) conv.unreadCount = 0;
  }

  // compatibility helpers for legacy code/tests
  async function start() {
    const nostr = useNostrStore();
    if (!(nostr as any).privateKeySignerPrivateKey) {
      notifyError("Missing private key");
    }
    const unsub = await stickyDmSubscription(
      nostr.pubkey,
      () => 0,
      async (ev: any) => {
        if (ev?.toNostrEvent) {
          const ne = await ev.toNostrEvent();
          await addIncomingMessage(ne as any);
        }
      },
    );
    dmSubscription.value = unsub as any;
    isInitialized.value = true;
  }

  async function addIncomingMessage(ev: NDKEvent) {
    await handleEncryptedDmEvent(ev);
  }

  async function addOutgoing(ev: NDKEvent) {
    await handleEncryptedDmEvent(ev);
  }

  async function sendDm(recipient: string, msg: string) {
    const nostr = useNostrStore();
    let result: any = { success: false };
    try {
      result = await (nostr as any).sendNip17DirectMessage(recipient, msg, [
        "wss://relay.example",
      ]);
    } catch {}
    if (result.success && result.event) {
      await handleEncryptedDmEvent(result.event as any);
      return { success: true, event: result.event };
    }
    return { success: false };
  }

  function normalizeKey(pk: string): string {
    const ns: any = useNostrStore();
    const resolved =
      typeof ns?.resolvePubkey === "function" ? ns.resolvePubkey(pk) : pk;
    if (!resolved) {
      console.warn("[dm] invalid pubkey", pk);
      return "";
    }
    return resolved;
  }

  async function sendToken(
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
      recipient = normalizeKey(recipient);
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
        (p: any) => p.bucketId === bucketId,
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

      const { success, event } = await sendDm(
        recipient,
        JSON.stringify(payload),
      );
      if (success && event) {
        if (subscription) {
          const conv = conversations.value.get(recipient);
          const msg = conv?.messages.find((m) => m.id === event.id);
          const payment: any = {
            token: tokenStr,
            subscription_id: subscription.subscription_id,
            tier_id: subscription.tier_id,
            month_index: subscription.month_index,
            total_months: subscription.total_months,
            amount: sendAmount,
          };
          if (msg) msg.subscriptionPayment = payment;
        }
        tokens.addPendingToken({
          amount: -sendAmount,
          token: tokenStr,
          unit: mints.activeUnit,
          mint: mints.activeMintUrl,
          bucketId,
        } as any);
      }
      return success;
    } catch (e) {
      console.error(e);
      notifyError("Failed to send token");
      return false;
    }
  }

  return {
    conversations,
    isInitialized,
    isLoading,
    dmSubscription,
    sortedConversations,
    totalUnreadCount,
    initialize,
    handleEncryptedDmEvent,
    sendMessage,
    markConversationAsRead,
    // legacy
    start,
    addIncomingMessage,
    sendDm,
    addOutgoing,
    eventLog,
    sendToken,
  };
});

export type DmStore = ReturnType<typeof useDmStore>;
