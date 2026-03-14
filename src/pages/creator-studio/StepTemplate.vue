<template>
  <q-card flat bordered class="studio-step-template">
    <div class="studio-step-template__header">
      <div class="studio-step-template__titles">
        <div class="studio-step-template__title text-subtitle1 text-weight-medium text-1">
          {{ title }}
        </div>
        <div v-if="subtitle" class="studio-step-template__subtitle text-caption text-2">
          {{ subtitle }}
        </div>
      </div>
      <div v-if="$slots.toolbar" class="studio-step-template__toolbar">
        <slot name="toolbar" />
      </div>
    </div>
    <div class="studio-step-template__body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="studio-step-template__footer">
      <slot name="footer" />
    </div>
  </q-card>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  subtitle?: string;
}>();
</script>

<style scoped>
.studio-step-template {
  background: var(--surface-2);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  height: 100%;
}

.studio-step-template__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}

.studio-step-template__titles {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.studio-step-template__title {
  margin: 0;
}

.studio-step-template__subtitle {
  margin: 0;
}

.studio-step-template__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-left: auto;
}

.studio-step-template__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.studio-step-template__footer {
  margin-top: auto;
}
</style>
