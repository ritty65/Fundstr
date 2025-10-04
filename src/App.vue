<template>
  <router-view />
  <DonationPrompt />
  <GuestConsentBar />
</template>

<script>
import { defineComponent, onMounted } from "vue";
import { useUiStore } from "src/stores/ui";
import DonationPrompt from "components/DonationPrompt.vue";
import GuestConsentBar from "components/GuestConsentBar.vue";
import { useCreatorsStore } from "src/stores/creators";

  export default defineComponent({
  name: "App",
  components: { DonationPrompt, GuestConsentBar },
  setup() {
    const ui = useUiStore();
    ui.initNetworkWatcher();

    const creators = useCreatorsStore();

    onMounted(() => {
      void creators.markWarmupReady();
    });
  },
});
</script>
