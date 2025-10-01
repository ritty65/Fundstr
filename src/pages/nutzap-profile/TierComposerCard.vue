<template>
  <section class="section-card tier-composer-card">
    <div class="section-header section-header--with-status">
      <div class="section-header-primary">
        <div class="section-title text-subtitle1 text-weight-medium text-1">Tiers &amp; benefits</div>
        <div class="section-subtitle text-body2 text-2">
          Outline pricing, cadence, and supporter perks. We'll flag anything that still needs attention.
        </div>
      </div>
      <q-chip
        dense
        size="sm"
        :color="tiersReady ? 'positive' : 'warning'"
        :text-color="tiersReady ? 'white' : 'black'"
        class="status-chip"
      >
        {{ tiersReady ? 'Validated' : 'Incomplete' }}
      </q-chip>
    </div>
    <div class="section-body column q-gutter-md">
      <div v-if="!tiersReady" class="tier-composer-hint text-caption text-2">
        Add at least one tier with a title, price, and frequency to unlock publishing.
      </div>
      <TierComposer
        :tiers="tiers"
        :frequency-options="frequencyOptions"
        :show-errors="showErrors"
        @update:tiers="value => emit('update:tiers', value)"
        @validation-changed="value => emit('validation-changed', value)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { toRefs, type PropType } from 'vue';
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
}>();

const { tiers, frequencyOptions, showErrors, tiersReady } = toRefs(props);
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

.tier-composer-hint {
  padding: 12px 16px;
  border: 1px dashed var(--surface-contrast-border);
  border-radius: 12px;
}
</style>
