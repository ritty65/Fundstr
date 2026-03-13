<template>
  <q-page
    class="row full-height no-horizontal-scroll messenger-page bg-surface-1 text-1"
    v-touch-swipe.right="openDrawer"
  >
    <div
      :class="[
        'col column messenger-shell',
        $q.screen.gt.xs
          ? 'q-pt-xs q-px-lg q-pb-md'
          : 'q-pt-none q-px-md q-pb-md',
      ]"
    >
      <div class="messenger-status-stack">
        <q-banner
          v-if="connecting && !loading"
          dense
          class="messenger-status messenger-status--neutral"
        >
          Connecting to your message relays...
        </q-banner>
        <q-banner
          v-else-if="!messenger.connected && !loading"
          dense
          class="messenger-status messenger-status--neutral"
        >
          <div class="row items-center q-gutter-sm">
            <span>
              Offline - {{ connectedCount }}/{{ totalRelays }} relays connected
              <span v-if="nextReconnectIn !== null">
                - retrying in {{ nextReconnectIn }}s
              </span>
            </span>
            <q-btn
              flat
              dense
              no-caps
              label="Reconnect all"
              @click="reconnectAll"
            />
          </div>
        </q-banner>
        <q-banner
          v-if="initError || startTimedOut"
          dense
          class="messenger-status messenger-status--error"
        >
          <div class="row items-center no-wrap q-gutter-sm">
            <div class="column">
              <span v-if="startTimedOut">Messenger startup timed out.</span>
              <span
                v-if="
                  initError &&
                  (!startTimedOut ||
                    initError !== 'Messenger startup timed out')
                "
              >
                {{ initError }}
              </span>
            </div>
            <q-space />
            <q-btn
              flat
              dense
              no-caps
              label="Retry"
              :loading="connecting"
              @click="init"
            />
            <q-btn
              flat
              dense
              no-caps
              label="Open Setup Wizard"
              @click="openSetupWizardFromError"
            />
          </div>
        </q-banner>
        <NostrRelayErrorBanner />
        <q-banner
          v-if="sendTokenWarning"
          dense
          class="messenger-status messenger-status--warning"
        >
          <div class="row items-center no-wrap q-gutter-sm">
            <span>{{ sendTokenWarning.message }}</span>
            <q-space />
            <q-btn
              flat
              dense
              no-caps
              color="primary"
              label="Go to wallet"
              @click="handleSendTokenWarningAction"
            />
          </div>
        </q-banner>
        <q-banner
          v-if="failedRelays.length"
          dense
          class="messenger-status messenger-status--error"
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
              no-caps
              label="Remove"
              @click="removeRelay(url)"
            />
          </div>
        </q-banner>
        <q-banner
          v-if="failedOutboxCount"
          dense
          class="messenger-status messenger-status--warning"
        >
          <div class="row items-center no-wrap">
            <span>{{ failedOutboxCount }} message(s) failed</span>
            <q-space />
            <q-btn flat dense no-caps label="Retry" @click="retryFailedQueue" />
          </div>
        </q-banner>
        <q-banner
          v-if="pendingDecryptCount"
          dense
          class="messenger-status messenger-status--neutral"
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
              no-caps
              label="Retry decryption"
              :loading="retryingDecrypts"
              @click="retryPendingDecrypts"
            />
          </div>
        </q-banner>
      </div>

      <q-spinner
        v-if="loading && !selected"
        size="lg"
        color="primary"
        class="self-center q-mt-xl"
      />

      <template v-else-if="selected">
        <ActiveChatHeader :pubkey="selected" :relays="relayInfos" />
        <MessageList :messages="messages" class="col" />
        <MessageInput @send="sendMessage" @sendToken="openSendTokenDialog" />
      </template>

      <div v-else class="messenger-empty-state col">
        <div class="messenger-empty-card bg-surface-2 text-1">
          <div class="messenger-empty-card__icon">
            <q-icon name="chat" size="40px" />
          </div>
          <div class="text-h5">Choose a conversation</div>
          <p class="text-body1 text-2 q-mb-none">
            Pick an existing chat from the left drawer or start a new one to
            send messages, share tokens, and manage conversations.
          </p>
          <div class="messenger-empty-card__actions">
            <q-btn
              color="primary"
              unelevated
              no-caps
              label="Open chats"
              @click="openDrawer"
            />
            <q-btn
              flat
              color="primary"
              no-caps
              label="Retry connection"
              @click="reconnectAll"
            />
          </div>
        </div>
      </div>

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
  nextTick,
  type WatchStopHandle,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMessengerStore } from "src/stores/messenger";
import { useNdk } from "src/composables/useNdk";
import { useNostrStore } from "src/stores/nostr";
import { useUiStore } from "src/stores/ui";
import type NDK from "@nostr-dev-kit/ndk";
import ActiveChatHeader from "components/ActiveChatHeader.vue";
import MessageList from "components/MessageList.vue";
import MessageInput from "components/MessageInput.vue";
import type { FileMeta } from "src/utils/messengerFiles";
import ChatSendTokenDialog from "components/ChatSendTokenDialog.vue";
import NostrSetupWizard from "components/NostrSetupWizard.vue";
import NostrRelayErrorBanner from "components/NostrRelayErrorBanner.vue";
import { useQuasar, TouchSwipe } from "quasar";
import { useMintsStore } from "src/stores/mints";
import { useBucketsStore } from "src/stores/buckets";
import { storeToRefs } from "pinia";

type SendTokenWarning = {
  message: string;
  tab?: string;
};

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
    const route = useRoute();
    const router = useRouter();
    const mintsStore = useMintsStore();
    const bucketsStore = useBucketsStore();
    const { mints, activeMintUrl } = storeToRefs(mintsStore);
    const { activeBuckets } = storeToRefs(bucketsStore);

    const ndkRef = ref<NDK | null>(null);
    const now = ref(Date.now());
    let timer: ReturnType<typeof setInterval> | undefined;
    const retryingDecrypts = ref(false);
    const pendingDecryptCount = computed(() => messenger.pendingDecryptCount);
    let decryptRetryTimer: ReturnType<typeof setInterval> | null = null;
    let startPromise: Promise<void> | null = null;
    let startRunId = 0;
    let lastCompletedStartRunId = 0;
    let startRecoveryStop: WatchStopHandle | null = null;

    const cleanupStartRecoveryWatcher = () => {
      if (startRecoveryStop) {
        startRecoveryStop();
        startRecoveryStop = null;
      }
    };

    const finalizeStartSuccess = (runId: number) => {
      if (runId !== startRunId) return;
      if (lastCompletedStartRunId === runId) return;
      lastCompletedStartRunId = runId;
      loading.value = false;
      initError.value = null;
      startTimedOut.value = false;
      startPromise = null;
      cleanupStartRecoveryWatcher();
      handleRoutePubkeyChange(route.query.pubkey);
    };

    const revealRouteConversationShell = () => {
      if (!nostr.hasIdentity) return;
      if (!(routeConversation.value || messenger.currentConversation)) return;
      loading.value = false;
      startTimedOut.value = false;
    };

    const registerStartRecoveryWatcher = (runId: number) => {
      cleanupStartRecoveryWatcher();
      startRecoveryStop = watch(
        [() => messenger.started, () => messenger.connected],
        ([started, connected]) => {
          if (runId !== startRunId) return;
          if (!started && !connected) return;
          finalizeStartSuccess(runId);
        },
      );
    };

    function bech32ToHex(pubkey: string): string | null {
      const resolved = nostr.resolvePubkey(pubkey);
      return resolved ?? null;
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
      const runId = ++startRunId;
      connecting.value = true;
      loading.value = true;
      initError.value = null;
      startTimedOut.value = false;
      cleanupStartRecoveryWatcher();
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
      try {
        await nostr.initSignerIfNotSet();
        await messenger.loadIdentity();
        ndkRef.value = await useNdk();
        const start = messenger.start();
        startPromise = start;

        if (routeConversation.value || messenger.currentConversation) {
          handleRoutePubkeyChange(route.query.pubkey);
          registerStartRecoveryWatcher(runId);
          revealRouteConversationShell();
        }

        timeoutHandle = setTimeout(() => {
          if (runId !== startRunId) return;
          startTimedOut.value = true;
          console.warn("Messenger startup taking longer than expected");
          registerStartRecoveryWatcher(runId);
        }, 10000);

        await start;

        if (runId !== startRunId) return;

        finalizeStartSuccess(runId);
      } catch (e) {
        if (runId !== startRunId) return;
        console.error(e);
        const message = e instanceof Error ? e.message : String(e);
        loading.value = false;
        initError.value = message;
        startPromise = null;
        cleanupStartRecoveryWatcher();
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (runId === startRunId) {
          connecting.value = false;
        }
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
        document.removeEventListener(
          "visibilitychange",
          handleDecryptVisibility,
        );
      }
      cleanupStartRecoveryWatcher();
    });

    const lastRoutePubkey = ref<string | null>(null);

    const handleRoutePubkeyChange = (pubkey: unknown) => {
      if (typeof pubkey !== "string" || !pubkey) {
        lastRoutePubkey.value = null;
        return;
      }

      const normalized = bech32ToHex(pubkey);

      if (!normalized) {
        lastRoutePubkey.value = null;
        return;
      }

      if (
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
      revealRouteConversationShell();

      if ($q.screen.lt.md) {
        messenger.setDrawer(false);
      }
    };

    const pendingTokenModal = ref(false);
    const sendTokenWarning = ref<SendTokenWarning | null>(null);

    const routeConversation = computed(() => {
      const pubkey = route.query.pubkey;
      if (Array.isArray(pubkey)) {
        return pubkey.length ? bech32ToHex(pubkey[0]) : null;
      }
      return typeof pubkey === "string" && pubkey ? bech32ToHex(pubkey) : null;
    });

    const hasActiveMint = computed(() =>
      Boolean(activeMintUrl.value && mints.value.length),
    );
    const hasActiveBucket = computed(() => activeBuckets.value.length > 0);

    const clearDonationIntent = async () => {
      if (route.query.intent === undefined) return;
      const query = { ...route.query };
      delete query.intent;
      try {
        await router.replace({ query });
      } catch (err) {
        console.warn("Failed to clear donation intent", err);
      }
    };

    const ensureSendTokenPrerequisites = () => {
      sendTokenWarning.value = null;
      if (!hasActiveMint.value) {
        sendTokenWarning.value = {
          message: "Add an active mint in your wallet before sending tokens.",
          tab: "mints",
        };
        return false;
      }
      if (!hasActiveBucket.value) {
        sendTokenWarning.value = {
          message: "Create a bucket in your wallet before sending tokens.",
          tab: "buckets",
        };
        return false;
      }
      return true;
    };

    const handleSendTokenWarningAction = () => {
      if (!sendTokenWarning.value) return;
      if (sendTokenWarning.value.tab) {
        ui.setTab(sendTokenWarning.value.tab);
      }
      sendTokenWarning.value = null;
      pendingTokenModal.value = false;
      void router.push({ path: "/wallet" });
    };

    watch(
      () => route.query.pubkey,
      (pubkey, previous) => {
        handleRoutePubkeyChange(pubkey);
        if (pubkey !== previous) {
          pendingTokenModal.value =
            (Array.isArray(route.query.intent)
              ? route.query.intent.includes("donate")
              : route.query.intent === "donate") && !!routeConversation.value;
        }
      },
      { immediate: true },
    );

    watch(
      [routeConversation, () => messenger.currentConversation],
      () => {
        revealRouteConversationShell();
      },
      { immediate: true },
    );

    watch(
      () => route.query.intent,
      (intent) => {
        const isDonate = Array.isArray(intent)
          ? intent.includes("donate")
          : intent === "donate";
        pendingTokenModal.value = isDonate && !!routeConversation.value;
        if (!isDonate) {
          sendTokenWarning.value = null;
        }
      },
      { immediate: true },
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

    const selected = computed(
      () => messenger.currentConversation || routeConversation.value || "",
    );
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
      const files =
        Array.isArray(payload.files) && payload.files.length
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

    const showSendTokenDialog = () => {
      if (!selected.value) return;
      (chatSendTokenDialogRef.value as any)?.show();
    };

    function openSendTokenDialog() {
      if (!ensureSendTokenPrerequisites()) {
        void clearDonationIntent();
        return;
      }
      showSendTokenDialog();
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

    watch(
      [pendingTokenModal, selected, loading, () => messenger.started],
      async ([shouldOpen, currentSelected, isLoading, started]) => {
        if (!shouldOpen || isLoading || !started) return;
        if (
          !routeConversation.value ||
          currentSelected !== routeConversation.value
        ) {
          return;
        }
        if (!ensureSendTokenPrerequisites()) {
          pendingTokenModal.value = false;
          await clearDonationIntent();
          return;
        }
        await nextTick();
        showSendTokenDialog();
        pendingTokenModal.value = false;
        await clearDonationIntent();
      },
    );

    watch(
      () => route.fullPath,
      () => {
        if (!routeConversation.value) {
          pendingTokenModal.value = false;
        }
      },
    );

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
      sendTokenWarning,
      handleSendTokenWarningAction,
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

<style scoped>
.messenger-page {
  background: radial-gradient(
      circle at top left,
      color-mix(in srgb, var(--accent-200) 28%, transparent),
      transparent 34%
    ),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--surface-1) 96%, transparent),
      var(--surface-1)
    );
}

.messenger-shell {
  min-width: 0;
}

.messenger-status-stack {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin-bottom: 1rem;
}

.messenger-status {
  border-radius: 14px;
  border: 1px solid var(--surface-contrast-border);
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
  color: var(--text-1);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
}

.messenger-status--warning {
  background: color-mix(in srgb, #c76816 10%, var(--surface-2));
  border-color: color-mix(in srgb, #c76816 28%, var(--surface-contrast-border));
}

.messenger-status--error {
  background: color-mix(in srgb, #b42318 10%, var(--surface-2));
  border-color: color-mix(in srgb, #b42318 28%, var(--surface-contrast-border));
}

.messenger-empty-state {
  display: grid;
  place-items: center;
  padding-block: clamp(2rem, 8vh, 4rem);
}

.messenger-empty-card {
  width: min(100%, 38rem);
  padding: clamp(1.5rem, 4vw, 2.5rem);
  border-radius: 22px;
  border: 1px solid var(--surface-contrast-border);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
}

.messenger-empty-card__icon {
  width: 72px;
  height: 72px;
  margin: 0 auto;
  border-radius: 22px;
  display: grid;
  place-items: center;
  color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 30%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-200) 60%, transparent);
}

.messenger-empty-card__actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

@media (max-width: 599px) {
  .messenger-empty-card__actions {
    flex-direction: column;
  }
}
</style>
