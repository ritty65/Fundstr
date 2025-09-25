<template>
  <div class="text-caption text-negative">{{ entry.message }}</div>
</template>

<script setup lang="ts">
const props = defineProps<{ entry: { message?: string } }>();
const entry = props.entry;
</script>
