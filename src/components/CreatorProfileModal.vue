<template>
  <q-dialog
    v-model="showLocal"
    persistent
    backdrop-filter="blur(2px) brightness(65%)"
  >
    <q-card class="profile-card">
      <q-card-section class="profile-header">
        <div class="header-main">
          <q-avatar size="104px" class="profile-avatar">
            <img :src="creatorAvatar" alt="Creator avatar" />
          </q-avatar>
          <div class="profile-info">
            <div class="profile-name">{{ displayName }}</div>
            <div v-if="creator?.profile?.nip05" class="profile-handle">
              {{ creator.profile.nip05 }}
            </div>
            <div v-if="creator?.profile?.about" class="profile-about">
              {{ creator.profile.about }}
            </div>
          </div>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          class="close-btn"
          @click="close"
          aria-label="Close creator profile"
        />
      </q-card-section>

      <q-card-section v-if="loading" class="loading-state">
        <q-spinner color="accent" size="42px" />
      </q-card-section>

      <template v-else>
        <q-separator class="section-divider" />
        <q-card-section v-if="creator" class="actions-section">
          <q-btn
            unelevated
            class="action-button subscribe"
            color="accent"
            :disable="!hasTiers"
            label="Subscribe"
            no-caps
            @click="handleSubscribe(primaryTierId || undefined)"
          />
          <q-btn
            outline
            class="action-button"
            color="accent"
            label="Message"
            no-caps
            @click="$emit('message', pubkey)"
          />
          <q-btn
            outline
            class="action-button"
            color="accent"
            label="Donate"
            no-caps
            @click="$emit('donate', pubkey)"
          />
        </q-card-section>

        <q-card-section v-if="creator" class="tiers-section">
          <div class="section-heading">Subscription tiers</div>
          <div v-if="hasTiers" class="tiers-grid">
            <q-card v-for="tier in tiers" :key="tier.id" flat bordered class="tier-card">
              <q-card-section class="tier-card__header">
                <div class="tier-name">{{ tier.name }}</div>
                <div class="tier-price">{{ formatSats(tier.price_sats) }} sats</div>
                <div v-if="tierFrequencyLabel(tier)" class="tier-frequency">
                  {{ tierFrequencyLabel(tier) }}
                </div>
              </q-card-section>
              <q-separator class="tier-separator" />
              <q-card-section class="tier-body">
                <div v-if="tier.description" class="tier-description">
                  {{ tier.description }}
                </div>
                <div v-if="tier.media?.length" class="tier-media">
                  <div
                    v-for="(mediaItem, mediaIndex) in tier.media"
                    :key="`${tier.id}-media-${mediaIndex}`"
                    class="tier-media__item"
                  >
                    <q-img
                      v-if="!mediaItem.type || mediaItem.type === 'image'"
                      :src="mediaItem.url"
                      :ratio="16 / 9"
                      class="tier-media__image"
                      loading="lazy"
                      :alt="mediaItem.title || `${tier.name} media`"
                    />
                    <video
                      v-else-if="mediaItem.type === 'video'"
                      controls
                      playsinline
                      preload="metadata"
                      class="tier-media__video"
                    >
                      <source :src="mediaItem.url" :type="mediaItem.mimeType || 'video/mp4'" />
                      Your browser does not support video playback.
                    </video>
                    <audio
                      v-else-if="mediaItem.type === 'audio'"
                      controls
                      preload="metadata"
                      class="tier-media__audio"
                    >
                      <source :src="mediaItem.url" :type="mediaItem.mimeType || 'audio/mpeg'" />
                      Your browser does not support audio playback.
                    </audio>
                  </div>
                </div>
                <div v-if="tier.benefits?.length" class="tier-benefits">
                  <div class="benefits-heading">Benefits</div>
                  <ul>
                    <li v-for="(benefit, index) in tier.benefits" :key="`${tier.id}-benefit-${index}`">
                      {{ benefit }}
                    </li>
                  </ul>
                </div>
                <div v-if="tier.welcomeMessage" class="tier-welcome">
                  <div class="welcome-heading">Welcome message</div>
                  <div class="welcome-copy">{{ tier.welcomeMessage }}</div>
                </div>
              </q-card-section>
              <q-separator class="tier-separator" />
              <q-card-actions class="tier-actions">
                <q-btn
                  color="accent"
                  class="tier-subscribe"
                  unelevated
                  no-caps
                  label="Subscribe"
                  @click="handleSubscribe(tier.id)"
                />
              </q-card-actions>
            </q-card>
          </div>
          <div v-else class="empty-state">No subscription tiers found for this creator.</div>
        </q-card-section>

        <q-card-section v-else class="empty-state">
          We couldn't load this creator's profile. Please try again later.
        </q-card-section>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useCreatorsStore } from 'stores/creators';
import type { CreatorProfile, Tier } from 'stores/types';
import {
  daysToFrequency,
  type SubscriptionFrequency,
} from 'src/constants/subscriptionFrequency';

const props = defineProps<{
  show: boolean;
  pubkey: string;
}>();

const emit = defineEmits(['close', 'message', 'donate']);

const router = useRouter();
const creatorsStore = useCreatorsStore();

const loading = ref(false);
const creator = ref<CreatorProfile | null>(null);
const tiers = ref<Tier[]>([]);
const showLocal = ref(false);

let requestToken = 0;

const displayName = computed(() => {
  const profile = creator.value?.profile ?? {};
  return (
    profile.display_name ||
    profile.name ||
    profile.nip05 ||
    'Unnamed User'
  );
});

const creatorAvatar = computed(() => {
  const profile = creator.value?.profile ?? {};
  if (profile.picture) return profile.picture as string;
  const source = profile.name || profile.display_name || profile.nip05 || props.pubkey;
  const initial = (typeof source === 'string' && source.trim()[0]) || 'U';
  return `https://placehold.co/200x200/1f2937/ffffff?text=${encodeURIComponent(
    initial.toUpperCase(),
  )}`;
});

const hasTiers = computed(() => tiers.value.length > 0);

const primaryTierId = computed(() => tiers.value[0]?.id ?? '');

watch(
  () => props.show,
  (visible) => {
    showLocal.value = visible;
    if (visible && props.pubkey) {
      void fetchCreatorData(props.pubkey);
    }
    if (!visible) {
      requestToken += 1;
      creator.value = null;
      tiers.value = [];
    }
  },
  { immediate: true },
);

watch(
  showLocal,
  (value) => {
    if (!value && props.show) {
      emit('close');
    }
  },
);

watch(
  () => props.pubkey,
  (newPubkey, oldPubkey) => {
    if (props.show && newPubkey && newPubkey !== oldPubkey) {
      void fetchCreatorData(newPubkey);
    }
  },
);

function tierFrequencyLabel(tier: Tier): string | null {
  const frequency = resolveFrequency(tier);
  if (!frequency) return null;
  switch (frequency) {
    case 'weekly':
      return 'Billed every week';
    case 'biweekly':
      return 'Billed twice a month';
    case 'monthly':
      return 'Billed every month';
    default:
      return null;
  }
}

function resolveFrequency(tier: Tier): SubscriptionFrequency | null {
  if (typeof tier.frequency === 'string') {
    return tier.frequency as SubscriptionFrequency;
  }
  if (typeof tier.intervalDays === 'number') {
    return daysToFrequency(tier.intervalDays);
  }
  if (typeof tier.intervalDays === 'string') {
    const parsed = parseInt(tier.intervalDays, 10);
    if (!Number.isNaN(parsed)) {
      return daysToFrequency(parsed);
    }
  }
  return null;
}

async function fetchCreatorData(pubkey: string) {
  const currentToken = ++requestToken;
  loading.value = true;

  try {
    const fetchedCreator = await creatorsStore.fetchCreator(pubkey);
    if (currentToken !== requestToken) return;
    creator.value = fetchedCreator ?? null;

    await creatorsStore.fetchTierDefinitions(pubkey);
    if (currentToken !== requestToken) return;

    if (!creatorsStore.tierFetchError) {
      tiers.value = creatorsStore.tiersMap[pubkey] || [];
    } else {
      tiers.value = [];
    }
  } catch (error) {
    console.error('Failed to load creator profile', error);
    if (currentToken === requestToken) {
      creator.value = null;
      tiers.value = [];
    }
  } finally {
    if (currentToken === requestToken) {
      loading.value = false;
    }
  }
}

function close() {
  requestToken += 1;
  showLocal.value = false;
}

function formatSats(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function handleSubscribe(tierId?: string) {
  if (!props.pubkey) return;
  const query: Record<string, string> = { pubkey: props.pubkey };
  if (tierId) {
    query.tier = tierId;
  }
  void router.push({ path: '/subscriptions', query });
  close();
}
</script>

<style scoped>
.profile-card {
  width: min(720px, 92vw);
  background: var(--surface-2);
  color: var(--text-1);
  border-radius: 20px;
  position: relative;
  overflow: hidden;
}

.profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px;
}

.header-main {
  display: flex;
  align-items: flex-start;
  gap: 20px;
}

.profile-avatar :deep(img) {
  border-radius: 50%;
  border: 3px solid var(--surface-contrast-border);
  object-fit: cover;
  width: 100%;
  height: 100%;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 420px;
}

.profile-name {
  font-size: 1.5rem;
  font-weight: 700;
}

.profile-handle {
  color: var(--accent-500);
  font-weight: 600;
}

.profile-about {
  color: var(--text-2);
  line-height: 1.5;
  white-space: pre-line;
}

.close-btn {
  color: var(--text-2);
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 24px;
}

.section-divider {
  opacity: 0.5;
}

.actions-section {
  display: flex;
  gap: 12px;
  padding: 24px;
  padding-top: 16px;
}

.action-button {
  flex: 1;
  font-weight: 600;
}

.action-button.subscribe {
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.16);
}

.tiers-section {
  padding: 16px 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-heading {
  font-size: 1.125rem;
  font-weight: 600;
}

.tiers-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
}

.tier-card {
  background: var(--surface-1);
  border-radius: 16px;
  border: 1px solid var(--surface-contrast-border);
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.tier-card__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tier-name {
  font-size: 1.1rem;
  font-weight: 600;
}

.tier-price {
  font-weight: 700;
  color: var(--accent-500);
}

.tier-frequency {
  font-size: 0.9rem;
  color: var(--text-2);
}

.tier-separator {
  opacity: 0.35;
}

.tier-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--text-2);
}

.tier-description {
  white-space: pre-line;
  color: var(--text-1);
}

.tier-media {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.tier-media__item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tier-media__image,
.tier-media__video,
.tier-media__audio {
  border-radius: 12px;
  border: 1px solid var(--surface-contrast-border);
  overflow: hidden;
}

.tier-media__video,
.tier-media__audio {
  width: 100%;
}

.tier-media__video {
  background: black;
  min-height: 180px;
}

.tier-media__audio {
  padding: 0.75rem;
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
}

.tier-benefits {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.benefits-heading,
.welcome-heading {
  font-weight: 600;
  color: var(--text-1);
}

.tier-benefits ul {
  padding-left: 18px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tier-benefits li {
  list-style: disc;
}

.tier-welcome {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.welcome-copy {
  white-space: pre-line;
}

.tier-actions {
  padding: 12px 16px 16px;
}

.tier-subscribe {
  width: 100%;
  font-weight: 600;
}

.empty-state {
  padding: 24px;
  color: var(--text-2);
  text-align: center;
}

@media (max-width: 599px) {
  .profile-card {
    width: min(92vw, 100%);
  }

  .profile-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 16px;
  }

  .close-btn {
    position: absolute;
    top: 12px;
    right: 12px;
  }

  .header-main {
    width: 100%;
  }

  .actions-section {
    flex-direction: column;
  }
}
</style>
