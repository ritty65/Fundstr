<template>
  <q-layout
    view="lHh Lpr lFf"
    :class="$q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark'"
    :style="navStyleVars"
  >
    <MainHeader />
    <AppNavDrawer />
    <q-page-container class="text-body1">
      <div class="max-w-7xl mx-auto">
        <router-view />
      </div>
    </q-page-container>
  </q-layout>
</template>

<script>
import { defineComponent, computed } from "vue";
import MainHeader from "components/MainHeader.vue";
import AppNavDrawer from "components/AppNavDrawer.vue";
import { useUiStore } from "src/stores/ui";
import { useQuasar } from "quasar";
import { NAV_DRAWER_WIDTH, NAV_DRAWER_GUTTER } from "src/constants/layout";

export default defineComponent({
  name: "BlankLayout",
  mixins: [windowMixin],
  components: {
    MainHeader,
    AppNavDrawer,
  },
  setup() {
    const ui = useUiStore();
    const $q = useQuasar();
    const navStyleVars = computed(() => ({
      "--nav-drawer-width": `${NAV_DRAWER_WIDTH}px`,
      "--nav-offset-x":
        ui.mainNavOpen && $q.screen.width >= 1024
          ? `calc(var(--nav-drawer-width) + ${NAV_DRAWER_GUTTER}px)`
          : "0px",
    }));

    return { ui, navStyleVars };
  },
});
</script>
