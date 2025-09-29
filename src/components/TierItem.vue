<template>
  <div class="tier-wrapper">
    <TierCard
      :tier="tierData"
      @edit="emit('save')"
      @delete="emit('delete')"
      @update:tier="emit('update:tierData', $event)"
    />
    <q-spinner
      v-if="tierData.publishStatus === 'pending'"
      color="primary"
      size="1em"
      class="status-indicator"
    />
    <q-icon
      v-else-if="tierData.publishStatus === 'succeeded'"
      name="check_circle"
      color="positive"
      class="status-indicator"
    />
    <q-icon
      v-else-if="tierData.publishStatus === 'failed'"
      name="warning"
      color="negative"
      class="status-indicator"
    >
      <q-tooltip>Failed to publish.</q-tooltip>
    </q-icon>
  </div>
</template>

<script setup lang="ts">
import TierCard from "./TierCard.vue";
import type { Tier } from "stores/types";

const props = defineProps<{ tierData: Tier }>();
const emit = defineEmits(["save", "delete", "update:tierData"]);
</script>

<style scoped>
.tier-wrapper {
  position: relative;
}
.status-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
}
</style>
