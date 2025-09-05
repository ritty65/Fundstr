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
interface RelayRow { relay: string; status: string; latencyMs?: number; fromFallback?: boolean }
const props = defineProps<{ publishing: boolean; results?: { kind: number; perRelay: RelayRow[] }[] }>();
const emit = defineEmits(["publish"]);
const loading = computed(() => props.publishing && !(props.results && props.results.length));
const table = computed(() => props.results?.[0]?.perRelay ?? []);
</script>
