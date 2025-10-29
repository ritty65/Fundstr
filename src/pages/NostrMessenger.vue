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
        <q-banner
          v-if="(messenger.sendQueue || []).length"
          dense
          class="bg-orange-2 q-mb-sm"
        >
          <div class="row items-center no-wrap">
            <span>{{ (messenger.sendQueue || []).length }} message(s) failed</span>
            <q-space />
            <q-btn
              flat
              dense
              label="Retry"
              @click="messenger.retryFailedMessages"
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

    function bech32ToHex(pubkey: string): string {
      try {
        const decoded = nip19.decode(pubkey);
        return typeof decoded.data === "string" ? decoded.data : pubkey;
      } catch {
        return pubkey;
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
    });

    onUnmounted(() => {
      if (timer) clearInterval(timer);
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

    const sendMessage = (
      payload:
        | string
        | {
            text: string;
            attachment?: { dataUrl: string; name: string; type: string };
          },
    ) => {
      if (!selected.value) return;
      if (typeof payload === "string") {
        messenger.sendDm(selected.value, payload);
        return;
      }
      const { text, attachment } = payload;
      if (text) messenger.sendDm(selected.value, text);
      if (attachment) {
        messenger.sendDm(selected.value, attachment.dataUrl, undefined, {
          name: attachment.name,
          type: attachment.type,
        });
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
        messenger.disconnect();
        messenger.started = false;
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
