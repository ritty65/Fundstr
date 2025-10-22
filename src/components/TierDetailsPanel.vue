<template>
  <div :id="id" class="tier-details-panel text-body2 text-1">
    <section v-if="hasDescription" class="tier-details-panel__section">
      <header class="tier-details-panel__heading">
        <q-icon name="subject" size="20px" class="tier-details-panel__icon" aria-hidden="true" />
        <span class="tier-details-panel__title">About this tier</span>
      </header>
      <p class="tier-details-panel__copy">{{ description }}</p>
    </section>

    <section v-if="hasWelcome" class="tier-details-panel__section">
      <header class="tier-details-panel__heading">
        <q-icon name="celebration" size="20px" class="tier-details-panel__icon" aria-hidden="true" />
        <span class="tier-details-panel__title">Welcome experience</span>
      </header>
      <p class="tier-details-panel__copy">{{ welcomeMessage }}</p>
    </section>

    <section v-if="hasBenefits" class="tier-details-panel__section tier-details-panel__section--benefits">
      <header class="tier-details-panel__heading">
        <q-icon name="workspace_premium" size="20px" class="tier-details-panel__icon" aria-hidden="true" />
        <span class="tier-details-panel__title">Perks included</span>
      </header>
      <ul class="tier-details-panel__benefit-list">
        <li v-for="benefit in benefits" :key="benefit" class="tier-details-panel__benefit-item">
          <q-icon name="task_alt" size="18px" class="tier-details-panel__benefit-icon" aria-hidden="true" />
          <span class="tier-details-panel__benefit-text">{{ benefit }}</span>
        </li>
      </ul>
    </section>

    <section v-if="hasMedia" class="tier-details-panel__section tier-details-panel__section--media">
      <header class="tier-details-panel__heading">
        <q-icon name="collections_bookmark" size="20px" class="tier-details-panel__icon" aria-hidden="true" />
        <span class="tier-details-panel__title">Extras &amp; resources</span>
      </header>
      <div v-if="featuredMedia" class="tier-details-panel__media-feature">
        <MediaPreview
          :url="featuredMedia.url"
          layout="responsive"
          class="tier-details-panel__media-feature-preview"
        />
        <div class="tier-details-panel__media-feature-body">
          <div class="tier-details-panel__media-feature-text">
            <span class="tier-details-panel__media-feature-title">{{ mediaLabel(featuredMedia) }}</span>
            <span
              v-if="mediaSecondaryLabel(featuredMedia)"
              class="tier-details-panel__media-feature-meta"
            >
              {{ mediaSecondaryLabel(featuredMedia) }}
            </span>
          </div>
          <div class="tier-details-panel__media-feature-actions">
            <q-btn
              flat
              dense
              class="tier-details-panel__media-feature-action"
              icon="open_in_new"
              color="accent"
              tag="a"
              :href="featuredMedia.url"
              target="_blank"
              rel="noopener"
              :aria-label="`Open ${mediaLabel(featuredMedia)} in a new tab`"
            />
            <q-btn
              flat
              dense
              class="tier-details-panel__media-feature-action"
              icon="content_copy"
              color="accent"
              :aria-label="`Copy link to ${mediaLabel(featuredMedia)}`"
              @click.prevent="copyMediaLink(featuredMedia.url)"
            />
          </div>
        </div>
      </div>
      <div class="tier-details-panel__media-strip" role="list">
        <article
          v-for="(item, index) in mediaItems"
          :key="`${item.url}-${index}`"
          class="tier-details-panel__media-tile"
          :class="{ 'tier-details-panel__media-tile--active': index === featuredIndex }"
          role="listitem"
          tabindex="0"
          :aria-label="mediaAriaLabel(item)"
          :aria-pressed="index === featuredIndex"
          @click="onTileClick($event, item, index)"
          @keydown.enter.prevent="selectFeaturedMedia(index)"
          @keydown.space.prevent="selectFeaturedMedia(index)"
        >
          <div class="tier-details-panel__media-thumb">
            <template v-if="isMediaLink(item)">
              <div class="tier-details-panel__media-link-preview" aria-hidden="true">
                <q-icon name="link" size="28px" />
              </div>
            </template>
            <template v-else>
              <MediaPreview
                :url="item.url"
                layout="responsive"
                class="tier-details-panel__media-preview"
              />
            </template>
          </div>
          <div class="tier-details-panel__media-body">
            <div class="tier-details-panel__media-text">
              <span class="tier-details-panel__media-label">{{ mediaLabel(item) }}</span>
              <span v-if="mediaSecondaryLabel(item)" class="tier-details-panel__media-meta">{{ mediaSecondaryLabel(item) }}</span>
            </div>
            <div class="tier-details-panel__media-actions">
              <q-btn
                flat
                dense
                round
                icon="open_in_new"
                tag="a"
                :href="item.url"
                target="_blank"
                rel="noopener"
                color="accent"
                data-media-action
                :aria-label="`Open ${mediaLabel(item)} in a new tab`"
              />
              <q-btn
                flat
                dense
                round
                icon="content_copy"
                color="accent"
                data-media-action
                :aria-label="`Copy link to ${mediaLabel(item)}`"
                @click.stop.prevent="copyMediaLink(item.url)"
              />
            </div>
          </div>
        </article>
      </div>
    </section>

    <div v-if="!hasAnyContent" class="tier-details-panel__empty text-2">
      No additional details for this tier yet.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { copyToClipboard, useQuasar } from 'quasar';
import MediaPreview from 'components/MediaPreview.vue';
import type { TierMedia as TierMediaItem } from 'stores/types';

const props = defineProps<{
  id?: string;
  description: string | null;
  benefits: string[];
  mediaItems: TierMediaItem[];
  welcomeMessage: string | null;
}>();

const hasDescription = computed(() => Boolean(props.description?.trim()));
const hasBenefits = computed(() => Array.isArray(props.benefits) && props.benefits.length > 0);
const hasMedia = computed(() => props.mediaItems.length > 0);
const hasWelcome = computed(() => Boolean(props.welcomeMessage?.trim()));
const hasAnyContent = computed(() => hasDescription.value || hasBenefits.value || hasMedia.value || hasWelcome.value);

const description = computed(() => props.description?.trim() ?? '');
const welcomeMessage = computed(() => props.welcomeMessage?.trim() ?? '');
const benefits = computed(() => (Array.isArray(props.benefits) ? props.benefits : []));
const mediaItems = computed(() => props.mediaItems);
const featuredIndex = ref(-1);

const featuredMedia = computed(() => {
  const items = mediaItems.value;
  if (!items.length) {
    return null;
  }
  const index = featuredIndex.value;
  if (index < 0 || index >= items.length) {
    return items[0];
  }
  return items[index];
});

const $q = useQuasar();

function isMediaLink(item: TierMediaItem): boolean {
  return (item.type ?? '').toLowerCase() === 'link';
}

function selectFeaturedMedia(index: number) {
  if (!Number.isInteger(index)) {
    return;
  }
  const items = mediaItems.value;
  if (!items.length) {
    return;
  }
  const safeIndex = Math.min(Math.max(index, 0), items.length - 1);
  featuredIndex.value = safeIndex;
}

function mediaLabel(item: TierMediaItem): string {
  const title = item.title?.trim();
  if (title) {
    return title;
  }
  try {
    const parsed = new URL(item.url);
    const host = parsed.hostname.replace(/^www\./, '');
    return host || parsed.href;
  } catch {
    return 'Open link';
  }
}

function mediaSecondaryLabel(item: TierMediaItem): string {
  if (!item.url) {
    return '';
  }
  try {
    const parsed = new URL(item.url);
    const host = parsed.hostname.replace(/^www\./, '');
    return host || parsed.protocol.replace(':', '');
  } catch {
    return '';
  }
}

function mediaAriaLabel(item: TierMediaItem): string {
  const label = mediaLabel(item);
  const meta = mediaSecondaryLabel(item);
  return meta ? `${label} – ${meta}` : label;
}

function onTileClick(event: MouseEvent, item: TierMediaItem, index: number) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('[data-media-action]')) {
    return;
  }
  selectFeaturedMedia(index);
}

async function copyMediaLink(url?: string) {
  if (!url) {
    return;
  }
  try {
    await copyToClipboard(url);
    $q.notify?.({
      type: 'positive',
      message: 'Link copied to clipboard',
      timeout: 1200,
    });
  } catch (error) {
    console.error('Failed to copy link', error);
    $q.notify?.({
      type: 'negative',
      message: 'Unable to copy link',
      timeout: 1600,
    });
  }
}

watch(
  mediaItems,
  (items) => {
    if (!items.length) {
      featuredIndex.value = -1;
      return;
    }
    if (featuredIndex.value < 0 || featuredIndex.value >= items.length) {
      const firstPlayable = items.findIndex((item) => !isMediaLink(item));
      featuredIndex.value = firstPlayable >= 0 ? firstPlayable : 0;
    }
  },
  { immediate: true },
);
</script>

<style scoped>
.tier-details-panel {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 22px 0 6px;
}

.tier-details-panel__section {
  display: grid;
  gap: 16px;
}

.tier-details-panel__heading {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-weight: 650;
  color: var(--text-1);
}

.tier-details-panel__title {
  font-size: 0.95rem;
  letter-spacing: 0.02em;
}

.tier-details-panel__icon {
  color: color-mix(in srgb, var(--accent-500) 72%, var(--accent-200) 28%);
}

.tier-details-panel__copy {
  margin: 0;
  white-space: pre-line;
  line-height: 1.6;
}

.tier-details-panel__benefit-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.tier-details-panel__benefit-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border-radius: 12px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--surface-2) 45%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--surface-contrast-border) 40%, transparent);
}

.tier-details-panel__benefit-icon {
  color: var(--accent-500);
  margin-top: 2px;
}

.tier-details-panel__section--media {
  gap: 18px;
}

.tier-details-panel__media-feature {
  display: grid;
  gap: 14px;
  background: color-mix(in srgb, var(--surface-2) 65%, transparent);
  border-radius: 18px;
  padding: 16px 18px 20px;
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--surface-contrast-border) 55%, transparent),
    0 16px 26px rgba(10, 16, 32, 0.12);
}

.tier-details-panel__media-feature-preview :deep(.media-preview-container) {
  border-radius: 14px;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}

.tier-details-panel__media-feature-body {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  justify-content: space-between;
  align-items: flex-start;
}

.tier-details-panel__media-feature-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.tier-details-panel__media-feature-title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--text-1);
  line-height: 1.35;
}

.tier-details-panel__media-feature-meta {
  color: var(--text-2);
  font-size: 0.85rem;
}

.tier-details-panel__media-feature-actions {
  display: inline-flex;
  gap: 8px;
}

.tier-details-panel__media-feature-action {
  border-radius: 999px;
}

.tier-details-panel__media-strip {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 4px 2px;
  margin: 0 -2px;
  scroll-snap-type: x proximity;
}

.tier-details-panel__media-strip::-webkit-scrollbar {
  height: 6px;
}

.tier-details-panel__media-strip::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
}

.tier-details-panel__media-tile {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: color-mix(in srgb, var(--surface-2) 78%, transparent);
  border-radius: 18px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--surface-contrast-border) 60%, transparent);
  padding: 14px;
  cursor: pointer;
  scroll-snap-align: start;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.tier-details-panel__media-tile--active {
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, var(--accent-500) 38%, transparent),
    0 14px 28px rgba(10, 16, 32, 0.2);
}

.tier-details-panel__media-tile:focus-visible {
  outline: none;
  box-shadow:
    inset 0 0 0 2px color-mix(in srgb, var(--accent-500) 50%, transparent),
    0 0 0 2px color-mix(in srgb, var(--accent-200) 60%, transparent);
  transform: translateY(-1px);
}

.tier-details-panel__media-tile:hover {
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, var(--accent-500) 25%, transparent),
    0 8px 18px -12px rgba(0, 0, 0, 0.32);
}

.tier-details-panel__media-thumb {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-1) 90%, transparent);
  aspect-ratio: 16 / 9;
}

.tier-details-panel__media-preview :deep(.media-preview-container) {
  border-radius: 14px;
  height: 100%;
}

.tier-details-panel__media-link-preview {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 20%, transparent);
  font-size: 1.8rem;
}

.tier-details-panel__media-body {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.tier-details-panel__media-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.tier-details-panel__media-label {
  font-weight: 650;
  font-size: 0.95rem;
  color: var(--text-1);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.tier-details-panel__media-meta {
  color: var(--text-2);
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tier-details-panel__media-actions {
  display: flex;
  gap: 6px;
}

.tier-details-panel__media-actions > :deep(.q-btn) {
  border-radius: 10px;
}

.tier-details-panel__empty {
  padding: 16px 0;
  font-size: 0.9rem;
}

@media (min-width: 768px) {
  .tier-details-panel__media-strip {
    overflow: visible;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 18px;
    padding: 0;
    margin: 0;
  }

  .tier-details-panel__media-tile {
    flex: 1 1 auto;
  }
}

@media (min-width: 1024px) {
  .tier-details-panel__media-feature {
    gap: 18px;
    padding: 18px 22px 24px;
  }

  .tier-details-panel__media-strip {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
}
</style>
