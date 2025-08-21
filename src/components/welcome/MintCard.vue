<template>
  <q-card class="q-pa-md">
    <div class="text-subtitle1">{{ mint.name }}</div>
    <div class="text-caption">{{ mint.url }}</div>
    <div class="text-caption q-mt-sm">
      <q-icon name="lens" size="8px" :color="statusColor" class="q-mr-xs" />
      <span v-if="mint.latencyMs !== null">{{ mint.latencyMs }}ms</span>
      <span v-else>unreachable</span>
    </div>
    <div class="text-caption q-mt-sm">
      <span v-if="mint.unit">Unit: {{ mint.unit }}</span>
      <span v-if="mint.region" class="q-ml-sm">Region: {{ mint.region }}</span>
    </div>
    <q-card-actions class="q-pt-md">
      <q-btn unelevated color="primary" class="full-width" label="Select" @click="emit('select', mint.url)" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ mint: any }>()
const emit = defineEmits<{ (e: 'select', url: string): void }>()

const statusColor = computed(() =>
  props.mint.status === 'ok'
    ? 'positive'
    : props.mint.status === 'pending'
    ? 'warning'
    : 'negative',
)
</script>
