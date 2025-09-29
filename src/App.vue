<template>
  <router-view />
  <DonationPrompt />
  <GuestConsentBar />
</template>

<script>
import { defineComponent } from "vue";
import { useUiStore } from "src/stores/ui";
import DonationPrompt from "components/DonationPrompt.vue";
import GuestConsentBar from "components/GuestConsentBar.vue";

  export default defineComponent({
  name: "App",
  components: { DonationPrompt, GuestConsentBar },
  setup() {
    const ui = useUiStore();
    ui.initNetworkWatcher();
  },
});
</script>
