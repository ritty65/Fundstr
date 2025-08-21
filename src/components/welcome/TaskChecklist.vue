<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-h6">{{ $t('welcome.taskList.title') }}</div>
      <div class="text-subtitle2">{{ $t('welcome.taskList.subtitle') }}</div>
    </q-card-section>
    <q-separator />
    <q-list>
      <q-item v-for="t in tasks" :key="t.id" clickable @click="$emit('run', t)">
        <q-item-section avatar><q-icon :name="t.icon" /></q-item-section>
        <q-item-section>
          <q-item-label>{{ t.title }}</q-item-label>
          <q-item-label caption>{{ t.desc }}</q-item-label>
          <div v-if="t.requires?.length" class="text-caption text-grey">
            Requires: {{ t.requires.join(', ') }}
          </div>
        </q-item-section>
        <q-item-section side>
          <q-badge v-if="t.done()" color="positive" label="✓" />
        </q-item-section>
      </q-item>
    </q-list>
    <q-separator />
    <q-card-actions align="between">
      <div>{{ progress }}</div>
      <q-btn unelevated color="primary" :disable="!canFinish" :label="$t('welcome.taskList.finish')" @click="$emit('finish')" />
    </q-card-actions>
  </q-card>
</template>

<script setup lang="ts">
import type { WelcomeTask } from 'src/types/welcome'

defineProps<{ tasks: WelcomeTask[]; progress: string; canFinish: boolean }>()
defineEmits<{ (e:'run', task: WelcomeTask): void; (e:'finish'): void }>()
</script>
