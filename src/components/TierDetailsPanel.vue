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
      <div class="tier-details-panel__media-grid">
        <div
          v-for="(item, index) in mediaItems"
          :key="`${item.url}-${index}`"
          class="tier-details-panel__media-item"
        >
          <template v-if="isMediaLink(item)">
            <q-chip
              dense
              outline
              clickable
              tag="a"
              icon="link"
              class="tier-details-panel__media-chip"
              :href="item.url"
              target="_blank"
              rel="noopener"
            >
              {{ mediaLabel(item) }}
            </q-chip>
          </template>
          <template v-else>
            <MediaPreview
              :url="item.url"
              layout="responsive"
              class="tier-details-panel__media-preview"
            />
          </template>
        </div>
      </div>
    </section>

    <div v-if="!hasAnyContent" class="tier-details-panel__empty text-2">
      No additional details for this tier yet.
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

function isMediaLink(item: TierMediaItem): boolean {
  return (item.type ?? '').toLowerCase() === 'link';
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
</script>

<style scoped>
.tier-details-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 18px 0 4px;
}

.tier-details-panel__section {
  display: grid;
  gap: 12px;
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

.tier-details-panel__media-grid {
  display: grid;
  gap: 12px;
}

.tier-details-panel__media-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tier-details-panel__media-preview :deep(.media-preview-container) {
  border-radius: 14px;
}

.tier-details-panel__media-chip {
  font-weight: 600;
  color: var(--text-1);
  border-color: color-mix(in srgb, var(--accent-500) 30%, transparent);
}

.tier-details-panel__empty {
  padding: 16px 0;
  font-size: 0.9rem;
}

@media (min-width: 768px) {
  .tier-details-panel__media-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }
}
</style>
