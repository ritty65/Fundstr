<template>
  <q-dialog
    v-model="showLocal"
    persistent
    backdrop-filter="blur(6px)"
    class="profile-dialog"
    :class="dialogClasses"
    :maximized="isDialogMaximized"
    content-class="profile-dialog__inner"
  >
    <q-card class="profile-card" :class="{ 'profile-card--two-column': isDesktopViewport }">
      <div class="profile-layout" :class="{ 'profile-layout--two-column': isDesktopViewport }">
        <div class="profile-layout__hero" :class="{ 'profile-layout__hero--desktop': isDesktopViewport }">
          <div class="hero-rail">
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
                    <q-avatar size="96px" class="profile-avatar">
                      <img :src="creatorAvatar" alt="Creator avatar" @error="onAvatarError" />
                    </q-avatar>
                  </div>
                  <div class="hero-meta">
                    <div class="hero-name">{{ displayName }}</div>
                    <div v-if="nip05" class="hero-handle">{{ nip05 }}</div>
                    <div
                      v-if="aboutText"
                      class="hero-about text-body2"
                      :class="{ 'hero-about--clamped': shouldClampBio && !isBioExpanded }"
                    >
                      {{ aboutText }}
                    </div>
                    <div v-if="shouldClampBio" class="hero-about__toggle">
                      <q-btn
                        flat
                        dense
                        no-caps
                        padding="4px 10px"
                        color="accent"
                        :label="isBioExpanded ? 'Hide bio' : 'Read bio'"
                        @click="toggleBio()"
                      />
                    </div>
                    <div
                      v-if="creator"
                      class="hero-actions"
                      :class="{ 'hero-actions--inline': isHeroActionsInline }"
                    >
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
                        icon="mail"
                        label="Message"
                        no-caps
                        @click="$emit('message', pubkey)"
                      />
                      <q-btn
                        outline
                        class="action-button"
                        color="accent"
                        icon="volunteer_activism"
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
        </div>

        <div class="profile-layout__content" :class="{ 'profile-layout__content--desktop': isDesktopViewport }">
          <div class="profile-layout__body">
            <q-card-section v-if="loading" class="loading-state">
              <q-spinner color="accent" size="42px" />
            </q-card-section>

            <template v-else>
              <q-card-section v-if="creator" class="tiers-section">
                <div class="section-heading">Subscription tiers</div>
                <div v-if="hasTiers" class="tiers-grid" role="list">
                  <article
                    v-for="tier in tiers"
                    :key="tier.id"
                    :id="tierRowElementId(tier.id)"
                    :class="[
                      'tier-card',
                      {
                        'tier-card--focus': tier.id === focusedTierId,
                      },
                    ]"
                    role="listitem"
                  >
                    <div class="tier-card__content">
                      <header class="tier-card__header">
                        <div class="tier-card__identity">
                          <div class="tier-card__name text-subtitle2 text-weight-medium text-1">
                            {{ tier.name }}
                          </div>
                          <div v-if="tierSummary(tier)" class="tier-card__summary text-body2 text-2">
                            {{ tierSummary(tier) }}
                          </div>
                        </div>
                        <div class="tier-card__pricing">
                          <div class="tier-card__price text-h6 text-weight-bold text-1">
                            {{ formatTierPrice(tier) }} sats
                          </div>
                          <div
                            v-if="tierFrequencyLabel(tier)"
                            class="tier-card__cadence text-caption"
                          >
                            {{ tierFrequencyLabel(tier) }}
                          </div>
                        </div>
                      </header>

                      <div v-if="tierHasBenefits(tier)" class="tier-card__perks" role="list">
                        <div
                          v-for="benefit in tierBenefits(tier).slice(0, 3)"
                          :key="`${tier.id}-badge-${benefit}`"
                          class="tier-card__perk-chip"
                          role="listitem"
                        >
                          <q-icon
                            name="check_circle"
                            size="16px"
                            class="tier-card__perk-icon"
                            aria-hidden="true"
                          />
                          <span class="tier-card__perk-text">{{ benefit }}</span>
                        </div>
                      </div>

                      <details
                        v-if="tierBenefitCountLabel(tier) || tier.welcomeMessage"
                        class="tier-card__extras"
                      >
                        <summary class="tier-card__extras-summary text-body2">
                          Membership extras
                        </summary>
                        <div class="tier-card__extras-body" role="list">
                          <div
                            v-if="tierBenefitCountLabel(tier)"
                            role="listitem"
                            class="tier-card__extra-pill"
                          >
                            <q-icon
                              name="auto_awesome"
                              size="14px"
                              class="tier-card__extra-icon"
                              aria-hidden="true"
                            />
                            {{ tierBenefitCountLabel(tier) }}
                          </div>
                          <div
                            v-if="tier.welcomeMessage"
                            role="listitem"
                            class="tier-card__extra-pill"
                          >
                            <q-icon
                              name="mail"
                              size="14px"
                              class="tier-card__extra-icon"
                              aria-hidden="true"
                            />
                            Welcome note
                          </div>
                        </div>
                      </details>

                      <div class="tier-card__actions">
                        <q-btn
                          color="accent"
                          class="tier-card__subscribe"
                          unelevated
                          no-caps
                          label="Subscribe"
                          @click="handleSubscribe(tier.id)"
                        />
                        <q-btn
                          flat
                          dense
                          class="tier-card__details-toggle"
                          no-caps
                          :label="isTierExpanded(tier.id) ? 'Hide details' : 'Details'"
                          :icon-right="isTierExpanded(tier.id) ? 'expand_less' : 'expand_more'"
                          @click="toggleTierDetails(tier.id)"
                          :aria-expanded="isTierExpanded(tier.id)"
                          :aria-controls="tierDetailsId(tier.id)"
                        />
                      </div>

                      <q-slide-transition>
                        <TierDetailsPanel
                          v-if="isTierExpanded(tier.id)"
                          :id="tierDetailsId(tier.id)"
                          class="tier-card__details"
                          :description="hasTierDescription(tier) ? tierDescription(tier) : null"
                          :benefits="tierBenefits(tier)"
                          :media-items="tierMediaItems(tier)"
                          :welcome-message="tier.welcomeMessage"
                        />
                      </q-slide-transition>
                    </div>
                  </article>
                </div>
                <div v-else class="empty-state">No subscription tiers found for this creator.</div>
              </q-card-section>

              <q-card-section v-else class="empty-state">
                We couldn't load this creator's profile. Please try again later.
              </q-card-section>
            </template>
          </div>
          <div class="profile-sticky-footer" v-if="showStickyFooter">
            <q-btn
              unelevated
              color="accent"
              class="profile-sticky-footer__cta"
              no-caps
              label="Choose a tier"
              :disable="!primaryTierId"
              @click="focusTierSelection()"
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
const isMobileViewport = computed(() => $q.screen.lt.sm);
const isDesktopViewport = computed(() => $q.screen.gt.sm);
const isDialogMaximized = computed(() => isMobileViewport.value || isDesktopViewport.value);
const dialogClasses = computed(() => ({
  'profile-dialog--maximized': isDialogMaximized.value,
  'profile-dialog--mobile': isMobileViewport.value,
  'profile-dialog--desktop': isDesktopViewport.value,
}));
const expandedTierIds = ref<Record<string, boolean>>({});
const focusedTierId = ref<string | null>(null);
const isBioExpanded = ref(false);

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

const shouldClampBio = computed(() => {
  const about = aboutText.value;
  if (!about) return false;
  if (about.length > 240) return true;
  return about.split(/\r?\n/).length > 3;
});

watch(aboutText, () => {
  isBioExpanded.value = false;
});

function onAvatarError(event: Event) {
  (event.target as HTMLImageElement).src = safeImageSrc(null, displayName.value, 200);
}

function toggleBio() {
  if (!shouldClampBio.value) {
    return;
  }
  isBioExpanded.value = !isBioExpanded.value;
}

const hasTiers = computed(() => tiers.value.length > 0);

const showStickyFooter = computed(() => hasTiers.value && $q.screen.lt.md);
const isHeroActionsInline = computed(() => $q.screen.gt.sm);

const primaryTierId = computed(() => tiers.value[0]?.id ?? '');

let focusTimeout: ReturnType<typeof setTimeout> | null = null;

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
    if (focusedTierId.value && !newTiers.some((tier) => tier.id === focusedTierId.value)) {
      focusedTierId.value = null;
    }
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

function focusTierSelection() {
  const tierId = primaryTierId.value;
  if (!tierId) {
    return;
  }

  expandedTierIds.value = { ...expandedTierIds.value, [tierId]: true };
  focusedTierId.value = tierId;
  clearFocusTimeout();
  focusTimeout = setTimeout(() => {
    focusedTierId.value = null;
    focusTimeout = null;
  }, 1600);

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      const element = document.getElementById(tierRowElementId(tierId));
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
}

function tierFrequencyLabel(tier: TierDetails): string | null {
  return tier.periodLabel;
}

function formatTierPrice(tier: TierDetails): string {
  return formatMsatToSats(tier.priceMsat);
}

function tierSummary(tier: TierDetails): string | null {
  if (tier.description) {
    return truncateText(tier.description, 180);
  }
  if (tier.benefits?.length) {
    return tier.benefits[0];
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

function tierRowElementId(tierId: string): string {
  const safeId = tierId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `tier-row-${safeId}`;
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
  focusedTierId.value = null;
  clearFocusTimeout();
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

function clearFocusTimeout() {
  if (focusTimeout !== null) {
    clearTimeout(focusTimeout);
    focusTimeout = null;
  }
}

onBeforeUnmount(() => {
  cancelActiveRequest();
  clearFocusTimeout();
});
</script>

<style scoped>
:deep(.q-dialog__backdrop) {
  background-color: rgba(0, 0, 0, 0.7);
}

.profile-dialog {
  width: 100%;
  max-width: none;
}

.profile-dialog__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: clamp(16px, 4vh, 40px) clamp(16px, 6vw, 84px);
  box-sizing: border-box;
}

.profile-dialog--mobile .profile-dialog__inner {
  padding: 0;
  align-items: stretch;
}

.profile-card {
  width: min(100%, 1260px);
  background: var(--surface-1);
  color: var(--text-1);
  border-radius: 24px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 85%, transparent);
  box-shadow: 0 22px 56px rgba(10, 14, 28, 0.26);
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
  max-height: min(96vh, 1400px);
  min-height: 0;
}

.profile-card--two-column {
  width: min(100%, 1320px);
}

.profile-dialog--mobile .profile-card {
  border-radius: 0;
  height: 100%;
  max-height: none;
  min-height: 100%;
}

.profile-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  min-height: 0;
  height: 100%;
}

.profile-layout--two-column {
  grid-template-columns: minmax(320px, 420px) minmax(0, 1fr);
  grid-template-rows: 1fr;
  column-gap: clamp(32px, 5vw, 64px);
  align-items: stretch;
}

.profile-layout__hero {
  position: relative;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid color-mix(in srgb, var(--surface-contrast-border) 75%, transparent);
  min-height: 0;
}

.profile-layout__hero--desktop {
  border-bottom: none;
  border-right: 1px solid color-mix(in srgb, var(--surface-contrast-border) 75%, transparent);
}

.profile-layout__content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1 1 auto;
  height: 100%;
}

.profile-layout__content--desktop {
  padding-right: clamp(8px, 1.4vw, 18px);
}

.profile-layout__body {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: clamp(24px, 4vh, 40px) clamp(16px, 5vw, 56px);
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

.hero-rail {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
  border-bottom: 1px solid color-mix(in srgb, var(--surface-contrast-border) 78%, transparent);
}

.profile-layout__hero--desktop .hero-rail {
  border-bottom: none;
  height: 100%;
  overflow-y: auto;
  padding-right: clamp(8px, 1vw, 16px);
  scrollbar-gutter: stable;
}

.hero-panel {
  position: relative;
  padding: clamp(24px, 3.5vw, 32px) clamp(24px, 4vw, 34px) clamp(20px, 3vw, 28px);
  background: var(--surface-1);
  overflow: hidden;
  color: var(--text-1);
  border-bottom: 1px solid color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
}

.profile-layout__hero--desktop .hero-panel {
  border-bottom: none;
  min-height: 100%;
  padding: clamp(36px, 5vh, 56px) clamp(32px, 4vw, 48px);
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
  gap: clamp(16px, 2.4vw, 24px);
  flex-wrap: wrap;
  z-index: 1;
}

.profile-layout__hero--desktop .hero-layout {
  flex-direction: column;
  align-items: stretch;
  gap: clamp(18px, 2vw, 28px);
}

.hero-avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-1) 85%, var(--surface-2) 15%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
  box-shadow: 0 16px 30px rgba(9, 15, 28, 0.22);
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
  gap: clamp(10px, 1.6vw, 16px);
  flex: 1 1 260px;
  min-width: 0;
}

.hero-name {
  font-size: clamp(1.55rem, 1.3vw + 1.3rem, 2.2rem);
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--text-1);
}

.hero-handle {
  font-size: clamp(0.95rem, 0.4vw + 0.9rem, 1.1rem);
  font-weight: 650;
  color: color-mix(in srgb, var(--text-1) 92%, var(--text-2) 8%);
  letter-spacing: 0.045em;
}

.hero-about {
  color: color-mix(in srgb, var(--text-1) 96%, var(--text-2) 4%);
  font-weight: 500;
  letter-spacing: 0.01em;
  line-height: 1.5;
  white-space: pre-line;
}

.hero-about--clamped {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hero-about__toggle {
  display: flex;
  justify-content: flex-start;
}

.hero-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: clamp(16px, 2.4vw, 24px);
  width: 100%;
}

.hero-actions--inline {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  width: auto;
}

.action-button {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  font-weight: 600;
  padding: 10px 18px;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.hero-actions--inline .action-button {
  flex: 0 1 auto;
  width: auto;
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

.tiers-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
}


.tier-card {
  position: relative;
  border-radius: 18px;
  padding: 24px;
  background: color-mix(in srgb, var(--surface-1) 97%, var(--surface-2) 3%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 65%, transparent);
  box-shadow: 0 14px 28px rgba(9, 15, 28, 0.14);
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.tier-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--accent-500) 18%, transparent);
  opacity: 0;
  transition: opacity 0.2s ease;
}

.tier-card--focus {
  border-color: color-mix(in srgb, var(--accent-500) 55%, transparent);
  box-shadow: 0 18px 40px rgba(12, 20, 40, 0.22);
}

.tier-card--focus::before {
  opacity: 1;
}

.tier-card:hover,
.tier-card:focus-within {
  border-color: color-mix(in srgb, var(--accent-500) 42%, transparent);
  transform: translateY(-2px);
  box-shadow: 0 20px 46px rgba(10, 16, 32, 0.2);
}

.tier-card__content {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.tier-card__header {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  align-items: flex-start;
}

.tier-card__identity {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  flex: 1 1 220px;
}

.tier-card__name {
  position: relative;
  padding-left: 18px;
  line-height: 1.2;
}

.tier-card__name::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--accent-500);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent-500) 22%, transparent);
}

.tier-card__summary {
  color: color-mix(in srgb, var(--text-1) 86%, var(--text-2) 14%);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.tier-card__pricing {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  min-width: 120px;
}

.tier-card__price {
  font-size: 1.1rem;
}

.tier-card__cadence {
  color: var(--text-2);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.tier-card__perks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tier-card__perk-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent-500) 20%, transparent);
  background: color-mix(in srgb, var(--accent-200) 10%, var(--surface-1) 90%);
  color: color-mix(in srgb, var(--text-1) 94%, var(--text-2) 6%);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.tier-card__perk-icon {
  color: color-mix(in srgb, var(--accent-500) 80%, var(--accent-600) 20%);
}

.tier-card__extras {
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 65%, transparent);
  background: color-mix(in srgb, var(--surface-2) 88%, transparent);
  overflow: hidden;
}

.tier-card__extras[open] {
  box-shadow: 0 10px 24px rgba(10, 16, 32, 0.1);
}

.tier-card__extras-summary {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  font-weight: 600;
  color: color-mix(in srgb, var(--text-1) 92%, var(--text-2) 8%);
  list-style: none;
}

.tier-card__extras-summary::-webkit-details-marker {
  display: none;
}

.tier-card__extras-summary::after {
  content: '';
  width: 20px;
  height: 20px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-200) 20%, transparent);
  mask: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M7 10l5 5 5-5z"/></svg>') center / 16px 16px no-repeat;
  transition: transform 0.2s ease;
}

.tier-card__extras[open] .tier-card__extras-summary::after {
  transform: rotate(180deg);
}

.tier-card__extras-body {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 12px 16px 16px;
}

.tier-card__extra-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-1) 92%, var(--surface-2) 8%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 62%, transparent);
  color: color-mix(in srgb, var(--text-1) 90%, var(--text-2) 10%);
  font-weight: 600;
  letter-spacing: 0.01em;
}

.tier-card__extra-icon {
  color: color-mix(in srgb, var(--accent-500) 78%, var(--accent-600) 22%);
}

.tier-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.tier-card__subscribe {
  flex: 1 1 180px;
  min-width: 0;
  font-weight: 600;
  box-shadow: 0 16px 30px rgba(10, 16, 32, 0.2);
}

.tier-card__details-toggle {
  font-weight: 600;
  color: color-mix(in srgb, var(--accent-500) 90%, var(--accent-600) 10%);
}

.tier-card__details-toggle:focus-visible {
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-500) 28%, transparent);
  border-radius: 8px;
}

.tier-card__details {
  margin-top: -4px;
  padding: 16px 18px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 70%, transparent);
  background: color-mix(in srgb, var(--surface-1) 94%, var(--surface-2) 6%);
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--surface-1) 60%, transparent);
}

@media (min-width: 768px) {
  .profile-layout__body {
    padding: clamp(28px, 4vh, 44px) clamp(24px, 6vw, 60px);
  }

  .profile-layout--two-column .profile-layout__body {
    padding: clamp(32px, 4vh, 52px) clamp(36px, 6vw, 72px);
  }

  .tiers-grid {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  }

  .tier-card {
    padding: 28px;
  }

  .tier-card__content {
    gap: 22px;
  }

  .tier-card__actions {
    justify-content: flex-start;
  }

  .tier-card__subscribe {
    flex: 0 0 auto;
    min-width: 180px;
  }
}

@media (max-width: 599px) {

  .profile-layout__body {
    padding: 20px 16px 24px;
  }

  .hero-rail {
    border-bottom: 1px solid color-mix(in srgb, var(--surface-contrast-border) 75%, transparent);
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

  .tier-card {
    padding: 20px;
  }

  .tier-card__header {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .tier-card__pricing {
    align-items: flex-start;
  }

  .tier-card__actions {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .tier-card__subscribe {
    width: 100%;
  }

  .tier-card__details {
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
    gap: 10px;
    margin-top: 16px;
  }

  .hero-actions .action-button {
    width: 100%;
  }

  .close-btn {
    top: 12px;
    right: 12px;
  }
}

@media (min-width: 1024px) {
  .profile-dialog__inner {
    padding: clamp(20px, 5vh, 48px) clamp(28px, 6vw, 96px);
  }

  .profile-layout--two-column {
    column-gap: clamp(40px, 4vw, 72px);
  }

  .profile-layout__hero--desktop .hero-rail {
    padding-right: clamp(12px, 1.6vw, 24px);
  }

  .profile-layout__hero--desktop .hero-panel {
    padding: clamp(40px, 6vh, 64px) clamp(36px, 4vw, 56px);
  }

  .hero-meta {
    gap: clamp(16px, 2vw, 24px);
  }

  .hero-actions--inline {
    flex-wrap: nowrap;
    gap: 18px;
    margin-top: 24px;
  }

  .hero-actions--inline .action-button {
    flex: 1 1 180px;
  }

  .profile-layout--two-column .profile-layout__body {
    padding: clamp(36px, 5vh, 56px) clamp(44px, 6vw, 84px);
  }

  .tiers-section {
    padding: 0;
    gap: 24px;
  }

  .tiers-grid {
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 24px;
  }

  .tier-card__pricing {
    align-items: flex-end;
  }

  .tier-card__actions {
    gap: 16px;
  }

  .empty-state {
    padding: 32px 48px;
  }
}

@media (min-width: 1280px) {
  .profile-layout--two-column {
    column-gap: clamp(48px, 4vw, 88px);
  }

  .hero-actions--inline .action-button {
    flex: 1 1 200px;
  }
}
</style>
