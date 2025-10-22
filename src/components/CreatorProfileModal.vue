<template>
  <q-dialog
    v-model="showLocal"
    persistent
    backdrop-filter="blur(6px)"
    class="profile-dialog"
    :class="{ 'profile-dialog--maximized': isDialogMaximized }"
    :maximized="isDialogMaximized"
  >
    <q-card class="profile-card">
      <div class="profile-layout">
        <div class="profile-layout__hero">
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

        <div class="profile-layout__content">
          <div class="profile-layout__body">
            <q-card-section v-if="loading" class="loading-state">
              <q-spinner color="accent" size="42px" />
            </q-card-section>

            <template v-else>
              <q-separator class="section-divider" />

              <q-card-section v-if="creator" class="tiers-section">
                <div class="section-heading">Subscription tiers</div>
                <div v-if="hasTiers" class="tiers-list">
                  <div
                    v-for="tier in tiers"
                    :key="tier.id"
                    :class="[
                      'tier-row',
                      {
                        'tier-row--recommended': tier.id === recommendedTierId,
                      },
                    ]"
                  >
                    <div class="tier-row__content">
                      <header class="tier-row__header">
                        <div class="tier-row__identity">
                          <div class="tier-row__name text-subtitle2 text-weight-medium text-1">
                            {{ tier.name }}
                          </div>
                          <q-chip
                            v-if="tier.id === recommendedTierId"
                            dense
                            class="tier-row__chip"
                            color="accent"
                            text-color="white"
                            square
                          >
                            Recommended
                          </q-chip>
                        </div>
                        <div class="tier-row__cta">
                          <div class="tier-row__pricing">
                            <div class="tier-row__price-amount text-h6 text-weight-bold text-1">
                              {{ formatTierPrice(tier) }} sats
                            </div>
                            <div
                              v-if="tierFrequencyLabel(tier)"
                              class="tier-row__price-cadence text-caption"
                            >
                              {{ tierFrequencyLabel(tier) }}
                            </div>
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
                      </header>

                      <div class="tier-row__body">
                        <div
                          v-if="tierHighlight(tier)"
                          class="tier-row__highlight text-body2 text-2"
                        >
                          {{ tierHighlight(tier) }}
                        </div>
                        <div v-if="tierHasBenefits(tier)" class="tier-row__perks" role="list">
                          <div
                            v-for="benefit in tierBenefits(tier).slice(0, 3)"
                            :key="`${tier.id}-badge-${benefit}`"
                            class="tier-row__perk-badge"
                            role="listitem"
                          >
                            <q-icon
                              name="check_circle"
                              size="16px"
                              class="tier-row__perk-icon"
                              aria-hidden="true"
                            />
                            <span class="tier-row__perk-text">{{ benefit }}</span>
                          </div>
                        </div>
                        <div class="tier-row__meta" role="list">
                          <span
                            v-if="tierBenefitCountLabel(tier)"
                            role="listitem"
                            class="tier-row__meta-pill"
                          >
                            <q-icon
                              name="auto_awesome"
                              size="14px"
                              class="tier-row__meta-icon"
                              aria-hidden="true"
                            />
                            {{ tierBenefitCountLabel(tier) }}
                          </span>
                          <span v-if="tier.welcomeMessage" role="listitem" class="tier-row__meta-pill">
                            <q-icon
                              name="mail"
                              size="14px"
                              class="tier-row__meta-icon"
                              aria-hidden="true"
                            />
                            Welcome note
                          </span>
                        </div>
                        <div class="tier-row__toggle">
                          <q-btn
                            flat
                            dense
                            class="tier-row__details-toggle"
                            no-caps
                            :label="isTierExpanded(tier.id) ? 'Hide details' : 'Details'"
                            :icon-right="isTierExpanded(tier.id) ? 'expand_less' : 'expand_more'"
                            @click="toggleTierDetails(tier.id)"
                            :aria-expanded="isTierExpanded(tier.id)"
                            :aria-controls="tierDetailsId(tier.id)"
                          />
                        </div>
                      </div>

                      <q-slide-transition>
                        <TierDetailsPanel
                          v-if="isTierExpanded(tier.id)"
                          :id="tierDetailsId(tier.id)"
                          class="tier-row__details"
                          :description="hasTierDescription(tier) ? tierDescription(tier) : null"
                          :benefits="tierBenefits(tier)"
                          :media-items="tierMediaItems(tier)"
                          :welcome-message="tier.welcomeMessage"
                        />
                      </q-slide-transition>
                    </div>
                  </div>
                </div>
                <div v-else class="empty-state">No subscription tiers found for this creator.</div>
              </q-card-section>

              <q-card-section v-else class="empty-state">
                We couldn't load this creator's profile. Please try again later.
              </q-card-section>
            </template>
          </div>
          <div class="profile-sticky-footer" v-if="hasTiers && $q.screen.lt.md">
            <q-btn
              unelevated
              color="accent"
              class="profile-sticky-footer__cta"
              no-caps
              label="Subscribe to recommended tier"
              :disable="!recommendedTierId && !primaryTierId"
              @click="handleSubscribe(recommendedTierId || primaryTierId || undefined)"
            />
          </div>
        </div>
      </div>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { nip19 } from 'nostr-tools';
import { useQuasar } from 'quasar';
import TierDetailsPanel from 'components/TierDetailsPanel.vue';
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
const $q = useQuasar();

const loading = ref(false);
const creator = ref<Creator | null>(null);
const tiers = ref<TierDetails[]>([]);
const showLocal = ref(false);
const isDialogMaximized = computed(() => $q.screen.lt.sm);
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

const recommendedTierId = computed(() => {
  if (!tiers.value.length) {
    return '';
  }

  let best: TierDetails | null = null;

  for (const tier of tiers.value) {
    if (!best) {
      best = tier;
      continue;
    }

    const bestBenefits = Array.isArray(best.benefits) ? best.benefits.length : 0;
    const tierBenefits = Array.isArray(tier.benefits) ? tier.benefits.length : 0;

    if (tierBenefits > bestBenefits) {
      best = tier;
      continue;
    }

    if (tierBenefits === bestBenefits) {
      const bestPrice = typeof best.priceMsat === 'number' ? best.priceMsat : Number.POSITIVE_INFINITY;
      const tierPrice = typeof tier.priceMsat === 'number' ? tier.priceMsat : Number.POSITIVE_INFINITY;

      if (tierPrice < bestPrice) {
        best = tier;
        continue;
      }
    }
  }

  return best?.id ?? '';
});

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

function tierDetailsId(tierId: string): string {
  return `tier-desc-${tierId}`;
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
:deep(.q-dialog__backdrop) {
  background-color: rgba(0, 0, 0, 0.7);
}

.profile-dialog {
  width: min(96vw, 1360px);
  max-width: 1360px;
}

.profile-card {
  width: 100%;
  max-width: 1360px;
  background: var(--surface-1);
  color: var(--text-1);
  border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 85%, transparent);
  box-shadow: 0 22px 56px rgba(10, 14, 28, 0.26);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: min(95vh, 1040px);
  max-height: min(95vh, 1040px);
}

.profile-dialog--maximized {
  width: 100vw;
  max-width: 100vw;
}

.profile-dialog--maximized .profile-card {
  border-radius: 0;
  height: 100%;
  max-height: none;
  min-height: 100%;
}

.profile-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.profile-layout__hero {
  position: relative;
}

.profile-layout__content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
  height: 100%;
}

.profile-layout__body {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 24px 0;
  scrollbar-gutter: stable;
}

.profile-sticky-footer {
  position: sticky;
  bottom: 0;
  margin-top: 20px;
  padding: 14px 24px 24px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-1) 94%, transparent) 0%,
    color-mix(in srgb, var(--surface-1) 98%, var(--surface-2) 2%) 60%
  );
  border-top: 1px solid color-mix(in srgb, var(--surface-contrast-border) 70%, transparent);
  display: flex;
  justify-content: flex-end;
  gap: 16px;
}

.profile-sticky-footer__cta {
  width: 100%;
  max-width: 320px;
  font-weight: 700;
  box-shadow: 0 16px 32px rgba(10, 16, 32, 0.22);
}


.profile-hero {
  padding: 0;
}

.hero-panel {
  position: relative;
  padding: 28px 28px 24px;
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
  align-items: flex-start;
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
  gap: 14px;
  max-width: min(440px, 100%);
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
  gap: 14px;
  margin-top: 20px;
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
  top: 24px;
  right: 24px;
  z-index: 2;
  color: var(--text-2);
  background: color-mix(in srgb, var(--surface-2) 80%, transparent);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 85%, transparent);
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 28px;
}

.section-divider {
  opacity: 1;
  background: color-mix(in srgb, var(--surface-contrast-border) 90%, transparent);
  margin: 0 28px;
}

.tiers-section {
  padding: 24px 28px 32px;
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
  padding: 22px 24px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-1) 97%, var(--surface-2) 3%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 65%, transparent);
  box-shadow: 0 12px 26px rgba(9, 15, 28, 0.12);
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.tier-row::before {
  content: '';
  position: absolute;
  top: 18px;
  bottom: 18px;
  left: 18px;
  width: 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-500) 38%, transparent);
  pointer-events: none;
}

.tier-row--recommended {
  border-color: color-mix(in srgb, var(--accent-500) 70%, transparent);
  box-shadow: 0 16px 36px rgba(12, 20, 40, 0.18);
}

.tier-row--recommended::before {
  background: linear-gradient(180deg, var(--accent-500) 0%, color-mix(in srgb, var(--accent-600) 65%, var(--accent-200) 35%) 100%);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-500) 28%, transparent);
}

.tier-row--recommended .tier-row__chip {
  background: color-mix(in srgb, var(--accent-500) 78%, var(--accent-200) 22%);
}

.tier-row:hover,
.tier-row:focus-within {
  border-color: color-mix(in srgb, var(--accent-500) 45%, transparent);
  transform: translateY(-2px);
  box-shadow: 0 18px 36px rgba(10, 16, 32, 0.18);
}

.tier-row--recommended:hover,
.tier-row--recommended:focus-within {
  border-color: color-mix(in srgb, var(--accent-500) 85%, transparent);
  box-shadow: 0 20px 42px rgba(12, 20, 40, 0.22);
}

.tier-row__content {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 20px;
}

.tier-row__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.tier-row__identity {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.tier-row__name {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 1.05rem;
  line-height: 1.2;
}

.tier-row__name::before {
  content: '';
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--accent-500);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-500) 16%, transparent);
}

.tier-row__chip {
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 10px;
}

.tier-row__cta {
  display: grid;
  gap: 10px;
  align-content: start;
  justify-items: end;
}

.tier-row__pricing {
  display: grid;
  gap: 4px;
  text-align: right;
}

.tier-row__price-amount {
  font-size: 1.1rem;
}

.tier-row__price-cadence {
  color: var(--text-2);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.tier-row__subscribe {
  font-weight: 600;
  min-width: 140px;
  box-shadow: 0 14px 26px rgba(10, 16, 32, 0.18);
}

.tier-row__body {
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'highlight'
    'perks'
    'meta'
    'toggle';
}

.tier-row__highlight {
  grid-area: highlight;
  color: color-mix(in srgb, var(--text-1) 94%, var(--text-2) 6%);
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.5;
}

.tier-row__perks {
  grid-area: perks;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tier-row__perk-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-200) 18%, transparent);
  color: var(--text-1);
  font-size: 0.82rem;
  line-height: 1.3;
}

.tier-row__perk-icon {
  color: color-mix(in srgb, var(--accent-500) 78%, var(--accent-200) 22%);
}

.tier-row__perk-text {
  font-weight: 600;
}

.tier-row__meta {
  grid-area: meta;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tier-row__meta-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--chip-bg);
  color: var(--chip-text);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.tier-row__meta-icon {
  color: var(--accent-500);
}

.tier-row__toggle {
  grid-area: toggle;
  display: flex;
  justify-content: flex-start;
}

.tier-row__details-toggle {
  font-weight: 600;
  color: var(--text-1);
}

.tier-row__details-toggle:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-500) 28%, transparent);
  border-radius: 8px;
}

.tier-row__details {
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-2) 24%, transparent);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 65%, transparent);
  padding: 16px 20px;
}

@media (min-width: 768px) {
  .profile-layout__body {
    padding: 28px 0;
  }

  .tier-row {
    padding: 26px 28px;
  }

  .tier-row__content {
    gap: 24px;
  }

  .tier-row__header {
    grid-template-columns: minmax(0, 2fr) auto;
  }

  .tier-row__body {
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    grid-template-areas:
      'highlight highlight'
      'perks meta'
      'toggle toggle';
  }

  .tier-row__subscribe {
    min-width: 160px;
  }
}

@media (max-width: 599px) {

  .profile-layout__body {
    padding: 20px 0;
  }

  .hero-panel {
    padding: 24px 20px 20px;
  }

  .hero-layout {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }

  .section-divider {
    margin: 0 20px;
  }

  .tiers-section {
    padding: 20px 20px 26px;
  }

  .tier-row {
    padding: 18px 20px 18px 26px;
  }

  .tier-row::before {
    left: 12px;
  }

  .tier-row__header {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .tier-row__cta {
    justify-items: stretch;
    align-content: stretch;
    gap: 12px;
  }

  .tier-row__pricing {
    text-align: left;
    justify-items: start;
  }

  .tier-row__subscribe {
    width: 100%;
  }

  .tier-row__body {
    gap: 10px;
  }

  .tier-row__details {
    padding: 12px 16px;
  }

  .profile-sticky-footer {
    margin-top: 16px;
    padding: 12px 20px 24px;
  }

  .profile-sticky-footer__cta {
    max-width: none;
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

@media (min-width: 1024px) {
  .profile-layout {
    display: grid;
    grid-template-columns: 360px minmax(0, 1fr);
    column-gap: 36px;
    height: 100%;
  }

  .profile-layout__hero {
    position: sticky;
    top: 0;
    align-self: start;
    width: 360px;
  }

  .profile-layout__content {
    min-height: 0;
  }

  .hero-panel {
    padding: 34px 36px 30px;
  }

  .hero-layout {
    gap: 32px;
  }

  .hero-meta {
    gap: 16px;
    max-width: 560px;
  }

  .hero-actions {
    margin-top: 28px;
    gap: 18px;
  }

  .profile-layout__body {
    padding: 32px 0;
  }

  .section-divider {
    margin: 0 36px;
  }

  .loading-state {
    padding: 56px 36px;
  }

  .tiers-section {
    padding: 28px 36px 40px;
    gap: 22px;
  }

  .empty-state {
    padding: 28px 36px;
  }
}
</style>
