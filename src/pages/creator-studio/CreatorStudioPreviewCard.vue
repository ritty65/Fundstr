<template>
  <div class="studio-preview-card" :class="{ 'is-highlighted': publishHighlighted }">
    <section class="preview-hero">
      <div class="preview-hero__banner" />
      <div class="preview-hero__content bg-surface-2" :class="heroHighlightClass">
        <div class="preview-hero__avatar" aria-hidden="true">
          <span>{{ heroInitial }}</span>
        </div>
        <div class="preview-hero__details">
          <div class="preview-hero__heading">
            <h2 class="preview-hero__name text-h6">{{ displayNameLabel }}</h2>
          </div>
          <p class="preview-hero__handle text-2">{{ authorLabel }}</p>
          <div class="preview-hero__chips" role="list">
            <q-chip
              dense
              outline
              class="preview-chip"
              :class="{ 'is-active': props.activeStep === 'profile' }"
              role="listitem"
            >
              {{ mintChipLabel }}
            </q-chip>
            <q-chip
              dense
              outline
              class="preview-chip"
              :class="{ 'is-active': props.activeStep === 'setup' }"
              role="listitem"
            >
              {{ relayChipLabel }}
            </q-chip>
            <q-chip
              dense
              outline
              class="preview-chip"
              :class="{ 'is-active': props.activeStep === 'tiers' }"
              role="listitem"
            >
              {{ tierChipLabel }}
            </q-chip>
          </div>
        </div>
      </div>
    </section>

    <section class="preview-section">
      <header class="preview-section__header">
        <h3 class="preview-section__title text-subtitle1">About</h3>
      </header>
      <div class="preview-section__body">
        <p class="preview-section__text text-2">
          Set your story and creator bio from the profile step to show supporters what you do.
        </p>
      </div>
    </section>

    <section class="preview-section" :class="tiersHighlightClass">
      <header class="preview-section__header">
        <h3 class="preview-section__title text-subtitle1">Membership tiers</h3>
      </header>
      <div v-if="displayTiers.length" class="preview-tier-list">
        <article v-for="tier in displayTiers" :key="tier.id" class="preview-tier-card">
          <header class="preview-tier-card__header">
            <div class="preview-tier-card__title-block">
              <h4 class="preview-tier-card__title text-1">{{ tier.title }}</h4>
              <p v-if="tier.description" class="preview-tier-card__description text-2">
                {{ tier.description }}
              </p>
            </div>
            <div class="preview-tier-card__pricing">
              <div class="preview-tier-card__sats">{{ tier.priceLabel }}</div>
              <div v-if="tier.frequencyLabel" class="preview-tier-card__frequency text-2">
                {{ tier.frequencyLabel }}
              </div>
            </div>
          </header>
          <div v-if="tier.hasBenefits" class="preview-tier-card__benefits">
            <h5 class="preview-tier-card__section-title text-2">Benefits</h5>
            <ul class="preview-tier-card__benefit-list">
              <li v-for="benefit in tier.benefits" :key="benefit" class="preview-tier-card__benefit">
                {{ benefit }}
              </li>
            </ul>
          </div>
          <div v-if="tier.hasMedia" class="preview-tier-card__media">
            <div
              v-for="(item, mediaIndex) in tier.media"
              :key="`${tier.id}-media-${mediaIndex}`"
              class="preview-tier-card__media-item"
            >
              <template v-if="item.isLink">
                <q-chip
                  dense
                  outline
                  clickable
                  tag="a"
                  icon="link"
                  class="preview-tier-card__media-chip"
                  :href="item.url"
                  target="_blank"
                  rel="noopener"
                >
                  {{ item.label }}
                </q-chip>
              </template>
              <template v-else>
                <MediaPreview :url="item.url" />
              </template>
            </div>
          </div>
          <div
            v-if="!tier.hasBenefits && !tier.hasMedia"
            class="preview-tier-card__placeholder text-2"
          >
            Add benefits or media to show what members receive at this tier.
          </div>
        </article>
      </div>
      <div v-else class="preview-section__empty text-2">
        Add at least one tier to preview how pricing appears on your public profile.
      </div>
    </section>

    <section class="preview-section" :class="infrastructureHighlightClass">
      <header class="preview-section__header">
        <h3 class="preview-section__title text-subtitle1">Infrastructure</h3>
      </header>
      <div class="preview-infrastructure">
        <article class="preview-info-card">
          <h4 class="preview-info-card__title text-subtitle2">Trusted mints</h4>
          <ul v-if="normalizedMintList.length" class="preview-info-card__list">
            <li v-for="mint in normalizedMintList" :key="mint" class="preview-info-card__item text-2">
              {{ mint }}
            </li>
          </ul>
          <p v-else class="preview-info-card__placeholder text-2">
            Add the mints you trust so supporters know where zaps settle.
          </p>
        </article>
        <article class="preview-info-card">
          <h4 class="preview-info-card__title text-subtitle2">Preferred relays</h4>
          <ul v-if="normalizedRelayList.length" class="preview-info-card__list">
            <li v-for="relay in normalizedRelayList" :key="relay" class="preview-info-card__item text-2">
              {{ relay }}
            </li>
          </ul>
          <p v-else class="preview-info-card__placeholder text-2">
            Choose the relays to broadcast events from your creator studio.
          </p>
        </article>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MediaPreview from 'components/MediaPreview.vue';
import type { Tier } from 'src/nutzap/types';
import type { TierMedia } from 'stores/types';
import { initialFromName, shortenNpub } from 'src/utils/profile';
import { normalizeTierMediaItems } from 'src/utils/validateMedia';

const props = defineProps<{
  displayName?: string | null;
  authorInput?: string | null;
  mintList?: string[] | null;
  relayList?: string[] | null;
  tiers?: Tier[] | null;
  activeStep?: 'profile' | 'setup' | 'tiers' | 'publish' | '' | null;
}>();

const displayNameLabel = computed(
  () => props.displayName?.trim() || 'Creator name',
);

const heroInitial = computed(() => initialFromName(props.displayName, 'N'));

const normalizedMintList = computed(() =>
  Array.isArray(props.mintList) ? props.mintList.filter(Boolean) : [],
);

const normalizedRelayList = computed(() =>
  Array.isArray(props.relayList) ? props.relayList.filter(Boolean) : [],
);

const authorLabel = computed(() => {
  const trimmed = props.authorInput?.trim();
  if (!trimmed) {
    return 'npub…';
  }
  if (trimmed.startsWith('npub')) {
    return shortenNpub(trimmed);
  }
  if (trimmed.length > 16) {
    return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
  }
  return trimmed;
});

const mintChipLabel = computed(
  () => `${normalizedMintList.value.length} trusted mint${
    normalizedMintList.value.length === 1 ? '' : 's'
  }`,
);

const relayChipLabel = computed(
  () => `${normalizedRelayList.value.length} relay${
    normalizedRelayList.value.length === 1 ? '' : 's'
  }`,
);

const tierChipLabel = computed(() => {
  const count = Array.isArray(props.tiers) ? props.tiers.length : 0;
  return `${count} tier${count === 1 ? '' : 's'}`;
});

function formatFrequency(value: Tier['frequency'] | undefined): string {
  switch (value) {
    case 'monthly':
      return 'Monthly';
    case 'yearly':
      return 'Yearly';
    case 'one_time':
      return 'One-time';
    default:
      return '';
  }
}

type PreviewTierMedia = TierMedia & {
  label: string;
  isLink: boolean;
};

function formatMediaLabel(url: string, title?: string): string {
  const trimmedTitle = title?.trim();
  if (trimmedTitle) {
    return trimmedTitle;
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    return host || parsed.href;
  } catch {
    return 'Open link';
  }
}

function normalizeTierMedia(input: unknown): PreviewTierMedia[] {
  return normalizeTierMediaItems(input).map((media) => ({
    ...media,
    label: formatMediaLabel(media.url, media.title),
    isLink: (media.type ?? '').toLowerCase() === 'link',
  }));
}

const displayTiers = computed(() => {
  if (!Array.isArray(props.tiers)) {
    return [] as {
      id: string;
      title: string;
      description?: string;
      benefits: string[];
      hasBenefits: boolean;
      media: PreviewTierMedia[];
      hasMedia: boolean;
      priceLabel: string;
      frequencyLabel: string;
    }[];
  }

  return props.tiers.map((tier, index) => {
    const priceNumber = Number(tier.price ?? 0);
    const validPrice = Number.isFinite(priceNumber) && priceNumber > 0;
    const priceLabel = validPrice
      ? `${new Intl.NumberFormat().format(priceNumber)} sats`
      : 'Set a price';
    const frequencyLabel = formatFrequency(tier.frequency);
    const benefits = Array.isArray((tier as any).benefits)
      ? ((tier as any).benefits as string[])
          .map(item => item?.trim())
          .filter((item): item is string => Boolean(item))
      : [];
    const media = normalizeTierMedia((tier as any).media);
    return {
      id: tier.id ?? `tier-${index}`,
      title: tier.title?.trim() || `Untitled tier #${index + 1}`,
      description: tier.description?.trim() || undefined,
      benefits,
      hasBenefits: benefits.length > 0,
      media,
      hasMedia: media.length > 0,
      priceLabel,
      frequencyLabel,
    };
  });
});

const publishHighlighted = computed(() => props.activeStep === 'publish');
const heroHighlighted = computed(() => props.activeStep === 'profile' || props.activeStep === 'setup');
const infrastructureHighlighted = computed(() => props.activeStep === 'setup');
const tiersHighlighted = computed(() => props.activeStep === 'tiers');

const heroHighlightClass = computed(() => ({
  'preview-highlight': heroHighlighted.value,
}));

const infrastructureHighlightClass = computed(() => ({
  'preview-highlight': infrastructureHighlighted.value,
}));

const tiersHighlightClass = computed(() => ({
  'preview-highlight': tiersHighlighted.value,
}));
</script>

<style scoped>
.studio-preview-card {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  position: relative;
  border-radius: 1.75rem;
  padding: 0.25rem 0.25rem 1.5rem;
}

.studio-preview-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: color-mix(in srgb, var(--surface-2) 85%, transparent);
  opacity: 0.4;
  pointer-events: none;
}

.studio-preview-card.is-highlighted::after {
  content: '';
  position: absolute;
  inset: 0.35rem;
  border-radius: inherit;
  border: 2px solid color-mix(in srgb, var(--accent-200) 55%, transparent);
  background: color-mix(in srgb, var(--accent-200) 16%, transparent);
  pointer-events: none;
}

.preview-hero {
  position: relative;
  padding: 0 0.75rem;
}

.preview-hero__banner {
  position: absolute;
  inset: 0.5rem;
  border-radius: 1.5rem;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent-500) 35%, transparent),
    color-mix(in srgb, var(--accent-200) 65%, transparent)
  );
  opacity: 0.35;
  filter: saturate(0.95);
}

.preview-hero__content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-radius: 1.5rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
}

.preview-hero__content.preview-highlight::after {
  content: '';
  position: absolute;
  inset: -0.35rem;
  border-radius: inherit;
  border: 2px solid color-mix(in srgb, var(--accent-200) 55%, transparent);
  background: color-mix(in srgb, var(--accent-200) 18%, transparent);
  pointer-events: none;
}

.preview-hero__avatar {
  flex-shrink: 0;
  width: 84px;
  height: 84px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2rem;
  font-weight: 600;
  background: var(--surface-1);
  border: 3px solid var(--surface-1);
  color: var(--accent-600);
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent-200) 45%, transparent);
}

.preview-hero__details {
  flex: 1;
  min-width: 0;
}

.preview-hero__heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.preview-hero__name {
  margin: 0;
  font-weight: 600;
}

.preview-hero__handle {
  margin: 0.25rem 0 0;
}

.preview-hero__chips {
  margin-top: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.preview-chip {
  border-color: var(--surface-contrast-border);
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.preview-chip.is-active {
  border-color: color-mix(in srgb, var(--accent-200) 65%, transparent);
  background: color-mix(in srgb, var(--accent-200) 24%, transparent);
}

.preview-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0 1rem;
}

.preview-section.preview-highlight::after {
  content: '';
  position: absolute;
  inset: 0.4rem;
  border-radius: 1.25rem;
  border: 2px solid color-mix(in srgb, var(--accent-200) 55%, transparent);
  background: color-mix(in srgb, var(--accent-200) 14%, transparent);
  pointer-events: none;
}

.preview-section.preview-highlight {
  position: relative;
}

.preview-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.preview-section__title {
  margin: 0;
}

.preview-section__body,
.preview-section__empty {
  background: var(--surface-2);
  border-radius: 1.25rem;
  padding: 1.25rem;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
}

.preview-section__text {
  margin: 0;
}

.preview-section__empty {
  text-align: center;
}

.preview-tier-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preview-tier-card {
  background: var(--surface-2);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 1.25rem;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 16px 28px rgba(18, 18, 23, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.preview-tier-card__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.preview-tier-card__title {
  margin: 0;
  font-weight: 600;
}

.preview-tier-card__description {
  margin: 0.35rem 0 0;
}

.preview-tier-card__pricing {
  text-align: right;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.preview-tier-card__sats {
  font-weight: 600;
}

.preview-tier-card__benefits {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview-tier-card__section-title {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
}

.preview-tier-card__benefit-list {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.preview-tier-card__benefit {
  list-style: disc;
}

.preview-tier-card__media {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.preview-tier-card__media-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview-tier-card__media :deep(.media-preview-container) {
  border-radius: 0.85rem;
  box-shadow: 0 10px 22px rgba(10, 16, 28, 0.16);
}

.preview-tier-card__media-chip {
  align-self: flex-start;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.preview-tier-card__placeholder {
  margin: 0;
  padding: 0.5rem 0;
  border-top: 1px dashed var(--surface-contrast-border);
}

.preview-infrastructure {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.preview-info-card {
  background: var(--surface-2);
  border-radius: 1.25rem;
  padding: 1.25rem;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.preview-info-card__title {
  margin: 0;
  font-weight: 600;
}

.preview-info-card__list {
  margin: 0;
  padding-left: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.preview-info-card__item {
  word-break: break-word;
}

.preview-info-card__placeholder {
  margin: 0;
}

@media (max-width: 767px) {
  .preview-hero__content {
    flex-direction: column;
    align-items: flex-start;
  }

  .preview-hero__avatar {
    width: 72px;
    height: 72px;
    font-size: 1.75rem;
  }

  .preview-tier-card__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .preview-tier-card__pricing {
    text-align: left;
  }
}
</style>
