<template>
  <article
    class="tier-slide text-1"
    :class="{ 'tier-slide--active': isActive }"
    role="group"
    aria-roledescription="slide"
    :aria-label="`Tier ${index + 1} of ${total}: ${tierName}`"
    :aria-hidden="!isActive"
  >
    <header class="tier-slide__header">
      <div class="tier-slide__title">
        <div class="tier-slide__name text-h6 text-weight-bold">{{ tierName }}</div>
        <div v-if="summary" class="tier-slide__summary text-body2 text-2">{{ summary }}</div>
        <div v-if="primaryPerks.length" class="tier-slide__perks" role="list">
          <span v-for="perk in primaryPerks" :key="`perk-${perk}`" class="tier-slide__perk" role="listitem">
            <q-icon name="check_circle" size="16px" class="tier-slide__perk-icon" aria-hidden="true" />
            <span>{{ perk }}</span>
          </span>
        </div>
      </div>
      <div class="tier-slide__pricing">
        <div class="tier-slide__price text-weight-bold">{{ priceLabel }}</div>
        <div v-if="frequencyLabel" class="tier-slide__frequency text-caption text-2">{{ frequencyLabel }}</div>
      </div>
    </header>

    <div class="tier-slide__body">
      <section
        v-if="hasMedia"
        class="tier-slide__media"
        role="region"
        :aria-label="`Media for ${tierName}`"
      >
        <div class="tier-slide__media-stage">
          <MediaPreview
            v-if="activeMedia && !isMediaLink(activeMedia)"
            :url="activeMedia.url"
            layout="responsive"
            class="tier-slide__media-preview"
          />
          <div v-else class="tier-slide__media-link" role="img" :aria-label="activeMediaLabel">
            <q-icon name="link" size="36px" />
            <span class="tier-slide__media-link-text">{{ activeMediaLabel }}</span>
          </div>
        </div>
        <div class="tier-slide__media-info" v-if="activeMedia">
          <div class="tier-slide__media-title">{{ mediaLabel(activeMedia) }}</div>
          <div v-if="mediaSecondaryLabel(activeMedia)" class="tier-slide__media-meta text-caption text-2">
            {{ mediaSecondaryLabel(activeMedia) }}
          </div>
        </div>
        <div class="tier-slide__media-actions" v-if="activeMedia">
          <q-btn
            flat
            dense
            color="accent"
            icon="open_in_new"
            class="tier-slide__media-action"
            tag="a"
            :href="activeMedia.url"
            target="_blank"
            rel="noopener"
            :aria-label="`Open ${activeMediaLabel} in a new tab`"
          />
          <q-btn
            flat
            dense
            color="accent"
            icon="content_copy"
            class="tier-slide__media-action"
            :aria-label="`Copy link to ${activeMediaLabel}`"
            @click.prevent="copyMediaLink(activeMedia.url)"
          />
        </div>
        <div
          v-if="mediaItems.length > 1"
          class="tier-slide__media-selectors"
          role="listbox"
          :aria-label="`Switch media for ${tierName}`"
        >
          <button
            v-for="(item, mediaIndex) in mediaItems"
            :key="`${item.url}-${mediaIndex}`"
            type="button"
            class="tier-slide__selector"
            :class="{ 'tier-slide__selector--active': mediaIndex === activeMediaIndex }"
            role="option"
            :aria-selected="mediaIndex === activeMediaIndex"
            :aria-label="`Show ${mediaLabel(item)}`"
            @click="selectMedia(mediaIndex)"
            @keydown.enter.prevent="selectMedia(mediaIndex)"
            @keydown.space.prevent="selectMedia(mediaIndex)"
          >
            <span class="tier-slide__selector-index" aria-hidden="true">{{ mediaIndex + 1 }}</span>
            <span class="tier-slide__selector-label">{{ mediaLabel(item) }}</span>
          </button>
        </div>
      </section>
      <section v-else class="tier-slide__media tier-slide__media--empty" aria-label="Tier media">
        <div class="tier-slide__media-empty text-2">Creator hasn't added media yet.</div>
      </section>

      <div class="tier-slide__info">
        <section v-if="hasDescription" class="tier-slide__section">
          <header class="tier-slide__section-heading">
            <q-icon name="subject" size="20px" class="tier-slide__section-icon" aria-hidden="true" />
            <span class="tier-slide__section-title">About this tier</span>
          </header>
          <p class="tier-slide__copy">{{ description }}</p>
        </section>

        <section v-if="hasBenefits" class="tier-slide__section">
          <header class="tier-slide__section-heading">
            <q-icon name="workspace_premium" size="20px" class="tier-slide__section-icon" aria-hidden="true" />
            <span class="tier-slide__section-title">Perks included</span>
          </header>
          <ul class="tier-slide__benefits">
            <li v-for="benefit in benefits" :key="benefit" class="tier-slide__benefit">
              <q-icon name="task_alt" size="18px" class="tier-slide__benefit-icon" aria-hidden="true" />
              <span>{{ benefit }}</span>
            </li>
          </ul>
        </section>

        <section v-if="hasWelcome" class="tier-slide__section">
          <header class="tier-slide__section-heading">
            <q-icon name="celebration" size="20px" class="tier-slide__section-icon" aria-hidden="true" />
            <span class="tier-slide__section-title">Welcome experience</span>
          </header>
          <p class="tier-slide__copy">{{ welcomeMessage }}</p>
        </section>

        <div v-if="!hasDetails" class="tier-slide__empty text-2">
          The creator hasn't shared additional details for this tier yet.
        </div>

        <div class="tier-slide__cta">
          <q-btn color="accent" unelevated no-caps label="Subscribe" @click="emitSubscribe" />
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { copyToClipboard, useQuasar } from 'quasar';
import MediaPreview from 'components/MediaPreview.vue';
import type { TierMedia as TierMediaItem } from 'stores/types';

const props = defineProps<{
  tierId: string;
  tierName: string;
  priceLabel: string;
  frequencyLabel: string | null;
  summary: string | null;
  description: string | null;
  benefits: string[];
  welcomeMessage: string | null;
  mediaItems: TierMediaItem[];
  index: number;
  total: number;
  isActive: boolean;
}>();

const emit = defineEmits<{
  (e: 'subscribe', tierId: string): void;
}>();

const summary = computed(() => (props.summary ?? '').trim());
const benefits = computed(() =>
  Array.isArray(props.benefits)
    ? props.benefits.map((benefit) => benefit.trim()).filter((benefit) => benefit.length > 0)
    : [],
);
const hasBenefits = computed(() => benefits.value.length > 0);
const primaryPerks = computed(() => benefits.value.slice(0, 3));
const description = computed(() => props.description?.trim() ?? '');
const hasDescription = computed(() => description.value.length > 0);
const welcomeMessage = computed(() => props.welcomeMessage?.trim() ?? '');
const hasWelcome = computed(() => welcomeMessage.value.length > 0);
const hasDetails = computed(() => hasDescription.value || hasBenefits.value || hasWelcome.value);

const mediaItems = computed(() => (Array.isArray(props.mediaItems) ? props.mediaItems : []));
const hasMedia = computed(() => mediaItems.value.length > 0);
const activeMediaIndex = ref(0);

watch(
  mediaItems,
  (items) => {
    if (!items.length) {
      activeMediaIndex.value = 0;
      return;
    }
    if (activeMediaIndex.value >= items.length) {
      activeMediaIndex.value = 0;
    }
  },
  { immediate: true },
);

watch(
  () => props.isActive,
  (active) => {
    if (active) {
      activeMediaIndex.value = 0;
    }
  },
);

const activeMedia = computed(() => {
  const items = mediaItems.value;
  if (!items.length) {
    return null;
  }
  const index = Math.min(Math.max(activeMediaIndex.value, 0), items.length - 1);
  return items[index];
});

const activeMediaLabel = computed(() => (activeMedia.value ? mediaLabel(activeMedia.value) : 'Media item'));

const $q = useQuasar();

function selectMedia(index: number) {
  if (!Number.isInteger(index)) {
    return;
  }
  const items = mediaItems.value;
  if (!items.length) {
    return;
  }
  const nextIndex = Math.min(Math.max(index, 0), items.length - 1);
  activeMediaIndex.value = nextIndex;
}

function isMediaLink(item: TierMediaItem | null | undefined): boolean {
  const type = (item?.type ?? '').toLowerCase();
  return type === 'link';
}

function mediaLabel(item: TierMediaItem): string {
  if (item.title && item.title.trim()) {
    return item.title.trim();
  }
  const type = (item.type ?? '').toLowerCase();
  if (type === 'audio') return 'Audio clip';
  if (type === 'video') return 'Video';
  if (type === 'image') return 'Image';
  if (type === 'link') return 'Link';
  return 'Media item';
}

function mediaSecondaryLabel(item: TierMediaItem): string | null {
  const type = (item.type ?? '').toLowerCase();
  if (type === 'audio') return 'Tap to listen';
  if (type === 'video') return 'Tap to play';
  if (type === 'image') return 'Tap to view full image';
  if (type === 'link') return 'Opens in a new tab';
  return null;
}

async function copyMediaLink(url: string) {
  if (!url) {
    return;
  }
  try {
    await copyToClipboard(url);
    $q.notify({ type: 'positive', message: 'Link copied to clipboard' });
  } catch (error) {
    console.error('Failed to copy link', error);
    $q.notify({ type: 'negative', message: 'Unable to copy link' });
  }
}

function emitSubscribe() {
  if (!props.tierId) {
    return;
  }
  emit('subscribe', props.tierId);
}
</script>

<style scoped>
.tier-slide {
  display: none;
  flex-direction: column;
  gap: clamp(20px, 4vh, 32px);
  background: color-mix(in srgb, var(--surface-1) 97%, var(--surface-2) 3%);
  border-radius: 20px;
  --tier-slide-padding: clamp(20px, 3vw, 32px);
  padding: var(--tier-slide-padding);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 75%, transparent);
  min-height: 0;
}

.tier-slide--active {
  display: flex;
}

.tier-slide__header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  gap: clamp(12px, 3vw, 24px);
  align-items: flex-start;
}

.tier-slide__title {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 70%;
}

.tier-slide__name {
  line-height: 1.2;
}

.tier-slide__summary {
  max-width: 56ch;
}

.tier-slide__perks {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tier-slide__perk {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-200) 25%, transparent);
  color: var(--accent-600);
  font-size: 13px;
  font-weight: 600;
}

.tier-slide__perk-icon {
  color: var(--accent-500);
}

.tier-slide__pricing {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  white-space: nowrap;
}

.tier-slide__price {
  font-size: clamp(20px, 3vw, 28px);
}

.tier-slide__body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
  grid-template-areas:
    'media'
    'info';
  gap: clamp(28px, 5vw, 48px);
  align-items: stretch;
}

.tier-slide__media {
  grid-area: media;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: color-mix(in srgb, var(--surface-2) 85%, transparent);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
  border-radius: 16px;
  padding: clamp(20px, 3vw, 28px);
}

.tier-slide__media-stage {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface-1) 92%, black 8%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tier-slide__media-preview :deep(.media-preview-container) {
  margin: 0;
  width: 100%;
  height: 100%;
}

.tier-slide__media-preview :deep(img),
.tier-slide__media-preview :deep(video),
.tier-slide__media-preview :deep(iframe) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tier-slide__media-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--accent-500);
  text-align: center;
  padding: 20px;
}

.tier-slide__media-link-text {
  font-weight: 600;
}

.tier-slide__media-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tier-slide__media-title {
  font-weight: 600;
}

.tier-slide__media-actions {
  display: flex;
  gap: 8px;
}

.tier-slide__media-selectors {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tier-slide__selector {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 75%, transparent);
  background: color-mix(in srgb, var(--surface-1) 96%, transparent);
  color: var(--text-2);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.tier-slide__selector:focus-visible,
.tier-slide__selector--active {
  border-color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 32%, transparent);
  color: color-mix(in srgb, var(--accent-600) 78%, var(--text-1) 22%);
}

.tier-slide__selector-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent-200) 40%, transparent);
  color: var(--accent-600);
  font-size: 12px;
  font-weight: 700;
}

.tier-slide__selector-label {
  display: inline-flex;
  max-width: 22ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tier-slide__media--empty {
  align-items: center;
  justify-content: center;
}

.tier-slide__media-empty {
  text-align: center;
  padding: 32px;
}

.tier-slide__info {
  grid-area: info;
  display: flex;
  flex-direction: column;
  gap: clamp(16px, 3vh, 24px);
  min-height: 0;
}

.tier-slide__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tier-slide__section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.tier-slide__section-title {
  font-size: 15px;
}

.tier-slide__section-icon {
  color: var(--accent-500);
}

.tier-slide__copy {
  line-height: 1.6;
  white-space: pre-wrap;
}

.tier-slide__benefits {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tier-slide__benefit {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.tier-slide__benefit-icon {
  color: var(--accent-500);
  margin-top: 2px;
}

.tier-slide__empty {
  padding: 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-2) 80%, transparent);
}

.tier-slide__cta {
  margin-top: auto;
  padding-top: clamp(24px, 5vh, 40px);
  display: flex;
  justify-content: flex-start;
}

@media (max-width: 1023px) {
  .tier-slide__body {
    gap: clamp(20px, 6vw, 32px);
  }

  .tier-slide__title {
    max-width: none;
  }

  .tier-slide__pricing {
    align-items: flex-start;
  }

  .tier-slide__cta {
    justify-content: stretch;
  }

  .tier-slide__cta :deep(.q-btn) {
    width: 100%;
  }
}
</style>
