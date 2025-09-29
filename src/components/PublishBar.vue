<template>
  <q-footer class="w-full bg-grey-3 dark:bg-grey-9 text-dark dark:text-white">
    <q-toolbar class="justify-center column items-center">
      <q-btn
        color="primary"
        outline
        :loading="loading"
        :disable="publishing"
        @click="emit('publish')"
      >
        {{ $t("creatorHub.publish") }}
      </q-btn>
      <q-banner
        v-if="fallbackUsed.length"
        dense
        class="bg-warning text-black q-mt-sm"
      >
        Your relays were unhealthy; also used fallback: {{ fallbackUsed.join(', ') }}
      </q-banner>
      <div v-if="table.length" class="q-mt-sm">
        <table class="text-caption">
          <thead>
            <tr>
              <th class="q-pr-sm">Relay</th>
              <th class="q-pr-sm">Status</th>
              <th class="q-pr-sm">Latency</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in table" :key="r.relay">
              <td class="q-pr-sm" style="word-break: break-all">{{ r.relay }}</td>
              <td class="q-pr-sm">
                <span v-if="r.status === 'ok'">✅ ok</span>
                <span v-else-if="r.status === 'timeout'">⏳ timeout</span>
                <span v-else-if="r.status === 'notConnected'">⚠ notConnected</span>
                <span v-else>❌ {{ r.status }}</span>
              </td>
              <td class="q-pr-sm">{{ r.latencyMs ? r.latencyMs + 'ms' : '' }}</td>
              <td>{{ r.fromFallback ? 'fallback' : 'user' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </q-toolbar>
  </q-footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { PublishReport } from "src/nostr/publish";
const props = defineProps<{ publishing: boolean; report?: PublishReport | null; fallbackUsed: string[] }>();
const emit = defineEmits(["publish"]);
const loading = computed(() => props.publishing && !props.report);
const table = computed(() => props.report?.byRelay ?? []);
const fallbackUsed = computed(() => props.fallbackUsed || []);
</script>
