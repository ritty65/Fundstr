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

<script>
import windowMixin from "src/mixins/windowMixin";
import { defineComponent, computed } from "vue";

import { useRoute } from "vue-router";
import MainHeader from "components/MainHeader.vue";
import AppNavDrawer from "components/AppNavDrawer.vue";
import { useNostrAuth } from "src/composables/useNostrAuth";
import { useQuasar } from "quasar";
import { useUiStore } from "src/stores/ui";
import { useNostrStore } from "src/stores/nostr";
import { FUNDSTR_WS_URL } from "src/nutzap/relayEndpoints";
import { NAV_DRAWER_WIDTH, NAV_DRAWER_GUTTER } from "src/constants/layout";

export default defineComponent({
  name: "FullscreenLayout",
  mixins: [windowMixin],
  components: {
    MainHeader,
    AppNavDrawer,
  },
  setup() {
    const { loggedIn } = useNostrAuth();
    const route = useRoute();
    const nostr = useNostrStore();

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
      nostr,
      route,
    };
  },
  async mounted() {
    const nostr = useNostrStore();
    void (async () => {
      try {
        await nostr.initSignerIfNotSet();
        if (nostr.hasIdentity && typeof nostr.connect === "function") {
          void nostr.connect([FUNDSTR_WS_URL]).catch((connectError) => {
            console.warn(
              "FullscreenLayout relay bootstrap failed",
              connectError,
            );
          });
        }
      } catch (error) {
        console.warn(
          "FullscreenLayout signer/bootstrap relay connect failed",
          error,
        );
      }
    })();
  },
});
</script>
