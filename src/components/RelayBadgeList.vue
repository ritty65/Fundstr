<template>
  <div class="relay-badge-list">
    <div v-if="!normalizedRelays.length" class="relay-badge-list__empty text-2">
      No relay preferences shared.
    </div>
    <ul v-else class="relay-badge-list__items">
      <li v-for="relay in normalizedRelays" :key="relay" class="relay-badge-list__item">
        <QIcon name="rss_feed" size="18px" class="relay-badge-list__icon" />
        <span class="relay-badge-list__label">{{ relay }}</span>
        <QTooltip class="relay-badge-list__tooltip" anchor="top middle" self="bottom middle">
          Relay advertised for subscription event discovery.
        </QTooltip>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { QIcon, QTooltip } from "quasar";

const props = defineProps<{ relays: string[] | undefined }>();

const normalizedRelays = computed(() =>
  Array.isArray(props.relays)
    ? props.relays
        .map((relay) => relay?.trim())
        .filter((relay): relay is string => !!relay)
    : [],
);
</script>

<style scoped>
.relay-badge-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.relay-badge-list__items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.relay-badge-list__item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.02);
  color: var(--text-1);
}

.relay-badge-list__icon {
  color: var(--accent-500);
}

.relay-badge-list__label {
  font-size: 0.85rem;
  line-height: 1.2;
  word-break: break-all;
}

.relay-badge-list__empty {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  border: 1px dashed var(--surface-contrast-border);
}

.relay-badge-list__tooltip {
  max-width: 220px;
  text-align: center;
}
</style>
