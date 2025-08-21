<template>
  <q-layout
    view="lHh Lpr lFf"
    :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
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
  </q-layout>
</template>

<script>
import { defineComponent, computed } from "vue";
import { useRoute } from "vue-router";
import MainHeader from "components/MainHeader.vue";
import AppNavDrawer from "components/AppNavDrawer.vue";
import PublishBar from "components/PublishBar.vue";
import { useCreatorHub } from "src/composables/useCreatorHub";
import { useQuasar } from "quasar";
import { useUiStore } from "src/stores/ui";
import { NAV_DRAWER_WIDTH, NAV_DRAWER_GUTTER } from "src/constants/layout";

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
    };
  },
});
</script>
