<template>
  <TierCard
    :tier="tierData"
    @edit="emit('edit')"
    @delete="emit('delete')"
    @update:tier="emit('update:tierData', $event)"
  />
</template>

<script setup lang="ts">
import TierCard from "./TierCard.vue";
import type { Tier } from "stores/types";

const props = defineProps<{ tierData: Tier }>();
const emit = defineEmits(["edit", "delete", "update:tierData"]);
</script>

<style scoped></style>
