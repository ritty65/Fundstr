<template>
  <q-page class="find-creators-page bg-surface-1 text-1 q-px-md q-pt-xl q-pb-xl">
    <CreatorProfileModal
      :show="showProfileModal"
      :pubkey="selectedProfilePubkey"
      @close="showProfileModal = false"
      @message="startChat"
      @donate="donate"
    />
    <DonateDialog
      v-model="showDonateDialog"
      :creator-pubkey="selectedPubkey"
      @confirm="handleDonate"
    />
    <SendTokenDialog />

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

            <q-form class="column q-gutter-sm" @submit.prevent="triggerImmediateSearch">
              <q-input
                v-model="searchQuery"
                outlined
                dense
                clearable
                autocomplete="off"
                label="Search Nostr profiles"
                placeholder="Name, npub, or NIP-05"
                :loading="searching && !refreshingCache"
                input-class="text-1"
                @update:model-value="debouncedSearch"
                @keyup.enter="triggerImmediateSearch"
              >
                <template #append>
                  <q-btn
                    flat
                    round
                    dense
                    icon="search"
                    :aria-label="$q.lang.label.search"
                    @click="triggerImmediateSearch"
                  />
                </template>
              </q-input>
              <div class="refresh-actions">
                <q-btn
                  outline
                  no-caps
                  color="accent"
                  icon="refresh"
                  label="Refresh data"
                  class="refresh-button"
                  :disable="searching || refreshingCache"
                  :loading="refreshingCache"
                  @click="refreshCurrentCreator"
                />
              </div>
            </q-form>

            <section class="column q-gutter-lg" role="region" aria-live="polite">
              <div v-if="searching && !refreshingCache" class="row q-col-gutter-lg" aria-label="Searching creators">
                <div
                  v-for="placeholder in searchSkeletonPlaceholders"
                  :key="placeholder"
                  class="col-12 col-sm-6 col-md-4"
                >
                  <q-skeleton type="rect" class="result-skeleton bg-surface-1" />
                </div>
              </div>

              <div v-else-if="searchResults.length">
                <div v-if="searchResultStatus" class="result-status row no-wrap q-mb-md">
                  <q-chip
                    dense
                    :ripple="false"
                    class="result-status-chip"
                    :class="searchResultStatus.className"
                  >
                    <q-icon :name="searchResultStatus.icon" size="18px" />
                    <span>{{ searchResultStatus.label }}</span>
                  </q-chip>
                </div>
                <div class="fixed-grid">
                  <CreatorCard
                    v-for="profile in searchResults"
                    :key="profile.pubkey"
                    :profile="profile"
                    :cache-hit="profile.cacheHit === true"
                    @view-tiers="viewProfile"
                    @message="startChat"
                    @donate="donate"
                  />
                </div>
              </div>

              <q-banner
                v-else-if="statusMessage"
                rounded
                dense
                class="status-banner text-1"
                aria-live="polite"
              >
                <template #avatar>
                  <q-icon :name="resolveBannerIcon(statusMessage)" size="20px" />
                </template>
                <span class="status-banner__text">{{ statusMessage }}</span>
              </q-banner>

              <div
                v-else-if="showSearchEmptyState"
                class="empty-state column items-center text-center q-pt-xl q-pb-xl q-px-md text-2"
              >
                <q-icon
                  name="travel_explore"
                  size="4rem"
                  class="q-mb-md text-accent-500"
                  aria-hidden="true"
                />
                <div class="text-h6 text-1">No profiles yet</div>
                <p class="text-body1 q-mt-sm q-mb-none">
                  Try a different name or paste an npub to explore more creators.
                </p>
              </div>

              <div v-if="showRetry" class="retry-wrapper">
                <q-btn
                  outline
                  no-caps
                  color="accent"
                  label="Retry search"
                  class="retry-button"
                  :disable="searching"
                  @click="retrySearch"
                />
              </div>
            </section>
          </q-card-section>
        </q-card>

        <q-card class="find-creators-panel bg-surface-2 text-1" flat bordered>
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

              <div v-else-if="featuredCreators.length" class="fixed-grid">
                <CreatorCard
                  v-for="profile in featuredCreators"
                  :key="profile.pubkey"
                  :profile="profile"
                  featured
                  @view-tiers="viewProfile"
                  @message="startChat"
                  @donate="donate"
                />
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
import { ref, computed, watch } from 'vue';
import { useCreatorsStore } from 'stores/creators';
import type { CreatorProfile, CreatorWarmCache } from 'stores/creators';
import { nip19 } from 'nostr-tools';
import { useRouter } from 'vue-router';
import { useMessengerStore } from 'stores/messenger';
import { useSendTokensStore } from 'stores/sendTokensStore';
import { useNostrStore } from 'stores/nostr';
import { useNdk } from 'src/composables/useNdk';
import { creatorCacheService } from 'src/nutzap/creatorCache';
import DonateDialog from "components/DonateDialog.vue";
import SendTokenDialog from "components/SendTokenDialog.vue";
import { useDonationPresetsStore } from "stores/donationPresets";
import CreatorProfileModal from 'components/CreatorProfileModal.vue';
import CreatorCard from 'components/CreatorCard.vue';

type DecoratedCreatorProfile = CreatorProfile & {
  npub: string;
  npubShort: string;
  cacheHit?: boolean;
};

const creatorsStore = useCreatorsStore();
const searchQuery = ref('');
const searchResults = ref<DecoratedCreatorProfile[]>([]);
const statusMessage = ref('');
const showRetry = ref(false);
const lastResolvedPubkeyHex = ref<string | null>(null);
const refreshingCache = ref(false);

const searching = computed(() => creatorsStore.searching);
const loadingFeatured = computed(() => creatorsStore.loadingFeatured);
const featuredCreators = computed(() => creatorsStore.featuredCreators);
const searchSkeletonPlaceholders = computed(() =>
  refreshingCache.value ? [0] : [0, 1, 2],
);
const featuredSkeletonPlaceholders = computed(() => [0, 1, 2, 3]);
const featuredStatusMessage = computed(() => {
  if (creatorsStore.error) return creatorsStore.error;
  if (loadingFeatured.value && !featuredCreators.value.length) return 'Loading creators...';
  if (!loadingFeatured.value && !featuredCreators.value.length && !creatorsStore.error)
    return 'Could not load creators. Please try again.';
  return '';
});
const showSearchEmptyState = computed(() => {
  const query = searchQuery.value.trim();
  return (
    !searching.value &&
    !refreshingCache.value &&
    query.length > 0 &&
    !searchResults.value.length &&
    !statusMessage.value
  );
});
const showFeaturedEmptyState = computed(
  () => !loadingFeatured.value && !featuredCreators.value.length && !featuredStatusMessage.value,
);

const searchResultStatus = computed<
  { label: string; icon: string; className: string } | null
>(() => {
  if (!searchResults.value.length) {
    return null;
  }

  const hasCacheHit = searchResults.value.some((profile) => profile.cacheHit);

  return hasCacheHit
    ? { label: 'Cached result', icon: 'history', className: 'is-cached' }
    : { label: 'Live data', icon: 'bolt', className: 'is-live' };
});

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

  if (normalized.includes('cache')) {
    return 'history';
  }

  return 'info';
};

const triggerImmediateSearch = () => {
  void handleSearch(false);
};

const debouncedSearch = debounce(() => {
  void handleSearch(false);
}, 300);

function debounce(func: (...args: any[]) => void, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function (...args: any[]) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

function decorateProfile(profile: CreatorProfile, cacheHit = false): DecoratedCreatorProfile {
  const npub = nip19.npubEncode(profile.pubkey);
  return {
    ...profile,
    npub,
    npubShort: `${npub.substring(0, 10)}...${npub.substring(npub.length - 5)}`,
    cacheHit,
  };
}

function parseCachedProfile(entry: CreatorWarmCache | undefined): Record<string, any> | null {
  if (!entry?.profileEvent?.content) {
    return null;
  }
  try {
    const parsed = JSON.parse(entry.profileEvent.content);
    if (parsed && typeof parsed === 'object') {
      return { ...(parsed as Record<string, any>) };
    }
  } catch (error) {
    console.warn('Failed to parse cached profile content', error);
  }
  return null;
}

async function hydrateCachedCreator(pubkeyHex: string): Promise<CreatorProfile | null> {
  try {
    await creatorsStore.ensureCreatorCacheFromDexie(pubkeyHex);
  } catch (error) {
    console.warn('Failed to hydrate creator cache from Dexie', error);
  }

  const entry = creatorsStore.getCreatorCache(pubkeyHex);
  if (!entry) {
    return null;
  }

  const hasProfile = entry.profileLoaded === true || entry.profileEvent !== undefined;
  const hasTiers =
    entry.tiersLoaded === true ||
    (Array.isArray(entry.tiers) && entry.tiers.length > 0) ||
    entry.tierEvent !== undefined;

  if (!hasProfile && !hasTiers) {
    return null;
  }

  return {
    pubkey: pubkeyHex,
    profile: parseCachedProfile(entry),
    followers: null,
    following: null,
    joined: entry.profileUpdatedAt ?? null,
  };
}

async function resolveSearchQuery(query: string): Promise<string> {
  let candidate = query.trim();
  if (!candidate) {
    throw new Error('Invalid identifier');
  }

  try {
    if (candidate.startsWith('npub')) {
      const decoded = nip19.decode(candidate);
      candidate = typeof decoded.data === 'string' ? (decoded.data as string) : '';
    } else if (candidate.startsWith('nprofile')) {
      const decoded = nip19.decode(candidate);
      if (typeof decoded.data === 'object' && (decoded.data as any).pubkey) {
        candidate = (decoded.data as any).pubkey;
      } else {
        throw new Error('Invalid identifier');
      }
    } else if (candidate.includes('@')) {
      const ndk = await useNdk({ requireSigner: false });
      const user = await ndk.getUserFromNip05(candidate);
      if (user) {
        candidate = user.pubkey;
      } else {
        throw new Error('NIP-05 not found');
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'NIP-05 not found') {
      throw error;
    }
    throw new Error('Invalid identifier');
  }

  if (!/^[0-9a-fA-F]{64}$/.test(candidate)) {
    throw new Error('Invalid pubkey');
  }

  return candidate.toLowerCase();
}

async function handleSearch(forceRefresh = false) {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    statusMessage.value = '';
    showRetry.value = false;
    lastResolvedPubkeyHex.value = null;
    return;
  }

  statusMessage.value = '';
  showRetry.value = false;

  let resolvedHex: string;
  try {
    resolvedHex = await resolveSearchQuery(query);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Invalid identifier';
    statusMessage.value = message;
    lastResolvedPubkeyHex.value = null;
    searchResults.value = [];
    return;
  }

  lastResolvedPubkeyHex.value = resolvedHex;

  const cachedProfile = await hydrateCachedCreator(resolvedHex);
  const hasCachedResult = Boolean(cachedProfile);
  if (cachedProfile) {
    searchResults.value = [decorateProfile(cachedProfile, true)];
    statusMessage.value = 'Loaded cached data. Fetching live updates…';
  } else {
    searchResults.value = [];
  }

  try {
    await creatorsStore.searchCreators(resolvedHex, forceRefresh);
    const decorated = creatorsStore.searchResults.map((profile) =>
      decorateProfile(profile),
    );
    if (decorated.length) {
      searchResults.value = decorated;
      statusMessage.value = '';
      showRetry.value = false;
    } else if (!hasCachedResult) {
      statusMessage.value = 'Failed to fetch profile.';
      showRetry.value = true;
    }
  } catch (error) {
    console.error('Search failed:', error);
    if (hasCachedResult) {
      statusMessage.value = 'Showing cached data. Live search failed.';
    } else {
      statusMessage.value = 'Search failed. Please try again.';
    }
    showRetry.value = true;
  }
}

async function refreshCurrentCreator() {
  if (refreshingCache.value) {
    return;
  }

  let targetHex = lastResolvedPubkeyHex.value;

  if (!targetHex) {
    const query = searchQuery.value.trim();
    if (!query) {
      return;
    }
    try {
      targetHex = await resolveSearchQuery(query);
      lastResolvedPubkeyHex.value = targetHex;
    } catch (error) {
      statusMessage.value =
        error instanceof Error ? error.message : 'Invalid identifier';
      showRetry.value = false;
      return;
    }
  }

  if (!targetHex) {
    return;
  }

  refreshingCache.value = true;
  statusMessage.value = 'Refreshing creator cache...';
  showRetry.value = false;

  try {
    await creatorCacheService.updateCreator(targetHex);
    await creatorsStore.ensureCreatorCacheFromDexie(targetHex);
    const cachedProfile = await hydrateCachedCreator(targetHex);
    const hasCachedResult = Boolean(cachedProfile);

    if (cachedProfile) {
      searchResults.value = [decorateProfile(cachedProfile, true)];
      statusMessage.value = 'Cache refreshed. Fetching live data…';
    }

    await creatorsStore.searchCreators(targetHex, true);
    const decorated = creatorsStore.searchResults.map((profile) =>
      decorateProfile(profile),
    );

    if (decorated.length) {
      searchResults.value = decorated;
      statusMessage.value = '';
      showRetry.value = false;
    } else if (hasCachedResult) {
      statusMessage.value = 'Cache refreshed. No live updates available.';
      showRetry.value = true;
    } else {
      statusMessage.value = 'Could not load creators. Please try again.';
      showRetry.value = true;
    }
  } catch (error) {
    console.error('Manual creator refresh failed:', error);
    statusMessage.value = 'Refresh failed. Please try again.';
    showRetry.value = true;
  } finally {
    refreshingCache.value = false;
  }
}

function retrySearch() {
  void handleSearch(true);
}

async function loadFeatured() {
  await creatorsStore.loadFeaturedCreators();
}

async function refreshFeatured() {
  await creatorsStore.loadFeaturedCreators(true);
}

const router = useRouter();
const messenger = useMessengerStore();
const sendTokensStore = useSendTokensStore();
const nostr = useNostrStore();
const showDonateDialog = ref(false);
const selectedPubkey = ref("");
const donationStore = useDonationPresetsStore();
const showProfileModal = ref(false);
const selectedProfilePubkey = ref('');

function viewProfile(pubkey: string) {
  selectedProfilePubkey.value = pubkey;
  showProfileModal.value = true;
}

function startChat(pubkey: string) {
  const resolvedPubkey = nostr.resolvePubkey(pubkey);
  const url = router.resolve({ path: "/nostr-messenger", query: { pubkey: resolvedPubkey } }).href;
  window.open(url, '_blank');
}

function donate(pubkey: string) {
  selectedPubkey.value = pubkey;
  showDonateDialog.value = true;
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
  if (type === "one-time") {
    sendTokensStore.clearSendData();
    sendTokensStore.recipientPubkey = selectedPubkey.value;
    sendTokensStore.sendViaNostr = true;
    sendTokensStore.sendData.bucketId = bucketId;
    sendTokensStore.sendData.amount = amount;
    sendTokensStore.sendData.memo = message;
    sendTokensStore.sendData.p2pkPubkey = locked ? selectedPubkey.value : "";
    sendTokensStore.showLockInput = locked;
    sendTokensStore.showSendTokens = true;
  } else {
    donationStore.createDonationPreset(
      periods,
      amount,
      selectedPubkey.value,
      bucketId,
    );
  }

  showDonateDialog.value = false;
}

watch(showDonateDialog, (isOpen) => {
  if (!isOpen) {
    selectedPubkey.value = "";
  }
});
</script>


<style scoped>
.fixed-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 24px;
}

h1 {
  font-size: 2.5rem;
  margin: 0;
}

.find-creators-page {
  min-height: 100vh;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-1) 96%, transparent) 0%,
    color-mix(in srgb, var(--surface-1) 88%, rgba(15, 23, 42, 0.05)) 55%,
    color-mix(in srgb, var(--surface-1) 82%, rgba(15, 23, 42, 0.12)) 100%
  );
}

.find-creators-content {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 1.25rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2.75rem;
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
  gap: 24px;
}

.refresh-button {
  width: 100%;
}

.refresh-actions {
  display: flex;
  justify-content: flex-end;
  width: 100%;
}

.retry-wrapper {
  display: flex;
  justify-content: center;
}

.retry-button {
  width: 100%;
}

.empty-state p {
  max-width: 320px;
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

.result-status {
  justify-content: flex-start;
}

.result-status-chip {
  gap: 6px;
  border-radius: 999px;
  padding: 4px 12px;
  border-width: 1px;
  border-style: solid;
  background: color-mix(in srgb, var(--chip-bg) 70%, transparent);
  border-color: color-mix(in srgb, var(--accent-200) 35%, transparent);
}

.result-status-chip.is-cached {
  border-color: color-mix(in srgb, var(--accent-500) 40%, transparent);
  color: var(--accent-600);
}

.result-status-chip.is-live {
  border-color: color-mix(in srgb, var(--accent-200) 55%, transparent);
  color: var(--text-1);
}

.result-skeleton,
.featured-skeleton {
  border-radius: 16px;
  height: 240px;
}

@media (min-width: 768px) {
  .refresh-button,
  .retry-button {
    width: auto;
  }

  .find-creators-content {
    padding: 0 2rem 3.5rem;
    gap: 3.25rem;
  }
}

@media (min-width: 1200px) {
  .find-creators-content {
    padding: 0 2.75rem 4rem;
  }
}
</style>
