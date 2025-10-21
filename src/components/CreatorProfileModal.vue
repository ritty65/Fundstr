<template>
  <q-dialog
    v-model="showLocal"
    persistent
    backdrop-filter="blur(6px)"
    class="creator-profile-dialog"
  >
    <q-card class="profile-card">
      <div class="profile-card__layout">
        <div class="profile-card__hero-column">
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
        </div>
        <div class="profile-card__tiers-column">
          <div v-if="loading" class="loading-state">
            <q-spinner color="accent" size="42px" />
          </div>
          <q-scroll-area v-else class="profile-card__scroll">
            <div class="profile-card__scroll-content">
              <q-separator class="section-divider" />

              <div v-if="creator" class="tiers-section">
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
                        <q-btn
                          flat
                          dense
                          class="tier-row__details-toggle"
                          no-caps
                          :label="isTierExpanded(tier.id) ? 'Hide details' : 'Details'"
                          :icon-right="isTierExpanded(tier.id) ? 'expand_less' : 'expand_more'"
                          @click="toggleTierDetails(tier.id)"
                          :aria-expanded="isTierExpanded(tier.id)"
                          :aria-controls="`tier-desc-${tier.id}`"
                        />
                      </div>
                      <div v-if="tierHighlight(tier)" class="tier-row__highlight text-body2 text-2">
                        {{ tierHighlight(tier) }}
                      </div>
                      <div class="tier-row__meta" role="list">
                        <span v-if="tierBenefitCountLabel(tier)" role="listitem" class="tier-row__meta-pill">
                          {{ tierBenefitCountLabel(tier) }}
                        </span>
                        <span v-if="tier.welcomeMessage" role="listitem" class="tier-row__meta-pill">
                          Welcome note
                        </span>
                      </div>
                      <q-slide-transition>
                        <div
                          v-if="isTierExpanded(tier.id)"
                          :id="`tier-desc-${tier.id}`"
                          class="tier-row__details text-body2 text-1"
                        >
                          <p v-if="hasTierDescription(tier)" class="tier-row__details-description">
                            {{ tierDescription(tier) }}
                          </p>
                          <ul v-if="tierHasBenefits(tier)" class="tier-row__benefits">
                            <li
                              v-for="benefit in tierBenefits(tier)"
                              :key="benefit"
                              class="tier-row__benefit"
                            >
                              {{ benefit }}
                            </li>
                          </ul>
                          <div v-if="tierHasMedia(tier)" class="tier-row__media">
                            <div
                              v-for="(item, mediaIndex) in tierMediaItems(tier)"
                              :key="`${tier.id}-media-${mediaIndex}`"
                              class="tier-row__media-item"
                            >
                              <template v-if="isTierMediaLink(item)">
                                <q-chip
                                  dense
                                  outline
                                  clickable
                                  tag="a"
                                  icon="link"
                                  class="tier-row__media-chip"
                                  :href="item.url"
                                  target="_blank"
                                  rel="noopener"
                                >
                                  {{ tierMediaLabel(item) }}
                                </q-chip>
                              </template>
                              <template v-else>
                                <MediaPreview :url="item.url" />
                              </template>
                            </div>
                          </div>
                          <div
                            v-if="!hasTierDescription(tier) && !tierHasBenefits(tier) && !tierHasMedia(tier)"
                            class="tier-row__details-empty text-2"
                          >
                            No additional details for this tier yet.
                          </div>
                        </div>
                      </q-slide-transition>
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
              </div>

              <div v-else class="empty-state">
                We couldn't load this creator's profile. Please try again later.
              </div>
            </div>
          </q-scroll-area>
        </div>
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
import { filterValidMedia } from 'src/utils/validateMedia';
import type { TierMedia as TierMediaItem } from 'stores/types';
import { toHex } from 'src/nostr/relayClient';

const props = defineProps<{
  show: boolean;
  pubkey: string;
}>();

const emit = defineEmits(['close', 'message', 'donate']);

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
const expandedTierIds = ref<Record<string, boolean>>({});

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
  tiers,
  (newTiers) => {
    const nextState: Record<string, boolean> = {};
    for (const tier of newTiers) {
      if (expandedTierIds.value[tier.id]) {
        nextState[tier.id] = true;
      }
    }
    expandedTierIds.value = nextState;
  },
  { deep: true },
);

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
      ? [...fetchedCreator.tiers]
      : [];

    let tierDetails: unknown[] = [];
    try {
      tierDetails = await fetchTierDetails(fetchedCreator, pubkey, controller.signal);
    } catch (tierError) {
      if ((tierError as any)?.name === 'AbortError') {
        return;
      }
      console.error('Failed to load creator tiers', tierError);
    }

    if (requestId !== currentRequestId) {
      return;
    }

    const combinedTiers = mergeTierSources(fetchedTiers, tierDetails);
    const mappedTiers = combinedTiers
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

async function fetchTierDetails(
  fetchedCreator: Creator | null,
  inputPubkey: string,
  signal: AbortSignal,
): Promise<unknown[]> {
  const candidates = collectPubkeyCandidates(fetchedCreator, inputPubkey);
  if (!candidates.hex.length && !candidates.npub.length) {
    return [];
  }

  let bestResult: unknown[] | null = null;
  let lastError: unknown = null;

  const tryFetch = async (id: string): Promise<unknown[] | null> => {
    try {
      const response = await discoveryClient.getCreatorTiers({
        id,
        fresh: true,
        signal,
      });
      const tiers = Array.isArray(response?.tiers) ? response.tiers : [];
      bestResult = tiers;
      return tiers;
    } catch (error) {
      if ((error as any)?.name === 'AbortError') {
        throw error;
      }
      lastError = error;
      return null;
    }
  };

  for (const hex of candidates.hex) {
    const result = await tryFetch(hex);
    if (result && result.length > 0) {
      return result;
    }
  }

  if (!bestResult || bestResult.length === 0) {
    for (const npub of candidates.npub) {
      const result = await tryFetch(npub);
      if (result && result.length > 0) {
        return result;
      }
    }
  }

  if (bestResult !== null) {
    return bestResult;
  }

  if (lastError) {
    throw lastError;
  }

  return [];
}

function collectPubkeyCandidates(
  fetchedCreator: Creator | null,
  inputPubkey: string,
): { hex: string[]; npub: string[] } {
  const hexCandidates = new Set<string>();
  const npubCandidates = new Set<string>();

  const addHexCandidate = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    try {
      const hex = toHex(trimmed);
      hexCandidates.add(hex);
    } catch {
      /* ignore invalid values */
    }
  };

  const addNpubCandidate = (value: unknown) => {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed.toLowerCase().startsWith('npub')) {
      npubCandidates.add(trimmed);
    }
  };

  addHexCandidate(fetchedCreator?.pubkey ?? null);
  addHexCandidate(inputPubkey);
  addNpubCandidate((fetchedCreator as any)?.npub ?? null);
  addNpubCandidate(inputPubkey);

  for (const hex of Array.from(hexCandidates)) {
    try {
      npubCandidates.add(nip19.npubEncode(hex));
    } catch {
      /* ignore encoding issues */
    }
  }

  return {
    hex: Array.from(hexCandidates),
    npub: Array.from(npubCandidates),
  };
}

function mergeTierSources(primary: unknown[], secondary: unknown[]): unknown[] {
  const tierOrder: string[] = [];
  const tierMap = new Map<string, Record<string, unknown>>();

  const processList = (list: unknown[]) => {
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const id = resolveTierId(entry);
      if (!id) {
        continue;
      }
      const record = { ...(entry as Record<string, unknown>) };
      if (!tierMap.has(id)) {
        tierMap.set(id, record);
        tierOrder.push(id);
      } else {
        const merged = mergeTierRecords(tierMap.get(id)!, record);
        tierMap.set(id, merged);
      }
    }
  };

  processList(primary);
  processList(secondary);

  return tierOrder
    .map((id) => tierMap.get(id))
    .filter((tier): tier is Record<string, unknown> => Boolean(tier));
}

function mergeTierRecords(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const benefits = selectPreferredArray(base.benefits, incoming.benefits);
  const media = selectPreferredArray(base.media, incoming.media);
  const welcomeMessage = selectPreferredWelcomeMessage(base.welcomeMessage, incoming.welcomeMessage);

  const merged: Record<string, unknown> = {
    ...base,
    ...incoming,
  };

  if (benefits !== undefined) {
    merged.benefits = benefits;
  } else {
    delete merged.benefits;
  }

  if (media !== undefined) {
    merged.media = media;
  } else {
    delete merged.media;
  }

  if (welcomeMessage !== undefined) {
    merged.welcomeMessage = welcomeMessage;
  } else {
    delete merged.welcomeMessage;
  }

  return merged;
}

function selectPreferredArray(
  baseValue: unknown,
  incomingValue: unknown,
): unknown[] | undefined {
  const baseArray = Array.isArray(baseValue) ? baseValue : undefined;
  const incomingArray = Array.isArray(incomingValue) ? incomingValue : undefined;

  if (incomingArray && baseArray) {
    if (incomingArray.length > baseArray.length) {
      return incomingArray;
    }
    if (incomingArray.length === baseArray.length && incomingArray.length > 0) {
      return incomingArray;
    }
    return baseArray.length > 0 ? baseArray : undefined;
  }

  if (incomingArray) {
    return incomingArray.length > 0 ? incomingArray : undefined;
  }

  if (baseArray) {
    return baseArray.length > 0 ? baseArray : undefined;
  }

  return undefined;
}

function selectPreferredWelcomeMessage(
  baseValue: unknown,
  incomingValue: unknown,
): string | null | undefined {
  const incomingText = typeof incomingValue === 'string' ? incomingValue.trim() : '';
  if (incomingText) {
    return incomingText;
  }

  const baseText = typeof baseValue === 'string' ? baseValue.trim() : '';
  if (baseText) {
    return baseText;
  }

  if (incomingValue === null || incomingValue === undefined) {
    return incomingValue as null | undefined;
  }

  if (baseValue === null || baseValue === undefined) {
    return baseValue as null | undefined;
  }

  return null;
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

function tierBenefits(tier: TierDetails): string[] {
  return Array.isArray(tier.benefits) ? tier.benefits : [];
}

function tierHasBenefits(tier: TierDetails): boolean {
  return tierBenefits(tier).length > 0;
}

function tierMediaItems(tier: TierDetails): TierMediaItem[] {
  return Array.isArray(tier.media) ? tier.media : [];
}

function tierHasMedia(tier: TierDetails): boolean {
  return tierMediaItems(tier).length > 0;
}

function isTierMediaLink(item: TierMediaItem): boolean {
  return (item.type ?? '').toLowerCase() === 'link';
}

function tierMediaLabel(item: TierMediaItem): string {
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

function hasTierDescription(tier: TierDetails): boolean {
  if (!tier.description) return false;
  return tier.description.trim().length > 0;
}

function tierDescription(tier: TierDetails): string {
  return (tier.description ?? '').trim();
}

function isTierExpanded(tierId: string): boolean {
  if (!tierId) return false;
  return Boolean(expandedTierIds.value[tierId]);
}

function toggleTierDetails(tierId: string) {
  if (!tierId || !expandedTierIds.value) {
    expandedTierIds.value = {};
    return;
  }
  const nextState = { ...expandedTierIds.value };
  if (nextState[tierId]) {
    delete nextState[tierId];
  } else {
    nextState[tierId] = true;
  }
  expandedTierIds.value = nextState;
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
  expandedTierIds.value = {};
}

function resolveTierId(rawTier: unknown): string | null {
  if (!rawTier || typeof rawTier !== 'object') return null;
  const t = rawTier as Record<string, unknown>;

  const candidates = [t.id, t.tier_id, t.d];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }

  return null;
}

function normalizeTierDetails(rawTier: unknown): TierDetails | null {
  if (!rawTier || typeof rawTier !== 'object') return null;
  const t = rawTier as Record<string, unknown>;

  const id = resolveTierId(t);
  if (!id) return null;

  const name =
    (typeof t.name === 'string' && t.name.trim()) ||
    (typeof t.title === 'string' && t.title.trim()) ||
    'Subscription tier';

  const rawDescription = typeof t.description === 'string' ? t.description.trim() : null;
  const description = rawDescription && rawDescription.length > 0 ? rawDescription : null;
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
      ? (t.benefits as unknown[])
          .filter((x): x is string => typeof x === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : parsePerks(t.perks);

  const rawMedia = Array.isArray(t.media)
    ? (t.media as unknown[]).map(normalizeMediaItem).filter((m): m is TierMediaItem => m !== null)
    : [];
  const media = filterValidMedia(rawMedia);

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
  if (!entry) {
    return null;
  }
  if (typeof entry === 'string') {
    const url = entry.trim();
    return url ? { url } : null;
  }
  if (typeof entry !== 'object') {
    return null;
  }
  const media = entry as Record<string, unknown>;
  const url = typeof media.url === 'string' ? media.url.trim() : '';
  if (!url) {
    return null;
  }
  const titleRaw = typeof media.title === 'string' ? media.title.trim() : '';
  const title = titleRaw.length > 0 ? titleRaw : undefined;
  const rawType = typeof media.type === 'string' ? media.type.trim().toLowerCase() : '';
  const allowedTypes: TierMediaItem['type'][] = ['image', 'video', 'audio', 'link'];
  const type = allowedTypes.includes(rawType as TierMediaItem['type'])
    ? (rawType as TierMediaItem['type'])
    : undefined;
  return { url, title, type };
}

onBeforeUnmount(() => {
  cancelActiveRequest();
});
</script>

<style scoped>
:deep(.creator-profile-dialog .q-dialog__inner) {
  width: 100%;
  max-width: min(960px, 94vw);
}

:deep(.creator-profile-dialog .q-dialog__inner--minimized) {
  width: 100%;
}

:deep(.q-dialog__backdrop) {
  background-color: rgba(0, 0, 0, 0.7);
}

.profile-card {
  width: 100%;
  max-width: 100%;
  background: var(--surface-1);
  color: var(--text-1);
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 85%, transparent);
  box-shadow: 0 22px 56px rgba(10, 14, 28, 0.26);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: min(92vh, 820px);
}

.profile-card__layout {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.profile-card__hero-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.profile-card__tiers-column {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  background: var(--surface-1);
}

.profile-card__scroll {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

.profile-card__scroll-content {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  flex: 1 1 auto;
}

.profile-hero {
  padding: 0;
  flex: 1 1 auto;
}

.hero-panel {
  position: relative;
  padding: 26px 24px 22px;
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
  max-width: min(320px, 100%);
}

.hero-name {
  font-size: 1.625rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--text-1);
}

.hero-handle {
  font-size: 1rem;
  font-weight: 650;
  color: color-mix(in srgb, var(--text-1) 92%, var(--text-2) 8%);
  letter-spacing: 0.045em;
}

.hero-about {
  color: color-mix(in srgb, var(--text-1) 96%, var(--text-2) 4%);
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.55;
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
  flex: 1 1 auto;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 24px;
  min-height: 0;
}

.section-divider {
  opacity: 1;
  background: color-mix(in srgb, var(--surface-contrast-border) 90%, transparent);
}

.tiers-section {
  padding: 18px 20px 24px;
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

.tier-row__details-toggle {
  margin-left: auto;
  font-weight: 600;
  color: var(--text-1);
}

.tier-row__details-toggle:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-500) 30%, transparent);
  border-radius: 8px;
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
  font-weight: 600;
  letter-spacing: 0.01em;
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
  font-weight: 700;
  letter-spacing: 0.0125em;
}

.tier-row__subscribe {
  font-weight: 600;
  min-width: 140px;
}

.tier-row__details {
  width: 100%;
  margin-top: 12px;
  padding-left: 26px;
  padding-right: 12px;
  color: var(--text-1);
  line-height: 1.6;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tier-row__details-description {
  margin: 0;
  white-space: pre-line;
}

.tier-row__benefits {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.tier-row__benefit {
  list-style: disc;
}

.tier-row__media {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tier-row__media-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tier-row__media :deep(.media-preview-container) {
  border-radius: 0.9rem;
  box-shadow: 0 14px 30px rgba(9, 15, 28, 0.18);
}

.tier-row__media-chip {
  align-self: flex-start;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.tier-row__details-empty {
  font-style: italic;
  color: var(--text-2);
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
  :deep(.creator-profile-dialog .q-dialog__inner) {
    width: 100%;
    max-width: 100%;
  }

  .hero-panel {
    padding: 22px 18px 18px;
  }

  .hero-layout {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .tiers-section {
    padding: 16px 16px 22px;
  }

  .tier-row {
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    padding-left: 22px;
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

  .tier-row__details {
    padding-left: 0;
    padding-right: 0;
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

@media (min-width: 768px) {
  .profile-card__layout {
    display: grid;
    grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
    height: 100%;
  }

  .profile-card__hero-column {
    border-right: 1px solid color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
  }
}
</style>
