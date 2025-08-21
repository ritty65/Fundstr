<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center">
      <q-icon name="visibility_off" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">{{ $t("Welcome.privacy.title") }}</h1>
      <p class="q-mt-sm">{{ $t("Welcome.privacy.lead") }}</p>
      <ul class="q-mt-md text-left" style="display: inline-block">
        <li v-for="(b, i) in $tm('Welcome.privacy.bullets')" :key="i">{{ b }}</li>
      </ul>
      <div class="q-mt-sm">
        <q-btn
          flat
          color="primary"
          @click="showAbout = true"
          :label="$t('Welcome.privacy.ctaLearn')"
        />
      </div>

      <q-dialog v-model="showAbout">
        <q-card style="max-width: 720px; width: 90vw;">
          <q-card-section>
            <div class="text-h6">{{ $t("Welcome.privacy.title") }}</div>
          </q-card-section>
          <q-separator />
          <q-card-section class="q-gutter-y-sm">
            <p>{{ $t("Welcome.privacy.lead") }}</p>
            <ul>
              <li v-for="(b, i) in $tm('Welcome.privacy.bullets')" :key="i">{{ b }}</li>
            </ul>
          </q-card-section>
          <q-separator />
          <q-card-actions align="right">
            <q-btn flat :label="$t('global.actions.close.label')" v-close-popup />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";

const id = "welcome-privacy-title";
const showAbout = ref(false);
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
