<template>
  <div class="tier-composer column q-gutter-md">
    <div class="row items-center justify-between">
      <div class="text-subtitle2">Manage Tiers ({{ entries.length }})</div>
      <q-btn
        dense
        color="primary"
        label="Add Tier"
        icon="add"
        :disable="isDisabled"
        @click="addTier"
      />
    </div>

    <div v-if="entries.length" class="column q-gutter-md">
      <div class="tier-composer__summary bg-surface-2 q-pa-md q-gutter-sm column">
        <div class="text-caption text-2 text-uppercase">Quick preview</div>
        <div class="column q-gutter-xs">
          <div
            v-for="(summary, index) in tierSummaries"
            :key="summary.id"
            :class="['tier-composer__summary-row row items-center justify-between', { 'has-error': cardHasVisibleErrors(index) }]"
          >
            <div class="column">
              <div class="text-body2 text-1 text-weight-medium">
                Tier {{ index + 1 }} — {{ summary.title }}
              </div>
              <div class="text-caption text-2">{{ summary.caption }}</div>
            </div>
            <div class="text-body2 text-1 tier-composer__summary-price">{{ summary.priceLabel }}</div>
          </div>
        </div>
      </div>

      <q-card v-for="(tier, index) in entries" :key="tier.id" class="tier-composer__card">
        <q-card-section class="row items-center justify-between">
          <div class="text-subtitle2 text-1">
            Tier {{ index + 1 }}
            <span v-if="tier.title" class="text-weight-medium">— {{ tier.title }}</span>
          </div>
          <div class="row items-center q-gutter-xs">
            <q-chip v-if="cardHasVisibleErrors(index)" color="negative" text-color="white" dense>
              Fix errors
            </q-chip>
            <q-btn
              dense
              flat
              round
              icon="delete"
              color="negative"
              :disable="isDisabled"
              @click="removeTier(index)"
            />
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section class="column q-gutter-md">
          <q-input
            v-model="tier.title"
            label="Title"
            dense
            filled
            :disable="isDisabled"
            @update:model-value="markTouched(tier.id, 'title')"
            @blur="markTouched(tier.id, 'title')"
            :error="shouldShowFieldError(index, 'title')"
            :error-message="shouldShowFieldError(index, 'title') ? validationAt(index).title : ''"
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
                :disable="isDisabled"
                @update:model-value="markTouched(tier.id, 'price')"
                @blur="markTouched(tier.id, 'price')"
                :error="shouldShowFieldError(index, 'price')"
                :error-message="shouldShowFieldError(index, 'price') ? validationAt(index).price : ''"
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
                :disable="isDisabled"
                @update:model-value="markTouched(tier.id, 'frequency')"
                :error="shouldShowFieldError(index, 'frequency')"
                :error-message="shouldShowFieldError(index, 'frequency') ? validationAt(index).frequency : ''"
              />
            </div>
          </div>

          <div class="tier-composer__presets column q-gutter-xs">
            <div class="text-caption text-2">Quick templates</div>
            <div class="row wrap items-center q-gutter-xs">
              <q-chip
                v-for="preset in tierPresets"
                :key="preset.label"
                clickable
                dense
                color="primary"
                text-color="white"
                outline
                :disable="isDisabled"
                @click="applyPreset(index, preset)"
              >
                {{ preset.label }}
              </q-chip>
            </div>
          </div>

          <div class="tier-optional column q-gutter-sm">
            <q-btn
              flat
              dense
              class="tier-optional__toggle"
              :icon="isOptionalOpen(tier.id) ? 'expand_less' : 'expand_more'"
              :label="isOptionalOpen(tier.id) ? 'Hide optional details' : 'Add optional details'"
              :disable="isDisabled"
              @click="toggleOptional(tier.id)"
            />
            <q-slide-transition>
              <div v-show="isOptionalOpen(tier.id)" class="column q-gutter-md">
                <q-input
                  v-model="tier.description"
                  type="textarea"
                  label="Description (optional)"
                  dense
                  filled
                  autogrow
                  :disable="isDisabled"
                  @update:model-value="markTouched(tier.id, 'description')"
                  @blur="markTouched(tier.id, 'description')"
                />
                <div class="column q-gutter-sm">
                  <div class="row items-center justify-between">
                    <div class="text-body2 text-2">Media (optional)</div>
                    <q-btn
                      dense
                      flat
                      color="primary"
                      icon="add"
                      label="Add Media"
                      :disable="isDisabled"
                      @click="addMedia(index)"
                    />
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
                          :disable="isDisabled"
                          @update:model-value="markTouched(tier.id, 'media', mediaIndex)"
                          @blur="markTouched(tier.id, 'media', mediaIndex)"
                          :error="shouldShowMediaError(index, mediaIndex)"
                          :error-message="shouldShowMediaError(index, mediaIndex) ? mediaError(index, mediaIndex) || '' : ''"
                        />
                        <div
                          v-if="mediaPreviews[index] && mediaPreviews[index][mediaIndex]"
                          class="tier-media-preview q-mt-sm"
                        >
                          <template v-if="mediaPreviews[index][mediaIndex]?.type === 'image'">
                            <q-img
                              :src="mediaPreviews[index][mediaIndex]?.src"
                              :ratio="16 / 9"
                              class="tier-media-preview__image"
                              no-spinner
                            />
                          </template>
                          <template v-else-if="mediaPreviews[index][mediaIndex]?.type === 'video'">
                            <video
                              :src="mediaPreviews[index][mediaIndex]?.src"
                              class="tier-media-preview__video"
                              controls
                              playsinline
                            />
                          </template>
                          <template v-else-if="mediaPreviews[index][mediaIndex]?.type === 'audio'">
                            <audio
                              :src="mediaPreviews[index][mediaIndex]?.src"
                              class="tier-media-preview__audio"
                              controls
                            />
                          </template>
                          <template v-else>
                            <iframe
                              :src="mediaPreviews[index][mediaIndex]?.src"
                              class="tier-media-preview__iframe"
                              loading="lazy"
                              allowfullscreen
                            />
                          </template>
                        </div>
                      </div>
                      <q-btn
                        dense
                        flat
                        round
                        icon="delete"
                        color="negative"
                        :disable="isDisabled"
                        @click="removeMedia(index, mediaIndex)"
                      />
                    </div>
                  </div>
                  <div v-else class="text-caption text-2">
                    No media added. Click "Add Media" to attach optional links.
                  </div>
                </div>
              </div>
            </q-slide-transition>
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
import { computed, nextTick, reactive, ref, watch } from 'vue';
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
import { determineMediaType, normalizeMediaUrl } from 'src/utils/validateMedia';

const props = defineProps<{
  tiers: Tier[];
  frequencyOptions: { value: Tier['frequency']; label: string }[];
  showErrors?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:tiers', tiers: Tier[]): void;
  (e: 'validation-changed', errors: TierFieldErrors[]): void;
}>();

const isDisabled = computed(() => props.disabled === true);

type TierTouchedState = {
  title: boolean;
  price: boolean;
  frequency: boolean;
  description: boolean;
  media: boolean[];
};

type TierPreset = {
  label: string;
  title: string;
  price: string;
  frequency: Tier['frequency'];
};

const entries = ref<TierDraft[]>([]);
const validations = ref<TierFieldErrors[]>([]);
const touched = reactive<Record<string, TierTouchedState>>({});
const optionalOpen = reactive<Record<string, boolean>>({});
let syncingFromProps = false;
let skipNextPropSync = false;

type MediaPreview = {
  type: 'image' | 'video' | 'audio' | 'iframe';
  src: string;
};

const tierPresets: TierPreset[] = [
  { label: 'Supporter • 1k sats / monthly', title: 'Supporter', price: '1000', frequency: 'monthly' },
  { label: 'Backer • 5k sats / monthly', title: 'Backer', price: '5000', frequency: 'monthly' },
  { label: 'Believer • 10k sats / yearly', title: 'Believer', price: '10000', frequency: 'yearly' },
  { label: 'Tip jar • 500 sats one-time', title: 'Tip jar', price: '500', frequency: 'one_time' },
];

const frequencyLabelMap = computed(() => {
  const map: Partial<Record<Tier['frequency'], string>> = {};
  for (const option of props.frequencyOptions) {
    map[option.value] = option.label;
  }
  return map;
});

const tierSummaries = computed(() =>
  entries.value.map((entry, index) => {
    const priceNumber = Number(entry.price);
    const priceValid = Number.isFinite(priceNumber) && priceNumber > 0;
    const priceLabel = priceValid ? `${new Intl.NumberFormat().format(priceNumber)} sats` : 'Set a price';
    const frequencyLabel = frequencyLabelMap.value[entry.frequency] ?? entry.frequency;
    const title = entry.title.trim() || `Untitled tier #${index + 1}`;
    return {
      id: entry.id,
      title,
      caption: `${priceLabel} • ${frequencyLabel}`,
      priceLabel,
    };
  })
);

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function createMediaPreview(rawUrl: string): MediaPreview | null {
  if (typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizeMediaUrl(trimmed);
  if (!normalized || !isHttpUrl(normalized)) {
    return null;
  }

  const detected = determineMediaType(normalized);
  if (detected === 'image') {
    return { type: 'image', src: normalized };
  }
  if (detected === 'audio') {
    return { type: 'audio', src: normalized };
  }
  if (detected === 'video') {
    return { type: 'video', src: normalized };
  }

  return { type: 'iframe', src: normalized };
}

const mediaPreviews = computed(() =>
  entries.value.map(entry => entry.media.map(url => createMediaPreview(url)))
);

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

function syncAncillaryState(drafts: TierDraft[]) {
  const ids = drafts.map(draft => draft.id);
  for (const existingId of Object.keys(touched)) {
    if (!ids.includes(existingId)) {
      delete touched[existingId];
      delete optionalOpen[existingId];
    }
  }

  for (const draft of drafts) {
    const existing = touched[draft.id];
    const normalizedMedia = draft.media.map((url, mediaIndex) => {
      const fromExisting = existing?.media?.[mediaIndex];
      return fromExisting ?? !!url.trim();
    });
    touched[draft.id] = {
      title: existing?.title ?? !!draft.title.trim(),
      price: existing?.price ?? false,
      frequency: existing?.frequency ?? false,
      description: existing?.description ?? !!draft.description.trim(),
      media: normalizedMedia,
    };

    if (!(draft.id in optionalOpen)) {
      optionalOpen[draft.id] = !!draft.description.trim() || draft.media.length > 0;
    }
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
    syncAncillaryState(entries.value);
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
    syncAncillaryState(entries.value);
    const sanitized = entries.value.map((entry, index) =>
      draftToTier(entry, props.tiers?.[index]),
    );
    skipNextPropSync = true;
    emit('update:tiers', sanitized);
    emitValidation();
  },
  { deep: true }
);

function ensureTouchedEntry(id: string) {
  if (!(id in touched)) {
    touched[id] = {
      title: false,
      price: false,
      frequency: false,
      description: false,
      media: [],
    };
  }
}

function validationAt(index: number): TierFieldErrors {
  return validations.value[index] ?? {};
}

function mediaError(index: number, mediaIndex: number): string | null {
  const validation = validationAt(index);
  return validation.media?.[mediaIndex] ?? null;
}

function markTouched(id: string, field: keyof TierTouchedState, mediaIndex?: number) {
  ensureTouchedEntry(id);
  const state = touched[id];
  if (field === 'media') {
    const index = typeof mediaIndex === 'number' ? mediaIndex : 0;
    state.media[index] = true;
  } else {
    state[field] = true;
  }
}

function isFieldTouched(id: string, field: keyof TierTouchedState, mediaIndex?: number) {
  const state = touched[id];
  if (!state) {
    return false;
  }
  if (props.showErrors) {
    return true;
  }
  if (field === 'media') {
    const index = typeof mediaIndex === 'number' ? mediaIndex : 0;
    return state.media[index] ?? false;
  }
  return state[field];
}

function shouldShowFieldError(index: number, field: Exclude<keyof TierFieldErrors, 'media'>) {
  const errors = validationAt(index);
  const tier = entries.value[index];
  if (!tier) {
    return false;
  }
  const hasError = Boolean(errors[field]);
  if (!hasError) {
    return false;
  }
  return isFieldTouched(tier.id, field as keyof TierTouchedState);
}

function shouldShowMediaError(index: number, mediaIndex: number) {
  const tier = entries.value[index];
  if (!tier) {
    return false;
  }
  const hasError = Boolean(mediaError(index, mediaIndex));
  if (!hasError) {
    return false;
  }
  return isFieldTouched(tier.id, 'media', mediaIndex);
}

function cardHasVisibleErrors(index: number) {
  const errors = validationAt(index);
  if (!hasTierErrors(errors)) {
    return false;
  }
  const tier = entries.value[index];
  if (!tier) {
    return false;
  }
  if (props.showErrors) {
    return true;
  }
  const state = touched[tier.id];
  if (!state) {
    return false;
  }
  if (errors.title && state.title) {
    return true;
  }
  if (errors.price && state.price) {
    return true;
  }
  if (errors.frequency && state.frequency) {
    return true;
  }
  if (Array.isArray(errors.media)) {
    return errors.media.some((entry, mediaIndex) => entry && state.media[mediaIndex]);
  }
  return false;
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
  ensureTouchedEntry(draft.id);
  touched[draft.id].media[draft.media.length - 1] = false;
}

function removeMedia(index: number, mediaIndex: number) {
  const next = [...entries.value];
  const media = [...next[index].media];
  media.splice(mediaIndex, 1);
  const draft = { ...next[index], media };
  next.splice(index, 1, draft);
  entries.value = next;
  ensureTouchedEntry(draft.id);
  touched[draft.id].media.splice(mediaIndex, 1);
}

function toggleOptional(id: string) {
  optionalOpen[id] = !optionalOpen[id];
}

function isOptionalOpen(id: string) {
  return optionalOpen[id] ?? false;
}

function applyPreset(index: number, preset: TierPreset) {
  const next = [...entries.value];
  const draft = {
    ...next[index],
    title: preset.title,
    price: preset.price,
    frequency: preset.frequency,
  };
  next.splice(index, 1, draft);
  entries.value = next;
  markTouched(draft.id, 'title');
  markTouched(draft.id, 'price');
  markTouched(draft.id, 'frequency');
}
</script>

<style scoped>
.tier-composer__card {
  border: 1px solid var(--surface-contrast-border, rgba(255, 255, 255, 0.08));
}

.tier-composer__summary {
  border: 1px solid var(--surface-contrast-border, rgba(255, 255, 255, 0.08));
  border-radius: 12px;
}

.tier-composer__summary-row {
  border-radius: 8px;
  padding: 8px 12px;
  background-color: rgba(255, 255, 255, 0.02);
}

.tier-composer__summary-row.has-error {
  border: 1px solid var(--q-negative, #f44336);
}

.tier-composer__summary-price {
  white-space: nowrap;
}

.tier-optional__toggle {
  align-self: flex-start;
}

.tier-media-preview {
  border: 1px solid var(--surface-contrast-border, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  padding: 8px;
  background-color: rgba(255, 255, 255, 0.02);
}

.tier-media-preview__image,
.tier-media-preview__video,
.tier-media-preview__iframe {
  width: 100%;
  border-radius: 6px;
  display: block;
}

.tier-media-preview__video,
.tier-media-preview__iframe {
  aspect-ratio: 16 / 9;
  background-color: rgba(0, 0, 0, 0.4);
}

.tier-media-preview__iframe {
  border: 0;
}

.tier-media-preview__audio {
  width: 100%;
  display: block;
}
</style>
