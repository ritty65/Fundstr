<template>
  <q-layout
    view="lHh Lpr lFf"
    class="bg-surface-1 text-1"
    :style="navStyleVars"
  >
    <MainHeader v-if="!route.meta.hideHeader" />
    <AppNavDrawer v-if="!route.meta.hideHeader" />
    <q-drawer
      v-if="isMessengerRoute"
      v-model="messenger.drawerOpen"
      :mini="messenger.drawerMini"
      mini-width="80"
      :width="computedDrawerWidth"
      side="left"
      show-if-above
      :breakpoint="600"
      bordered
      :behavior="$q.screen.lt.md ? 'mobile' : 'default'"
      :overlay="$q.screen.lt.md"
      :class="[
        'q-pa-md column messenger-drawer',
        { 'drawer-collapsed': messenger.drawerMini },
      ]"
    >
      <div class="column no-wrap full-height">
        <div
          v-show="!messenger.drawerMini"
          class="row items-center justify-between q-mt-md q-mb-md"
        >
          <div class="text-subtitle1">Chats</div>
          <q-btn flat dense round icon="add" @click="openNewChatDialog" />
        </div>
        <q-input
          v-show="!messenger.drawerMini"
          dense
          rounded
          debounce="300"
          v-model="conversationSearch"
          placeholder="Search"
          class="q-mb-md"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
        <q-scroll-area class="col" style="min-height: 0; min-width: 0">
          <Suspense>
            <template #default>
              <ConversationList
                :mini="messenger.drawerMini"
                :selected-pubkey="messenger.currentConversation"
                :search="conversationSearch"
                @select="selectConversation"
              />
            </template>
            <template #fallback>
              <q-skeleton height="100px" square />
            </template>
          </Suspense>
        </q-scroll-area>
        <UserInfo v-show="!messenger.drawerMini" />
      </div>
      <!-- Desktop resizer handle (hidden on <md and when mini) -->
      <div
        v-if="$q.screen.gt.sm && !messenger.drawerMini"
        class="drawer-resizer"
        @mousedown="onResizeStart"
        aria-label="Resize conversations panel"
        title="Drag to resize"
      />
    </q-drawer>
    <q-page-container class="text-body1">
      <transition name="fade">
        <q-banner
          v-if="showRelayBanner"
          dense
          class="q-mx-auto q-mt-md q-mb-md relay-banner"
          :class="relayBannerClass"
        >
          <div class="row items-center no-wrap full-width">
            <span>{{ relayBannerMessage }}</span>
            <q-space />
            <q-btn
              v-if="isRelayDisconnected"
              outline
              dense
              round
              color="white"
              label="Reconnect"
              @click="reconnectFundstrRelay"
            />
          </div>
        </q-banner>
      </transition>
      <DegradedSnackbar />
      <div :class="isMessengerRoute ? 'w-full' : 'max-w-7xl mx-auto'">
        <router-view />
      </div>
    </q-page-container>
    <NewChatDialog
      v-if="isMessengerRoute"
      ref="newChatDialogRef"
      @start="startChat"
    />
  </q-layout>
</template>

<script>import windowMixin from 'src/mixins/windowMixin'
import { defineComponent, ref, computed, watch, onMounted, onBeforeUnmount } from "vue";

import { useRouter, useRoute } from "vue-router";
import { useQuasar, LocalStorage } from "quasar";
import MainHeader from "components/MainHeader.vue";
import AppNavDrawer from "components/AppNavDrawer.vue";
import ConversationList from "components/ConversationList.vue";
import UserInfo from "components/UserInfo.vue";
import NewChatDialog from "components/NewChatDialog.vue";
import DegradedSnackbar from "components/DegradedSnackbar.vue";
import { useNostrStore, refreshCachedNutzapProfiles } from "src/stores/nostr";
import { useCashuStore } from "src/stores/cashu";
import { useMessengerStore } from "src/stores/messenger";
import { useUiStore } from "src/stores/ui";
import { NAV_DRAWER_WIDTH, NAV_DRAWER_GUTTER } from "src/constants/layout";
import { fundstrRelayClient, useFundstrRelayStatus } from "src/nutzap/relayClient";
import { WS_FIRST_TIMEOUT_MS } from "src/nutzap/relayEndpoints";
import { creatorCacheService } from "src/nutzap/creatorCache";

export default defineComponent({
  name: "MainLayout",
  mixins: [windowMixin],
  components: {
    MainHeader,
    AppNavDrawer,
    ConversationList,
    UserInfo,
    NewChatDialog,
    DegradedSnackbar,
  },
  setup() {
    const messenger = useMessengerStore();
    const nostr = useNostrStore();
    const cashuStore = useCashuStore();
    const router = useRouter();
    const route = useRoute();
    const conversationSearch = ref("");
    const newChatDialogRef = ref(null);
    const $q = useQuasar();
    const ui = useUiStore();

    const navStyleVars = computed(() => ({
      "--nav-drawer-width": `${NAV_DRAWER_WIDTH}px`,
      "--nav-offset-x":
        ui.mainNavOpen && $q.screen.width >= 1024
          ? `calc(var(--nav-drawer-width) + ${NAV_DRAWER_GUTTER}px)`
          : "0px",
    }));

    // Persisted width just for this layout (keep store unchanged)
    const DEFAULT_DESKTOP = 440;
    const DEFAULT_TABLET = 320;
    const MIN_W = 320;
    const MAX_W = 640;

    const saved = LocalStorage.getItem("cashu.messenger.drawerWidth");
    const drawerWidth = ref(
      typeof saved === "number"
        ? saved
        : $q.screen.lt.md
        ? DEFAULT_TABLET
        : DEFAULT_DESKTOP,
    );

    const computedDrawerWidth = computed(() => {
      if ($q.screen.lt.md)
        return Math.max(MIN_W, Math.min(drawerWidth.value, 420));
      return Math.max(MIN_W, Math.min(drawerWidth.value, MAX_W));
    });

    watch(drawerWidth, (val) => {
      LocalStorage.set("cashu.messenger.drawerWidth", val);
    });

    watch(
      () => $q.screen.lt.md,
      (isLt) => {
        if (isLt && drawerWidth.value > 420) drawerWidth.value = DEFAULT_TABLET;
        if (!isLt && drawerWidth.value < MIN_W)
          drawerWidth.value = DEFAULT_DESKTOP;
      },
    );

    const relayStatus = useFundstrRelayStatus();
    const CONNECTING_BANNER_DELAY_MS = Math.max(WS_FIRST_TIMEOUT_MS || 0, 5000);
    const connectingTimeoutElapsed = ref(false);
    let connectingBannerTimer = null;

    const clearConnectingTimeout = () => {
      if (connectingBannerTimer) {
        clearTimeout(connectingBannerTimer);
        connectingBannerTimer = null;
      }
      connectingTimeoutElapsed.value = false;
    };

    const scheduleConnectingTimeout = () => {
      clearConnectingTimeout();
      if (CONNECTING_BANNER_DELAY_MS <= 0) {
        return;
      }
      connectingBannerTimer = window.setTimeout(() => {
        connectingTimeoutElapsed.value = true;
        connectingBannerTimer = null;
      }, CONNECTING_BANNER_DELAY_MS);
    };

    const showRelayBanner = computed(() => {
      if (relayStatus.value === "reconnecting" || relayStatus.value === "disconnected") {
        return true;
      }
      return connectingTimeoutElapsed.value && relayStatus.value !== "connected";
    });
    const isRelayDisconnected = computed(() => relayStatus.value === "disconnected");
    const relayBannerClass = computed(() =>
      relayStatus.value === "disconnected" ? "bg-negative text-inverse" : "bg-warning text-1",
    );
    const relayBannerMessage = computed(() => {
      switch (relayStatus.value) {
        case "disconnected":
          return "Disconnected from Nutzap relay. We'll keep trying to reconnect.";
        case "reconnecting":
          return "Reconnecting to Nutzap relay…";
        default:
          if (connectingTimeoutElapsed.value && relayStatus.value !== "connected") {
            return "Still trying to reach the Nutzap relay…";
          }
          return "";
      }
    });

    const HEARTBEAT_AUTHOR = "0".repeat(64);
    const heartbeatFilters = [{ kinds: [0], authors: [HEARTBEAT_AUTHOR], limit: 1 }];
    const HEARTBEAT_INTERVAL_MS = 60000;
    let heartbeatTimer = null;
    let heartbeatInFlight = false;

    const sendHeartbeat = async () => {
      if (heartbeatInFlight || relayStatus.value !== "connected") {
        return;
      }
      const client = fundstrRelayClient;
      if (!client?.requestOnce) {
        return;
      }
      heartbeatInFlight = true;
      try {
        await client.requestOnce(heartbeatFilters, { timeoutMs: 2000 });
      } catch (err) {
        if (import.meta?.env?.DEV) {
          console.debug("[fundstr-relay] heartbeat failed", err);
        }
      } finally {
        heartbeatInFlight = false;
      }
    };

    const startHeartbeat = () => {
      if (heartbeatTimer) return;
      void sendHeartbeat();
      heartbeatTimer = window.setInterval(() => {
        void sendHeartbeat();
      }, HEARTBEAT_INTERVAL_MS);
    };

    const stopHeartbeat = () => {
      if (!heartbeatTimer) return;
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    };

    const reconnectFundstrRelay = () => {
      if (fundstrRelayClient?.connect) {
        fundstrRelayClient.connect();
      }
    };

    const onWindowFocus = () => {
      if (relayStatus.value !== "connected") {
        reconnectFundstrRelay();
      }
      void sendHeartbeat();
    };

    onMounted(() => {
      window.addEventListener("focus", onWindowFocus);
    });

    onBeforeUnmount(() => {
      window.removeEventListener("focus", onWindowFocus);
      stopHeartbeat();
      clearConnectingTimeout();
    });

    const ensureNutzapListener = () => {
      const myPubkey = nostr.pubkey;
      if (!myPubkey) return;
      void cashuStore.initListener(myPubkey).catch((err) => {
        if (import.meta?.env?.DEV) {
          console.warn("[nutzap] Failed to initialise listener", err);
        }
      });
    };

    watch(
      relayStatus,
      (status, previous) => {
        if (status === "connected") {
          clearConnectingTimeout();
          startHeartbeat();
          if (!previous || previous !== "connected") {
            ensureNutzapListener();
          }
          if (previous && previous !== "connected") {
            refreshCachedNutzapProfiles();
          }
        } else {
          if (status === "connecting") {
            scheduleConnectingTimeout();
          } else {
            clearConnectingTimeout();
          }
          stopHeartbeat();
        }
      },
      { immediate: true },
    );

    watch(
      () => nostr.pubkey,
      (pubkey) => {
        if (pubkey && relayStatus.value === "connected") {
          ensureNutzapListener();
        }
      },
    );

    // Drag-to-resize
    let startX = 0;
    let startW = 0;
    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      drawerWidth.value = startW + dx;
    };
    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    const onResizeStart = (e) => {
      startX = e.clientX;
      startW = drawerWidth.value;
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    };

    const openNewChatDialog = () => {
      newChatDialogRef.value?.show();
    };

    const selectConversation = (pubkey) => {
      messenger.markRead(pubkey);
      messenger.setCurrentConversation(pubkey);
      if ($q.screen.lt.md) {
        messenger.setDrawer(false);
      }
      if (router.currentRoute.value.path !== "/nostr-messenger") {
        router.push("/nostr-messenger");
      }
    };

    const startChat = (pubkey) => {
      messenger.startChat(pubkey);
      selectConversation(pubkey);
    };

    const isMessengerRoute = computed(() =>
      router.currentRoute.value.path.startsWith("/nostr-messenger"),
    );

    return {
      messenger,
      conversationSearch,
      newChatDialogRef,
      openNewChatDialog,
      selectConversation,
      startChat,
      isMessengerRoute,
      computedDrawerWidth,
      onResizeStart,
      navStyleVars,
      showRelayBanner,
      relayBannerClass,
      relayBannerMessage,
      isRelayDisconnected,
      reconnectFundstrRelay,
      route,
    };
  },
  async mounted() {
    const nostr = useNostrStore();
    await nostr.initSignerIfNotSet();
    creatorCacheService.start();
  },
});
</script>

<style scoped>
.messenger-drawer :deep(.q-drawer__content),
.messenger-drawer :deep(.q-scrollarea) {
  overflow-x: hidden;
}

.messenger-drawer {
  overflow: hidden;
  position: relative;
}

.messenger-drawer.drawer-collapsed {
  padding: 8px 6px !important;
}

.messenger-drawer :deep(.column),
.messenger-drawer :deep(.row),
.messenger-drawer :deep(.col) {
  min-width: 0;
  box-sizing: border-box;
}

/* Desktop resizer handle */
.drawer-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
  height: 100%;
  cursor: col-resize;
  z-index: 3;
}
.drawer-resizer::after {
  content: "";
  position: absolute;
  top: 50%;
  right: 2px;
  transform: translateY(-50%);
  width: 2px;
  height: 32px;
  border-radius: 2px;
  background: currentColor;
  opacity: 0.25;
}
@media (max-width: 1023px) {
  .drawer-resizer {
    display: none;
  }
}

.relay-banner {
  max-width: 960px;
  border-radius: 12px;
}
</style>
