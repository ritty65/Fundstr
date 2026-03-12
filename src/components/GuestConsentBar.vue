<template>
  <transition name="consent-fade">
    <q-banner
      v-if="showConsentBar"
      rounded
      inline-actions
      class="guest-consent-bar bg-surface-2 text-1"
    >
      <div class="guest-consent-bar__copy">
        <div class="text-body2 text-1">
          Terms and privacy apply while browsing.
        </div>
      </div>
      <template #action>
        <div class="guest-consent-bar__actions">
          <q-btn
            flat
            no-caps
            color="primary"
            label="Review terms"
            to="/terms"
          />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Accept"
            @click="consentGiven = true"
          />
        </div>
      </template>
    </q-banner>
  </transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watchEffect } from "vue";
import { useLocalStorage } from "@vueuse/core";
import { useWelcomeStore } from "stores/welcome";

const consentGiven = useLocalStorage<boolean>("guest.consent", false);
const welcome = useWelcomeStore();
const showConsentBar = computed(
  () => !consentGiven.value && !welcome.welcomeCompleted,
);

watchEffect(() => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.style.setProperty(
    "--guest-consent-space",
    showConsentBar.value ? "132px" : "0px",
  );
});

onBeforeUnmount(() => {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.style.setProperty("--guest-consent-space", "0px");
});
</script>

<style scoped>
.guest-consent-bar {
  position: fixed;
  left: 20px;
  bottom: 20px;
  width: min(20rem, calc(100vw - 24px));
  z-index: 1000;
  border: 1px solid var(--surface-contrast-border);
  box-shadow: 0 18px 38px rgba(15, 23, 42, 0.16);
  backdrop-filter: blur(10px);
}

.guest-consent-bar__copy {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-width: 8.5rem;
}

.guest-consent-bar :deep(.q-banner__content) {
  align-items: center;
}

.guest-consent-bar :deep(.q-banner__actions) {
  padding-left: 0.35rem;
}

.guest-consent-bar__actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.guest-consent-bar__actions .q-btn {
  min-height: 36px;
  padding-inline: 0.8rem;
}

.consent-fade-enter-active,
.consent-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.consent-fade-enter-from,
.consent-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 599px) {
  .guest-consent-bar {
    left: 12px;
    width: auto;
    bottom: 12px;
  }

  .guest-consent-bar__actions {
    width: 100%;
    justify-content: flex-end;
    flex-wrap: wrap;
  }
}
</style>
