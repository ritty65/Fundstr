<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center">
      <q-icon name="inventory" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">
        {{ $t("Welcome.buckets.title") }}
      </h1>
      <p class="q-mt-sm">{{ $t("Welcome.buckets.lead") }}</p>
      <ul class="q-mt-md text-left" style="display: inline-block">
        <li v-for="(b, i) in $tm('Welcome.buckets.bullets')" :key="i">
          {{ b }}
        </li>
      </ul>
      <q-btn
        class="q-mt-md"
        color="primary"
        @click="createBuckets"
        :label="$t('Welcome.buckets.ctaPrimary')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
const props = defineProps<{ onCreateBuckets?: () => void }>();
const id = "welcome-buckets-title";

function createBuckets() {
  props.onCreateBuckets?.();
}
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
