<template>
  <router-view />
</template>

<script>
import { defineComponent } from "vue";
import { useUiStore } from "src/stores/ui";

export default defineComponent({
  name: "App",
  setup() {
    const ui = useUiStore();
    ui.initNetworkWatcher();
  },
});
</script>
