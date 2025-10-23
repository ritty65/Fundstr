<template>
  <q-page class="fundstr-supporters q-pa-xl-xl q-pa-lg-md q-pa-md bg-surface-1 text-1">
    <CreatorProfileModal
      :show="showProfileModal"
      :pubkey="selectedProfilePubkey"
      @close="showProfileModal = false"
      @message="startChat"
      @donate="donate"
    />
    <DonateDialog v-model="showDonateDialog" :creator-pubkey="selectedPubkey" @confirm="handleDonate" />
    <SendTokenDialog />

    <div class="hero text-center q-mx-auto">
      <h1 class="text-h3 text-bold q-mb-md">Fundstr Supporters</h1>
      <p class="text-subtitle1 text-2 q-mb-xl">
        These Nostr public keys belong to early supporters and donors who help Fundstr grow.
        We are grateful for their contributions to privacy-preserving creator tools.
      </p>
      <div v-if="tierLoading || showTierWidget" class="fundstr-tier-widget q-mt-xl">
        <div class="fundstr-tier-widget__header">
          <h2 class="text-h5 text-weight-medium q-mb-xs">
            {{ t('FundstrSupportersPage.tiers.title') }}
          </h2>
          <p class="text-body2 text-2 q-mb-md">
            {{ t('FundstrSupportersPage.tiers.subtitle') }}
          </p>
        </div>
        <div v-if="tierLoading" class="fundstr-tier-widget__skeletons">
          <q-skeleton
            v-for="placeholder in tierSkeletons"
            :key="placeholder"
            type="rect"
            class="fundstr-tier-widget__skeleton bg-surface-2"
          />
        </div>
        <div v-else-if="showTierWidget" class="fundstr-tier-widget__grid">
          <div v-for="tier in supportTierCards" :key="tier.id" class="fundstr-tier-widget__card bg-surface-2 text-1">
            <div class="fundstr-tier-widget__card-header">
              <div class="fundstr-tier-widget__title">{{ tier.title }}</div>
              <div class="fundstr-tier-widget__price">{{ tier.priceLabel }}</div>
            </div>
            <ul v-if="tier.perks.length" class="fundstr-tier-widget__perks text-2">
              <li v-for="(perk, index) in tier.perks" :key="`${tier.id}-perk-${index}`">{{ perk }}</li>
            </ul>
            <p v-else-if="tier.description" class="fundstr-tier-widget__description text-2">
              {{ tier.description }}
            </p>
            <q-btn
              color="accent"
              unelevated
              class="fundstr-tier-widget__cta"
              :label="t('FundstrSupportersPage.tiers.supportCta')"
              no-caps
              @click="supportFundstr"
            />
          </div>
        </div>
      </div>
      <div v-if="canShowSupportCta" class="q-mt-md">
        <q-btn color="primary" unelevated @click="supportFundstr">Want to support?</q-btn>
      </div>
    </div>

    <section class="supporters-section">
      <div v-if="loadingSupporters" class="row q-col-gutter-lg" aria-label="Loading supporters">
        <div
          v-for="placeholder in skeletonPlaceholders"
          :key="placeholder"
          class="col-12 col-sm-6 col-lg-4"
        >
          <q-skeleton type="rect" class="supporter-skeleton bg-surface-2" />
        </div>
      </div>

      <q-banner
        v-else-if="supportersError"
        rounded
        dense
        class="status-banner text-1"
        role="status"
        aria-live="polite"
      >
        <template #avatar>
          <q-icon name="warning" size="20px" />
        </template>
        <span class="status-banner__text">{{ supportersError }}</span>
      </q-banner>

      <template v-else>
        <q-banner
          v-if="supportersWarnings.length"
          rounded
          dense
          class="status-banner text-1 q-mb-lg"
          role="status"
          aria-live="polite"
        >
          <template #avatar>
            <q-icon name="info" size="20px" />
          </template>
          <div class="column">
            <span v-for="(warning, index) in supportersWarnings" :key="index" class="status-banner__text">
              {{ warning }}
            </span>
          </div>
        </q-banner>

        <div v-if="supporterProfiles.length" class="supporters-grid">
          <CreatorCard
            v-for="profile in supporterProfiles"
            :key="profile.pubkey"
            :profile="profile"
            featured
            @view-tiers="viewProfile"
            @message="startChat"
            @donate="donate"
          />
        </div>

        <div
          v-else
          class="empty-state column items-center text-center q-pt-xl q-pb-xl q-px-md text-2"
        >
          <q-icon name="favorite" size="4rem" class="q-mb-md text-accent-500" aria-hidden="true" />
          <div class="text-h6 text-1">Supporter profiles coming soon</div>
          <p class="text-body1 q-mt-sm q-mb-none">
            We&apos;re fetching supporter data from the discovery service. Please check back shortly.
          </p>
        </div>
      </template>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { nip19, type Event as NostrEvent } from 'nostr-tools';
import { useLocalStorage } from '@vueuse/core';
import CreatorProfileModal from 'components/CreatorProfileModal.vue';
import CreatorCard from 'components/CreatorCard.vue';
import DonateDialog from 'components/DonateDialog.vue';
import SendTokenDialog from 'components/SendTokenDialog.vue';
import { createFundstrDiscoveryClient } from 'src/api/fundstrDiscovery';
import type { Creator } from 'src/lib/fundstrApi';
import { SUPPORTERS } from 'src/data/supporters';
import { useRouter } from 'vue-router';
import { useSendTokensStore } from 'stores/sendTokensStore';
import { useDonationPresetsStore } from 'stores/donationPresets';
import { fetchNutzapProfile, useNostrStore } from 'stores/nostr';
import { useDonationPrompt } from '@/composables/useDonationPrompt';
import { queryNutzapTiers } from '@/nostr/relayClient';
import { FUNDSTR_REQ_URL, FUNDSTR_WS_URL, WS_FIRST_TIMEOUT_MS } from '@/nutzap/relayEndpoints';
import { useI18n } from 'vue-i18n';

const discoveryClient = createFundstrDiscoveryClient();
const router = useRouter();
const sendTokensStore = useSendTokensStore();
const donationStore = useDonationPresetsStore();
const nostr = useNostrStore();
const { open: openDonationPrompt, hasPaymentRails } = useDonationPrompt();
const canShowSupportCta = hasPaymentRails;
const { t, locale } = useI18n();

type TierFrequency = 'monthly' | 'yearly' | 'one_time';

interface SupportTier {
  id: string;
  title: string;
  priceSats: number;
  frequency: TierFrequency;
  description: string;
  perks: string[];
}

interface SupportTierCardView extends SupportTier {
  priceLabel: string;
}

interface CachedNutzapProfile {
  hexPub: string;
  p2pkPubkey: string;
  trustedMints: string[];
  relays?: string[];
  tierAddr?: string;
}

interface NutzapProfileCacheRecord {
  profile: CachedNutzapProfile | null;
  fetchedAt: number;
}

interface PersistedNutzapProfileCache {
  version: number;
  entries: Record<string, NutzapProfileCacheRecord>;
}

const FUNDSTR_SUPPORT_NPUB = 'npub1aljmhjp5tqrw3m60ra7t3u8uqq223d6rdg9q0h76a8djd9m4hmvsmlj82m';

const fundstrSupportHex = computed(() => decodeNpubToHex(FUNDSTR_SUPPORT_NPUB));

const nutzapProfileCache =
  typeof window === 'undefined'
    ? ref<PersistedNutzapProfileCache>({ version: 1, entries: {} })
    : useLocalStorage<PersistedNutzapProfileCache>('cashu.ndk.nutzapProfileCache', {
        version: 1,
        entries: {},
      });

const supportTiers = ref<SupportTier[]>([]);
const tierLoading = ref(false);
const lastProfileFetchedAt = ref<number | null>(null);
const tierRequestReady = ref(false);
let activeTierRequestId = 0;

const priceFormatter = computed(
  () => new Intl.NumberFormat(locale.value || undefined, { maximumFractionDigits: 0 }),
);

const supportTierCards = computed<SupportTierCardView[]>(() =>
  supportTiers.value.map((tier) => ({
    ...tier,
    priceLabel: t('FundstrSupportersPage.tiers.priceWithFrequency', {
      price: priceFormatter.value.format(tier.priceSats),
      frequency: t(`FundstrSupportersPage.tiers.frequency.${tier.frequency}`),
    }),
  })),
);

const showTierWidget = computed(() => supportTierCards.value.length > 0);

const tierSkeletons = computed(() => {
  const count = supportTierCards.value.length || 3;
  return Array.from({ length: count }, (_, index) => index);
});

const loadingSupporters = ref(false);
const supportersError = ref('');
const supportersWarnings = ref<string[]>([]);
const supporterProfiles = ref<Creator[]>([]);

const supporterNpubs = computed(() =>
  SUPPORTERS.map((supporter) => supporter.npub).filter((npub) => typeof npub === 'string' && npub.trim().length > 0),
);

const skeletonPlaceholders = computed(() => {
  const count = supporterNpubs.value.length || 3;
  return Array.from({ length: count }, (_, index) => index);
});

onMounted(() => {
  void loadSupporterProfiles();
  void initializeFundstrTiers();
});

watch(
  () => {
    const hex = fundstrSupportHex.value;
    if (!hex) {
      return null;
    }
    const entry = nutzapProfileCache.value.entries?.[hex];
    return entry?.fetchedAt ?? null;
  },
  (fetchedAt) => {
    if (!tierRequestReady.value) {
      if (typeof fetchedAt === 'number') {
        lastProfileFetchedAt.value = fetchedAt;
      }
      return;
    }
    if (typeof fetchedAt === 'number' && fetchedAt === lastProfileFetchedAt.value) {
      return;
    }
    lastProfileFetchedAt.value = fetchedAt ?? null;
    void loadFundstrSupportTiers();
  },
);

async function initializeFundstrTiers() {
  try {
    await loadFundstrSupportTiers();
  } finally {
    tierRequestReady.value = true;
  }
}

function getFundstrProfileEntry(): NutzapProfileCacheRecord | undefined {
  const hex = fundstrSupportHex.value;
  if (!hex) {
    return undefined;
  }
  const entries = nutzapProfileCache.value.entries ?? {};
  return entries[hex];
}

function normalizeSupportTier(raw: unknown, index: number): SupportTier | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const candidate = raw as Record<string, unknown>;
  const idSource = [candidate.id, candidate.identifier, candidate.slug]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find((value) => value.length > 0);
  const nameSource = [candidate.title, candidate.name]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find((value) => value.length > 0);
  const title = nameSource ?? '';
  if (!title) {
    return null;
  }
  const priceSource =
    candidate.price ?? candidate.price_sats ?? candidate.priceSats ?? candidate.amount ?? 0;
  const priceNumber = Number(priceSource);
  const priceSats = Number.isFinite(priceNumber) ? Math.max(0, Math.round(priceNumber)) : 0;
  const rawFrequency =
    typeof candidate.frequency === 'string' ? candidate.frequency.trim().toLowerCase() : '';
  const normalizedFrequency = (() => {
    if (rawFrequency === 'one-time' || rawFrequency === 'one time') {
      return 'one_time';
    }
    if (rawFrequency === 'yearly') {
      return 'yearly';
    }
    if (rawFrequency === 'one_time' || rawFrequency === 'monthly') {
      return rawFrequency as TierFrequency;
    }
    return 'monthly' as const;
  })();
  const description =
    typeof candidate.description === 'string' ? candidate.description.trim() : '';
  const benefitSource = Array.isArray(candidate.benefits)
    ? candidate.benefits
    : Array.isArray(candidate.perks)
      ? candidate.perks
      : [];
  let perks = Array.isArray(benefitSource)
    ? benefitSource
        .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter((entry) => entry.length > 0)
    : [];
  if (!perks.length && description) {
    const lines = description
      .split(/\r?\n+/)
      .map((line) => line.replace(/^[\-\*\u2022]\s*/, '').trim())
      .filter((line) => line.length > 0);
    if (lines.length > 1) {
      perks = lines;
    }
  }
  const id = idSource && idSource.length > 0 ? idSource : `tier-${index}`;
  return {
    id,
    title,
    priceSats,
    frequency: normalizedFrequency,
    description,
    perks,
  };
}

function parseTierEvent(event: NostrEvent | null): SupportTier[] {
  if (!event || typeof event.content !== 'string') {
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.content);
  } catch (error) {
    console.warn('[supporters] Unable to parse tier JSON', error);
    return [];
  }
  if (!Array.isArray(parsed)) {
    return [];
  }
  const seen = new Set<string>();
  const tiers = parsed
    .map((entry, index) => normalizeSupportTier(entry, index))
    .filter((tier): tier is SupportTier => tier !== null)
    .filter((tier) => {
      if (seen.has(tier.id)) {
        return false;
      }
      seen.add(tier.id);
      return true;
    })
    .sort((a, b) => a.priceSats - b.priceSats);
  return tiers;
}

async function loadFundstrSupportTiers(): Promise<void> {
  const hex = fundstrSupportHex.value;
  if (!hex) {
    supportTiers.value = [];
    return;
  }
  const requestId = ++activeTierRequestId;
  tierLoading.value = true;
  try {
    let profileEntry = getFundstrProfileEntry();
    let profile = profileEntry?.profile ?? null;
    if (!profile) {
      profile = await fetchNutzapProfile(FUNDSTR_SUPPORT_NPUB, { fundstrOnly: true });
      profileEntry = getFundstrProfileEntry();
    }
    if (!profile || !profile.tierAddr) {
      if (requestId === activeTierRequestId) {
        supportTiers.value = [];
      }
      return;
    }
    const tierEvent = await queryNutzapTiers(profile.hexPub ?? hex, {
      fanout: Array.isArray(profile.relays) ? profile.relays : undefined,
      httpBase: FUNDSTR_REQ_URL,
      fundstrWsUrl: FUNDSTR_WS_URL,
      wsTimeoutMs: Math.min(WS_FIRST_TIMEOUT_MS, 1200),
      allowFanoutFallback: true,
    });
    const tiers = parseTierEvent(tierEvent);
    if (requestId === activeTierRequestId) {
      supportTiers.value = tiers;
    }
  } catch (error) {
    console.warn('[supporters] Failed to load Fundstr tiers', error);
    if (requestId === activeTierRequestId) {
      supportTiers.value = [];
    }
  } finally {
    if (requestId === activeTierRequestId) {
      tierLoading.value = false;
      const entry = getFundstrProfileEntry();
      lastProfileFetchedAt.value = entry?.fetchedAt ?? lastProfileFetchedAt.value;
    }
  }
}

async function loadSupporterProfiles() {
  if (!supporterNpubs.value.length) {
    supporterProfiles.value = [];
    return;
  }

  loadingSupporters.value = true;
  supportersError.value = '';
  supportersWarnings.value = [];

  try {
    const response = await discoveryClient.getCreatorsByPubkeys({
      npubs: supporterNpubs.value,
      fresh: false,
      swr: true,
    });

    const results = Array.isArray(response.results) ? response.results : [];
    const warnings = Array.isArray(response.warnings)
      ? response.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
      : [];
    supportersWarnings.value = warnings;

    const profilesByHex = new Map<string, Creator>();
    for (const creator of results) {
      if (!creator || typeof creator.pubkey !== 'string') {
        continue;
      }
      const normalizedPubkey = creator.pubkey.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/i.test(normalizedPubkey)) {
        continue;
      }
      profilesByHex.set(normalizedPubkey, { ...creator, featured: true });
    }

    const resolvedProfiles: Creator[] = [];
    for (const npub of supporterNpubs.value) {
      const hex = decodeNpubToHex(npub);
      if (!hex) {
        continue;
      }
      const profile = profilesByHex.get(hex);
      if (profile) {
        resolvedProfiles.push(profile);
      }
    }

    supporterProfiles.value = resolvedProfiles;
  } catch (error) {
    console.error('[supporters] Failed to load supporter profiles', error);
    supportersError.value =
      error instanceof Error && error.message
        ? error.message
        : 'Unable to load supporter profiles right now. Please try again later.';
  } finally {
    loadingSupporters.value = false;
  }
}

function decodeNpubToHex(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return '';
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.data instanceof Uint8Array) {
      return Array.from(decoded.data)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .toLowerCase();
    }
    if (typeof decoded.data === 'string') {
      return decoded.data.toLowerCase();
    }
    if (decoded.data && typeof (decoded.data as any).pubkey === 'string') {
      return String((decoded.data as any).pubkey).toLowerCase();
    }
  } catch (error) {
    console.warn('[supporters] Unable to decode npub', { identifier, error });
  }
  return '';
}

const showDonateDialog = ref(false);
const selectedPubkey = ref('');
const showProfileModal = ref(false);
const selectedProfilePubkey = ref('');

function viewProfile(pubkey: string) {
  selectedProfilePubkey.value = pubkey;
  showProfileModal.value = true;
}

function startChat(pubkey: string) {
  const resolvedPubkey = nostr.resolvePubkey(pubkey);
  const url = router.resolve({ path: '/nostr-messenger', query: { pubkey: resolvedPubkey } }).href;
  window.open(url, '_blank');
}

function donate(pubkey: string) {
  selectedPubkey.value = pubkey;
  showDonateDialog.value = true;
}

function supportFundstr() {
  const opened = openDonationPrompt({ bypassGate: true });
  console.info('[supporters] Want to support CTA clicked', { opened });
}

function handleDonate({
  bucketId,
  locked,
  type,
  amount,
  periods,
  message,
}: any) {
  if (!selectedPubkey.value) return;
  if (type === 'one-time') {
    sendTokensStore.clearSendData();
    sendTokensStore.recipientPubkey = selectedPubkey.value;
    sendTokensStore.sendViaNostr = true;
    sendTokensStore.sendData.bucketId = bucketId;
    sendTokensStore.sendData.amount = amount;
    sendTokensStore.sendData.memo = message;
    sendTokensStore.sendData.p2pkPubkey = locked ? selectedPubkey.value : '';
    sendTokensStore.showLockInput = locked;
    sendTokensStore.showSendTokens = true;
  } else {
    donationStore.createDonationPreset(periods, amount, selectedPubkey.value, bucketId);
    donationStore.showCreatePresetDialog = true;
  }
  showDonateDialog.value = false;
}
</script>

<style scoped>
.fundstr-supporters {
  max-width: 1100px;
  margin: 0 auto;
}

.hero p {
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}

.fundstr-tier-widget {
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 20px;
  background-color: var(--surface-2);
  padding: 24px;
  text-align: left;
}

.hero .fundstr-tier-widget {
  margin-left: auto;
  margin-right: auto;
  max-width: 900px;
}

.fundstr-tier-widget__header {
  text-align: left;
}

.fundstr-tier-widget__grid,
.fundstr-tier-widget__skeletons {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.fundstr-tier-widget__skeleton {
  height: 220px;
  border-radius: 16px;
}

.fundstr-tier-widget__card {
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fundstr-tier-widget__card-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fundstr-tier-widget__title {
  font-size: 1.05rem;
  font-weight: 600;
}

.fundstr-tier-widget__price {
  font-size: 0.95rem;
  color: var(--text-2);
}

.fundstr-tier-widget__perks {
  margin: 0;
  padding-left: 18px;
  list-style-type: disc;
}

.fundstr-tier-widget__perks li + li {
  margin-top: 4px;
}

.fundstr-tier-widget__description {
  margin: 0;
}

.fundstr-tier-widget__cta {
  margin-top: auto;
  align-self: flex-start;
}

@media (max-width: 599px) {
  .fundstr-tier-widget {
    padding: 20px;
  }

  .fundstr-tier-widget__card {
    padding: 16px;
  }

  .fundstr-tier-widget__header {
    text-align: center;
  }

  .fundstr-tier-widget__grid,
  .fundstr-tier-widget__skeletons {
    grid-template-columns: 1fr;
  }

  .fundstr-tier-widget__cta {
    align-self: stretch;
  }
}

.supporters-section {
  margin-top: 48px;
}

.supporters-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.supporter-skeleton {
  height: 320px;
  border-radius: 16px;
}

.empty-state {
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background-color: var(--surface-2);
}

.status-banner {
  background-color: var(--surface-2);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 12px 16px;
}

.status-banner__text {
  line-height: 1.4;
}
</style>
