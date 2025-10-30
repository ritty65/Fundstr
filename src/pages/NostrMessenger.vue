<template>
  <q-page
    class="row full-height no-horizontal-scroll"
    :class="[$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark']"
    v-touch-swipe.right="openDrawer"
  >
    <div
      :class="[
        'col column',
        $q.screen.gt.xs
          ? 'q-pt-xs q-px-lg q-pb-md'
          : 'q-pt-none q-px-md q-pb-md',
      ]"
    >
      <q-banner v-if="connecting && !loading" dense class="bg-grey-3">
        Connecting...
      </q-banner>
        <q-banner
          v-else-if="!messenger.connected && !loading"
          dense
          class="bg-grey-3"
        >
        <div class="row items-center q-gutter-sm">
          <span>
            Offline - {{ connectedCount }}/{{ totalRelays }} connected
            <span v-if="nextReconnectIn !== null">
              - reconnecting in {{ nextReconnectIn }}s
            </span>
          </span>
          <q-btn flat dense label="Reconnect All" @click="reconnectAll" />
        </div>
        </q-banner>
        <q-banner
          v-if="initError || startTimedOut"
          dense
          class="bg-red-2 q-mb-sm"
        >
          <div class="row items-center no-wrap q-gutter-sm">
            <div class="column">
              <span v-if="startTimedOut">Messenger startup timed out.</span>
              <span
                v-if="
                  initError &&
                  (!startTimedOut || initError !== 'Messenger startup timed out')
                "
              >
                {{ initError }}
              </span>
            </div>
            <q-space />
            <q-btn
              flat
              dense
              label="Retry"
              :loading="connecting"
              @click="init"
            />
            <q-btn
              flat
              dense
              label="Open Setup Wizard"
              @click="openSetupWizardFromError"
            />
          </div>
        </q-banner>
        <NostrRelayErrorBanner />
        <q-banner
          v-if="failedRelays.length"
          dense
          class="bg-red-2 q-mb-sm"
        >
          <div
            v-for="url in failedRelays"
            :key="url"
            class="row items-center no-wrap"
          >
            <span>Relay {{ url }} unreachable</span>
            <q-space />
            <q-btn
              flat
              dense
              label="Remove"
              @click="removeRelay(url)"
            />
          </div>
        </q-banner>
        <q-banner v-if="failedOutboxCount" dense class="bg-orange-2 q-mb-sm">
          <div class="row items-center no-wrap">
            <span>{{ failedOutboxCount }} message(s) failed</span>
            <q-space />
            <q-btn flat dense label="Retry" @click="retryFailedQueue" />
          </div>
        </q-banner>
        <q-banner
          v-if="pendingDecryptCount"
          dense
          class="bg-grey-2 q-mb-sm"
        >
          <div class="row items-center no-wrap">
            <span>
              {{ pendingDecryptCount }} encrypted message
              <span v-if="pendingDecryptCount > 1">s</span>
              awaiting decryption
            </span>
            <q-space />
            <q-btn
              flat
              dense
              label="Retry decryption"
              :loading="retryingDecrypts"
              @click="retryPendingDecrypts"
            />
          </div>
        </q-banner>
        <q-spinner v-if="loading" size="lg" color="primary" />
        <ActiveChatHeader :pubkey="selected" :relays="relayInfos" />
      <MessageList :messages="messages" class="col" />
      <MessageInput @send="sendMessage" @sendToken="openSendTokenDialog" />
      <ChatSendTokenDialog ref="chatSendTokenDialogRef" :recipient="selected" />
    </div>
    <q-btn
      v-if="$q.screen.lt.md && !messenger.drawerOpen"
      fab
      icon="chat"
      color="primary"
      class="fixed bottom-left"
      style="bottom: 16px; left: 16px"
      @click="openDrawer"
    />
  </q-page>
  <NostrSetupWizard v-model="showSetupWizard" @complete="setupComplete" />
</template>

<script lang="ts">
import {
  defineComponent,
  computed,
  ref,
  onMounted,
  onUnmounted,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { useMessengerStore } from "src/stores/messenger";
import { useNdk } from "src/composables/useNdk";
import { useNostrStore } from "src/stores/nostr";
import { useUiStore } from "src/stores/ui";
import { nip19 } from "nostr-tools";
import type NDK from "@nostr-dev-kit/ndk";
import ActiveChatHeader from "components/ActiveChatHeader.vue";
import MessageList from "components/MessageList.vue";
import MessageInput from "components/MessageInput.vue";
import type { FileMeta } from "src/utils/messengerFiles";
import ChatSendTokenDialog from "components/ChatSendTokenDialog.vue";
import NostrSetupWizard from "components/NostrSetupWizard.vue";
import NostrRelayErrorBanner from "components/NostrRelayErrorBanner.vue";
import { useQuasar, TouchSwipe } from "quasar";

export default defineComponent({
  name: "NostrMessenger",
  directives: { TouchSwipe },
  components: {
    ActiveChatHeader,
    MessageList,
    MessageInput,
    ChatSendTokenDialog,
    NostrSetupWizard,
    NostrRelayErrorBanner,
  },
  setup() {
    const loading = ref(true);
    const connecting = ref(false);
    const initError = ref<string | null>(null);
    const startTimedOut = ref(false);
    const messenger = useMessengerStore();
    const nostr = useNostrStore();
    const showSetupWizard = ref(false);
    const $q = useQuasar();
    const ui = useUiStore();

    const ndkRef = ref<NDK | null>(null);
    const now = ref(Date.now());
    let timer: ReturnType<typeof setInterval> | undefined;
    const retryingDecrypts = ref(false);
    const pendingDecryptCount = computed(() => messenger.pendingDecryptCount);
    let decryptRetryTimer: ReturnType<typeof setInterval> | null = null;

    function bech32ToHex(pubkey: string): string {
      try {
        const decoded = nip19.decode(pubkey);
        return typeof decoded.data === "string" ? decoded.data : pubkey;
      } catch {
        return pubkey;
      }
    }

    function startDecryptRetryTimer() {
      if (decryptRetryTimer) return;
      decryptRetryTimer = setInterval(() => {
        if (
          typeof document === "undefined" ||
          document.visibilityState === "visible"
        ) {
          void runPendingDecryptRetry("timer");
        }
      }, 15000);
    }

    function stopDecryptRetryTimer() {
      if (!decryptRetryTimer) return;
      clearInterval(decryptRetryTimer);
      decryptRetryTimer = null;
    }

    async function runPendingDecryptRetry(
      _reason: string,
      opts: { force?: boolean } = {},
    ) {
      if (!pendingDecryptCount.value) return;
      if (retryingDecrypts.value) return;
      try {
        retryingDecrypts.value = true;
        await messenger.retryAllPendingDecrypts(opts);
      } catch (err) {
        console.warn("[nostrMessenger.retryDecrypt]", err);
      } finally {
        retryingDecrypts.value = false;
      }
    }

    async function retryPendingDecrypts() {
      await runPendingDecryptRetry("manual", { force: true });
    }

    function handleDecryptVisibility() {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        void runPendingDecryptRetry("visibility");
      }
    }

    async function init() {
      connecting.value = true;
      loading.value = true;
      initError.value = null;
      startTimedOut.value = false;
      try {
        await nostr.initSignerIfNotSet();
        await messenger.loadIdentity();
        ndkRef.value = await useNdk();
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            startTimedOut.value = true;
            reject(new Error("Messenger startup timed out"));
          }, 10000);

          messenger
            .start()
            .then(resolve)
            .catch(reject)
            .finally(() => {
              clearTimeout(timer);
            });
        });
        loading.value = false;
        handleRoutePubkeyChange(route.query.pubkey);
      } catch (e) {
        console.error(e);
        const message = e instanceof Error ? e.message : String(e);
        loading.value = false;
        initError.value = message;
      } finally {
        connecting.value = false;
      }
    }

    async function checkAndInit() {
      if (!nostr.hasIdentity || nostr.relays.length === 0) {
        loading.value = false;
        showSetupWizard.value = true;
        return;
      }
      await init();
    }

    onMounted(() => {
      checkAndInit();
      timer = setInterval(() => (now.value = Date.now()), 1000);
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleDecryptVisibility);
      }
    });

    onUnmounted(() => {
      if (timer) clearInterval(timer);
      stopDecryptRetryTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleDecryptVisibility);
      }
    });

    const route = useRoute();
    const lastRoutePubkey = ref<string | null>(null);

    const handleRoutePubkeyChange = (pubkey: unknown) => {
      if (typeof pubkey !== "string" || !pubkey) {
        lastRoutePubkey.value = null;
        return;
      }

      const normalized = bech32ToHex(pubkey);

      if (
        !normalized ||
        normalized === lastRoutePubkey.value ||
        normalized === messenger.currentConversation
      ) {
        lastRoutePubkey.value = normalized;
        return;
      }

      lastRoutePubkey.value = normalized;
      messenger.startChat(normalized);
      messenger.setCurrentConversation(normalized);
      void messenger.ensureConversationSubscription(normalized, "route-change");

      if ($q.screen.lt.md) {
        messenger.setDrawer(false);
      }
    };

    watch(
      () => route.query.pubkey,
      (pubkey) => {
        handleRoutePubkeyChange(pubkey);
      },
    );

    watch(
      () => messenger.connected,
      (connected) => {
        if (connected) {
          void runPendingDecryptRetry("reconnect");
        }
      },
    );

    watch(
      () => nostr.signer,
      (signer, previous) => {
        if (signer && signer !== previous) {
          void runPendingDecryptRetry("signer-change");
        }
      },
    );

    watch(
      pendingDecryptCount,
      (count, previous) => {
        if (count > 0) {
          startDecryptRetryTimer();
          if (!previous || previous === 0) {
            void runPendingDecryptRetry("pending-change", { force: true });
          }
        } else {
          stopDecryptRetryTimer();
        }
      },
      { immediate: true },
    );

    const openDrawer = () => {
      if ($q.screen.lt.md) {
        messenger.setDrawer(true);
      }
    };

    const selected = computed(() => messenger.currentConversation);
    const chatSendTokenDialogRef = ref<InstanceType<
      typeof ChatSendTokenDialog
    > | null>(null);
    const messages = computed(
      () => messenger.conversations[selected.value] || [],
    );

    const connectedCount = computed(() => {
      if (!ndkRef.value) return 0;
      return Array.from(ndkRef.value.pool.relays.values()).filter(
        (r) => r.connected,
      ).length;
    });

    const totalRelays = computed(() => ndkRef.value?.pool.relays.size || 0);

    const relayInfos = computed(() => {
      if (!ndkRef.value) return [] as { url: string; connected: boolean }[];
      return Array.from(ndkRef.value.pool.relays.values()).map((r) => ({
        url: r.url,
        connected: r.connected,
      }));
    });

    const failedRelays = computed(() => nostr.failedRelays);

    const removeRelay = (url: string) => {
      messenger.removeRelay(url);
      const idx = nostr.failedRelays.indexOf(url);
      if (idx !== -1) nostr.failedRelays.splice(idx, 1);
    };

    const nextReconnectIn = computed(() => {
      if (!ndkRef.value) return null;
      let earliest: number | null = null;
      ndkRef.value.pool.relays.forEach((r) => {
        if (r.status !== 5) {
          const nr = r.connectionStats.nextReconnectAt;
          if (nr && (earliest === null || nr < earliest)) earliest = nr;
        }
      });
      return earliest
        ? Math.max(0, Math.ceil((earliest - now.value) / 1000))
        : null;
    });

    watch(nextReconnectIn, (val) => {
      if (val === 0 && !messenger.connected && !connecting.value) {
        reconnectAll();
      }
    });

    watch(
      () => nostr.pubkey,
      async (newVal, oldVal) => {
        if (newVal && newVal !== oldVal && !loading.value) {
          await messenger.loadIdentity();
          await messenger.start();
        }
      },
    );

    const failedOutboxCount = computed(() => {
      if (messenger.outboxEnabled) {
        const count = messenger.failedOutboxCount;
        return typeof count === "number" ? count : 0;
      }
      const queue = Array.isArray(messenger.sendQueue)
        ? messenger.sendQueue.length
        : 0;
      return queue;
    });

    const sendMessage = (payload: { text: string; files?: FileMeta[] }) => {
      if (!selected.value) return;
      const files = Array.isArray(payload.files) && payload.files.length
        ? payload.files
        : undefined;
      const text = payload.text.trim();
      if (files?.length) {
        messenger.sendDm(
          selected.value,
          text,
          undefined,
          undefined,
          undefined,
          files,
        );
        return;
      }
      if (text) {
        messenger.sendDm(selected.value, text);
      }
    };

    const retryFailedQueue = async () => {
      if (messenger.outboxEnabled) {
        await messenger.outboxRetryAll();
        return;
      }
      const queue = Array.isArray(messenger.sendQueue)
        ? messenger.sendQueue.slice()
        : [];
      for (const msg of queue) {
        const localId = msg?.localEcho?.localId;
        if (localId) {
          await messenger.retrySend(localId);
        }
      }
    };

    function openSendTokenDialog() {
      if (!selected.value) return;
      (chatSendTokenDialogRef.value as any)?.show();
    }

    const openSetupWizardFromError = () => {
      initError.value = null;
      startTimedOut.value = false;
      loading.value = false;
      showSetupWizard.value = true;
    };

    const reconnectAll = async () => {
      connecting.value = true;
      initError.value = null;
      startTimedOut.value = false;
      try {
        await messenger.disconnect();
        await messenger.start();
      } catch (e) {
        console.error(e);
      } finally {
        connecting.value = false;
      }
    };

    const setupComplete = async () => {
      showSetupWizard.value = false;
      loading.value = true;
      initError.value = null;
      startTimedOut.value = false;
      await init();
    };

    return {
      loading,
      connecting,
      initError,
      startTimedOut,
      messenger,
      selected,
      chatSendTokenDialogRef,
      messages,
      showSetupWizard,
      init,
      openSetupWizardFromError,
      sendMessage,
      openSendTokenDialog,
      retryFailedQueue,
      failedOutboxCount,
      pendingDecryptCount,
      retryPendingDecrypts,
      retryingDecrypts,
      reconnectAll,
      connectedCount,
      totalRelays,
      relayInfos,
      failedRelays,
      nextReconnectIn,
      setupComplete,
      openDrawer,
      removeRelay,
      ui,
    };
  },
});
</script>
