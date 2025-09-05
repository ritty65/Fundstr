<template>
  <div>
    <q-banner
      v-if="fallbackUsed"
      inline-actions
      dense
      class="bg-warning text-black q-mb-sm"
    >
      <div class="text-body2">
        Your relays looked unhealthy. We temporarily used vetted open relays. Consider updating your relay list.
      </div>
      <template #action>
        <q-btn flat dense label="Manage" @click="$emit('manage')" />
      </template>
    </q-banner>

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
  </div>
</template>

<script setup lang="ts">
defineProps<{ error?: { message: string; details?: any }; fallbackUsed?: boolean }>();
defineEmits<{ 'retry': []; 'manage': [] }>();
</script>
