<template>
  <q-dialog
    v-model="showLocal"
    persistent
    backdrop-filter="blur(6px)"
    position="right"
    transition-show="slide-left"
    transition-hide="slide-right"
    class="creator-profile-dialog"
  >
    <q-card class="profile-card">
      <q-card-section class="profile-header">
        <div class="header-main">
          <q-avatar size="104px" class="profile-avatar">
            <img :src="creatorAvatar" alt="Creator avatar" @error="onAvatarError" />
          </q-avatar>
          <div class="profile-info">
            <div class="profile-name">{{ displayName }}</div>
            <div v-if="identityEntries.length" class="profile-section">
              <div class="profile-section-label">Nostr handles</div>
              <div class="profile-handle-list">
                <div
                  v-for="identity in identityEntries"
                  :key="identity.label"
                  class="profile-handle-chip"
                >
                  <span class="profile-handle-chip__label">{{ identity.label }}</span>
                  <span class="profile-handle-chip__value">{{ identity.value }}</span>
                </div>
              </div>
            </div>
            <div v-if="aboutText" class="profile-section">
              <div class="profile-section-label">About</div>
              <div class="profile-about">
                {{ aboutText }}
              </div>
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

      <div class="profile-body">
        <q-card-section v-if="loading" class="loading-state">
          <q-spinner color="accent" size="42px" />
        </q-card-section>

        <template v-else>
          <q-separator v-if="creator" class="section-divider" />

          <q-card-section v-if="creator" class="actions-section">
            <div class="action-stack">
              <q-btn
                unelevated
                class="action-tile action-tile--primary"
                color="accent"
                :disable="!hasTiers"
                no-caps
                @click="handleSubscribe(primaryTierId || undefined)"
              >
                <div class="action-tile__content">
                  <q-icon name="loyalty" size="24px" />
                  <div class="action-tile__labels">
                    <span class="action-tile__title">Subscribe</span>
                    <span class="action-tile__subtitle">
                      {{ hasTiers ? 'Access member perks' : 'Tiers coming soon' }}
                    </span>
                  </div>
                </div>
              </q-btn>

              <q-btn
                flat
                class="action-tile action-tile--secondary"
                color="accent"
                no-caps
                @click="$emit('message', pubkey)"
              >
                <div class="action-tile__content">
                  <q-icon name="chat" size="24px" />
                  <div class="action-tile__labels">
                    <span class="action-tile__title">Message</span>
                    <span class="action-tile__subtitle">Start a conversation</span>
                  </div>
                </div>
              </q-btn>

              <q-btn
                flat
                class="action-tile action-tile--secondary"
                color="accent"
                no-caps
                @click="$emit('donate', pubkey)"
              >
                <div class="action-tile__content">
                  <q-icon name="volunteer_activism" size="24px" />
                  <div class="action-tile__labels">
                    <span class="action-tile__title">Donate</span>
                    <span class="action-tile__subtitle">Support directly</span>
                  </div>
                </div>
              </q-btn>
            </div>
          </q-card-section>

          <q-card-section v-if="creator" class="tiers-section">
            <div class="section-heading">Subscription tiers</div>
            <div v-if="hasTiers" class="tiers-list">
            <q-expansion-item
              v-for="tier in tiers"
              :key="tier.id"
              bordered
              expand-separator
              class="tier-expansion"
              :model-value="expandedTierId === tier.id"
              @update:model-value="(expanded) => handleTierExpansionChange(tier.id, expanded)"
            >
              <template #header>
                <div class="tier-header">
                  <div class="tier-name">
                    {{ tier.name }}
                  </div>
                  <div class="tier-header__meta">
                    <span class="tier-pill tier-pill--price">
                      {{ formatTierPrice(tier) }} sats
                    </span>
                    <span v-if="tierFrequencyLabel(tier)" class="tier-pill tier-pill--frequency">
                      {{ tierFrequencyLabel(tier) }}
                    </span>
                  </div>
                </div>
              </template>

              <div class="tier-content">
                <div v-if="tier.description" class="tier-description">
                  {{ tier.description }}
                </div>
                <div v-if="tier.benefits?.length" class="tier-benefits q-mt-md">
                  <div class="benefits-heading">Benefits</div>
                  <ul>
                    <li v-for="(benefit, index) in tier.benefits" :key="`${tier.id}-benefit-${index}`">
                      {{ benefit }}
                    </li>
                  </ul>
                </div>
                <div v-if="tier.media?.length" class="tier-media q-mt-md">
                  <div
                    v-for="(mediaItem, mediaIndex) in tier.media"
                    :key="`${tier.id}-media-${mediaIndex}`"
                    class="tier-media__item"
                  >
                    <MediaPreview :url="mediaItem.url" />
                  </div>
                </div>
                <div v-if="tier.welcomeMessage" class="tier-welcome q-mt-md">
                  <div class="welcome-heading">Welcome message</div>
                  <div class="welcome-copy">{{ tier.welcomeMessage }}</div>
                </div>
                <div class="tier-sticky-cta">
                  <q-separator class="tier-sticky-cta__divider" />
                  <q-btn
                    color="accent"
                    class="tier-subscribe"
                    unelevated
                    no-caps
                    :label="`Subscribe to ${tier.name}`"
                    @click="handleSubscribe(tier.id)"
                  />
                </div>
              </div>
            </q-expansion-item>
          </div>
          <div v-else class="empty-state">No subscription tiers found for this creator.</div>
          </q-card-section>

          <q-card-section v-else class="empty-state">
            We couldn't load this creator's profile. Please try again later.
          </q-card-section>
        </template>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { nip19 } from 'nostr-tools';
import MediaPreview from 'components/MediaPreview.vue';
import { formatMsatToSats, type Creator } from 'src/lib/fundstrApi';
import { useFundstrDiscovery } from 'src/api/fundstrDiscovery';
import {
  displayNameFromProfile,
  normalizeMeta,
  safeImageSrc,
  type ProfileMeta,
} from 'src/utils/profile';

const props = defineProps<{
  show: boolean;
  pubkey: string;
}>();

const emit = defineEmits(['close', 'message', 'donate']);

interface TierMediaItem {
  url: string;
  title?: string;
  type?: "image" | "video" | "audio" | "link";
}

interface TierDetails {
  id: string;
  name: string;
  description: string | null;
  priceMsat: number | null;
  benefits: string[];
  media: TierMediaItem[];
  welcomeMessage: string | null;
  periodLabel: string | null;
}

const router = useRouter();

const loading = ref(false);
const creator = ref<Creator | null>(null);
const tiers = ref<TierDetails[]>([]);
const showLocal = ref(false);
const expandedTierId = ref<string | null>(null);

const discoveryClient = useFundstrDiscovery();

let currentRequestId = 0;
let activeController: AbortController | null = null;

const creatorMeta = computed<ProfileMeta>(() => {
  const c = creator.value;
  const baseMeta = normalizeMeta((c?.profile as any) ?? {});
  const extraMeta = normalizeMeta((c as any)?.meta ?? {});
  const directMeta = normalizeMeta({
    display_name: c?.displayName ?? null,
    name: c?.name ?? null,
    about: c?.about ?? null,
    picture: c?.picture ?? null,
    nip05: c?.nip05 ?? null,
  });
  return { ...baseMeta, ...extraMeta, ...directMeta };
});

const creatorNpub = computed(() => {
  const key = creator.value?.pubkey ?? props.pubkey ?? '';
  if (!key) return '';
  try {
    return nip19.npubEncode(key);
  } catch {
    return key;
  }
});

const displayName = computed(() => displayNameFromProfile(creatorMeta.value, creatorNpub.value));

const creatorAvatar = computed(() => safeImageSrc(creatorMeta.value.picture, displayName.value, 200));

const nip05 = computed(() => (typeof creatorMeta.value.nip05 === 'string' ? creatorMeta.value.nip05.trim() : ''));

const aboutText = computed(() => {
  const about = typeof creatorMeta.value.about === 'string' ? creatorMeta.value.about.trim() : '';
  return about || '';
});

const identityEntries = computed(() => {
  const entries: Array<{ label: string; value: string }> = [];
  const nip05Value = nip05.value;
  if (nip05Value) {
    entries.push({ label: 'NIP-05', value: nip05Value });
  }
  const npubValue = creatorNpub.value;
  if (npubValue) {
    entries.push({ label: 'npub', value: npubValue });
  }
  return entries;
});

function onAvatarError(event: Event) {
  (event.target as HTMLImageElement).src = safeImageSrc(null, displayName.value, 200);
}

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
      cancelActiveRequest();
      resetState();
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

function handleTierExpansionChange(tierId: string, expanded: boolean) {
  expandedTierId.value = expanded ? tierId : null;
}

async function fetchCreatorData(pubkey: string) {
  if (!pubkey) {
    return;
  }

  cancelActiveRequest();

  const requestId = ++currentRequestId;
  const controller = new AbortController();
  activeController = controller;
  loading.value = true;

  try {
    const response = await discoveryClient.getCreators({
      q: pubkey,
      signal: controller.signal,
      fresh: true,
    });
    if (requestId !== currentRequestId) {
      return;
    }

    if (response.warnings?.length) {
      console.warn('Discovery warnings while loading creator', {
        pubkey,
        warnings: response.warnings,
      });
    }

    const fetchedCreator = response.results?.[0] ?? null;
    creator.value = fetchedCreator ?? null;

    const fetchedTiers = Array.isArray(fetchedCreator?.tiers)
      ? fetchedCreator.tiers
      : [];

    const mappedTiers = fetchedTiers
      .map((tier) => normalizeTierDetails(tier))
      .filter((tier): tier is TierDetails => tier !== null);

    tiers.value = mappedTiers;

    expandedTierId.value = mappedTiers[0]?.id ?? null;
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      return;
    }
    console.error('Failed to load creator profile', error);
    if (requestId === currentRequestId) {
      creator.value = null;
      tiers.value = [];
      expandedTierId.value = null;
    }
  } finally {
    if (requestId === currentRequestId) {
      loading.value = false;
    }
    if (activeController === controller) {
      activeController = null;
    }
  }
}

function close() {
  cancelActiveRequest();
  showLocal.value = false;
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

function tierFrequencyLabel(tier: TierDetails): string | null {
  return tier.periodLabel;
}

function formatTierPrice(tier: TierDetails): string {
  return formatMsatToSats(tier.priceMsat);
}

function cancelActiveRequest() {
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
  currentRequestId += 1;
  loading.value = false;
}

function resetState() {
  creator.value = null;
  tiers.value = [];
  expandedTierId.value = null;
}

function normalizeTierDetails(rawTier: unknown): TierDetails | null {
  if (!rawTier || typeof rawTier !== 'object') return null;
  const t = rawTier as Record<string, unknown>;

  const id =
    (typeof t.id === 'string' && t.id.trim()) ||
    (typeof t.tier_id === 'string' && t.tier_id.trim()) ||
    (typeof t.d === 'string' && t.d.trim()) || '';
  if (!id) return null;

  const name =
    (typeof t.name === 'string' && t.name.trim()) ||
    (typeof t.title === 'string' && t.title.trim()) ||
    'Subscription tier';

  const description = typeof t.description === 'string' ? t.description : null;
  let priceMsat = extractNumericValue(t.price_msat ?? t.priceMsat ?? t.amount_msat ?? t.amountMsat ?? null);
  if (priceMsat === null) {
    const priceSat = extractNumericValue(t.price ?? null);
    if (priceSat !== null) {
      priceMsat = priceSat * 1000;
    }
  }
  const periodLabel =
    (typeof t.period === 'string' && t.period) ||
    (typeof t.cadence === 'string' && t.cadence) ||
    (typeof t.interval === 'string' && t.interval) || null;

  const benefits =
    Array.isArray(t.benefits)
      ? (t.benefits as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
      : parsePerks(t.perks);

  const media = Array.isArray(t.media)
    ? (t.media as unknown[]).map(normalizeMediaItem).filter((m): m is TierMediaItem => m !== null)
    : [];

  const welcomeMessage =
    (typeof t.welcome_message === 'string' && t.welcome_message) ||
    (typeof t.welcomeMessage === 'string' && t.welcomeMessage) || null;

  return { id, name, description, priceMsat, benefits, media, welcomeMessage, periodLabel };
}

function parsePerks(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
    }
  } catch {}
  return value.split(/\r?\n|,|;/).map(s => s.trim()).filter(Boolean);
}

function extractNumericValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeMediaItem(entry: unknown): TierMediaItem | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }
  const media = entry as Record<string, unknown>;
  const url = typeof media.url === 'string' ? media.url.trim() : '';
  if (!url) {
    return null;
  }
  const title = typeof media.title === 'string' ? media.title : undefined;
  const type = typeof media.type === 'string' ? media.type : undefined;
  return { url, title, type };
}

onBeforeUnmount(() => {
  cancelActiveRequest();
});
</script>

<style scoped>
:deep(.q-dialog__backdrop) {
  background-color: rgba(6, 8, 12, 0.35);
}

.creator-profile-dialog :deep(.q-dialog__inner) {
  align-items: stretch;
}

.creator-profile-dialog :deep(.q-dialog__inner--right) {
  justify-content: flex-end;
}

.profile-card {
  width: min(420px, 100vw);
  background: var(--surface-2);
  color: var(--text-1);
  border-radius: 24px 0 0 24px;
  display: flex;
  flex-direction: column;
  max-height: 100vh;
  box-shadow: 0 20px 32px rgba(0, 0, 0, 0.24);
}

.profile-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28px 28px 20px;
  gap: 12px;
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
  gap: 16px;
  max-width: 100%;
}

.profile-name {
  font-size: 1.5rem;
  font-weight: 700;
}

.profile-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-section-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-2);
  font-weight: 600;
}

.profile-handle-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.profile-handle-chip {
  display: inline-flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border);
  min-width: 0;
}

.profile-handle-chip__label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-2);
}

.profile-handle-chip__value {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-1);
  word-break: break-word;
}

.profile-about {
  color: var(--text-1);
  line-height: 1.6;
  white-space: pre-line;
  font-size: 1rem;
}

.close-btn {
  color: var(--text-2);
}

.profile-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 64px 24px;
}

.section-divider {
  opacity: 0.35;
}

.actions-section {
  padding: 20px 28px 12px;
}

.action-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.action-tile {
  width: 100%;
  text-align: left;
  border-radius: 16px;
  padding: 0;
  min-height: 68px;
}

.action-tile :deep(.q-btn__content) {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
}

.action-tile__labels {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.action-tile__title {
  font-size: 1.05rem;
  font-weight: 600;
}

.action-tile__subtitle {
  font-size: 0.8rem;
  color: var(--text-2);
}

.action-tile--primary {
  box-shadow: 0 12px 30px rgba(19, 16, 46, 0.28);
}

.action-tile--secondary {
  background: rgba(109, 93, 211, 0.12);
  border: 1px solid rgba(109, 93, 211, 0.25);
}

.action-tile--secondary :deep(.q-icon) {
  color: var(--accent-500);
}

.tiers-section {
  padding: 12px 28px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-heading {
  font-size: 1.125rem;
  font-weight: 600;
}

.tiers-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tier-expansion {
  border-radius: 16px;
  background: var(--surface-1);
}

.tier-expansion :deep(.q-expansion-item__container) {
  border-radius: inherit;
  background: inherit;
}

.tier-expansion :deep(.q-item) {
  padding: 18px 22px;
}

.tier-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tier-name {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-1);
}

.tier-header__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.tier-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-1);
}

.tier-pill--price {
  background: rgba(109, 93, 211, 0.16);
  color: var(--accent-500);
}

.tier-pill--frequency {
  color: var(--text-2);
}

.tier-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
  color: var(--text-2);
  padding: 0 22px 22px;
}

.tier-description {
  white-space: pre-line;
  color: var(--text-1);
  font-size: 0.95rem;
  line-height: 1.6;
}

.tier-media {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tier-media__item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tier-media__image,
.tier-media__video,
.tier-media__audio,
.tier-media__link {
  border-radius: 12px;
  border: 1px solid var(--surface-contrast-border);
  overflow: hidden;
}

.tier-media__video {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 360px;
  background: black;
}

.tier-media__audio {
  display: block;
  width: 100%;
  background: var(--surface-1);
}

.tier-media__link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  background: var(--surface-1);
  color: var(--accent-500);
  font-weight: 600;
  text-decoration: none;
  transition: color 0.2s ease, background-color 0.2s ease;
  word-break: break-word;
  width: 100%;
}

.tier-media__link:hover,
.tier-media__link:focus-visible {
  background: var(--accent-200);
  color: var(--accent-600);
}

.tier-media__link-text {
  overflow-wrap: anywhere;
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

.tier-sticky-cta {
  position: sticky;
  bottom: -16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 0 0;
  background: linear-gradient(180deg, rgba(13, 15, 21, 0) 0%, var(--surface-1) 45%);
}

.tier-sticky-cta__divider {
  opacity: 0.2;
}

.tier-subscribe {
  font-weight: 600;
  width: 100%;
}

.empty-state {
  padding: 32px 28px;
  color: var(--text-2);
  text-align: center;
}

@media (max-width: 959px) {
  .profile-card {
    border-radius: 24px 24px 0 0;
    max-height: 90vh;
  }

  .creator-profile-dialog :deep(.q-dialog__inner) {
    align-items: flex-end;
  }
}

@media (max-width: 599px) {
  .profile-card {
    width: 100vw;
    border-radius: 20px 20px 0 0;
  }

  .profile-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .close-btn {
    position: absolute;
    top: 16px;
    right: 16px;
  }

  .header-main {
    width: 100%;
  }

  .profile-body {
    max-height: 60vh;
  }
}
</style>
