import { defineStore } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import type { NDKEvent } from "@nostr-dev-kit/ndk";
import { sanitizeMessage } from "../js/message-utils";

export type DMMessage = {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  outgoing: boolean;
};

type ChatBuckets = Record<string, Record<string, DMMessage[]>>;
type UnreadBuckets = Record<string, Record<string, number>>;

const CHAT_STORAGE_KEY = "cashu.dmChats";
const UNREAD_STORAGE_KEY = "cashu.dmChats.unread";

export const useDmChatsStore = defineStore("dmChats", {
  state: () => ({
    activePubkey: "",
    chatsByUser: useLocalStorage<ChatBuckets>(CHAT_STORAGE_KEY, {}),
    unreadCountsByUser: useLocalStorage<UnreadBuckets>(
      UNREAD_STORAGE_KEY,
      {},
    ),
  }),
  getters: {
    chats(state): Record<string, DMMessage[]> {
      return state.chatsByUser[state.activePubkey] || {};
    },
    unreadCounts(state): Record<string, number> {
      return state.unreadCountsByUser[state.activePubkey] || {};
    },
  },
  actions: {
    setActivePubkey(pubkey: string) {
      if (this.activePubkey === pubkey) return;
      this.activePubkey = pubkey;
      this.ensureActiveBuckets();
    },
    loadChats(pubkey?: string) {
      if (pubkey) {
        this.activePubkey = pubkey;
      }

      this.migrateChats();
      this.migrateUnreadCounts();
      this.ensureActiveBuckets();
    },
    addIncoming(event: NDKEvent) {
      if (!this.ensureActiveBuckets()) return;

      const msg: DMMessage = {
        id: event.id,
        pubkey: event.pubkey,
        content: sanitizeMessage(event.content),
        created_at: event.created_at,
        outgoing: false,
      };
      const chats = this.chatsByUser[this.activePubkey];
      const unreadCounts = this.unreadCountsByUser[this.activePubkey];

      if (!chats[event.pubkey]) {
        chats[event.pubkey] = [];
      }
      chats[event.pubkey].push(msg);
      unreadCounts[event.pubkey] = (unreadCounts[event.pubkey] || 0) + 1;
    },
    addOutgoing(event: NDKEvent) {
      if (!this.ensureActiveBuckets()) return;

      const recipientTag = event.tags?.find((t) => t[0] === "p");
      const recipient = recipientTag ? (recipientTag[1] as string) : "";
      const msg: DMMessage = {
        id: event.id,
        pubkey: recipient,
        content: sanitizeMessage(event.content),
        created_at: event.created_at,
        outgoing: true,
      };

      const chats = this.chatsByUser[this.activePubkey];
      if (!chats[recipient]) {
        chats[recipient] = [];
      }
      chats[recipient].push(msg);
    },
    markChatRead(pubkey: string) {
      if (!this.ensureActiveBuckets()) return;
      this.unreadCountsByUser[this.activePubkey][pubkey] = 0;
    },
    ensureActiveBuckets(): boolean {
      if (!this.activePubkey) return false;
      if (!this.chatsByUser[this.activePubkey]) {
        this.chatsByUser[this.activePubkey] = {};
      }
      if (!this.unreadCountsByUser[this.activePubkey]) {
        this.unreadCountsByUser[this.activePubkey] = {};
      }
      return true;
    },
    migrateChats() {
      const stored = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored);
        if (this.isLegacyChats(parsed)) {
          if (this.activePubkey) {
            this.chatsByUser[this.activePubkey] = parsed;
          }
        } else if (typeof parsed === "object" && parsed) {
          this.chatsByUser = parsed;
        }
      } catch {}
    },
    migrateUnreadCounts() {
      const stored = localStorage.getItem(UNREAD_STORAGE_KEY);
      if (!stored) return;
      try {
        const parsed = JSON.parse(stored);
        if (this.isLegacyUnreadCounts(parsed)) {
          if (this.activePubkey) {
            this.unreadCountsByUser[this.activePubkey] = parsed;
          }
        } else if (typeof parsed === "object" && parsed) {
          this.unreadCountsByUser = parsed;
        }
      } catch {}
    },
    isLegacyChats(value: unknown): value is Record<string, DMMessage[]> {
      if (!value || typeof value !== "object") return false;
      return Object.values(value as Record<string, unknown>).some((entry) =>
        Array.isArray(entry),
      );
    },
    isLegacyUnreadCounts(value: unknown): value is Record<string, number> {
      if (!value || typeof value !== "object") return false;
      return Object.values(value as Record<string, unknown>).some(
        (entry) => typeof entry === "number",
      );
    },
  },
});
