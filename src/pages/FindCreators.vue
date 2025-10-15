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
                :loading="searchLoading"
                input-class="text-1"
                @clear="handleClear"
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
              <div
                v-if="searchLoading && !searchResults.length"
                class="row q-col-gutter-lg"
                aria-label="Searching creators"
              >
                <div
                  v-for="placeholder in searchSkeletonPlaceholders"
                  :key="`search-skeleton-${placeholder}`"
                  class="col-12 col-sm-6 col-md-4"
                >
                  <q-skeleton type="rect" class="result-skeleton bg-surface-1" />
                </div>
              </div>

              <template v-else>
                <q-banner
                  v-if="searchErrorMessage"
                  rounded
                  dense
                  class="status-banner text-1"
                  aria-live="polite"
                >
                  <template #avatar>
                    <q-icon name="warning" size="20px" />
                  </template>
                  <div class="row items-center q-gutter-sm">
                    <span class="status-banner__text">{{ searchErrorMessage }}</span>
                    <q-btn flat dense color="accent" label="Retry" @click="retrySearch" />
                  </div>
                </q-banner>

                <div v-if="searchResults.length" class="fixed-grid">
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

                <div
                  v-else-if="showInitialEmptyState"
                  class="empty-state column items-center text-center q-pt-xl q-pb-xl q-px-md text-2"
                >
                  <q-icon
                    name="lightbulb"
                    size="4rem"
                    class="q-mb-md text-accent-500"
                    aria-hidden="true"
                  />
                  <div class="text-h6 text-1">Search for creators</div>
                  <p class="text-body1 q-mt-sm q-mb-none">
                    Start typing a name, npub, or NIP-05 handle to find creators.
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
                  :loading="featuredLoading"
                  :disable="featuredLoading"
                  @click="refreshFeatured"
                />
              </div>
            </div>

            <q-banner
              v-if="featuredErrorMessage"
              rounded
              dense
              class="status-banner text-1 q-mt-md"
              aria-live="polite"
            >
              <template #avatar>
                <q-icon name="warning" size="20px" />
              </template>
              <div class="row items-center q-gutter-sm">
                <span class="status-banner__text">{{ featuredErrorMessage }}</span>
                <q-btn flat dense color="accent" label="Retry" @click="refreshFeatured" />
              </div>
            </q-banner>

            <div class="q-mt-md" role="region" aria-live="polite">
              <div
                v-if="featuredLoading && !featuredList.length"
                class="row q-col-gutter-lg"
              >
                <div
                  v-for="placeholder in featuredSkeletonPlaceholders"
                  :key="`featured-skeleton-${placeholder}`"
                  class="col-12 col-sm-6 col-md-4"
                >
                  <q-skeleton type="rect" class="featured-skeleton bg-surface-1" />
                </div>
              </div>

              <div v-else-if="featuredList.length" class="fixed-grid">
                <CreatorCard
                  v-for="profile in featuredList"
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
import { storeToRefs } from 'pinia';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import CreatorProfileModal from 'components/CreatorProfileModal.vue';
import CreatorCard from 'components/CreatorCard.vue';
import DonateDialog from 'components/DonateDialog.vue';
import SendTokenDialog from 'components/SendTokenDialog.vue';
import { useSendTokensStore } from 'stores/sendTokensStore';
import { useDonationPresetsStore } from 'stores/donationPresets';
import { useNostrStore } from 'stores/nostr';
import { useCreatorsStore } from 'stores/creators';
import { FEATURED_CREATORS } from 'src/config/featured-creators';

const $q = useQuasar();

const creatorsStore = useCreatorsStore();
const {
  searchResults,
  loadingSearch,
  errorSearch,
  featured,
  featuredCreators,
  loadingFeatured,
  errorFeatured,
} = storeToRefs(creatorsStore);

const featuredList = computed(() =>
  featured.value.length ? featured.value : featuredCreators.value,
);

const featuredLoading = computed(() => loadingFeatured.value);
const featuredErrorMessage = computed(
  () => errorFeatured.value || creatorsStore.featuredError || '',
);

const searchQuery = ref('');
const trimmedQuery = computed(() => searchQuery.value.trim());
const initialSearchPerformed = ref(false);

const searchSkeletonPlaceholders = [0, 1, 2];
const featuredSkeletonPlaceholders = [0, 1, 2, 3, 4, 5];

let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const searchLoading = computed(() => loadingSearch.value || creatorsStore.searching);
const searchErrorMessage = computed(
  () => errorSearch.value || creatorsStore.error || '',
);

const showSearchEmptyState = computed(
  () =>
    initialSearchPerformed.value &&
    !searchLoading.value &&
    !searchErrorMessage.value &&
    searchResults.value.length === 0 &&
    trimmedQuery.value.length > 0,
);

const showInitialEmptyState = computed(
  () =>
    !initialSearchPerformed.value &&
    !searchLoading.value &&
    !searchErrorMessage.value &&
    searchResults.value.length === 0 &&
    trimmedQuery.value.length === 0,
);

const router = useRouter();
const route = useRoute();
const sendTokensStore = useSendTokensStore();
const donationStore = useDonationPresetsStore();
const nostr = useNostrStore();

const showDonateDialog = ref(false);
const selectedPubkey = ref('');
const showProfileModal = ref(false);
const selectedProfilePubkey = ref('');

const runSearch = async ({ fresh = false }: { fresh?: boolean } = {}) => {
  const query = trimmedQuery.value;
  await creatorsStore.searchCreators(query, { fresh });
  if (query) {
    initialSearchPerformed.value = true;
  }
};

const triggerImmediateSearch = () => {
  if (!trimmedQuery.value) {
    handleClear();
    return;
  }
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  void runSearch({ fresh: true });
};

const retrySearch = () => {
  if (!trimmedQuery.value) {
    return;
  }
  void runSearch({ fresh: true });
};

const handleClear = () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  searchQuery.value = '';
  void creatorsStore.searchCreators('');
  initialSearchPerformed.value = false;
};

watch(trimmedQuery, (value) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  if (!value) {
    void creatorsStore.searchCreators('');
    initialSearchPerformed.value = false;
    return;
  }
  searchTimeout = setTimeout(() => {
    void runSearch();
  }, 350);
});

onBeforeUnmount(() => {
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
});

const loadFeatured = () => {
  void creatorsStore.loadFeatured(FEATURED_CREATORS);
};

const refreshFeatured = () => {
  void creatorsStore.refreshFeatured(FEATURED_CREATORS);
};

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

function redirectToCreatorIfPresent() {
  const npub = route.query.npub;
  if (typeof npub === 'string' && npub.trim()) {
    void router.replace({ name: 'creator-profile', params: { npub: npub.trim() } });
  }
}

onMounted(() => {
  redirectToCreatorIfPresent();
  if (trimmedQuery.value) {
    void runSearch();
  }
  loadFeatured();
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
