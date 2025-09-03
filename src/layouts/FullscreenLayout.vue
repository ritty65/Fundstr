<template>
    <q-layout
      view="lHh Lpr lFf"
      class="bg-surface-1 text-1"
      :style="navStyleVars"
    >
    <MainHeader v-if="!route.meta.hideHeader" />
    <AppNavDrawer v-if="!route.meta.hideHeader" />
    <q-page-container class="text-body1">
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script>import windowMixin from 'src/mixins/windowMixin'
import { defineComponent, computed } from "vue";

import { useRoute } from "vue-router";
import MainHeader from "components/MainHeader.vue";
import AppNavDrawer from "components/AppNavDrawer.vue";
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
  },
  setup() {
    const { loggedIn } = useCreatorHub();
    const route = useRoute();

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
      navStyleVars,
      route,
    };
  },
});
</script>
