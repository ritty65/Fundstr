<template>
  <div class="column q-gutter-xs">
    <div class="text-caption text-2">{{ timestamp }}</div>
    <div class="text-body2" style="white-space: pre-wrap">{{ entry.event.content }}</div>
    <div class="text-caption text-2">id {{ notePreview }}</div>
    <q-expansion-item dense dense-toggle label="Raw event">
      <pre class="text-caption mono q-mt-sm">{{ rawJson }}</pre>
    </q-expansion-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { date } from 'quasar';
import { nip19, type Event as NostrEvent } from 'nostr-tools';

type Entry = { event: NostrEvent };

const props = defineProps<{ entry: Entry }>();

const timestamp = computed(() => date.formatDate(props.entry.event.created_at * 1000, 'YYYY-MM-DD HH:mm'));
const notePreview = computed(() => {
  try {
    const encoded = nip19.noteEncode(props.entry.event.id);
    return `${encoded.slice(0, 12)}…`;
  } catch {
    return props.entry.event.id;
  }
});
const rawJson = computed(() => JSON.stringify(props.entry.event, null, 2));
</script>
