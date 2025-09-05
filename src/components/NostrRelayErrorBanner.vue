<template>
  <q-banner v-if="error" inline-actions dense class="bg-negative text-white">
    <div class="text-body2">
      {{ error.message }}
      <div v-if="error.details" class="q-mt-xs">
        Tried: {{ error.details.urlsTried?.length || 0 }},
        Connected: {{ error.details.urlsConnected?.length || 0 }},
        OK: {{ error.details.okOn?.length || 0 }},
        Failed: {{ error.details.failedOn?.length || 0 }},
        No ACK: {{ error.details.missingAcks?.length || 0 }}
      </div>
    </div>
    <template #action>
      <q-btn flat dense label="Retry" @click="$emit('retry')" />
    </template>
  </q-banner>
</template>

<script setup lang="ts">
defineProps<{ error?: { message: string; details?: any } }>();
defineEmits<{ 'retry': [] }>();
</script>
