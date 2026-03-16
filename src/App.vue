<template>
  <div class="app-shell">
    <router-view />
  </div>
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

<style scoped>
.app-shell {
  padding-bottom: var(--guest-consent-space, 0px);
}
</style>
