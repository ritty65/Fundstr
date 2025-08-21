<template>
  <q-expansion-item dense expand-separator :label="title" icon="info">
    <div class="text-body2 q-mt-sm">
      <slot />
    </div>
  </q-expansion-item>
</template>

<script setup lang="ts">
defineProps<{ title: string }>()
</script>
