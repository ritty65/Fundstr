<template>
  <q-footer class="publish-bar q-px-md q-py-sm bg-surface-2 text-1">
    <div class="publish-bar__content">
      <div class="publish-bar__cta">
        <span class="publish-bar__label text-2">
          {{ $t("creatorHub.publishBar.unsavedChanges") }}
        </span>
        <q-btn
          color="primary"
          unelevated
          class="publish-bar__button"
          :loading="loading"
          :disable="publishing"
          @click="emit('publish')"
        >
          {{ $t("creatorHub.publish") }}
        </q-btn>
      </div>
      <q-banner
        v-if="fallbackUsed.length"
        dense
        class="publish-bar__fallback"
      >
        Your relays were unhealthy; also used fallback: {{ fallbackUsed.join(', ') }}
      </q-banner>
      <div v-if="table.length" class="publish-bar__report">
        <div class="publish-report-card">
          <table class="publish-report-card__table text-caption">
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
      </div>
    </div>
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
