<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center">
      <q-icon name="install_mobile" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">
        {{ $t("Welcome.pwa.title") }}
      </h1>
      <p class="q-mt-sm">{{ $t("Welcome.pwa.lead") }}</p>
      <div class="q-mt-md">
        <q-btn
          color="primary"
          class="q-mr-sm"
          :disable="!deferredPrompt"
          @click="install"
          :label="$t('Welcome.pwa.ctaInstall')"
        />
        <q-btn
          flat
          color="primary"
          @click="skip"
          :label="$t('Welcome.pwa.ctaSkip')"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { usePwaInstall } from "src/composables/usePwaInstall";

const props = defineProps<{ deferredPrompt?: any }>();
const { promptInstall } = usePwaInstall();
const id = "welcome-pwa-title";

function install() {
  promptInstall();
}

function skip() {
  /* no-op in placeholder */
}
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
