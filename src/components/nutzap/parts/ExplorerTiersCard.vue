<template>
  <div class="column q-gutter-xs">
    <div class="text-subtitle1">Nutzap Tiers (kind 30000)</div>
    <q-list dense>
      <template v-if="tiers.length">
        <q-item v-for="tier in tiers" :key="tier.id" dense>
          <q-item-section>
            <div class="text-body2">
              <span class="mono">{{ tier.id }}</span> — <b>{{ tier.title }}</b> · {{ tier.price }} sats / {{ tier.frequency }}
            </div>
            <div v-if="tier.description" class="text-caption text-2">{{ tier.description }}</div>
          </q-item-section>
        </q-item>
      </template>
      <template v-else>
        <q-item dense>
          <q-item-section class="text-caption text-2">No tiers found.</q-item-section>
        </q-item>
      </template>
    </q-list>
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

const parsed = computed(() => {
  try {
    return JSON.parse(props.entry.event.content || '{}');
  } catch {
    return {};
  }
});

const tiers = computed(() => {
  const raw = parsed.value;
  const list = Array.isArray(raw?.tiers) ? raw.tiers : Array.isArray(raw) ? raw : [];
  return list.map((tier: any) => ({
    id: tier.id || '',
    title: tier.title || '',
    price: Number.isFinite(Number(tier.price)) ? Number(tier.price) : Number(tier.price_sats) || 0,
    frequency: tier.frequency || 'monthly',
    description: tier.description || '',
  }));
});

const rawJson = computed(() => JSON.stringify(props.entry.event, null, 2));
</script>
