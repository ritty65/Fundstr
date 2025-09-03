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
      class="pending-indicator"
    />
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
.pending-indicator {
  position: absolute;
  top: 4px;
  right: 4px;
}
</style>
