<template>
  <QPage class="find-creators-page bg-surface-1 text-1">
    <NostrRelayErrorBanner />
    <div class="find-creators-page__inner">
      <section class="find-creators-search bg-surface-2">
        <header class="find-creators-search__header">
          <h1 class="find-creators-search__title text-h5">
            {{ $t('FindCreators.headings.search') }}
          </h1>
          <p class="find-creators-search__hint text-2">
            {{ $t('FindCreators.inputs.search.tooltip') }}
          </p>
        </header>
        <div class="find-creators-search__controls">
          <QInput
            v-model="searchQuery"
            dense
            outlined
            clearable
            class="find-creators-search__input"
            :placeholder="$t('FindCreators.inputs.search.placeholder')"
            @keyup.enter="submitSearch"
            @clear="clearSearch"
          >
            <template #append>
              <QBtn
                icon="search"
                color="primary"
                round
                dense
                flat
                :aria-label="$t('FindCreators.inputs.search.tooltip')"
                @click="submitSearch"
              />
            </template>
          </QInput>
          <div class="find-creators-search__actions">
            <QBtn
              v-if="!showingFeatured && (searchQuery || creators.searchResults.length)"
              flat
              dense
              color="primary"
              class="find-creators-search__action"
              @click="clearSearch"
            >
              {{ $t('FindCreators.actions.back_to_search.label') }}
            </QBtn>
            <QBtn
              v-if="showingFeatured"
              flat
              dense
              color="primary"
              class="find-creators-search__action"
              @click="reloadFeatured"
            >
              {{ $t('FindCreators.actions.load_featured.label') }}
            </QBtn>
          </div>
        </div>
      </section>

      <section class="find-creators-results">
        <header class="find-creators-results__header">
          <h2 class="find-creators-results__title text-h6">
            {{ showingFeatured ? $t('FindCreators.headings.featured') : $t('FindCreators.headings.results') }}
          </h2>
          <QBtn
            v-if="!showingFeatured && (searchQuery || creators.searchResults.length)"
            flat
            dense
            color="primary"
            class="find-creators-results__reset"
            @click="clearSearch"
          >
            {{ $t('FindCreators.actions.back_to_search.label') }}
          </QBtn>
        </header>

        <div v-if="creators.searching" class="find-creators-results__state">
          <q-spinner-hourglass size="28px" class="find-creators-results__spinner" />
          <p class="text-2">
            {{
              showingFeatured
                ? $t('FindCreators.states.loadingFeatured')
                : $t('FindCreators.states.loadingResults')
            }}
          </p>
        </div>

        <q-banner
          v-else-if="searchError"
          class="find-creators-results__banner bg-negative text-white"
          rounded
        >
          {{ searchError }}
        </q-banner>

        <div v-else-if="!creators.searchResults.length" class="find-creators-results__state text-2">
          <p>{{ $t('FindCreators.states.noResults') }}</p>
          <QBtn v-if="!showingFeatured" flat color="primary" @click="clearSearch">
            {{ $t('FindCreators.actions.load_featured.label') }}
          </QBtn>
        </div>

        <div v-else class="find-creators-grid">
          <article
            v-for="creator in creators.searchResults"
            :key="creator.pubkey"
            class="creator-card bg-surface-2"
          >
            <div class="creator-card__header">
              <div class="creator-card__avatar">
                <img
                  v-if="creatorAvatar(creator)"
                  :src="creatorAvatar(creator)"
                  :alt="creatorDisplayName(creator)"
                />
                <div v-else class="creator-card__avatar-fallback">
                  {{ creatorInitial(creator) }}
                </div>
              </div>
              <div class="creator-card__identity">
                <h3 class="creator-card__name text-h6">{{ creatorDisplayName(creator) }}</h3>
                <p v-if="creatorHandle(creator)" class="creator-card__handle text-2">
                  @{{ creatorHandle(creator) }}
                </p>
                <p v-if="creatorNip05(creator)" class="creator-card__nip05 text-2">
                  {{ creatorNip05(creator) }}
                </p>
              </div>
            </div>
            <p v-if="creatorAbout(creator)" class="creator-card__about text-2">
              {{ creatorAbout(creator) }}
            </p>
            <ul class="creator-card__stats text-2">
              <li v-if="creator.followers !== null">
                <span class="creator-card__stat-label">{{ $t('FindCreators.labels.followers') }}</span>
                <span class="creator-card__stat-value">{{ formatNumber(creator.followers) }}</span>
              </li>
              <li v-if="creator.following !== null">
                <span class="creator-card__stat-label">{{ $t('FindCreators.labels.following') }}</span>
                <span class="creator-card__stat-value">{{ formatNumber(creator.following) }}</span>
              </li>
              <li v-if="creator.joined">
                <span class="creator-card__stat-label">{{ $t('FindCreators.labels.joined') }}</span>
                <span class="creator-card__stat-value">{{ formatJoined(creator.joined) }}</span>
              </li>
            </ul>
            <div class="creator-card__actions">
              <QBtn
                color="primary"
                unelevated
                class="creator-card__action"
                :label="$t('CreatorHub.profile.subscribeCta')"
                @click="openSubscriptionDialog(creator.pubkey)"
              />
              <QBtn
                outline
                color="primary"
                class="creator-card__action"
                :label="$t('FindCreators.actions.donate.label')"
                @click="openDonateDialog(creator.pubkey)"
              />
              <QBtn
                outline
                color="primary"
                class="creator-card__action"
                :label="$t('FindCreators.actions.message.label')"
                @click="startChatWithCreator(creator.pubkey)"
              />
              <QBtn
                flat
                color="primary"
                class="creator-card__action creator-card__action--view"
                :label="$t('FindCreators.actions.view_profile.label')"
                @click="goToProfile(creator.pubkey)"
              />
            </div>
          </article>
        </div>
      </section>
    </div>

    <DonateDialog v-model="showDonateDialog" @confirm="handleDonate" />
    <SubscribeDialog
      v-model="showSubscribeDialog"
      :tier="selectedTier"
      :supporter-pubkey="nostr.pubkey"
      :creator-pubkey="dialogNpub"
      @confirm="confirmSubscribe"
    />
    <SendTokenDialog />
    <QDialog v-model="showTierDialog">
      <QCard class="tier-dialog">
        <QCardSection class="tier-dialog__top">
          <div class="tier-dialog__hero">
            <div class="tier-dialog__identity">
              <div class="tier-dialog__avatar">
                <img
                  v-if="heroAvatarUrl"
                  :src="heroAvatarUrl"
                  :alt="`${heroTitle} avatar`"
                  class="tier-dialog__avatar-image"
                />
                <div v-else class="tier-dialog__avatar-fallback">
                  {{ heroInitial }}
                </div>
              </div>
              <div class="tier-dialog__meta">
                <div class="tier-dialog__title text-1">{{ heroTitle }}</div>
                <div v-if="heroAbout" class="tier-dialog__subtitle text-2">
                  {{ heroAbout }}
                </div>
              </div>
            </div>
            <div class="tier-dialog__actions">
              <QBtn
                color="primary"
                unelevated
                class="tier-dialog__cta"
                label="Subscribe"
                :disable="!canSubscribe"
                @click="openHeroSubscribe"
              />
              <QBtn
                outline
                color="primary"
                class="tier-dialog__cta"
                icon="volunteer_activism"
                label="Donate"
                :disable="!dialogPubkey"
                @click="openHeroDonate"
              />
              <QBtn
                outline
                color="primary"
                class="tier-dialog__cta"
                icon="chat"
                label="Message"
                :disable="!dialogPubkey"
                @click="startChatWithCreator(dialogPubkey)"
              />
              <QBtn
                dense
                flat
                round
                icon="close"
                class="tier-dialog__close"
                @click="showTierDialog = false"
              />
            </div>
          </div>
        </QCardSection>
        <QSeparator />
        <QCardSection class="tier-dialog__body">
          <div class="tier-dialog__grid">
            <section class="tier-dialog__column tier-dialog__column--primary">
              <div class="section-header">
                <div>
                  <h3 class="section-title">Subscription tiers</h3>
                  <p class="section-caption text-2">
                    Choose a tier that matches your support cadence.
                  </p>
                </div>
              </div>
              <NutzapExplainer
                class="tier-dialog__explainer"
                :is-guest="isGuest"
                @start-onboarding="goToWelcome"
              />
              <div class="tier-list">
                <div
                  v-if="loadingTiers"
                  class="tier-list__state tier-list__state--loading"
                >
                  <q-spinner-hourglass size="24px" />
                  <div class="text-caption text-2">Loading tiers…</div>
                </div>
                <div
                  v-else-if="tierFetchError"
                  class="tier-list__state tier-list__state--error"
                >
                  <QBanner
                    class="full-width"
                    dense
                    rounded
                    color="negative"
                    text-color="white"
                    icon="warning"
                  >
                    We couldn't load subscription tiers. Please check your connection and try again.
                  </QBanner>
                  <QBtn flat color="primary" label="Retry" @click="retryFetchTiers" />
                </div>
                <div
                  v-else-if="!tiers.length"
                  class="tier-list__state tier-list__state--empty"
                >
                  <div class="text-1">Creator has no subscription tiers yet.</div>
                  <QBtn flat color="primary" label="Retry" @click="retryFetchTiers" />
                </div>
                <div v-else class="tier-card-grid">
                  <TierSummaryCard
                    v-for="t in tiers"
                    :key="t.id"
                    :tier="t"
                    :price-sats="getPrice(t)"
                    :price-fiat="formatFiat(getPrice(t))"
                    :frequency-label="frequencyLabel(t)"
                    subscribe-label="Subscribe"
                    @subscribe="openSubscribe"
                  />
                </div>
              </div>
            </section>
            <aside class="tier-dialog__column tier-dialog__column--secondary">
              <section v-if="highlightBenefits.length" class="info-panel">
                <h3 class="section-title">Benefit highlights</h3>
                <ul class="benefit-list">
                  <li
                    v-for="benefit in highlightBenefits"
                    :key="benefit"
                    class="benefit-list__item"
                  >
                    {{ benefit }}
                  </li>
                </ul>
              </section>
              <section class="info-panel">
                <div class="info-panel__header">
                  <h3 class="section-title">Infrastructure trust</h3>
                  <q-spinner-hourglass
                    v-if="loadingProfile"
                    size="18px"
                    class="info-panel__spinner"
                  />
                </div>
                <div v-if="nutzapProfile" class="info-panel__body">
                  <div v-if="nutzapProfile.p2pkPubkey" class="info-subsection">
                    <div class="info-subsection__label text-2">
                      <span>{{ $t('CreatorHub.profile.p2pkLabel') }}</span>
                      <q-btn
                        flat
                        dense
                        round
                        size="sm"
                        class="info-subsection__info-btn"
                        icon="info"
                        :aria-label="$t('FindCreators.explainers.tooltips.p2pk')"
                      >
                        <q-tooltip anchor="top middle" self="bottom middle">
                          {{ $t('FindCreators.explainers.tooltips.p2pk') }}
                        </q-tooltip>
                      </q-btn>
                    </div>
                    <code class="info-subsection__value">{{ nutzapProfile.p2pkPubkey }}</code>
                  </div>
                  <div class="info-subsection">
                    <div class="info-subsection__label text-2">
                      <span>{{ $t('CreatorHub.profile.trustedMintsLabel') }}</span>
                      <q-btn
                        flat
                        dense
                        round
                        size="sm"
                        class="info-subsection__info-btn"
                        icon="info"
                        :aria-label="$t('FindCreators.explainers.tooltips.trustedMints')"
                      >
                        <q-tooltip anchor="top middle" self="bottom middle">
                          {{ $t('FindCreators.explainers.tooltips.trustedMints') }}
                        </q-tooltip>
                      </q-btn>
                    </div>
                    <MintSafetyList :mints="nutzapProfile.trustedMints" />
                  </div>
                  <div class="info-subsection">
                    <div class="info-subsection__label text-2">
                      <span>{{ $t('CreatorHub.profile.relaysLabel') }}</span>
                      <q-btn
                        flat
                        dense
                        round
                        size="sm"
                        class="info-subsection__info-btn"
                        icon="info"
                        :aria-label="$t('FindCreators.explainers.tooltips.relays')"
                      >
                        <q-tooltip anchor="top middle" self="bottom middle">
                          {{ $t('FindCreators.explainers.tooltips.relays') }}
                        </q-tooltip>
                      </q-btn>
                    </div>
                    <RelayBadgeList :relays="nutzapProfile.relays" />
                  </div>
                </div>
                <div
                  v-else-if="loadingProfile"
                  class="info-panel__body info-panel__body--state text-2"
                >
                  Loading infrastructure…
                </div>
                <div
                  v-else
                  class="info-panel__body info-panel__body--state text-2"
                >
                  Creator hasn't published infrastructure details yet.
                </div>
              </section>
            </aside>
          </div>
        </QCardSection>
      </QCard>
    </QDialog>
  </QPage>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { nip19 } from 'nostr-tools';
import DonateDialog from 'components/DonateDialog.vue';
import SubscribeDialog from 'components/SubscribeDialog.vue';
import SendTokenDialog from 'components/SendTokenDialog.vue';
import NostrRelayErrorBanner from 'components/NostrRelayErrorBanner.vue';
import MintSafetyList from 'components/MintSafetyList.vue';
import RelayBadgeList from 'components/RelayBadgeList.vue';
import NutzapExplainer from 'components/NutzapExplainer.vue';
import TierSummaryCard from 'components/TierSummaryCard.vue';
import { useSendTokensStore } from 'stores/sendTokensStore';
import { useDonationPresetsStore } from 'stores/donationPresets';
import { useCreatorsStore } from 'stores/creators';
import { useNostrStore } from 'stores/nostr';
import { useMessengerStore } from 'stores/messenger';
import {
  QBanner,
  QBtn,
  QCard,
  QCardSection,
  QDialog,
  QInput,
  QPage,
  QSeparator,
  QTooltip,
} from 'quasar';
import { queryNutzapProfile, toHex } from '@/nostr/relayClient';
import type { NostrEvent } from '@/nostr/relayClient';
import { fallbackDiscoverRelays } from '@/nostr/discovery';
import { WS_FIRST_TIMEOUT_MS } from '@/nutzap/relayEndpoints';
import {
  parseNutzapProfileEvent,
  type NutzapProfileDetails,
} from '@/nutzap/profileCache';
import type { CreatorProfile } from 'stores/creators';
import { usePriceStore } from 'stores/price';
import { useUiStore } from 'stores/ui';
import { useWelcomeStore } from 'stores/welcome';
import {
  daysToFrequency,
  type SubscriptionFrequency,
} from 'src/constants/subscriptionFrequency';
import { isTrustedUrl } from 'src/utils/sanitize-url';

const sendTokensStore = useSendTokensStore();
const donationStore = useDonationPresetsStore();
const creators = useCreatorsStore();
const nostr = useNostrStore();
const messenger = useMessengerStore();
const router = useRouter();
const route = useRoute();
const priceStore = usePriceStore();
const uiStore = useUiStore();
const welcomeStore = useWelcomeStore();

const searchQuery = ref('');
const showingFeatured = ref(false);
const searchError = computed(() => creators.error);

const showDonateDialog = ref(false);
const selectedPubkey = ref('');
const showTierDialog = ref(false);
const loadingTiers = ref(false);
const dialogPubkey = ref('');
const dialogNpub = computed(() => {
  const hex = dialogPubkey.value;
  if (hex.length === 64 && /^[0-9a-f]{64}$/i.test(hex)) {
    return nip19.npubEncode(hex);
  }
  return '';
});

const showSubscribeDialog = ref(false);
const selectedTier = ref<any>(null);
const nutzapProfile = ref<NutzapProfileDetails | null>(null);
const loadingProfile = ref(false);
const lastRelayHints = ref<string[]>([]);
const tiers = computed(() => creators.tiersMap[dialogPubkey.value] || []);
const tierFetchError = computed(() => creators.tierFetchError);
const isGuest = computed(() => !welcomeStore.welcomeCompleted);
let tierTimeout: ReturnType<typeof setTimeout> | null = null;

const CUSTOM_LINK_WS_TIMEOUT_MS = Math.min(WS_FIRST_TIMEOUT_MS, 1200);

const heroMetadata = ref<HeroMetadata>({});
type HeroMetadata = {
  displayName?: string;
  name?: string;
  about?: string;
  picture?: string;
};

const canSubscribe = computed(
  () => !loadingTiers.value && !tierFetchError.value && tiers.value.length > 0,
);

const heroTitle = computed(() => {
  const display = heroMetadata.value.displayName?.trim();
  if (display) return display;
  const name = heroMetadata.value.name?.trim();
  if (name) return name;
  const npub = dialogNpub.value;
  if (npub) return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
  const hex = dialogPubkey.value;
  if (hex) return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
  return 'Creator';
});

const heroAbout = computed(() => heroMetadata.value.about?.trim() ?? '');
const heroAvatarUrl = computed(() => {
  const candidate = heroMetadata.value.picture?.trim();
  if (candidate && isTrustedUrl(candidate)) return candidate;
  return '';
});
const heroInitial = computed(() =>
  heroTitle.value ? heroTitle.value.charAt(0).toUpperCase() : 'C',
);

const highlightBenefits = computed(() => {
  const seen = new Set<string>();
  const benefits: string[] = [];
  for (const tier of tiers.value) {
    if (!Array.isArray(tier?.benefits)) continue;
    for (const rawBenefit of tier.benefits as string[]) {
      if (benefits.length >= 6) break;
      if (typeof rawBenefit !== 'string') continue;
      const normalized = rawBenefit.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      benefits.push(normalized);
    }
    if (benefits.length >= 6) break;
  }
  return benefits;
});

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return '';
  return new Intl.NumberFormat().format(value);
}

function formatJoined(joined: number | null): string {
  if (!joined) return '';
  const date = new Date(joined * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

function creatorDisplayName(creator: CreatorProfile): string {
  const profile = creator.profile ?? {};
  if (typeof profile.display_name === 'string' && profile.display_name.trim()) {
    return profile.display_name.trim();
  }
  if (typeof profile.name === 'string' && profile.name.trim()) {
    return profile.name.trim();
  }
  return `${creator.pubkey.slice(0, 8)}…${creator.pubkey.slice(-4)}`;
}

function creatorHandle(creator: CreatorProfile): string {
  const profile = creator.profile ?? {};
  if (typeof profile.name === 'string' && profile.name.trim()) {
    return profile.name.trim();
  }
  return '';
}

function creatorNip05(creator: CreatorProfile): string {
  const profile = creator.profile ?? {};
  if (typeof profile.nip05 === 'string' && profile.nip05.trim()) {
    return profile.nip05.trim();
  }
  return '';
}

function creatorAbout(creator: CreatorProfile): string {
  const profile = creator.profile ?? {};
  if (typeof profile.about === 'string' && profile.about.trim()) {
    return profile.about.trim();
  }
  return '';
}

function creatorAvatar(creator: CreatorProfile): string {
  const profile = creator.profile ?? {};
  const candidate =
    typeof profile.picture === 'string' && profile.picture.trim()
      ? profile.picture.trim()
      : typeof profile.image === 'string' && profile.image.trim()
        ? profile.image.trim()
        : '';
  if (candidate && isTrustedUrl(candidate)) {
    return candidate;
  }
  return '';
}

function creatorInitial(creator: CreatorProfile): string {
  const name = creatorDisplayName(creator);
  return name ? name.charAt(0).toUpperCase() : 'C';
}

function hasHeroMetadata(meta: HeroMetadata): boolean {
  return [meta.displayName, meta.name, meta.about, meta.picture].some(
    (value) => typeof value === 'string' && value.trim().length > 0,
  );
}

function extractHeroMetadata(source: any): HeroMetadata {
  const metadata: HeroMetadata = {};
  if (!source) return metadata;

  const fromObject = (obj: Record<string, any>) => {
    if (typeof obj.display_name === 'string') {
      metadata.displayName = obj.display_name;
    }
    if (typeof obj.name === 'string') {
      metadata.name = obj.name;
    }
    if (typeof obj.about === 'string') {
      metadata.about = obj.about;
    }
    if (typeof obj.picture === 'string') {
      metadata.picture = obj.picture;
    } else if (typeof obj.image === 'string') {
      metadata.picture = obj.image;
    }
  };

  if (source.profile && typeof source.profile === 'object') {
    fromObject(source.profile as Record<string, any>);
  }

  const eventContent =
    typeof source.profileEvent?.content === 'string'
      ? source.profileEvent.content
      : typeof source.event?.content === 'string'
        ? source.event.content
        : typeof source.content === 'string'
          ? source.content
          : '';

  if (eventContent) {
    try {
      const parsed = JSON.parse(eventContent) as Record<string, any>;
      if (parsed && typeof parsed === 'object') {
        fromObject(parsed);
      }
    } catch (error) {
      console.warn('Failed to parse profile metadata', error);
    }
  }

  return metadata;
}

function updateHeroMetadata(source: any, options: { preserveExisting?: boolean } = {}) {
  const { preserveExisting = false } = options;
  const next = extractHeroMetadata(source);
  if (preserveExisting && !hasHeroMetadata(next)) {
    return;
  }
  heroMetadata.value = next;
}

function formatFiat(sats: number): string {
  const price = Number(priceStore.bitcoinPrice);
  if (!price) return '';
  const usdValue = (price / 100000000) * sats;
  return uiStore.formatCurrency(usdValue, 'USD', true);
}

function getPrice(t: any): number {
  return t.price_sats ?? t.price ?? 0;
}

function resolveFrequency(tier: any): SubscriptionFrequency {
  if (typeof tier?.frequency === 'string') {
    return tier.frequency as SubscriptionFrequency;
  }
  if (typeof tier?.intervalDays === 'number') {
    return daysToFrequency(tier.intervalDays);
  }
  if (typeof tier?.intervalDays === 'string') {
    const parsed = parseInt(tier.intervalDays, 10);
    if (!Number.isNaN(parsed)) {
      return daysToFrequency(parsed);
    }
  }
  return 'monthly';
}

function frequencyLabel(tier: any): string {
  const frequency = resolveFrequency(tier);
  switch (frequency) {
    case 'weekly':
      return 'Every week';
    case 'biweekly':
      return 'Twice a month';
    default:
      return 'Every month';
  }
}

function openHeroSubscribe() {
  if (!tiers.value.length) return;
  openSubscribe(tiers.value[0]);
}

function openHeroDonate() {
  if (!dialogPubkey.value) return;
  selectedPubkey.value = dialogPubkey.value;
  showDonateDialog.value = true;
}

function goToWelcome() {
  void router.push({ path: '/welcome', query: { first: '1' } });
}

function openSubscribe(tier: any) {
  selectedTier.value = tier;
  showSubscribeDialog.value = true;
}

function retryFetchTiers() {
  if (!dialogPubkey.value) return;
  loadingTiers.value = true;
  if (tierTimeout) clearTimeout(tierTimeout);
  tierTimeout = setTimeout(() => {
    loadingTiers.value = false;
  }, 5000);
  creators.fetchTierDefinitions(dialogPubkey.value, {
    relayHints: lastRelayHints.value,
    fundstrOnly: true,
  });
}

function confirmSubscribe({ bucketId, periods, amount, startDate, total }: any) {
  void bucketId;
  void periods;
  void amount;
  void startDate;
  void total;
  showSubscribeDialog.value = false;
  showTierDialog.value = false;
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
    showDonateDialog.value = false;
    sendTokensStore.showSendTokens = true;
  } else {
    donationStore.createDonationPreset(
      periods,
      amount,
      selectedPubkey.value,
      bucketId,
    );
    showDonateDialog.value = false;
  }
}

function updateRouteForSearch(value: string) {
  const trimmed = value.trim();
  const nextQuery = { ...route.query } as Record<string, any>;
  if (trimmed) {
    nextQuery.npub = trimmed;
  } else {
    delete nextQuery.npub;
  }
  return router.replace({ path: route.path, query: nextQuery });
}

async function submitSearch() {
  const trimmed = searchQuery.value.trim();
  const current = typeof route.query.npub === 'string' ? route.query.npub : '';
  if (trimmed === current) {
    if (trimmed) {
      showingFeatured.value = false;
      await creators.searchCreators(trimmed);
    } else {
      showingFeatured.value = true;
      await creators.loadFeaturedCreators();
    }
    return;
  }
  await updateRouteForSearch(trimmed);
}

async function clearSearch() {
  searchQuery.value = '';
  await submitSearch();
}

async function reloadFeatured() {
  showingFeatured.value = true;
  await creators.loadFeaturedCreators();
}

function goToProfile(pubkey: string) {
  const resolved = nostr.resolvePubkey(pubkey) || pubkey;
  let routeParam = resolved;
  try {
    routeParam = nip19.npubEncode(resolved);
  } catch (err) {
    console.warn('Failed to encode npub', err);
    routeParam = resolved;
  }
  void router.push({ name: 'PublicCreatorProfile', params: { npubOrHex: routeParam } });
}

function openDonateDialog(pubkey: string) {
  try {
    selectedPubkey.value = toHex(pubkey);
  } catch (err) {
    console.warn('Failed to normalize pubkey for donation', err);
    selectedPubkey.value = nostr.resolvePubkey(pubkey) || pubkey;
  }
  showDonateDialog.value = true;
}

function openSubscriptionDialog(pubkey: string) {
  selectedPubkey.value = '';
  void viewCreatorProfile(pubkey, { openDialog: true, fundstrOnly: true });
}

function startChatWithCreator(pubkeyInput: string) {
  const resolved = nostr.resolvePubkey(pubkeyInput);
  void router.push({ path: '/nostr-messenger', query: { pubkey: resolved } });
  if (messenger.started) {
    messenger.startChat(resolved);
    return;
  }
  const stop = watch(
    () => messenger.started,
    (started) => {
      if (started) {
        messenger.startChat(resolved);
        stop();
      }
    },
  );
}

async function fetchProfileWithFallback(
  pubkeyInput: string,
  opts: { fundstrOnly?: boolean } = {},
) {
  let hex: string;
  try {
    hex = toHex(pubkeyInput);
  } catch (err) {
    console.error('Invalid pubkey for profile fetch', err);
    return {
      event: null,
      details: null,
      relayHints: [],
      pubkeyHex: '',
    };
  }

  const relayHints = new Set<string>();
  const fundstrOnly = opts.fundstrOnly === true;
  let event: NostrEvent | null = null;
  try {
    event = await queryNutzapProfile(hex, {
      allowFanoutFallback: false,
      wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
    });
  } catch (e) {
    console.error('Failed to query Nutzap profile', e);
  }

  if (!event && !fundstrOnly) {
    try {
      const discovered = await fallbackDiscoverRelays(hex);
      for (const url of discovered) relayHints.add(url);
      if (relayHints.size) {
        event = await queryNutzapProfile(hex, {
          fanout: Array.from(relayHints),
          allowFanoutFallback: true,
          wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
        });
      }
    } catch (e) {
      console.error('NIP-65 discovery failed', e);
    }
  }

  if (event) {
    for (const tag of event.tags || []) {
      if (tag[0] === 'relay' && typeof tag[1] === 'string' && tag[1]) {
        relayHints.add(tag[1]);
      }
    }
  }

  const details = parseNutzapProfileEvent(event);
  if (details) {
    for (const relay of details.relays) relayHints.add(relay);
  }

  return {
    event,
    details,
    relayHints: Array.from(relayHints),
    pubkeyHex: hex,
  };
}

async function viewCreatorProfile(
  pubkeyInput: string,
  opts: { openDialog?: boolean; fundstrOnly?: boolean } = {},
) {
  const trimmed = typeof pubkeyInput === 'string' ? pubkeyInput.trim() : '';
  if (!trimmed) return;

  const { openDialog = true, fundstrOnly = true } = opts;
  let pubkeyHex: string;
  try {
    pubkeyHex = toHex(trimmed);
  } catch (e) {
    console.error('Invalid creator pubkey', e);
    loadingProfile.value = false;
    loadingTiers.value = false;
    return;
  }

  dialogPubkey.value = pubkeyHex;
  selectedPubkey.value = pubkeyHex;
  selectedTier.value = null;

  const cache = await creators.ensureCreatorCacheFromDexie(pubkeyHex);
  const cachedProfile = cache?.profileDetails ?? null;
  const cachedProfileLoaded = cache?.profileLoaded === true;
  const cachedTiersLoaded = cache?.tiersLoaded === true;

  updateHeroMetadata(cache);

  if (cachedProfileLoaded) {
    nutzapProfile.value = cachedProfile;
    lastRelayHints.value = cachedProfile?.relays
      ? [...cachedProfile.relays]
      : [];
  } else {
    nutzapProfile.value = null;
    lastRelayHints.value = [];
  }

  loadingProfile.value = !cachedProfileLoaded;
  const needsTierFetch = !cachedTiersLoaded;
  loadingTiers.value = needsTierFetch;

  if (tierTimeout) {
    clearTimeout(tierTimeout);
    tierTimeout = null;
  }
  if (needsTierFetch) {
    tierTimeout = setTimeout(() => {
      loadingTiers.value = false;
    }, 5000);
  }

  let profileResult: Awaited<ReturnType<typeof fetchProfileWithFallback>> | null =
    null;
  if (!cachedProfileLoaded) {
    try {
      profileResult = await fetchProfileWithFallback(trimmed, { fundstrOnly });
    } catch (e) {
      console.error('Failed to fetch creator profile', e);
    }

    if (profileResult && profileResult.pubkeyHex) {
      dialogPubkey.value = profileResult.pubkeyHex;
      selectedPubkey.value = profileResult.pubkeyHex;
      nutzapProfile.value = profileResult.details ?? null;
      lastRelayHints.value = profileResult.relayHints;
      updateHeroMetadata(profileResult, { preserveExisting: true });
      creators
        .saveProfileCache(
          profileResult.pubkeyHex,
          profileResult.event,
          profileResult.details,
        )
        .catch((err) =>
          console.error('Failed to cache Nutzap profile', err),
        );
    }
  }

  loadingProfile.value = false;

  if (needsTierFetch) {
    try {
      await creators.fetchTierDefinitions(pubkeyHex, {
        relayHints: lastRelayHints.value,
        fundstrOnly,
      });
    } catch (e) {
      console.error('Failed to fetch tier definitions', e);
    } finally {
      if (tierTimeout) {
        clearTimeout(tierTimeout);
        tierTimeout = null;
      }
      loadingTiers.value = false;
    }
  } else {
    if (tierTimeout) {
      clearTimeout(tierTimeout);
      tierTimeout = null;
    }
    loadingTiers.value = false;
  }

  if (openDialog) {
    await nextTick();
    showTierDialog.value = true;
  }
}

watch(tiers, (val) => {
  if (val.length > 0) {
    loadingTiers.value = false;
    if (tierTimeout) clearTimeout(tierTimeout);
  }
});

watch(tierFetchError, (val) => {
  if (val) {
    loadingTiers.value = false;
    if (tierTimeout) clearTimeout(tierTimeout);
  }
});

watch(showTierDialog, (val) => {
  if (!val) {
    nutzapProfile.value = null;
    loadingProfile.value = false;
    lastRelayHints.value = [];
    heroMetadata.value = {};
  }
});

watch(
  () => route.query.npub,
  (npub) => {
    if (typeof npub === 'string' && npub.trim()) {
      searchQuery.value = npub;
      showingFeatured.value = false;
      void creators.searchCreators(npub);
    } else {
      searchQuery.value = '';
      showingFeatured.value = true;
      void creators.loadFeaturedCreators();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  if (tierTimeout) clearTimeout(tierTimeout);
  nutzapProfile.value = null;
  loadingProfile.value = false;
});
</script>

<style scoped>
.find-creators-page {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.find-creators-page__inner {
  width: min(100%, 1100px);
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.find-creators-search {
  border-radius: 1.25rem;
  border: 1px solid var(--surface-contrast-border);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.12);
  padding: clamp(1.5rem, 2vw, 2.25rem);
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.find-creators-search__header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.find-creators-search__title {
  margin: 0;
  font-weight: 600;
}

.find-creators-search__hint {
  margin: 0;
}

.find-creators-search__controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.find-creators-search__input :deep(.q-field__control) {
  min-height: 48px;
}

.find-creators-search__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.find-creators-search__action {
  flex: 0 0 auto;
}

@media (min-width: 720px) {
  .find-creators-search__controls {
    flex-direction: row;
    align-items: center;
  }

  .find-creators-search__input {
    flex: 1 1 auto;
  }

  .find-creators-search__actions {
    justify-content: flex-end;
  }
}

.find-creators-results {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.find-creators-results__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.find-creators-results__title {
  margin: 0;
}

.find-creators-results__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem 1.5rem;
  border-radius: 1rem;
  border: 1px dashed var(--surface-contrast-border);
  background: rgba(0, 0, 0, 0.03);
}

.find-creators-results__banner {
  border-radius: 1rem;
}

.find-creators-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.creator-card {
  border-radius: 1rem;
  border: 1px solid var(--surface-contrast-border);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.creator-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.12);
}

.creator-card__header {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.creator-card__avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 2px solid var(--surface-contrast-border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--surface-1);
  font-weight: 600;
  font-size: 1.4rem;
  color: var(--accent-500);
}

.creator-card__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.creator-card__identity {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.creator-card__name {
  margin: 0;
  font-weight: 600;
}

.creator-card__handle,
.creator-card__nip05 {
  margin: 0;
  word-break: break-word;
}

.creator-card__about {
  margin: 0;
  line-height: 1.5;
  word-break: break-word;
}

.creator-card__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem 1.5rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.creator-card__stat-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: block;
  color: var(--text-2);
}

.creator-card__stat-value {
  font-weight: 600;
  color: var(--text-1);
}

.creator-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.creator-card__action {
  flex: 1 1 140px;
}

.creator-card__action--view {
  flex: 1 1 100%;
}

@media (min-width: 840px) {
  .creator-card__action {
    flex: 1 1 auto;
  }

  .creator-card__action--view {
    flex: 0 0 auto;
  }
}

.tier-dialog {
  width: 100%;
  max-width: 960px;
  background: var(--surface-2);
  color: var(--text-1);
}

.tier-dialog__top {
  padding: 1.5rem 1.75rem 1.25rem;
}

.tier-dialog__body {
  padding: 1.5rem 1.75rem 1.75rem;
}

.tier-dialog__hero {
  display: flex;
  align-items: stretch;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.tier-dialog__identity {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
  flex: 1 1 auto;
}

.tier-dialog__avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--surface-1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--accent-500);
  border: 2px solid var(--surface-contrast-border);
  overflow: hidden;
}

.tier-dialog__avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tier-dialog__avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.06);
}

.tier-dialog__meta {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}

.tier-dialog__title {
  font-size: 1.25rem;
  font-weight: 600;
}

.tier-dialog__subtitle {
  margin: 0;
  line-height: 1.45;
}

.tier-dialog__actions {
  margin-left: auto;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.tier-dialog__cta {
  min-width: 140px;
}

.tier-dialog__close {
  color: var(--text-2);
}

.tier-dialog__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: 1.75rem;
}

.tier-dialog__column--secondary {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.section-caption {
  font-size: 0.9rem;
  margin: 0.35rem 0 0;
}

.tier-dialog__explainer {
  margin-bottom: 1.5rem;
}

.tier-list__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem 1.5rem;
  text-align: center;
  border: 1px dashed var(--surface-contrast-border);
  border-radius: 1rem;
  background: rgba(0, 0, 0, 0.02);
}

.tier-card-grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border);
  border-left: 4px solid var(--accent-500);
  border-radius: 1rem;
  padding: 1.25rem 1.5rem;
}

.info-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.info-panel__spinner {
  color: var(--accent-500);
}

.info-panel__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.info-panel__body--state {
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 80px;
}

.info-subsection {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.info-subsection__label {
  font-size: 0.85rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.info-subsection__info-btn {
  color: var(--text-2);
  min-width: 0;
  padding: 0;
}

.info-subsection__info-btn :deep(.q-btn__content) {
  padding: 0;
}

.info-subsection__info-btn :deep(.q-icon) {
  font-size: 1rem;
}

.info-subsection__info-btn:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

.info-subsection__value {
  font-family: 'SFMono-Regular', 'Fira Code', 'Courier New', monospace;
  font-size: 0.85rem;
  word-break: break-all;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-1);
}

.benefit-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.benefit-list__item {
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--surface-contrast-border);
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.95rem;
  line-height: 1.4;
}

@media (max-width: 1080px) {
  .tier-dialog__grid {
    grid-template-columns: 1fr;
  }

  .tier-dialog__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .tier-dialog__hero {
    flex-direction: column;
    align-items: stretch;
  }

  .tier-dialog__avatar {
    width: 64px;
    height: 64px;
  }

  .tier-dialog__actions {
    width: 100%;
    gap: 0.5rem;
  }

  .tier-dialog__cta {
    flex: 1 1 100%;
    min-width: 0;
  }
}
</style>
