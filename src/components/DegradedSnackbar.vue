<template>
  <div v-if="notices.length" class="q-pa-md">
    <q-banner
      v-for="notice in notices"
      :key="notice.id"
      dense
      rounded
      class="q-mb-sm"
      :class="notice.level === 'negative' ? 'bg-negative text-white' : 'bg-warning text-black'"
    >
      <div class="row items-center no-wrap">
        <div class="col">
          <div class="text-subtitle2">{{ notice.message }}</div>
          <div v-if="notice.retryable" class="text-caption text-2">Retrying automatically</div>
        </div>
        <q-btn
          dense
          flat
          round
          icon="close"
          color="white"
          @click="dismiss(notice.id)"
          aria-label="Dismiss degraded notice"
        />
      </div>
    </q-banner>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useUiStore } from "src/stores/ui";

const ui = useUiStore();
const notices = computed(() => ui.degradedNotices);
const dismiss = (id: string) => ui.clearDegradedNotice(id);
</script>
