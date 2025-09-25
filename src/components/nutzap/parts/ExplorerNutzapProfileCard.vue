<template>
  <div class="column q-gutter-xs">
    <div class="text-subtitle1">Nutzap Profile (kind 10019)</div>
    <div class="text-caption text-2">p2pk: <span class="mono">{{ p2pkPreview }}</span></div>
    <div class="text-caption text-2">Mints: {{ mintsList }}</div>
    <div class="text-caption text-2">Relays: {{ relaysList }}</div>
    <div class="text-caption text-2">Tier address: <span class="mono">{{ tierAddr }}</span></div>
    <q-expansion-item dense dense-toggle label="Raw event">
      <pre class="text-caption mono q-mt-sm">{{ rawJson }}</pre>
    </q-expansion-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Event as NostrEvent } from 'nostr-tools';

type Entry = { event: NostrEvent };

const props = defineProps<{ entry: Entry }>();

const content = computed(() => {
  try {
    return JSON.parse(props.entry.event.content || '{}');
  } catch {
    return {} as Record<string, unknown>;
  }
});

const p2pkPreview = computed(() => {
  const value = (content.value.p2pk as string) || '';
  return value ? `${value.slice(0, 14)}…` : '—';
});
const mintsList = computed(() => (Array.isArray(content.value.mints) ? content.value.mints.join(', ') : '—'));
const relaysList = computed(() => (Array.isArray(content.value.relays) ? content.value.relays.join(', ') : '—'));
const tierAddr = computed(() => (content.value.tierAddr as string) || '');
const rawJson = computed(() => JSON.stringify(props.entry.event, null, 2));
</script>
