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
        <div class="tier-slide__media-main">
          <div
            class="tier-slide__media-stage"
            :class="[
              { 'tier-slide__media-stage--placeholder': !activeMedia || isMediaLink(activeMedia) },
              activeMediaStageClass,
            ]"
          >
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

            <button
              v-if="mediaItems.length > 1"
              type="button"
              class="tier-slide__media-arrow tier-slide__media-arrow--prev"
              :aria-label="`Show previous media for ${tierName}`"
              @click="goToPreviousMedia"
            >
              <q-icon name="chevron_left" size="20px" />
            </button>
            <button
              v-if="mediaItems.length > 1"
              type="button"
              class="tier-slide__media-arrow tier-slide__media-arrow--next"
              :aria-label="`Show next media for ${tierName}`"
              @click="goToNextMedia"
            >
              <q-icon name="chevron_right" size="20px" />
            </button>

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
                :title="mediaLabel(item)"
                @click="selectMedia(mediaIndex)"
                @keydown.enter.prevent="selectMedia(mediaIndex)"
                @keydown.space.prevent="selectMedia(mediaIndex)"
              >
                <span class="tier-slide__selector-index" aria-hidden="true">{{ mediaIndex + 1 }}</span>
              </button>
            </div>
          </div>
          <div v-if="activeMedia" class="tier-slide__media-meta">
            <div class="tier-slide__media-info">
              <div class="tier-slide__media-title">{{ mediaLabel(activeMedia) }}</div>
              <div v-if="mediaSecondaryLabel(activeMedia)" class="tier-slide__media-subtitle text-caption text-2">
                {{ mediaSecondaryLabel(activeMedia) }}
              </div>
            </div>
            <div class="tier-slide__media-actions">
              <q-btn
                flat
                round
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
                round
                dense
                color="accent"
                icon="content_copy"
                class="tier-slide__media-action"
                :aria-label="`Copy link to ${activeMediaLabel}`"
                @click.prevent="copyMediaLink(activeMedia.url)"
              />
            </div>
          </div>
        </div>
        <div
          v-if="mediaItems.length > 1"
          class="tier-slide__media-thumbs"
          aria-hidden="true"
        >
          <button
            v-for="(item, mediaIndex) in mediaItems"
            :key="`${item.url}-${mediaIndex}`"
            type="button"
            class="tier-slide__thumb"
            :class="{ 'tier-slide__thumb--active': mediaIndex === activeMediaIndex }"
            :title="mediaLabel(item)"
            tabindex="-1"
            @click="selectMedia(mediaIndex)"
            @keydown.enter.prevent="selectMedia(mediaIndex)"
            @keydown.space.prevent="selectMedia(mediaIndex)"
          >
            <MediaPreview
              v-if="!isMediaLink(item)"
              :url="item.url"
              class="tier-slide__thumb-preview"
            />
            <div v-else class="tier-slide__thumb-link" aria-hidden="true">
              <q-icon name="link" size="18px" />
            </div>
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

const activeMediaType = computed(() => (activeMedia.value?.type ?? '').toLowerCase());
const activeMediaShape = computed(() => {
  const type = activeMediaType.value;
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  if (type === 'audio') return 'audio';
  if (type === 'iframe' || type === 'youtube' || type === 'nostr') return 'embed';
  return null;
});
const activeMediaStageClass = computed(() =>
  activeMediaShape.value ? `tier-slide__media-stage--${activeMediaShape.value}` : null,
);

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

function goToPreviousMedia() {
  const items = mediaItems.value;
  if (!items.length) {
    return;
  }
  const previousIndex = (activeMediaIndex.value - 1 + items.length) % items.length;
  activeMediaIndex.value = previousIndex;
}

function goToNextMedia() {
  const items = mediaItems.value;
  if (!items.length) {
    return;
  }
  const nextIndex = (activeMediaIndex.value + 1) % items.length;
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
  min-height: 0;
}

.tier-slide--active {
  display: flex;
}

.tier-slide__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: clamp(12px, 3vw, 24px);
  align-items: flex-start;
}

.tier-slide__title {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
  justify-self: end;
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
  gap: clamp(18px, 3.4vw, 28px);
  align-items: stretch;
}


.tier-slide__media {
  grid-area: media;
  display: flex;
  flex-direction: column;
  gap: clamp(12px, 2vw, 18px);
  background: color-mix(in srgb, var(--surface-2) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 70%, transparent);
  border-radius: 14px;
  padding: clamp(12px, 1.8vw, 18px);
}

.tier-slide__media-main {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1;
}

.tier-slide__media-stage {
  --tier-media-aspect: 16 / 9;
  position: relative;
  width: 100%;
  aspect-ratio: var(--tier-media-aspect);
  min-height: min(520px, 55vh);
  border-radius: 14px;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface-1) 88%, black 12%);
  border: 1px solid color-mix(in srgb, var(--accent-200) 38%, transparent);
  box-shadow: 0 14px 32px rgba(0, 0, 0, 0.1), 0 0 0 1px color-mix(in srgb, var(--accent-200) 48%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
}

.tier-slide__media-stage--image {
  --tier-media-aspect: auto;
}

.tier-slide__media-stage--video,
.tier-slide__media-stage--embed {
  --tier-media-aspect: 16 / 9;
}

.tier-slide__media-stage--audio {
  --tier-media-aspect: 1 / 1;
}

.tier-slide__media-stage--placeholder {
  --tier-media-aspect: 4 / 3;
  min-height: min(440px, 55vh);
}

.tier-slide__media-preview :deep(.media-preview-container) {
  margin: 0;
  width: 100%;
  height: 100%;
  aspect-ratio: inherit;
  border-radius: inherit;
}

.tier-slide__media-preview :deep(.media-preview-container--responsive img) {
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


.tier-slide__media-meta {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
  text-align: left;
}

.tier-slide__media-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: flex-start;
}

.tier-slide__media-title {
  font-weight: 600;
  font-size: clamp(15px, 1.8vw, 18px);
}

.tier-slide__media-subtitle {
  color: var(--text-2);
}


.tier-slide__media-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-start;
  flex-wrap: wrap;
}

.tier-slide__media-action {
  --q-btn-padding: 6px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.08);
  background: color-mix(in srgb, var(--accent-200) 35%, transparent);
  color: var(--accent-600);
}

.tier-slide__media-action:focus-visible {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-200) 60%, transparent);
}


.tier-slide__media-selectors {
  position: absolute;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-1) 70%, transparent);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(12px);
  z-index: 2;
}

.tier-slide__media-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: color-mix(in srgb, var(--surface-1) 72%, transparent);
  color: var(--text-1);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18);
  cursor: pointer;
  transition: background-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
  z-index: 2;
}

.tier-slide__media-arrow:hover {
  background: color-mix(in srgb, var(--surface-1) 86%, transparent);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.22);
}

.tier-slide__media-arrow:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-200) 60%, transparent);
}

.tier-slide__media-arrow--prev {
  left: 12px;
}

.tier-slide__media-arrow--next {
  right: 12px;
}

.tier-slide__selector {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 60%, transparent);
  background: color-mix(in srgb, var(--surface-1) 50%, transparent);
  color: transparent;
  font-size: 0;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

.tier-slide__selector:focus-visible,
.tier-slide__selector--active {
  border-color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 35%, transparent);
}

.tier-slide__selector--active {
  transform: scale(1.1);
}

.tier-slide__selector-index {
  display: none;
}

.tier-slide__media-thumbs {
  display: flex;
  justify-content: center;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.tier-slide__thumb {
  display: inline-flex;
  width: 72px;
  aspect-ratio: 1 / 1;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 75%, transparent);
  background: color-mix(in srgb, var(--surface-1) 95%, transparent);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.tier-slide__thumb:hover {
  transform: translateY(-2px);
}

.tier-slide__thumb--active {
  border-color: color-mix(in srgb, var(--accent-500) 65%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-200) 50%, transparent);
}

.tier-slide__thumb-preview :deep(.media-preview-container) {
  height: 100%;
  aspect-ratio: 1 / 1;
  border-radius: inherit;
  box-shadow: none;
}

.tier-slide__thumb-preview :deep(img),
.tier-slide__thumb-preview :deep(video),
.tier-slide__thumb-preview :deep(iframe) {
  object-fit: cover;
}

.tier-slide__thumb-link {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 30%, transparent);
}

@media (min-width: 1024px) {
  .tier-slide__media {
    flex-direction: row;
    align-items: flex-start;
  }

  .tier-slide__media-main {
    flex: 1;
  }

  .tier-slide__media-meta {
    padding-right: clamp(6px, 1.4vw, 14px);
  }

  .tier-slide__media-thumbs {
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
    gap: 10px;
    padding-bottom: 0;
    padding-left: clamp(10px, 1.6vw, 16px);
    overflow-x: visible;
    overflow-y: auto;
    max-height: min(55vh, 520px);
    max-width: clamp(140px, 18vw, 220px);
  }

  .tier-slide__thumb {
    width: 100%;
    aspect-ratio: 16 / 9;
  }
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
  gap: clamp(12px, 2.6vh, 20px);
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
    gap: clamp(16px, 4.6vw, 24px);
  }

  .tier-slide__pricing {
    align-items: flex-start;
    justify-self: start;
  }

  .tier-slide__cta {
    justify-content: stretch;
  }

  .tier-slide__cta :deep(.q-btn) {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .tier-slide__header {
    grid-template-columns: 1fr;
  }

  .tier-slide__pricing {
    justify-self: start;
    width: 100%;
    padding-top: 4px;
  }
}
</style>
