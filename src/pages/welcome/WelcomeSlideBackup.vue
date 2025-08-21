<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center">
      <q-icon name="warning" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">
        {{ $t("Welcome.backup.title") }}
      </h1>
      <p class="q-mt-sm">{{ $t("Welcome.backup.lead") }}</p>
      <ul class="q-mt-md text-left" style="display: inline-block">
        <li v-for="(b, i) in $tm('Welcome.backup.bullets')" :key="i">{{ b }}</li>
      </ul>
      <div class="q-mt-md">
        <q-btn
          color="primary"
          class="q-mb-sm"
          @click="revealSeed"
          :label="$t('Welcome.backup.revealSeed')"
        />
        <q-btn
          color="primary"
          flat
          @click="downloadBackup"
          :label="$t('Welcome.backup.downloadBackup')"
        />
      </div>
      <q-checkbox
        class="q-mt-md"
        v-model="welcomeStore.seedPhraseValidated"
        :label="$t('Welcome.backup.acknowledge')"
        aria-label="$t('Welcome.backup.acknowledge')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useWelcomeStore } from "src/stores/welcome";

const props = defineProps<{ onRevealSeed?: () => void; onDownloadBackup?: () => void }>();
const welcomeStore = useWelcomeStore();
const id = "welcome-backup-title";

function revealSeed() {
  props.onRevealSeed?.();
}

function downloadBackup() {
  props.onDownloadBackup?.();
}
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
