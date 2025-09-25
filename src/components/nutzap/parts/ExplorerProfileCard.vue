<template>
  <div class="column q-gutter-xs">
    <div class="row items-center q-gutter-sm">
      <div class="text-subtitle1">{{ displayName }}</div>
      <div class="text-caption text-2">{{ nip05Id }}</div>
    </div>
    <div class="text-caption text-2">npub: <span class="mono">{{ npubPreview }}</span></div>
    <div class="text-caption text-2">Updated {{ updatedAt }}</div>
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

const content = computed(() => {
  try {
    return JSON.parse(props.entry.event.content || '{}');
  } catch {
    return {} as Record<string, unknown>;
  }
});

const displayName = computed(() =>
  (content.value.display_name as string) || (content.value.name as string) || 'Unnamed'
);
const nip05Id = computed(() => (content.value.nip05 as string) || '');
const npubPreview = computed(() => {
  try {
    const npub = nip19.npubEncode(props.entry.event.pubkey);
    return `${npub.slice(0, 12)}…${npub.slice(-6)}`;
  } catch {
    return props.entry.event.pubkey;
  }
});
const updatedAt = computed(() => date.formatDate(props.entry.event.created_at * 1000, 'YYYY-MM-DD HH:mm'));
const rawJson = computed(() => JSON.stringify(props.entry.event, null, 2));
</script>
