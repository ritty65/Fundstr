<template>
  <q-page class="find-creators-page page-shell bg-surface-1 text-1 q-pt-xl q-pb-xl">
    <CreatorProfileModal
      :show="showProfileModal"
      :pubkey="selectedProfilePubkey"
      @close="showProfileModal = false"
      @message="startChat"
      @donate="donate"
    />

    <div class="find-creators-content">
      <section class="page-hero stack-12">
        <h1 class="text-h3 text-bold">Discover Creators on Nostr</h1>
        <p class="text-body1 text-2 q-mb-none">
          Search the Nostr network, explore featured voices, and support the builders shaping the ecosystem.
        </p>
      </section>

      <div class="section-stack">
        <q-card class="find-creators-panel bg-surface-2 text-1" flat bordered>
          <q-card-section class="panel-section q-px-xl q-py-lg">
            <header class="stack-12">
              <div class="text-h5">Nostr User Search</div>
              <p class="text-body2 text-2 q-mb-none">
                Search by name, npub, or NIP-05 identifier (e.g., user@domain.com).
              </p>
            </header>

            <q-form class="search-form" @submit.prevent="handleSearch">
              <q-input
                v-model="searchQuery"
                outlined
                dense
                clearable
                autocomplete="off"
                placeholder="Name, npub, or NIP-05"
                :loading="searchLoading"
                input-class="text-1"
                @keyup.enter="handleSearch"
              >
                <template #append>
                  <q-btn
                    type="submit"
                    flat
                    round
                    dense
                    icon="search"
                    :aria-label="$q.lang.label.search"
                  />
                </template>
              </q-input>
            </q-form>

            <section class="column q-gutter-md" role="region" aria-live="polite">
              <div v-if="searchLoading && !searchResults.length" class="column q-gutter-sm" aria-label="Searching creators">
                <q-skeleton
                  v-for="placeholder in searchSkeletonPlaceholders"
                  :key="placeholder"
                  type="rect"
                  class="result-card-skeleton bg-surface-1"
                />
              </div>

              <template v-else>
                <q-banner
                  v-if="searchError"
                  rounded
                  dense
                  class="status-banner text-1"
                  aria-live="polite"
                >
                  <template #avatar>
                    <q-icon :name="resolveBannerIcon(searchError)" size="20px" />
                  </template>
                  <span class="status-banner__text">{{ searchError }}</span>
                </q-banner>

                <q-banner
                  v-if="searchWarnings.length > 0"
                  rounded
                  dense
                  class="status-banner text-1"
                  aria-live="polite"
                >
                  <template #avatar>
                    <q-icon name="warning" size="20px" />
                  </template>
                  <div class="column">
                    <span v-for="(warning, index) in searchWarnings" :key="index" class="status-banner__text">
                      {{ warning }}
                    </span>
                  </div>
                </q-banner>

                <div v-if="searchResults.length" class="column q-gutter-sm">
                  <q-card
                    v-for="profile in searchResults"
                    :key="profile.pubkey"
                    flat
                    bordered
                    class="creator-result-card bg-surface-2 text-1"
                  >
                    <div class="row items-start q-col-gutter-md no-wrap">
                      <div class="col-auto">
                        <q-avatar size="64px" class="creator-avatar">
                          <img v-if="profile.picture" :src="profile.picture" :alt="getDisplayName(profile)" />
                          <q-icon v-else name="person" size="32px" />
                        </q-avatar>
                      </div>
                      <div class="col">
                        <div class="text-subtitle1 text-bold ellipsis">
                          {{ getDisplayName(profile) }}
                        </div>
                        <div class="text-body2 text-2 ellipsis">
                          {{ getHandle(profile) }}
                        </div>
                        <p class="text-body2 q-mt-xs q-mb-none about-snippet">
                          {{ getAboutSnippet(profile) }}
                        </p>
                      </div>
                      <div class="col-auto column q-gutter-xs action-buttons">
                        <q-btn outline color="accent" no-caps size="sm" label="Message" @click="startChat(profile.pubkey)" />
                        <q-btn outline color="accent" no-caps size="sm" label="Donate" @click="donate(profile.pubkey)" />
                        <q-btn flat color="accent" no-caps size="sm" label="Subscribe" @click="viewProfile(profile.pubkey)" />
                      </div>
                    </div>
                  </q-card>
                </div>

                <div
                  v-else-if="showEmptyState"
                  class="empty-state column items-center text-center q-pt-xl q-pb-xl q-px-md text-2"
                >
                  <q-icon name="travel_explore" size="3.5rem" class="text-accent-500 q-mb-md" />
                  <div class="text-h6 text-1">{{ emptyStateTitle }}</div>
                  <p class="text-body1 q-mt-sm q-mb-none">{{ emptyStateMessage }}</p>
                  <q-btn
                    v-if="!initialLoadComplete"
                    class="q-mt-md"
                    flat
                    color="accent"
                    no-caps
                    label="Browse featured creators"
                    @click="jumpToFeatured"
                  />
                </div>
              </template>
            </section>
          </q-card-section>
        </q-card>

        <q-card
          id="featured-creators"
          ref="featuredSectionRef"
          class="find-creators-panel bg-surface-2 text-1"
          flat
          bordered
        >
          <q-card-section class="panel-section q-px-xl q-py-lg">
            <div class="row items-start justify-between q-col-gutter-md">
              <div class="col">
                <div class="text-h5">Featured Creators</div>
                <p class="text-body2 text-2 q-mt-xs q-mb-none">
                  Discover highlighted profiles curated by the Fundstr team.
                </p>
              </div>
              <div class="col-auto">
                <q-btn
                  outline
                  no-caps
                  color="accent"
                  icon="refresh"
                  label="Refresh"
                  :loading="loadingFeatured"
                  :disable="loadingFeatured"
                  @click="refreshFeatured"
                />
              </div>
            </div>

            <div class="q-mt-md" role="region" aria-live="polite">
              <div
                v-if="loadingFeatured && !featuredCreators.length"
                class="row q-col-gutter-lg"
              >
                <div
                  v-for="placeholder in featuredSkeletonPlaceholders"
                  :key="placeholder"
                  class="col-12 col-sm-6 col-md-4"
                >
                  <q-skeleton type="rect" class="featured-skeleton bg-surface-1" />
                </div>
              </div>

              <div v-else-if="featuredCreators.length" class="column q-gutter-md">
                <q-banner
                  v-if="featuredWarningMessage"
                  rounded
                  dense
                  class="status-banner text-1"
                  aria-live="polite"
                >
                  <template #avatar>
                    <q-icon :name="resolveBannerIcon(featuredWarningMessage)" size="20px" />
                  </template>
                  <span class="status-banner__text">{{ featuredWarningMessage }}</span>
                </q-banner>
                <div class="featured-grid-container">
                  <div class="featured-legend" aria-label="Legend for featured badges">
                    <div class="legend-header" :class="{ 'legend-header--mobile': isMobileScreen }">
                      <div class="legend-title text-subtitle1 text-1">Badge legend</div>
                      <q-btn
                        v-if="isMobileScreen"
                        dense
                        flat
                        no-caps
                        color="accent"
                        class="legend-toggle"
                        :icon="legendExpanded ? 'expand_less' : 'expand_more'"
                        :label="legendExpanded ? 'Hide' : 'Show'"
                        @click="toggleLegend"
                      />
                    </div>

                    <div
                      v-show="!isMobileScreen || legendExpanded"
                      class="legend-content"
                      role="list"
                    >
                      <div class="legend-item" role="listitem">
                        <div class="legend-chip">
                          <q-badge color="accent" class="badge badge-featured">Featured</q-badge>
                        </div>
                        <div class="legend-text text-2">Fundstr-curated pick</div>
                      </div>

                      <div class="legend-item" role="listitem">
                        <div class="legend-chip">
                          <span class="status-chip accent">
                            <q-icon name="verified_user" size="14px" />
                            <span>Creator</span>
                          </span>
                        </div>
                        <div class="legend-text text-2">Creator account</div>
                      </div>

                      <div class="legend-item" role="listitem">
                        <div class="legend-chip">
                          <span class="status-chip accent">
                            <q-icon name="verified_user" size="14px" />
                            <span>Personal</span>
                          </span>
                        </div>
                        <div class="legend-text text-2">Personal supporter profile</div>
                      </div>

                      <div class="legend-item" role="listitem">
                        <div class="legend-chip">
                          <span class="status-chip accent">
                            <q-icon name="bolt" size="14px" />
                            <span>Lightning</span>
                          </span>
                        </div>
                        <div class="legend-text text-2">Lightning-ready for zaps</div>
                      </div>

                      <div class="legend-item" role="listitem">
                        <div class="legend-chip">
                          <span class="status-chip accent">
                            <q-icon name="sell" size="14px" />
                            <span>Has tiers</span>
                          </span>
                        </div>
                        <div class="legend-text text-2">Subscription tiers available</div>
                      </div>

                      <div class="legend-item" role="listitem">
                        <div class="legend-chip">
                          <span class="status-chip muted">
                            <q-icon name="alternate_email" size="14px" />
                            <span>NIP-05</span>
                          </span>
                        </div>
                        <div class="legend-text text-2">Verified NIP-05 handle</div>
                      </div>

                      <div class="legend-item" role="listitem">
                        <div class="legend-chip">
                          <span class="status-chip neutral">
                            <q-icon name="data_thresholding" size="14px" />
                            <span>Cache hit</span>
                          </span>
                        </div>
                        <div class="legend-text text-2">Data pulled from cache</div>
                      </div>
                    </div>
                  </div>
                  <div class="featured-grid">
                    <CreatorCard
                      v-for="profile in featuredCreators"
                      :key="profile.pubkey"
                      :profile="profile"
                      featured
                      :has-lightning="profile.hasLightning ?? undefined"
                      :has-tiers="profile.hasTiers ?? undefined"
                      :is-creator="profile.isCreator ?? undefined"
                      :is-personal="profile.isPersonal ?? undefined"
                      :nip05="profile.nip05 ?? undefined"
                      @view-tiers="viewProfile"
                      @view-profile="viewProfile"
                      @message="startChat"
                      @donate="donate"
                    />
                  </div>
                </div>
              </div>

              <q-banner
                v-else-if="featuredStatusMessage"
                rounded
                dense
                class="status-banner text-1"
                aria-live="polite"
              >
                <template #avatar>
                  <q-icon :name="resolveBannerIcon(featuredStatusMessage)" size="20px" />
                </template>
                <span class="status-banner__text">{{ featuredStatusMessage }}</span>
              </q-banner>

              <div
                v-else-if="showFeaturedEmptyState"
                class="empty-state column items-center text-center q-pt-xl q-pb-xl q-px-md text-2"
              >
                <q-icon
                  name="auto_awesome"
                  size="4rem"
                  class="q-mb-md text-accent-500"
                  aria-hidden="true"
                />
                <div class="text-h6 text-1">No featured creators yet</div>
                <p class="text-body1 q-mt-sm q-mb-none">
                  Check back soon as we highlight more voices from the Nostr community.
                </p>
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch, type ComponentPublicInstance } from 'vue';
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import CreatorProfileModal from 'components/CreatorProfileModal.vue';
import { useNostrStore } from 'stores/nostr';
import { useCreatorsStore, type CreatorProfile } from 'stores/creators';
import { useMessengerStore } from 'stores/messenger';
import { useMintsStore } from 'stores/mints';
import { useBucketsStore } from 'stores/buckets';
import { useUiStore } from 'stores/ui';
import { notifyError } from 'src/js/notify';
import { debug } from '@/js/logger';
import {
  mintSupportsSplit,
  resolveSupportedNuts,
  SPLIT_SUPPORT_REQUIRED_MESSAGE,
} from 'src/utils/nuts';

const creatorsStore = useCreatorsStore();
const {
  searchResults,
  searching,
  error: storeError,
  searchWarnings: storeSearchWarnings,
  featuredCreators,
  loadingFeatured: storeLoadingFeatured,
  featuredError: storeFeaturedError,
  featuredStatusMessage: storeFeaturedStatusMessage,
} = storeToRefs(creatorsStore);

const router = useRouter();
const route = useRoute();
const $q = useQuasar();
const nostr = useNostrStore();
const messenger = useMessengerStore();
const mintsStore = useMintsStore();
const bucketsStore = useBucketsStore();
const uiStore = useUiStore();

const searchQuery = ref('');
const initialLoadComplete = ref(false);

const searchSkeletonPlaceholders = [0, 1, 2];
const featuredSkeletonPlaceholders = [0, 1, 2, 3, 4, 5];

const trimmedQuery = computed(() => (searchQuery.value || '').trim());
const searchLoading = computed(() => searching.value);
const searchError = computed(() => storeError.value);
const searchWarnings = computed(() => storeSearchWarnings?.value ?? []);
const loadingFeatured = computed(() => storeLoadingFeatured?.value ?? false);
const featuredError = computed(() => storeFeaturedError.value);

const showEmptyState = computed(() => {
  if (searchLoading.value) return false;
  if (searchResults.value.length) return false;
  if (searchError.value) return false;
  return initialLoadComplete.value || !trimmedQuery.value;
});

const emptyStateTitle = computed(() =>
  initialLoadComplete.value ? 'No creators found' : 'Search Nostr creators',
);
const emptyStateMessage = computed(() =>
  initialLoadComplete.value
    ? 'Try a different name, npub, or NIP-05 handle.'
    : 'Start typing a name, npub, or NIP-05 handle to find creators.',
);

const toText = (value?: string | null) => (typeof value === 'string' ? value.trim() : '');
const shortenHex = (value: string) => `${value.slice(0, 8)}…${value.slice(-4)}`;

const getHandle = (profile: CreatorProfile) =>
  toText((profile as any).nip05 ?? profile.nip05) ||
  toText((profile as any).npub ?? '') ||
  (profile.pubkey ? `npub:${shortenHex(profile.pubkey)}` : 'Nostr user');

const getDisplayName = (profile: CreatorProfile) =>
  toText((profile as any).display_name ?? (profile as any).displayName ?? profile.name) ||
  getHandle(profile);

const getAboutSnippet = (profile: CreatorProfile) => {
  const about = toText(profile.about ?? (profile as any).about) || 'No bio yet.';
  return about.length > 180 ? `${about.slice(0, 177)}…` : about;
};

const resolveBannerIcon = (message: string | null | undefined) => {
  if (!message) {
    return 'info';
  }

  const normalized = message.toLowerCase();

  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'warning';
  }

  if (normalized.includes('refresh') || normalized.includes('loading')) {
    return 'autorenew';
  }

  return 'info';
};

const resolveElement = (target: HTMLElement | ComponentPublicInstance | null) => {
  if (!target) {
    return undefined;
  }

  if (target instanceof HTMLElement) {
    return target;
  }

  if ('$el' in target && target.$el instanceof HTMLElement) {
    return target.$el;
  }

  return undefined;
};

const jumpToFeatured = () => {
  const el = resolveElement(featuredSectionRef.value);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  void router.push({ hash: '#featured-creators' });
};

const handleSearch = () => {
  void runSearch({ fresh: true });
};

async function runSearch({ fresh = false }: { fresh?: boolean } = {}) {
  const hasQuery = trimmedQuery.value.length > 0;
  try {
    await creatorsStore.searchCreators(trimmedQuery.value, { fresh });
  } finally {
    initialLoadComplete.value = hasQuery;
  }
}

async function loadFeatured(force = false) {
  await creatorsStore.loadFeaturedCreators(force);
}

const featuredStatusMessage = computed(() => {
  if (featuredError.value) {
    return featuredError.value;
  }
  if (storeFeaturedStatusMessage.value && !featuredCreators.value.length) {
    return storeFeaturedStatusMessage.value;
  }
  if (loadingFeatured.value && !featuredCreators.value.length) {
    return 'Loading creators...';
  }
  if (!loadingFeatured.value && !featuredCreators.value.length) {
    return 'No featured creators available right now.';
  }
  return '';
});

const featuredWarningMessage = computed(
  () => storeFeaturedStatusMessage.value || '',
);

const showFeaturedEmptyState = computed(
  () => !loadingFeatured.value && !featuredCreators.value.length && !featuredError.value,
);

const refreshFeatured = async () => {
  await loadFeatured(true);
};

const isMobileScreen = computed(() => $q.screen.lt.md);
const legendExpanded = ref(!$q.screen.lt.md);

watch(isMobileScreen, (isMobile) => {
  legendExpanded.value = !isMobile;
});

const toggleLegend = () => {
  legendExpanded.value = !legendExpanded.value;
};

watch(searchWarnings, (warnings) => {
  if (Array.isArray(warnings) && warnings.length > 0) {
    debug('Search warnings:', warnings);
  }
});

const showProfileModal = ref(false);
const selectedProfilePubkey = ref('');
const featuredSectionRef = ref<HTMLElement | ComponentPublicInstance | null>(null);
const activeMintInfo = computed(() => mintsStore.activeInfo);
const supportedNuts = computed(() => resolveSupportedNuts(activeMintInfo.value));
const activeMintSupportsSplit = computed(() =>
  mintSupportsSplit(activeMintInfo.value, supportedNuts.value),
);
const { activeBuckets } = storeToRefs(bucketsStore);
const bucketBalances = computed(() => bucketsStore.bucketBalances);
const hasFundedBucket = computed(() =>
  activeBuckets.value.some((bucket) => (bucketBalances.value[bucket.id] ?? 0) > 0),
);

function viewProfile(pubkey: string) {
  selectedProfilePubkey.value = pubkey;
  showProfileModal.value = true;
}

function startChat(pubkey: string) {
  const resolvedPubkey = nostr.resolvePubkey(pubkey);
  messenger.startChat(resolvedPubkey);
  if ($q.screen.lt.md) {
    messenger.setDrawer(true);
  }
  void router.push({ path: '/nostr-messenger', query: { pubkey: resolvedPubkey } });
}

async function donate(pubkey: string) {
  if (!activeMintSupportsSplit.value) {
    notifyError(SPLIT_SUPPORT_REQUIRED_MESSAGE);
    return;
  }
  const hasActiveMint =
    typeof mintsStore.activeMintUrl === 'string' && mintsStore.activeMintUrl.trim().length > 0;
  const hasPositiveBalance = mintsStore.activeBalance > 0;
  const hasActiveBucketWithFunds = hasFundedBucket.value;

  if (!hasActiveMint) {
    uiStore.setWalletDrawer(true);
    notifyError(
      'Complete onboarding to connect your wallet, choose mints, and start supporting creators.',
    );
    return;
  }

  if (!hasPositiveBalance && !hasActiveBucketWithFunds) {
    uiStore.setWalletDrawer(true);
    notifyError('Add funds to your wallet to support this creator.');
    return;
  }

  if (!nostr.signer || !nostr.pubkey) {
    notifyError('Your Nostr identity is not ready yet. Please try again.');
    return;
  }
  const resolvedPubkey = nostr.resolvePubkey(pubkey);
  messenger.startChat(resolvedPubkey);
  showProfileModal.value = false;
  void router.push({
    path: '/nostr-messenger',
    query: { pubkey: resolvedPubkey, intent: 'donate' },
  });
}

function redirectToCreatorIfPresent() {
  const npub = route.query.npub;
  if (typeof npub === 'string' && npub.trim()) {
    void router.replace({ name: 'creator-profile', params: { npub: npub.trim() } });
  }
}

onMounted(() => {
  redirectToCreatorIfPresent();
  if (typeof route.query.q === 'string' && route.query.q.trim()) {
    searchQuery.value = route.query.q.trim();
    void runSearch();
  }
  void loadFeatured();
});
</script>



<style scoped>
.find-creators-page {
  min-height: 100vh;
}

.find-creators-content {
  width: min(100%, 1200px);
  margin: 0 auto;
  padding: 0 1.25rem clamp(2rem, 3vw, 3.5rem);
  display: flex;
  flex-direction: column;
  gap: clamp(2rem, 2.25vw, 2.75rem);
}

.page-hero {
  width: 100%;
  text-align: center;
}

.page-hero h1 {
  margin: 0;
  font-size: 2.5rem;
}

.section-stack {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.stack-12 {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.find-creators-panel {
  width: 100%;
  border-radius: 16px;
  border: 1px solid var(--surface-contrast-border);
  box-shadow:
    0 12px 24px rgba(15, 23, 42, 0.04),
    0 24px 48px rgba(15, 23, 42, 0.08);
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.search-form {
  margin-top: 4px;
}

.result-card-skeleton {
  border-radius: 14px;
  height: 148px;
}

.featured-skeleton {
  border-radius: 14px;
  height: 240px;
}

.creator-result-card {
  border-radius: 14px;
  padding: 12px 16px;
}

.creator-avatar {
  background: var(--surface-1);
}

.creator-avatar :deep(img) {
  object-fit: cover;
}

.about-snippet {
  color: var(--text-2);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.action-buttons {
  min-width: 140px;
}

@media (max-width: 767px) {
  .find-creators-content {
    padding: 0 1rem 2.5rem;
  }

  .page-hero h1 {
    font-size: 2.1rem;
  }

  .action-buttons {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .action-buttons .q-btn {
    flex: 1 1 45%;
  }
}

.empty-state {
  gap: 6px;
}

.empty-state p {
  max-width: 360px;
}

.status-banner {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-200) 20%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-200) 40%, transparent);
}

.status-banner :deep(.q-banner__avatar) {
  margin-right: 4px;
  color: var(--accent-600);
}

.status-banner__text {
  font-size: 0.95rem;
  line-height: 1.4;
}

.featured-grid {
  display: grid;
  gap: clamp(20px, 2vw, 32px);
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.featured-grid-container {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding-inline: clamp(0px, 3vw, 16px);
}

.featured-legend {
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.legend-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.legend-header--mobile {
  margin-bottom: 0;
}

.legend-title {
  font-weight: 700;
}

.legend-toggle {
  padding: 4px 8px;
}

.legend-content {
  display: grid;
  gap: 0.65rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  padding-top: 0.25rem;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.25rem 0;
}

.legend-chip {
  flex-shrink: 0;
}

.legend-text {
  line-height: 1.3;
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.82rem;
  line-height: 1;
  background: var(--chip-bg);
  color: var(--text-2);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 55%, transparent);
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.status-chip.accent {
  color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 45%, transparent);
  border-color: color-mix(in srgb, var(--accent-500) 40%, transparent);
}

.status-chip.muted {
  background: color-mix(in srgb, var(--chip-bg) 80%, transparent);
  color: var(--text-2);
}

.status-chip.neutral {
  background: color-mix(in srgb, var(--chip-bg) 60%, transparent);
  border-color: color-mix(in srgb, var(--surface-contrast-border) 70%, transparent);
}

.status-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-200);
  transform: translateY(-1px);
}

@media (max-width: 767px) {
  .legend-content {
    grid-template-columns: 1fr;
  }

  .featured-legend {
    margin-bottom: 0.5rem;
  }
}
</style>

