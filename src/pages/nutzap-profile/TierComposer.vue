<template>
  <div class="tier-composer column q-gutter-md">
    <div class="row items-center justify-between">
      <div class="text-subtitle2">Manage Tiers ({{ entries.length }})</div>
      <q-btn dense color="primary" label="Add Tier" icon="add" @click="addTier" />
    </div>

    <div v-if="entries.length" class="column q-gutter-md">
      <q-card v-for="(tier, index) in entries" :key="tier.id" class="tier-composer__card">
        <q-card-section class="row items-center justify-between">
          <div class="text-subtitle2 text-1">
            Tier {{ index + 1 }}
            <span v-if="tier.title" class="text-weight-medium">— {{ tier.title }}</span>
          </div>
          <div class="row items-center q-gutter-xs">
            <q-chip v-if="cardHasErrors(index)" color="negative" text-color="white" dense>
              Fix errors
            </q-chip>
            <q-btn dense flat round icon="delete" color="negative" @click="removeTier(index)" />
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section class="column q-gutter-md">
          <q-input
            v-model="tier.title"
            label="Title"
            dense
            filled
            :error="!!validationAt(index).title"
            :error-message="validationAt(index).title"
          />
          <div class="row q-col-gutter-md">
            <div class="col-12 col-sm-6">
              <q-input
                v-model="tier.price"
                label="Price (sats)"
                type="number"
                dense
                filled
                min="0"
                :error="!!validationAt(index).price"
                :error-message="validationAt(index).price"
              />
            </div>
            <div class="col-12 col-sm-6">
              <q-select
                v-model="tier.frequency"
                :options="frequencyOptions"
                emit-value
                map-options
                label="Frequency"
                dense
                filled
                :error="!!validationAt(index).frequency"
                :error-message="validationAt(index).frequency"
              />
            </div>
          </div>
          <q-input
            v-model="tier.description"
            type="textarea"
            label="Description"
            dense
            filled
            autogrow
          />
          <div class="column q-gutter-sm">
            <div class="row items-center justify-between">
              <div class="text-body2 text-2">Media</div>
              <q-btn dense flat color="primary" icon="add" label="Add Media" @click="addMedia(index)" />
            </div>
            <div v-if="tier.media.length" class="column q-gutter-sm">
              <div
                v-for="(mediaUrl, mediaIndex) in tier.media"
                :key="`${tier.id}-media-${mediaIndex}`"
                class="row items-center q-gutter-sm"
              >
                <div class="col">
                  <q-input
                    v-model="tier.media[mediaIndex]"
                    label="Media URL"
                    dense
                    filled
                    :error="!!mediaError(index, mediaIndex)"
                    :error-message="mediaError(index, mediaIndex) || ''"
                  />
                </div>
                <q-btn dense flat round icon="delete" color="negative" @click="removeMedia(index, mediaIndex)" />
              </div>
            </div>
            <div v-else class="text-caption text-2">
              No media added. Click "Add Media" to attach optional links.
            </div>
          </div>
        </q-card-section>
      </q-card>
    </div>
    <div v-else class="text-caption text-2">
      No tiers yet. Add at least one tier before publishing.
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import type { Tier } from 'src/nutzap/types';
import {
  createEmptyDraft,
  draftToTier,
  hasTierErrors,
  tierToDraft,
  type TierDraft,
  type TierFieldErrors,
  validateTierDraft,
} from './tierComposerUtils';

const props = defineProps<{
  tiers: Tier[];
  frequencyOptions: { value: Tier['frequency']; label: string }[];
}>();

const emit = defineEmits<{
  (e: 'update:tiers', tiers: Tier[]): void;
  (e: 'validation-changed', errors: TierFieldErrors[]): void;
}>();

const entries = ref<TierDraft[]>([]);
const validations = ref<TierFieldErrors[]>([]);
let syncingFromProps = false;
let skipNextPropSync = false;

function cloneErrors(results: TierFieldErrors[]): TierFieldErrors[] {
  return results.map(result => ({
    ...result,
    media: Array.isArray(result.media) ? [...result.media] : undefined,
  }));
}

function emitValidation(notifyParent = true) {
  const results = entries.value.map(entry => validateTierDraft(entry));
  validations.value = results;
  if (notifyParent) {
    emit('validation-changed', cloneErrors(results));
  }
}

watch(
  () => props.tiers,
  tiers => {
    if (skipNextPropSync) {
      skipNextPropSync = false;
      emitValidation();
      return;
    }
    syncingFromProps = true;
    entries.value = tiers.map(tier => tierToDraft(tier));
    // ensure empty composer still allows adding media rows later
    if (!entries.value.length) {
      validations.value = [];
      emit('validation-changed', []);
    } else {
      emitValidation();
    }
    void nextTick(() => {
      syncingFromProps = false;
    });
  },
  { deep: true, immediate: true }
);

watch(
  entries,
  () => {
    if (syncingFromProps) {
      return;
    }
    const sanitized = entries.value.map(entry => draftToTier(entry));
    skipNextPropSync = true;
    emit('update:tiers', sanitized);
    emitValidation();
  },
  { deep: true }
);

function cardHasErrors(index: number) {
  return hasTierErrors(validationAt(index));
}

function validationAt(index: number): TierFieldErrors {
  return validations.value[index] ?? {};
}

function mediaError(index: number, mediaIndex: number): string | null {
  const validation = validationAt(index);
  return validation.media?.[mediaIndex] ?? null;
}

function addTier() {
  const newDraft = createEmptyDraft({ id: uuidv4(), media: [] });
  entries.value = [...entries.value, newDraft];
}

function removeTier(index: number) {
  const next = [...entries.value];
  next.splice(index, 1);
  entries.value = next;
}

function addMedia(index: number) {
  const next = [...entries.value];
  const draft = { ...next[index], media: [...next[index].media, ''] };
  next.splice(index, 1, draft);
  entries.value = next;
}

function removeMedia(index: number, mediaIndex: number) {
  const next = [...entries.value];
  const media = [...next[index].media];
  media.splice(mediaIndex, 1);
  const draft = { ...next[index], media };
  next.splice(index, 1, draft);
  entries.value = next;
}
</script>

<style scoped>
.tier-composer__card {
  border: 1px solid var(--surface-contrast-border, rgba(255, 255, 255, 0.08));
}
</style>
