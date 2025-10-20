<template>
  <q-dialog
    v-model="showLocal"
    persistent
    backdrop-filter="blur(6px)"
    style="width: 82%; max-width: 520px;"
  >
    <q-card class="profile-card">
      <q-card-section class="profile-hero">
        <div class="hero-panel">
          <q-btn
            flat
            round
            dense
            icon="close"
            class="close-btn"
            @click="close"
            aria-label="Close creator profile"
          />
          <div class="hero-layout">
            <div class="hero-avatar">
              <q-avatar size="120px" class="profile-avatar">
                <img :src="creatorAvatar" alt="Creator avatar" @error="onAvatarError" />
              </q-avatar>
            </div>
            <div class="hero-meta">
              <div class="hero-name">{{ displayName }}</div>
              <div v-if="nip05" class="hero-handle">{{ nip05 }}</div>
              <div v-if="aboutText" class="hero-about text-body2">{{ aboutText }}</div>
              <div v-if="creator" class="hero-actions">
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
              </div>
            </div>
          </div>
        </div>
      </q-card-section>

      <q-card-section v-if="loading" class="loading-state">
        <q-spinner color="accent" size="42px" />
      </q-card-section>

      <template v-else>
        <q-separator class="section-divider" />

        <q-card-section v-if="creator" class="tiers-section">
          <div class="section-heading">Subscription tiers</div>
          <div v-if="hasTiers" class="tiers-list">
            <div v-for="tier in tiers" :key="tier.id" class="tier-row">
              <div class="tier-row__content">
                <div class="tier-row__header">
                  <div class="tier-row__name text-subtitle2 text-weight-medium text-1">
                    {{ tier.name }}
                  </div>
                  <div v-if="tierFrequencyLabel(tier)" class="tier-row__cadence text-caption">
                    {{ tierFrequencyLabel(tier) }}
                  </div>
                </div>
                <div v-if="tierHighlight(tier)" class="tier-row__highlight text-body2 text-2">
                  {{ tierHighlight(tier) }}
                </div>
                <div class="tier-row__meta" role="list">
                  <span v-if="tierBenefitCountLabel(tier)" role="listitem" class="tier-row__meta-pill">
                    {{ tierBenefitCountLabel(tier) }}
                  </span>
                  <span v-if="tierMediaCountLabel(tier)" role="listitem" class="tier-row__meta-pill">
                    {{ tierMediaCountLabel(tier) }}
                  </span>
                  <span v-if="tier.welcomeMessage" role="listitem" class="tier-row__meta-pill">
                    Welcome note
                  </span>
                </div>
              </div>
              <div class="tier-row__cta">
                <div class="tier-row__price text-subtitle2 text-weight-medium text-1">
                  {{ tierPriceSummary(tier) }}
                </div>
                <q-btn
                  color="accent"
                  class="tier-row__subscribe"
                  unelevated
                  no-caps
                  label="Subscribe"
                  @click="handleSubscribe(tier.id)"
                />
              </div>
            </div>
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { nip19 } from 'nostr-tools';
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
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      return;
    }
    console.error('Failed to load creator profile', error);
      if (requestId === currentRequestId) {
        creator.value = null;
        tiers.value = [];
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

function tierPriceSummary(tier: TierDetails): string {
  const price = `${formatTierPrice(tier)} sats`;
  const cadence = tierFrequencyLabel(tier);
  return cadence ? `${price} / ${cadence}` : price;
}

function tierHighlight(tier: TierDetails): string | null {
  if (tier.benefits?.length) {
    return tier.benefits[0];
  }
  if (tier.description) {
    return truncateText(tier.description, 140);
  }
  return null;
}

function tierBenefitCountLabel(tier: TierDetails): string | null {
  const count = tier.benefits?.length ?? 0;
  if (!count) return null;
  return `${count} benefit${count === 1 ? '' : 's'}`;
}

function tierMediaCountLabel(tier: TierDetails): string | null {
  const count = tier.media?.length ?? 0;
  if (!count) return null;
  return `${count} media ${count === 1 ? 'drop' : 'drops'}`;
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

function truncateText(text: string, maxLength = 140): string {
  const clean = text.trim();
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, maxLength - 1).trimEnd()}…`;
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
  background-color: rgba(0, 0, 0, 0.7);
}

.profile-card {
  width: 100%;
  max-width: 100%;
  background: var(--surface-1);
  color: var(--text-1);
  border-radius: 18px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 85%, transparent);
  box-shadow: 0 26px 64px rgba(10, 14, 28, 0.28);
  position: relative;
  overflow: hidden;
}


.profile-hero {
  padding: 0;
}

.hero-panel {
  position: relative;
  padding: 32px 28px 26px;
  background: var(--surface-1);
  overflow: hidden;
  color: var(--text-1);
  border-bottom: 1px solid color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
}

.hero-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent-600) 24%, transparent) 0%,
    transparent 70%
  );
  opacity: 0.7;
  pointer-events: none;
}

.hero-panel::after {
  content: '';
  position: absolute;
  width: 240px;
  height: 240px;
  right: -120px;
  top: -80px;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--accent-500) 30%, transparent) 0%,
    transparent 70%
  );
  opacity: 0.6;
  pointer-events: none;
}

.hero-layout {
  position: relative;
  display: flex;
  align-items: center;
  gap: 24px;
  z-index: 1;
}

.hero-avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--surface-1) 85%, var(--surface-2) 15%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
  box-shadow: 0 20px 38px rgba(9, 15, 28, 0.24);
}

.profile-avatar :deep(img) {
  border-radius: 50%;
  border: 3px solid color-mix(in srgb, var(--surface-1) 40%, var(--accent-200) 60%);
  object-fit: cover;
  width: 100%;
  height: 100%;
}

.hero-meta {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 360px;
}

.hero-name {
  font-size: 1.625rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.hero-handle {
  font-size: 1rem;
  font-weight: 600;
  color: var(--accent-500);
  letter-spacing: 0.02em;
}

.hero-about {
  color: var(--text-2);
  line-height: 1.5;
  white-space: pre-line;
}

.hero-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
  flex-wrap: nowrap;
}

.action-button {
  flex: 1;
  font-weight: 600;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.action-button.subscribe {
  box-shadow: 0 18px 32px rgba(10, 16, 32, 0.28);
}

.action-button:not(.subscribe):hover,
.action-button:not(.subscribe):focus-visible {
  transform: translateY(-1px);
}

.close-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  color: var(--text-2);
  background: color-mix(in srgb, var(--surface-2) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 85%, transparent);
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 24px;
}

.section-divider {
  opacity: 1;
  background: color-mix(in srgb, var(--surface-contrast-border) 90%, transparent);
}

.tiers-section {
  padding: 20px 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
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

.tier-row {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 24px;
  padding: 20px 24px 20px 32px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-1) 94%, var(--surface-2) 6%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 88%, transparent);
  box-shadow: 0 18px 36px rgba(9, 15, 28, 0.18);
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.tier-row::before {
  content: '';
  position: absolute;
  top: 14px;
  bottom: 14px;
  left: 14px;
  width: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-500) 65%, transparent);
  pointer-events: none;
}

.tier-row:hover,
.tier-row:focus-within {
  border-color: color-mix(in srgb, var(--accent-500) 55%, transparent);
  transform: translateY(-2px);
  box-shadow: 0 22px 42px rgba(10, 16, 32, 0.22);
}

.tier-row__content {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tier-row__header {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: baseline;
}

.tier-row__name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 1.05rem;
}

.tier-row__name::before {
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--accent-500);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-500) 20%, transparent);
}

.tier-row__cadence {
  color: var(--text-2);
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.tier-row__highlight {
  color: var(--text-1);
  line-height: 1.5;
}

.tier-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tier-row__meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-text);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.tier-row__cta {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  min-width: 160px;
  text-align: right;
}

.tier-row__price {
  color: var(--text-1);
}

.tier-row__subscribe {
  font-weight: 600;
  min-width: 140px;
}

.empty-state {
  padding: 24px;
  color: var(--text-2);
  text-align: center;
  background: color-mix(in srgb, var(--surface-1) 94%, var(--surface-2) 6%);
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 85%, transparent);
}

@media (max-width: 599px) {
  .hero-panel {
    padding: 24px 20px 20px;
  }

  .hero-layout {
    flex-direction: column;
    align-items: stretch;
    gap: 18px;
  }

  .tiers-section {
    padding: 16px 16px 24px;
  }

  .tier-row {
    flex-direction: column;
    gap: 16px;
    padding: 18px;
    padding-left: 24px;
  }

  .tier-row__cta {
    align-items: stretch;
    text-align: left;
    min-width: 0;
  }

  .tier-row__price {
    align-self: flex-start;
  }

  .tier-row__subscribe {
    width: 100%;
  }

  .hero-avatar {
    padding: 4px;
  }

  .hero-actions {
    width: 100%;
    flex-wrap: wrap;
    gap: 10px;
  }

  .hero-actions .action-button {
    flex: 1 1 100%;
  }

  .close-btn {
    top: 12px;
    right: 12px;
  }
}
</style>
