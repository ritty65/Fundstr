import { boot } from "quasar/wrappers";
import { nextTick } from "vue";
import { useWelcomeStore } from "src/stores/welcome";
import { useMnemonicStore } from "src/stores/mnemonic";
import { useMintsStore } from "src/stores/mints";
import { useProofsStore } from "src/stores/proofs";
import { useUiStore } from "src/stores/ui";
import { useSettingsStore } from "src/stores/settings";
import { useCreatorProfileStore } from "src/stores/creatorProfile";
import { useSubscriptionsStore } from "src/stores/subscriptions";
import { useMessengerStore } from "src/stores/messenger";
import type { MessengerMessage } from "src/stores/messenger";
import type { Proof } from "@cashu/cashu-ts";

declare global {
  interface Window {
    __FUNDSTR_E2E__?: Record<string, any>;
  }
}

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = window.indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export default boot(() => {
  if (!import.meta.env.VITE_E2E) {
    return;
  }

  const ui = useUiStore();
  const settings = useSettingsStore();
  settings.checkIncomingInvoices = false;
  settings.periodicallyCheckIncomingInvoices = false;
  settings.useWebsockets = false;
  ui.globalMutexLock = false;

  const api = {
    async reset() {
      localStorage.clear();
      sessionStorage.clear();
      await deleteIndexedDb("cashuDatabase");
      const welcome = useWelcomeStore();
      welcome.$reset?.();
      welcome.showWelcome = true;
      welcome.currentSlide = 0;
      welcome.seedPhraseValidated = false;
      welcome.walletRestored = false;
      welcome.termsAccepted = false;
      welcome.nostrSetupCompleted = false;
      welcome.mintConnected = false;
      welcome.featuresVisited = {
        creatorStudio: false,
        subscriptions: false,
        buckets: false,
      };
      welcome.welcomeCompleted = false;
      const mints = useMintsStore();
      mints.mints = [];
      mints.activeMintUrl = "";
      mints.activeProofs = [];
      await nextTick();
    },
    async bootstrap() {
      const mnemonic = useMnemonicStore();
      if (!mnemonic.mnemonic) {
        await mnemonic.initializeMnemonic();
      }
      ui.mainNavOpen = false;
    },
    async seedMint(config: {
      url: string;
      nickname?: string;
      keysetId: string;
    }) {
      const mints = useMintsStore();
      const mintEntry = {
        url: config.url,
        nickname: config.nickname ?? "E2E Mint",
        keysets: [
          {
            id: config.keysetId,
            unit: "sat",
            active: true,
          },
        ],
        keys: [
          {
            id: config.keysetId,
            unit: "sat",
            keys: {
              1: "02" + "1".repeat(64),
              2: "02" + "2".repeat(64),
              4: "02" + "3".repeat(64),
              8: "02" + "4".repeat(64),
              16: "02" + "5".repeat(64),
              32: "02" + "6".repeat(64),
              64: "02" + "7".repeat(64),
              128: "02" + "8".repeat(64),
              256: "02" + "9".repeat(64),
              512: "02" + "a".repeat(64),
              1024: "02" + "b".repeat(64),
            },
          },
        ],
        info: {
          name: "E2E Mint",
          pubkey: "e2e",
          version: "0.0-test",
          contact: [],
          nuts: {
            4: { methods: [], disabled: false },
            5: { methods: [], disabled: false },
          },
        },
      } as any;
      mints.mints = [mintEntry];
      mints.activeMintUrl = config.url;
      mints.addMintData.url = config.url;
      localStorage.setItem("cashu.mints", JSON.stringify([mintEntry]));
      localStorage.setItem("cashu.activeMintUrl", config.url);
      localStorage.setItem("cashu.activeUnit", "sat");
      await nextTick();
    },
    async creditProofs(amounts: number[]) {
      const proofsStore = useProofsStore();
      const mints = useMintsStore();
      const keysetId =
        mints.activeKeysets[0]?.id || mints.mints[0]?.keysets?.[0]?.id;
      if (!keysetId) return;
      const proofs: Proof[] = amounts.map((amount, index) => ({
        amount,
        id: keysetId,
        secret: `e2e-secret-${Date.now()}-${index}-${Math.random()}`,
        C: `e2e-C-${Date.now()}-${index}`,
      }));
      await proofsStore.addProofs(proofs);
      await proofsStore.updateActiveProofs();
    },
    async debitProofs(amounts: number[]) {
      const proofsStore = useProofsStore();
      const proofs = await proofsStore.getProofs();
      const toRemove: Proof[] = [];
      for (const amount of amounts) {
        const index = proofs.findIndex(
          (p) => p.amount === amount && !toRemove.includes(p as Proof),
        );
        if (index >= 0) {
          toRemove.push(proofs[index]);
        }
      }
      if (toRemove.length) {
        await proofsStore.removeProofs(toRemove);
        await proofsStore.updateActiveProofs();
      }
    },
    async generateToken(amount: number) {
      await api.debitProofs([amount]);
      const token = `cashu:e2e-token-${amount}-${Date.now()}`;
      localStorage.setItem("e2e.lastToken", token);
      return token;
    },
    async redeemToken(amount: number) {
      await api.creditProofs([amount]);
    },
    async setCreatorProfile(profile: Record<string, unknown>) {
      const creator = useCreatorProfileStore();
      creator.setProfile(profile as any);
      creator.markClean();
    },
    async addSubscription(data: {
      creatorNpub: string;
      tierId: string;
      amountPerInterval: number;
      frequency?: string;
    }) {
      const store = useSubscriptionsStore();
      await store.addSubscription({
        creatorNpub: data.creatorNpub,
        tierId: data.tierId,
        creatorP2PK: "",
        mintUrl: useMintsStore().activeMintUrl || "https://mint.test",
        amountPerInterval: data.amountPerInterval,
        frequency: (data.frequency as any) ?? "monthly",
        startDate: Date.now(),
        commitmentLength: 1,
        intervals: [],
        status: "active",
        creatorName: "E2E Creator",
        tierName: "Supporter",
        benefits: [],
        creatorAvatar: "",
      } as any);
    },
    async seedConversation(pubkey: string, messages: MessengerMessage[]) {
      const messenger = useMessengerStore();
      const key = messenger.normalizeKey(pubkey);
      messenger.conversations[key] = messages;
      messenger.currentConversation = key;
    },
    getSnapshot() {
      const mints = useMintsStore();
      const subs = useSubscriptionsStore();
      const messenger = useMessengerStore();
      const activeConversation = messenger.currentConversation;
      const conversation = activeConversation
        ? messenger.conversations[activeConversation] || []
        : [];
      return {
        balance: mints.totalUnitBalance,
        subscriptions: subs.subscriptions.value.map((s) => s.id),
        conversationCount: conversation.length,
      };
    },
  };

  window.__FUNDSTR_E2E__ = api;
});

