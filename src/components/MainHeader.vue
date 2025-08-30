<template>
  <q-header class="bg-transparent" style="z-index: 2000">
    <q-toolbar class="app-toolbar" dense>
      <div class="left-controls row items-center no-wrap" v-if="!isWelcomePage">
          <q-btn
            v-if="isMessengerPage"
            flat
            dense
            round
            icon="chat"
            :color="chatButtonColor"
            aria-label="Toggle Chats"
            @click.stop="toggleMessengerDrawer"
          >
          <q-badge
            v-if="messenger.sendQueue.length"
            color="negative"
            floating
          >
            {{ messenger.sendQueue.length }}
          </q-badge>
          <q-tooltip>Chats</q-tooltip>
        </q-btn>
          <q-btn
            flat
            dense
            round
            :icon="ui.mainNavOpen ? 'close' : 'menu'"
            color="primary"
            aria-label="Toggle navigation"
            :aria-expanded="String(ui.mainNavOpen)"
            aria-controls="app-nav"
            @click="ui.toggleMainNav"
            ref="mainNavBtn"
            :disable="ui.globalMutexLock"
          >
          <q-tooltip>Menu</q-tooltip>
        </q-btn>
      </div>

      <q-toolbar-title class="app-title" />

      <div
        class="right-controls row items-center no-wrap"
        v-if="!isWelcomePage"
      >
        <transition
          appear
          enter-active-class="animated wobble"
          leave-active-class="animated fadeOut"
        >
          <q-badge
            v-if="ui.offline"
            color="red"
            text-color="black"
            class="q-mr-sm"
          >
            <span>{{ $t("MainHeader.offline.warning.text") }}</span>
          </q-badge>
        </transition>
        <q-badge
          v-if="isStaging()"
          color="yellow"
          text-color="black"
          class="q-mr-sm"
        >
          <span>{{ $t("MainHeader.staging.warning.text") }}</span>
        </q-badge>
        <!-- <q-badge color="yellow" text-color="black" class="q-mr-sm">
          <span v-if="!isStaging()">Beta</span>
          <span v-else>Staging – don't use with real funds!</span>
        </q-badge> -->
        <transition-group appear enter-active-class="animated pulse">
          <q-badge
            v-if="countdown > 0"
            color="negative"
            text-color="white"
            class="q-mr-sm"
            @click="reload"
          >
            {{ $t("MainHeader.reload.warning.text", { countdown }) }}
            <q-spinner
              v-if="countdown > 0"
              size="0.8em"
              :thickness="10"
              class="q-ml-sm"
              color="white"
            />
          </q-badge>
        </transition-group>
        <q-btn
          flat
          dense
          round
          size="0.8em"
          :icon="countdown > 0 ? 'close' : 'refresh'"
          :color="countdown > 0 ? 'negative' : 'primary'"
          aria-label="Refresh"
          @click.stop="reload"
          :loading="reloading"
          :disable="ui.globalMutexLock && countdown === 0"
        >
          <q-tooltip>{{ $t("MainHeader.reload.tooltip") }}</q-tooltip>
          <template v-slot:loading>
            <q-spinner size="xs" />
          </template>
        </q-btn>
        <q-btn
          flat
          dense
          round
          size="0.8em"
          :icon="darkIcon"
          color="primary"
          aria-label="Toggle Dark Mode"
          @click.stop="toggleDarkMode"
          class="q-ml-sm"
        />
      </div>
    </q-toolbar>
  </q-header>
</template>

<script>import windowMixin from 'src/mixins/windowMixin'
import {

  defineComponent,
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  nextTick,
  watch,
} from "vue";
import { useRoute } from "vue-router";
import { useUiStore } from "src/stores/ui";
import { useMessengerStore } from "src/stores/messenger";
import { useQuasar } from "quasar";
import {
  notifySuccess,
  notify,
  notifyWarning,
  notifyRefreshed,
} from "src/js/notify";

export default defineComponent({
  name: "MainHeader",
  mixins: [windowMixin],
  setup() {
    const ui = useUiStore();
    const route = useRoute();
    const messenger = useMessengerStore();
    const $q = useQuasar();
    const mainNavBtn = ref(null);

    const focusNavBtn = () => {
      const btn = mainNavBtn.value;
      if (!btn) return;
      if (typeof btn.focus === "function") {
        btn.focus();
      } else {
        btn.$el?.focus();
      }
    };
    const onKeydown = (e) => {
      if (e.key === "Escape" && ui.mainNavOpen) {
        ui.closeMainNav();
        nextTick(() => {
          if (mainNavBtn.value) focusNavBtn();
        });
      }
    };

    onMounted(() => window.addEventListener("keydown", onKeydown));
    onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

    watch(
      () => ui.mainNavOpen,
      (open) => {
        if (!open) {
          nextTick(() => {
            if (mainNavBtn.value) focusNavBtn();
          });
        }
      },
    );

    const toggleDarkMode = () => {
      console.log("toggleDarkMode", $q.dark.isActive);
      $q.dark.toggle();
      $q.localStorage.set("cashu.darkMode", $q.dark.isActive);
      notifySuccess(
        $q.dark.isActive ? "Dark mode enabled" : "Dark mode disabled",
      );
    };
    const darkIcon = computed(() =>
      $q.dark.isActive ? "wb_sunny" : "brightness_3",
    );
    const isMessengerPage = computed(() =>
      route.path.startsWith("/nostr-messenger"),
    );
    const isWelcomePage = computed(() => route.path.startsWith("/welcome"));
    const chatButtonColor = computed(() =>
      $q.dark.isActive ? "white" : "primary",
    );
    const countdown = ref(0);
    const reloading = ref(false);
    let countdownInterval;

    const toggleMessengerDrawer = () => {
      if ($q.screen.lt.md) {
        messenger.setDrawer(!messenger.drawerOpen);
      } else {
        messenger.toggleDrawer();
        notify(
          messenger.drawerMini ? "Messenger collapsed" : "Messenger expanded",
        );
      }
    };

    const isStaging = () => {
      return location.host.includes("staging");
    };

    const reload = () => {
      console.log(
        "reload",
        "countdown:",
        countdown.value,
        "mutex:",
        ui.globalMutexLock,
      );
      if (countdown.value > 0) {
        try {
          clearInterval(countdownInterval);
          countdown.value = 0;
          reloading.value = false;
          notifyWarning("Reload cancelled");
        } finally {
          ui.unlockMutex();
        }
        return;
      }
      if (ui.globalMutexLock) return;
      ui.lockMutex();
      reloading.value = true;
      countdown.value = 3;
      notify("Reloading in 3 seconds…");
      countdownInterval = setInterval(() => {
        countdown.value--;
        if (countdown.value === 0) {
          clearInterval(countdownInterval);
          notifyRefreshed("Reloading…");
          try {
            location.reload();
          } finally {
            ui.unlockMutex();
          }
        }
      }, 1000);
    };

    return {
      isStaging,
      reload,
      countdown,
      reloading,
      ui,
      isWelcomePage,
      isMessengerPage,
      toggleMessengerDrawer,
      toggleDarkMode,
      darkIcon,
      chatButtonColor,
      mainNavBtn,
      messenger,
    };
  },
});
</script>
<style scoped>
.q-header {
  position: sticky;
  top: 0;
  /* Allow navigation drawer overlay to sit above the header */
  z-index: 950;
  overflow-x: hidden;
}

.app-toolbar {
  padding-inline: 8px;
  min-height: 48px;
  display: flex;
  align-items: center;
}

.app-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.left-controls,
.right-controls {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.left-controls {
  transition: transform 0.2s ease;
  transform: translateX(var(--nav-offset-x, 0));
}

</style>
