<template>
  <div class="mint-safety-list">
    <div v-if="!normalizedMints.length" class="mint-safety-list__empty text-2">
      No trusted mints published yet.
    </div>
    <ul v-else class="mint-safety-list__items">
      <li v-for="mint in normalizedMints" :key="mint" class="mint-safety-list__item">
        <QIcon name="shield" size="18px" class="mint-safety-list__icon" />
        <span class="mint-safety-list__label">{{ mint }}</span>
        <QTooltip class="mint-safety-list__tooltip" anchor="top middle" self="bottom middle">
          Verified Cashu mint shared via Nutzap profile.
        </QTooltip>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { QIcon, QTooltip } from "quasar";

const props = defineProps<{ mints: string[] | undefined }>();

const normalizedMints = computed(() =>
  Array.isArray(props.mints)
    ? props.mints
        .map((mint) => mint?.trim())
        .filter((mint): mint is string => !!mint)
    : [],
);
</script>

<style scoped>
.mint-safety-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.mint-safety-list__items {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.mint-safety-list__item {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-text);
}

.mint-safety-list__icon {
  color: var(--accent-500);
}

.mint-safety-list__label {
  font-size: 0.85rem;
  line-height: 1.2;
  word-break: break-all;
}

.mint-safety-list__empty {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  border: 1px dashed var(--surface-contrast-border);
}

.mint-safety-list__tooltip {
  max-width: 220px;
  text-align: center;
}
</style>
