<template>
  <div>
    <q-banner v-if="error" inline-actions dense class="bg-negative text-white">
      <div class="text-body2">
        <strong>{{ error.message }}</strong>
        <div v-if="table.length" class="q-mt-sm">
          <table class="text-caption">
            <thead>
              <tr>
                <th class="q-pr-sm">Relay</th>
                <th class="q-pr-sm">Status</th>
                <th>Suggestion</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in table" :key="r.url">
                <td class="q-pr-sm" style="word-break: break-all">{{ r.url }}</td>
                <td class="q-pr-sm">{{ r.err || 'ok' }}</td>
                <td>{{ suggestion(r.err) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="q-mt-xs text-caption">
          No further details available. Please check your network and relay settings.
        </div>
      </div>
      <template #action>
        <q-btn flat dense label="Retry" @click="$emit('retry')" />
        <q-btn
          v-if="props.allowReplace"
          flat
          dense
          label="Replace with vetted relays"
          @click="$emit('replace')"
        />
        <q-btn flat dense label="Manage" @click="$emit('manage')" />
      </template>
    </q-banner>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  error?: { message: string; details?: any };
  allowReplace?: boolean;
}>();

defineEmits<{
  retry: [];
  manage: [];
  replace: [];
}>();

const table = computed(() => props.error?.details?.byRelay || []);

function suggestion(status?: string) {
  switch (status) {
    case 'timeout':
      return 'Relay timeout';
    case 'notConnected':
      return 'Check URL or connectivity';
    case 'blocked':
    case 'rejected':
      return 'Relay rejected event';
    default:
      return '';
  }
}

</script>
