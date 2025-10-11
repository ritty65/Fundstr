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
                :loading="searchLoading && !loadingMore"
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
            </q-form>

            <section class="column q-gutter-lg" role="region" aria-live="polite">
              <div v-if="searchLoading && !searchResults.length" class="row q-col-gutter-lg" aria-label="Searching creators">
                <div
                  v-for="placeholder in searchSkeletonPlaceholders"
                  :key="placeholder"
                  class="col-12 col-sm-6 col-md-4"
                >
                  <q-skeleton type="rect" class="result-skeleton bg-surface-1" />
                </div>
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

                <div v-if="searchResults.length" class="column q-gutter-md">
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

                  <div v-if="hasMoreResults" class="load-more-wrapper">
                    <q-btn
                      outline
                      no-caps
                      color="accent"
                      class="load-more-button"
                      label="Load more"
                      :loading="loadingMore"
                      :disable="loadingMore"
                      @click="loadMore"
                    />
                  </div>
                </div>

                <div
                  v-else-if="showSearchEmptyState || showInitialEmptyState"
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
              </template>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import CreatorProfileModal from 'components/CreatorProfileModal.vue';
import CreatorCard from 'components/CreatorCard.vue';
import DonateDialog from 'components/DonateDialog.vue';
import SendTokenDialog from 'components/SendTokenDialog.vue';
import { useSendTokensStore } from 'stores/sendTokensStore';
import { useDonationPresetsStore } from 'stores/donationPresets';
import { useNostrStore } from 'stores/nostr';
import { fetchCreators, fetchCreator, type Creator } from 'src/lib/fundstrApi';
import { FEATURED_CREATORS } from 'stores/creators';

const DEFAULT_LIMIT = 9;

const searchQuery = ref('');
const searchResults = ref<Creator[]>([]);
const searchLoading = ref(false);
const loadingMore = ref(false);
const searchError = ref('');
const hasMoreResults = ref(true);
const initialLoadComplete = ref(false);

const searchSkeletonPlaceholders = [0, 1, 2];
const featuredSkeletonPlaceholders = [0, 1, 2, 3];

const requestCache = new Map<string, Promise<Creator[]>>();
const responseCache = new Map<string, Creator[]>();
let activeRequest: { key: string; controller: AbortController } | null = null;

const trimmedQuery = computed(() => searchQuery.value.trim());
const hasQuery = computed(() => trimmedQuery.value.length > 0);
const showSearchEmptyState = computed(
  () =>
    initialLoadComplete.value &&
    !searchLoading.value &&
    !loadingMore.value &&
    !searchError.value &&
    !searchResults.value.length &&
    hasQuery.value,
);
const showInitialEmptyState = computed(
  () =>
    initialLoadComplete.value &&
    !searchLoading.value &&
    !loadingMore.value &&
    !searchError.value &&
    !searchResults.value.length &&
    !hasQuery.value,
);

function debounce(func: (...args: any[]) => void, delay: number) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function (this: unknown, ...args: any[]) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

const triggerImmediateSearch = () => {
  void runSearch();
};

const debouncedSearch = debounce(() => {
  void runSearch();
}, 300);

const loadMore = () => {
  void runSearch({ append: true });
};

function applySearchResults(creators: Creator[], append: boolean) {
  if (append) {
    searchResults.value = [...searchResults.value, ...creators];
  } else {
    searchResults.value = [...creators];
  }
  hasMoreResults.value = creators.length === DEFAULT_LIMIT;
  searchError.value = '';
  if (!append) {
    initialLoadComplete.value = true;
  }
}

function finalizeSearch(append: boolean, aborted: boolean) {
  if (append) {
    loadingMore.value = false;
  } else {
    searchLoading.value = false;
    if (!aborted) {
      initialLoadComplete.value = true;
    }
  }
}

async function runSearch({ append = false }: { append?: boolean } = {}) {
  const query = trimmedQuery.value;
  const offset = append ? searchResults.value.length : 0;
  const cacheKey = JSON.stringify({ q: query, limit: DEFAULT_LIMIT, offset });

  if (append) {
    if (loadingMore.value || !hasMoreResults.value) {
      return;
    }
  } else {
    hasMoreResults.value = true;
  }

  if (activeRequest && activeRequest.key !== cacheKey) {
    activeRequest.controller.abort();
    activeRequest = null;
  }

  if (append) {
    loadingMore.value = true;
  } else {
    searchLoading.value = true;
  }
  searchError.value = '';

  const cachedResponse = responseCache.get(cacheKey);
  if (cachedResponse) {
    applySearchResults(cachedResponse, append);
    finalizeSearch(append, false);
    return;
  }

  let promise = requestCache.get(cacheKey);
  if (!promise) {
    const controller = new AbortController();
    activeRequest = { key: cacheKey, controller };
    promise = fetchCreators(query, DEFAULT_LIMIT, offset, controller.signal);
    requestCache.set(cacheKey, promise);
  }

  let aborted = false;
  try {
    const creators = await promise!;
    responseCache.set(cacheKey, creators);
    applySearchResults(creators, append);
  } catch (error) {
    if ((error as any)?.name === 'AbortError') {
      aborted = true;
    } else {
      if (!append) {
        searchResults.value = [];
      }
      hasMoreResults.value = false;
      searchError.value =
        error instanceof Error ? error.message : 'Unable to load creators. Please try again.';
    }
  } finally {
    if (requestCache.get(cacheKey) === promise) {
      requestCache.delete(cacheKey);
    }
    if (activeRequest && activeRequest.key === cacheKey) {
      activeRequest = null;
    }
    finalizeSearch(append, aborted);
  }
}

const featuredCreators = ref<Creator[]>([]);
const featuredError = ref('');
const loadingFeatured = ref(false);
const featuredCache = new Map<string, Creator>();
const featuredControllers = new Set<AbortController>();

function registerFeaturedController(controller: AbortController) {
  featuredControllers.add(controller);
  controller.signal.addEventListener(
    'abort',
    () => {
      featuredControllers.delete(controller);
    },
    { once: true },
  );
}

async function loadFeatured(force = false) {
  if (loadingFeatured.value) {
    return;
  }
  loadingFeatured.value = true;
  featuredError.value = '';

  const settled = await Promise.allSettled(
    FEATURED_CREATORS.map(async (npub) => {
      if (!force && featuredCache.has(npub)) {
        return featuredCache.get(npub)!;
      }
      const controller = new AbortController();
      registerFeaturedController(controller);
      try {
        const creator = await fetchCreator(npub, controller.signal);
        const decorated: Creator = { ...creator, featured: true };
        featuredCache.set(npub, decorated);
        return decorated;
      } finally {
        featuredControllers.delete(controller);
      }
    }),
  );

  const nextCreators: Creator[] = [];
  let failures = 0;

  settled.forEach((result, index) => {
    const npub = FEATURED_CREATORS[index];
    if (result.status === 'fulfilled') {
      const creator = { ...result.value, featured: true };
      featuredCache.set(npub, creator);
      nextCreators.push(creator);
    } else if (featuredCache.has(npub)) {
      nextCreators.push(featuredCache.get(npub)!);
      failures += 1;
    } else {
      failures += 1;
    }
  });

  if (nextCreators.length) {
    featuredCreators.value = nextCreators;
    if (failures === settled.length) {
      featuredError.value = 'Could not load featured creators. Please try again later.';
    } else if (failures > 0) {
      featuredError.value = 'Some featured creators could not be loaded.';
    }
  } else {
    featuredCreators.value = [];
    featuredError.value = 'Could not load featured creators. Please try again later.';
  }

  loadingFeatured.value = false;
}

const featuredStatusMessage = computed(() => {
  if (featuredError.value) {
    return featuredError.value;
  }
  if (loadingFeatured.value && !featuredCreators.value.length) {
    return 'Loading creators...';
  }
  if (!loadingFeatured.value && !featuredCreators.value.length) {
    return 'No featured creators available right now.';
  }
  return '';
});

const showFeaturedEmptyState = computed(
  () => !loadingFeatured.value && !featuredCreators.value.length && !featuredError.value,
);

const refreshFeatured = () => {
  void loadFeatured(true);
};

const router = useRouter();
const route = useRoute();
const sendTokensStore = useSendTokensStore();
const nostr = useNostrStore();
const donationStore = useDonationPresetsStore();
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
  }

  showDonateDialog.value = false;
}

watch(showDonateDialog, (isOpen) => {
  if (!isOpen) {
    selectedPubkey.value = '';
  }
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

  return 'info';
};

function redirectToCreatorIfPresent() {
  const npub = route.query.npub;
  if (typeof npub === 'string' && npub.trim()) {
    void router.replace({ name: 'creator-profile', params: { npub: npub.trim() } });
  }
}

onMounted(() => {
  redirectToCreatorIfPresent();
  void runSearch();
  void loadFeatured();
});

onBeforeUnmount(() => {
  if (activeRequest) {
    activeRequest.controller.abort();
    activeRequest = null;
  }
  featuredControllers.forEach((controller) => controller.abort());
  featuredControllers.clear();
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


.load-more-wrapper {
  display: flex;
  justify-content: center;
}

.load-more-button {
  min-width: 180px;
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


.result-skeleton,
.featured-skeleton {
  border-radius: 16px;
  height: 240px;
}

@media (min-width: 768px) {
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
