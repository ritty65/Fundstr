<template>
  <q-banner v-if="!consentGiven" class="guest-consent-bar">
    By browsing, you agree to our
    <router-link to="/terms">Terms</router-link>
    and privacy policy.
    <template #action>
      <q-btn flat color="primary" label="Accept" @click="consentGiven = true" />
    </template>
  </q-banner>
</template>

<script setup lang="ts">
import { useLocalStorage } from '@vueuse/core';

const consentGiven = useLocalStorage<boolean>('guest.consent', false);
</script>

<style scoped>
.guest-consent-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
}
</style>
