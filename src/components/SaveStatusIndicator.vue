<template>
  <div class="save-status-indicator" :class="`save-status-indicator--${status}`">
    <q-spinner
      v-if="status === 'saving'"
      class="save-status-indicator__icon"
      :color="iconProps.color"
      :size="iconProps.size"
    />
    <q-icon
      v-else
      class="save-status-indicator__icon"
      :name="iconProps.name"
      :color="iconProps.color"
      :size="iconProps.size"
    />
    <span class="save-status-indicator__label text-caption">{{ label }}</span>
    <q-tooltip
      v-if="status === 'error' && errorMessage"
      class="bg-surface-2 text-1"
      anchor="top middle"
      self="bottom middle"
    >
      {{ errorMessage }}
    </q-tooltip>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

type SaveStatus = "idle" | "unsaved" | "saving" | "success" | "error";

const props = defineProps<{
  status: SaveStatus;
  errorMessage?: string | null;
}>();

const label = computed(() => {
  switch (props.status) {
    case "unsaved":
      return "Unsaved changes";
    case "saving":
      return "Saving...";
    case "success":
      return "Saved";
    case "error":
      return "Save failed";
    default:
      return "Synced";
  }
});

const iconProps = computed(() => {
  switch (props.status) {
    case "unsaved":
      return { name: "edit", color: "primary", size: "16px" };
    case "saving":
      return { color: "primary", size: "16px" };
    case "success":
      return { name: "check_circle", color: "positive", size: "16px" };
    case "error":
      return { name: "error", color: "negative", size: "16px" };
    default:
      return { name: "check_circle", color: "grey-5", size: "16px" };
  }
});
</script>

<style scoped>
.save-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  background: transparent;
  color: var(--text-2);
}

.save-status-indicator__icon {
  display: inline-flex;
}

.save-status-indicator--saving .save-status-indicator__label,
.save-status-indicator--unsaved .save-status-indicator__label {
  color: var(--text-1);
}

.save-status-indicator--success .save-status-indicator__label {
  color: var(--q-positive, #21ba45);
}

.save-status-indicator--error .save-status-indicator__label {
  color: var(--q-negative, #c10015);
}
</style>
