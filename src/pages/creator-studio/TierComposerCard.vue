<template>
  <section class="section-card tier-composer-card">
    <div class="section-header section-header--with-status">
      <div class="section-header-primary">
        <div class="section-title text-subtitle1 text-weight-medium text-1">Compose tiers</div>
        <div class="section-subtitle text-body2 text-2">
          Draft pricing, benefits, and cadence before publishing downstream.
        </div>
      </div>
      <q-chip
        dense
        size="sm"
        :color="tiersReady ? 'positive' : 'warning'"
        :text-color="tiersReady ? 'white' : 'black'"
        class="status-chip"
      >
        {{ tiersReady ? 'Valid' : 'Needs review' }}
      </q-chip>
      <q-btn
        flat
        dense
        icon="refresh"
        label="Reload from relay"
        @click="handleDiscardLocal"
      />
    </div>
    <div class="section-body column q-gutter-md">
      <TierComposer
        ref="composerRef"
        :tiers="tiers"
        :frequency-options="frequencyOptions"
        :show-errors="showErrors"
        @update:tiers="value => emit('update:tiers', value)"
        @validation-changed="value => emit('validation-changed', value)"
        @request-refresh-from-relay="() => emit('request-refresh-from-relay')"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, toRefs, type PropType } from 'vue';
import TierComposer from './TierComposer.vue';
import type { Tier } from 'src/nutzap/types';
import type { TierFieldErrors } from './tierComposerUtils';

type FrequencyOption = {
  value: Tier['frequency'];
  label: string;
};

const props = defineProps({
  tiers: { type: Array as PropType<Tier[]>, required: true },
  frequencyOptions: { type: Array as PropType<FrequencyOption[]>, required: true },
  showErrors: { type: Boolean, required: true },
  tiersReady: { type: Boolean, required: true },
});

const emit = defineEmits<{
  (e: 'update:tiers', value: Tier[]): void;
  (e: 'validation-changed', value: TierFieldErrors[]): void;
  (e: 'request-refresh-from-relay'): void;
}>();

const { tiers, frequencyOptions, showErrors, tiersReady } = toRefs(props);

const composerRef = ref<InstanceType<typeof TierComposer> | null>(null);

function handleDiscardLocal() {
  composerRef.value?.discardLocalEditsAndReload();
}
</script>

<style scoped>
.tier-composer-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.tier-composer-card .section-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}
</style>
