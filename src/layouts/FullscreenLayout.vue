<template>
    <q-layout
      view="lHh Lpr lFf"
      class="bg-surface-1 text-1"
      :style="navStyleVars"
    >
    <MainHeader />
    <AppNavDrawer />
    <q-page-container class="text-body1">
      <router-view />
    </q-page-container>
    <PublishBar
      v-if="loggedIn && showPublishBar"
      :publishing="publishing"
      @publish="publishFullProfile"
    />
    <q-banner
      v-if="isRunning"
      class="fixed-bottom bg-primary text-white"
    >
      <div class="row items-center justify-end">
        <q-btn flat dense color="white" @click="skip">Skip</q-btn>
        <q-btn
          flat
          dense
          color="white"
          @click="isPaused ? resume() : pause()"
        >
          {{ isPaused ? 'Resume' : 'Pause' }}
        </q-btn>
      </div>
    </q-banner>
  </q-layout>
</template>

<script>import windowMixin from 'src/mixins/windowMixin'
import { defineComponent, computed } from "vue";

import { useRoute } from "vue-router";
import MainHeader from "components/MainHeader.vue";
import AppNavDrawer from "components/AppNavDrawer.vue";
import PublishBar from "components/PublishBar.vue";
import { useCreatorHub } from "src/composables/useCreatorHub";
import { useQuasar } from "quasar";
import { useUiStore } from "src/stores/ui";
import { NAV_DRAWER_WIDTH, NAV_DRAWER_GUTTER } from "src/constants/layout";
import { useAutoPageTour } from "src/composables/useAutoPageTour";

export default defineComponent({
  name: "FullscreenLayout",
  mixins: [windowMixin],
  components: {
    MainHeader,
    AppNavDrawer,
    PublishBar,
  },
  setup() {
    const { loggedIn, publishFullProfile, publishing } = useCreatorHub();
    const route = useRoute();
    const showPublishBar = computed(() => route.path === "/creator-hub");

    const $q = useQuasar();
    const ui = useUiStore();
    const { isRunning, isPaused, skip, pause, resume } = useAutoPageTour();
    const navStyleVars = computed(() => ({
      "--nav-drawer-width": `${NAV_DRAWER_WIDTH}px`,
      "--nav-offset-x":
        ui.mainNavOpen && $q.screen.width >= 1024
          ? `calc(var(--nav-drawer-width) + ${NAV_DRAWER_GUTTER}px)`
          : "0px",
    }));

    return {
      loggedIn,
      publishFullProfile,
      publishing,
      showPublishBar,
      navStyleVars,
      isRunning,
      isPaused,
      skip,
      pause,
      resume,
    };
  },
});
</script>
