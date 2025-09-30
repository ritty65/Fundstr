<template>
  <section class="section-card">
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
    </div>
    <div class="section-body column q-gutter-md">
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
