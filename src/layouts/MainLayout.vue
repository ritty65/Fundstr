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
          <q-btn
            flat
            dense
            round
            icon="add"
            :disable="nostrUiDisabled"
            :loading="nostrLoading"
            @click="openNewChatDialog"
          />
        </div>
        <q-input
          v-show="!messenger.drawerMini"
          dense
          rounded
          debounce="300"
          v-model="conversationSearch"
          placeholder="Search"
          class="q-mb-md"
          :disable="nostrUiDisabled"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>
        <q-scroll-area class="col" style="min-height: 0; min-width: 0">
          <template v-if="nostrReady">
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
          </template>
          <div v-else class="column q-gutter-sm q-pa-sm items-stretch">
            <div
              v-if="nostrInitError"
              class="column items-center q-gutter-xs q-pa-sm text-center"
            >
              <span class="text-negative text-caption">
                Unable to connect to Nostr right now. Messaging features are temporarily
                unavailable.
              </span>
              <q-btn
                flat
                dense
                no-caps
                color="primary"
                icon="refresh"
                label="Retry"
                :disable="nostrLoading"
                :loading="nostrLoading"
                @click="retryNostrInit"
              />
            </div>
            <div
              v-else-if="nostrLoading"
              class="column items-center justify-center q-gutter-sm q-pa-md text-2"
            >
              <q-spinner color="accent-500" size="28px" />
              <span>Connecting to relays…</span>
            </div>
            <template v-else>
              <q-skeleton v-for="n in 4" :key="n" height="52px" square />
            </template>
          </div>
        </q-scroll-area>
        <UserInfo v-if="!messenger.drawerMini && nostrReady" />
        <q-skeleton
          v-else-if="!messenger.drawerMini && nostrLoading"
          height="96px"
          square
        />
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
import { defineComponent, ref, computed, watch, nextTick } from "vue";

import { useRouter, useRoute } from "vue-router";
import { useQuasar, LocalStorage } from "quasar";
import MainHeader from "components/MainHeader.vue";
import AppNavDrawer from "components/AppNavDrawer.vue";
import ConversationList from "components/ConversationList.vue";
import UserInfo from "components/UserInfo.vue";
import NewChatDialog from "components/NewChatDialog.vue";
import { useNostrStore } from "src/stores/nostr";
import { useNutzapStore } from "src/stores/nutzap";
import { useMessengerStore } from "src/stores/messenger";
import { useUiStore } from "src/stores/ui";
import { NAV_DRAWER_WIDTH, NAV_DRAWER_GUTTER } from "src/constants/layout";

export default defineComponent({
  name: "MainLayout",
  mixins: [windowMixin],
  components: {
    MainHeader,
    AppNavDrawer,
    ConversationList,
    UserInfo,
    NewChatDialog,
  },
  setup() {
    const messenger = useMessengerStore();
    const router = useRouter();
    const route = useRoute();
    const conversationSearch = ref("");
    const newChatDialogRef = ref(null);
    const $q = useQuasar();
    const ui = useUiStore();
    const nostr = useNostrStore();
    const nutzapStore = useNutzapStore();

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

    const nostrInitTriggered = ref(false);
    const nostrInitPending = ref(false);
    const nostrInitError = ref(null);
    let nostrInitPromise = null;
    let pubkeyWatchStop = null;
    const lastNutzapPubkey = ref(null);

    const startNutzapListener = () => {
      const pubkey = nostr.pubkey;
      if (!pubkey) {
        if (pubkeyWatchStop) return;
        pubkeyWatchStop = watch(
          () => nostr.pubkey,
          (nextPk) => {
            if (nextPk) {
              pubkeyWatchStop?.();
              pubkeyWatchStop = null;
              startNutzapListener();
            }
          },
        );
        return;
      }
      if (lastNutzapPubkey.value === pubkey) return;
      nutzapStore.initListener(pubkey);
      lastNutzapPubkey.value = pubkey;
    };

    const ensureNostrInit = () => {
      if (nostr.initialized) {
        startNutzapListener();
        return Promise.resolve();
      }
      if (nostrInitPromise) return nostrInitPromise;
      nostrInitTriggered.value = true;
      nostrInitPending.value = true;
      nostrInitError.value = null;
      nostrInitPromise = nostr
        .initSignerIfNotSet()
        .then(() => {
          startNutzapListener();
        })
        .catch((err) => {
          console.warn("Failed to initialise Nostr signer", err);
          nostrInitError.value = err instanceof Error ? err : new Error(String(err));
        })
        .finally(() => {
          nostrInitPending.value = false;
          nostrInitPromise = null;
        });
      return nostrInitPromise;
    };

    const scheduleNostrInit = () => {
      if (process.env.SERVER) return;
      if (typeof window !== "undefined") {
        const idle = window.requestIdleCallback ?? ((cb) => window.setTimeout(cb, 0));
        idle(() => {
          void ensureNostrInit();
        });
      } else {
        nextTick(() => {
          void ensureNostrInit();
        });
      }
    };

    if (!process.env.SERVER) {
      watch(
        isMessengerRoute,
        (needsInit) => {
          if (needsInit) {
            scheduleNostrInit();
          }
        },
        { immediate: true },
      );

      watch(
        () => nostr.pubkey,
        (pk) => {
          if (pk && nostr.initialized) {
            startNutzapListener();
          }
        },
      );
    }

    const nostrLoading = computed(
      () => nostrInitPending.value || (nostrInitTriggered.value && !nostr.initialized),
    );
    const nostrReady = computed(() => nostr.initialized && !nostrInitError.value);
    const nostrUiDisabled = computed(() => !nostrReady.value || nostrLoading.value);

    const retryNostrInit = () => {
      nostrInitError.value = null;
      void ensureNostrInit();
    };

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
      route,
      nostrLoading,
      nostrReady,
      nostrInitError,
      nostrUiDisabled,
      retryNostrInit,
    };
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
</style>
