<template>
  <router-view />
  <DonationPrompt />
</template>

<script>
import { defineComponent } from "vue";
import { useUiStore } from "src/stores/ui";
import DonationPrompt from "components/DonationPrompt.vue";

  export default defineComponent({
  name: "App",
  components: { DonationPrompt },
  setup() {
    const ui = useUiStore();
    ui.initNetworkWatcher();
  },
});
</script>
