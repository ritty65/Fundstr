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

                <div
                  v-if="resultSummary"
                  class="search-results-toolbar row items-center justify-between q-col-gutter-md"
                >
                  <div class="text-body2 text-2">{{ resultSummary }}</div>
                  <div class="row items-center q-gutter-sm toolbar-controls">
                    <div class="row items-center q-gutter-xs filters-group">
                      <q-chip
                        v-for="filter in filterChips"
                        :key="filter.key"
                        clickable
                        dense
                        square
                        class="filter-chip"
                        :color="activeFilters[filter.key] ? 'accent' : 'accent-200'"
                        :outline="!activeFilters[filter.key]"
                        :text-color="activeFilters[filter.key] ? 'white' : 'text-2'"
                        :selected="activeFilters[filter.key]"
                        @click="toggleFilter(filter.key)"
                      >
                        {{ filter.label }}
                      </q-chip>
                    </div>
                    <q-btn-toggle
                      v-model="viewMode"
                      dense
                      unelevated
                      rounded
                      toggle-color="accent"
                      color="accent-200"
                      text-color="text-1"
                      :options="viewModeOptions"
                      class="view-mode-toggle"
                      aria-label="Toggle between grid and grouped views"
                    />
                    <q-select
                      v-model="sortOption"
                      dense
                      outlined
                      emit-value
                      map-options
                      dropdown-icon="expand_more"
                      options-dense
                      class="sort-select"
                      :options="sortOptions"
                      label="Sort by"
                    />
                  </div>
                </div>

                <div v-if="searchResults.length" class="column q-gutter-md">
                  <template v-if="viewMode === 'grid'">
                    <div class="fixed-grid">
                      <CreatorCard
                        v-for="profile in searchResults"
                        :key="profile.pubkey"
                        :profile="profile"
                        :cache-hit="profile.cacheHit === true"
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
                  </template>

                  <template v-else>
                    <div class="column q-gutter-lg grouped-results">
                      <section
                        v-for="group in groupedResults"
                        :key="group.key"
                        class="grouped-section"
                        aria-live="polite"
                      >
                        <h2 class="grouped-heading text-subtitle1 text-bold">{{ group.title }}</h2>
                        <div class="fixed-grid">
                          <CreatorCard
                            v-for="profile in group.profiles"
                            :key="profile.pubkey"
                            :profile="profile"
                            :cache-hit="profile.cacheHit === true"
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
                      </section>
                    </div>
                  </template>

                  <div v-if="false" class="load-more-wrapper">
                    <!-- The new API does not support pagination. This is hidden. -->
                  </div>
                </div>

                <div
                  v-else-if="showSearchEmptyState || showInitialEmptyState"
                  class="empty-state column items-center text-center q-pt-xl q-pb-xl q-px-md text-2"
                >
                  <div class="empty-illustration q-mb-md" aria-hidden="true">
                    <div class="empty-illustration__halo">
                      <q-icon name="travel_explore" size="3.5rem" class="text-accent-500" />
                    </div>
                    <div class="empty-badges" role="group" aria-label="Quick filter toggles">
                      <div
                        v-for="action in emptyStateFilterActions"
                        :key="action.key"
                        class="badge-toggle"
                      >
                        <q-btn
                          outline
                          color="accent"
                          no-caps
                          size="sm"
                          padding="10px 14px"
                          :icon="action.icon"
                          :label="action.label"
                          :aria-label="action.ariaLabel || action.label"
                          @click="applyFilterSampleAction(action)"
                        />
                        <div class="text-caption text-2 badge-toggle__helper">{{ action.helper }}</div>
                      </div>
                    </div>
                  </div>
                  <div class="text-h6 text-1">{{ emptyStateTitle }}</div>
                  <p class="text-body1 q-mt-sm q-mb-none">{{ emptyStateMessage }}</p>

                  <div class="empty-actions column q-gutter-md q-mt-md">
                    <div class="row justify-center q-col-gutter-sm sample-queries">
                      <q-btn
                        v-for="sample in sampleQueries"
                        :key="sample.value"
                        outline
                        color="accent"
                        no-caps
                        size="sm"
                        padding="10px 14px"
                        :label="sample.label"
                        @click="applySampleQuery(sample.value)"
                      />
                    </div>
                    <div class="row justify-center q-col-gutter-sm empty-ctas">
                      <q-btn
                        outline
                        icon="content_paste"
                        color="accent"
                        no-caps
                        label="Paste npub"
                        @click="pasteNpubFromClipboard"
                      />
                      <q-btn
                        flat
                        icon="auto_awesome"
                        color="accent"
                        no-caps
                        label="Go to Featured Creators"
                        @click="jumpToFeatured"
                      />
                    </div>
                    <div class="text-body2 text-2 helper-text">
                      Run a filtered sample search with the toggles above, try a suggested search, paste an npub, or jump to our curated list.
                    </div>
                  </div>
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
import CreatorCard from 'components/CreatorCard.vue';
import { useNostrStore } from 'stores/nostr';
import { useCreatorsStore, type CreatorProfile } from 'stores/creators';
import { useMessengerStore } from 'stores/messenger';
import { useMintsStore } from 'stores/mints';
import { useBucketsStore } from 'stores/buckets';
import { useUiStore } from 'stores/ui';
import { notifyError, notifyWarning } from 'src/js/notify';
import { debug } from '@/js/logger';
import {
  mintSupportsSplit,
  resolveSupportedNuts,
  SPLIT_SUPPORT_REQUIRED_MESSAGE,
} from 'src/utils/nuts';
import { useDonationPrompt } from '@/composables/useDonationPrompt';
import { useI18n } from 'vue-i18n';

type FilterKey =
  | 'hasTiers'
  | 'hasLightning'
  | 'featured'
  | 'nip05Verified'
  | 'fundstrCreator'
  | 'signalOnly';
type SortOption = 'relevance' | 'followers';
type ViewMode = 'grid' | 'grouped';

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
const { open: openDonationPrompt } = useDonationPrompt();
const { t } = useI18n();

const searchQuery = ref('');
const initialLoadComplete = ref(false);

const searchSkeletonPlaceholders = [0, 1, 2];
const featuredSkeletonPlaceholders = [0, 1, 2, 3, 4, 5];

type EmptyStateFilterAction = {
  key: FilterKey;
  label: string;
  icon: string;
  helper: string;
  sampleQuery: string;
  ariaLabel?: string;
};

const sampleQueries = [
  { label: 'Lightning devs', value: 'lightning' },
  { label: 'NIP-05 creators', value: 'nip-05' },
  { label: 'Zaps & tipping', value: 'zap me' },
];

const emptyStateFilterActions: EmptyStateFilterAction[] = [
  {
    key: 'hasLightning',
    label: 'Lightning builders',
    icon: 'bolt',
    helper: 'Filters to creators ready for lightning zaps.',
    sampleQuery: 'lightning',
    ariaLabel: 'Search lightning-ready creators and enable the lightning filter',
  },
  {
    key: 'nip05Verified',
    label: 'NIP-05 ready',
    icon: 'verified',
    helper: 'Shows creators with verified NIP-05 handles.',
    sampleQuery: 'nip-05',
    ariaLabel: 'Search verified NIP-05 creators and enable the verification filter',
  },
];

const filterChips: { key: FilterKey; label: string }[] = [
  { key: 'hasTiers', label: 'Has tiers' },
  { key: 'hasLightning', label: 'Has lightning' },
  { key: 'featured', label: 'Featured' },
  { key: 'nip05Verified', label: 'NIP-05 verified' },
  { key: 'fundstrCreator', label: 'Fundstr creator' },
  { key: 'signalOnly', label: 'Signal only' },
];

const sortOptions = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'Followers', value: 'followers' },
];

const activeFilters = ref<Record<FilterKey, boolean>>({
  hasTiers: false,
  hasLightning: false,
  featured: false,
  nip05Verified: false,
  fundstrCreator: false,
  signalOnly: false,
});

const viewMode = ref<ViewMode>('grid');

const sortOption = ref<SortOption>('relevance');

const viewModeOptions = [
  { label: 'Grid', icon: 'grid_view', value: 'grid' },
  { label: 'Grouped', icon: 'view_agenda', value: 'grouped' },
];

const trimmedQuery = computed(() => (searchQuery.value || '').trim());
const hasQuery = computed(() => trimmedQuery.value.length > 0);
const searchLoading = computed(() => searching.value);
const searchError = computed(() => storeError.value);
const searchWarnings = computed(() => storeSearchWarnings?.value ?? []);
const searchFilters = computed(() => ({ ...activeFilters.value }));
const resultSummary = computed(() => {
  if (!initialLoadComplete.value) {
    return '';
  }

  if (!hasQuery.value && !searchResults.value.length && !searchLoading.value) {
    return '';
  }

  if (searchLoading.value) {
    return 'Searching creators...';
  }

  const count = searchResults.value.length;
  const noun = count === 1 ? 'creator' : 'creators';
  return `${count} ${noun} found`;
});
const loadingFeatured = computed(() => storeLoadingFeatured?.value ?? false);

const toNullableString = (value: unknown) =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const isTruthyFlag = (value: unknown) =>
  value === true || value === 'true' || value === 1 || value === '1';

const creatorIsFundstrCreator = (profile: CreatorProfile) => {
  if (profile.isCreator !== undefined && profile.isCreator !== null) {
    return Boolean(profile.isCreator);
  }

  const profileRecord = (profile?.profile ?? {}) as Record<string, unknown>;
  const metaRecord = (profile?.meta ?? {}) as Record<string, unknown>;

  return [
    (profile as Record<string, unknown> | null | undefined)?.['fundstrCreator'],
    profileRecord['fundstr_creator'],
    profileRecord['fundstrCreator'],
    metaRecord['fundstr_creator'],
    metaRecord['fundstrCreator'],
  ].some(isTruthyFlag);
};

const creatorHasVerifiedNip05 = (profile: CreatorProfile) => {
  if (profile.nip05Verified !== undefined && profile.nip05Verified !== null) {
    return Boolean(profile.nip05Verified);
  }

  const profileRecord = (profile?.profile ?? {}) as Record<string, unknown>;
  const metaRecord = (profile?.meta ?? {}) as Record<string, unknown>;

  const nip05Value =
    toNullableString(profile.nip05) ??
    toNullableString(profileRecord['nip05']) ??
    toNullableString(metaRecord['nip05']);

  const verifiedHandle = toNullableString(metaRecord['nip05_verified_value']);

  return Boolean(
    nip05Value &&
      verifiedHandle &&
      nip05Value.trim().toLowerCase() === verifiedHandle.trim().toLowerCase(),
  );
};

const isPersonalProfile = (profile: CreatorProfile) => profile.isPersonal === true;

const isCreatorProfile = (profile: CreatorProfile) => {
  if (profile.isCreator !== undefined && profile.isCreator !== null) {
    return Boolean(profile.isCreator);
  }

  return Boolean(profile.featured || profile.hasTiers || profile.hasLightning);
};

const groupedResults = computed(() => {
  const groups = [
    { key: 'fundstr', title: 'Fundstr creators', predicate: creatorIsFundstrCreator },
    { key: 'verified', title: 'NIP-05 verified', predicate: creatorHasVerifiedNip05 },
    { key: 'creators', title: 'Creators', predicate: isCreatorProfile },
    { key: 'personal', title: 'Personal profiles', predicate: isPersonalProfile },
  ];

  const buckets = groups.map((group) => ({ ...group, profiles: [] as CreatorProfile[] }));
  const ungrouped: CreatorProfile[] = [];

  for (const profile of searchResults.value) {
    const bucket = buckets.find((group) => group.predicate(profile));
    if (bucket) {
      bucket.profiles.push(profile);
    } else {
      ungrouped.push(profile);
    }
  }

  if (ungrouped.length) {
    buckets.push({
      key: 'other',
      title: 'Other profiles',
      predicate: () => true,
      profiles: ungrouped,
    });
  }

  return buckets.filter((group) => group.profiles.length > 0);
});
const showSearchEmptyState = computed(
  () =>
    initialLoadComplete.value &&
    !searchLoading.value &&
    !searchError.value &&
    searchWarnings.value.length === 0 &&
    !searchResults.value.length &&
    hasQuery.value,
);
const showInitialEmptyState = computed(
  () =>
    initialLoadComplete.value &&
    !searchLoading.value &&
    !searchError.value &&
    searchWarnings.value.length === 0 &&
    !searchResults.value.length &&
    !hasQuery.value,
);

const emptyStateTitle = computed(() =>
  showInitialEmptyState.value ? 'Search for creators' : 'No profiles yet',
);
const emptyStateMessage = computed(() =>
  showInitialEmptyState.value
    ? 'Start typing a name, npub, or NIP-05 handle to find creators.'
    : 'Try a different name or paste an npub to explore more creators.',
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
  void runSearch({ fresh: true });
};

const debouncedSearch = debounce(() => {
  void runSearch();
}, 300);

const applyClientFilters = () => {
  creatorsStore.applySearchFilters(searchFilters.value, sortOption.value);
};

watch(
  () => ({ ...activeFilters.value }),
  () => {
    applyClientFilters();
  },
  { deep: true },
);

watch(sortOption, () => {
  applyClientFilters();
});

const loadMore = () => {
  // The new discovery service does not support pagination.
  // This function is now a no-op but is kept to prevent template errors.
  // The "Load More" button will be hidden via `hasMoreResults`.
};

async function runSearch({ fresh = false }: { fresh?: boolean } = {}) {
  try {
    await creatorsStore.searchCreators(trimmedQuery.value, {
      fresh,
      filters: searchFilters.value,
      sort: sortOption.value,
    });
  } finally {
    initialLoadComplete.value = true;
  }
}

async function loadFeatured(force = false) {
  await creatorsStore.loadFeaturedCreators(force);
}

const featuredError = computed(() => storeFeaturedError.value);

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

  if (!hasActiveMint || !hasPositiveBalance || !hasActiveBucketWithFunds) {
    const title = t('DonationPrompt.cashu.ctas.setupTitle');
    const description = t('DonationPrompt.cashu.ctas.setupDescription');

    notifyWarning(title, description);
    showProfileModal.value = false;

    if (!hasActiveMint) {
      void openDonationPrompt({ bypassGate: true, defaultTab: 'cashu' });
    }

    void router.push('/wallet');
    return;
  }
  if (!nostr.hasIdentity) {
    uiStore.showMissingSignerModal = true;
    notifyWarning(
      'You\'ll need a Nostr identity before we can deliver the Cashu token.',
    );
    return;
  }

  try {
    await nostr.initSignerIfNotSet();
  } catch (error) {
    notifyError('We couldn\'t connect to your Nostr signer. Please try again.');
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

function toggleFilter(filterKey: FilterKey) {
  activeFilters.value = {
    ...activeFilters.value,
    [filterKey]: !activeFilters.value[filterKey],
  };
}

const applySampleQuery = (query: string) => {
  searchQuery.value = query;
  triggerImmediateSearch();
};

const applyFilterSampleAction = (action: EmptyStateFilterAction) => {
  activeFilters.value = {
    ...activeFilters.value,
    [action.key]: true,
  };

  applySampleQuery(action.sampleQuery);
};

const pasteNpubFromClipboard = async () => {
  if (!navigator?.clipboard?.readText) {
    notifyWarning('Clipboard access is unavailable. Paste manually instead.');
    return;
  }

  try {
    const npub = (await navigator.clipboard.readText()).trim();
    if (!npub) {
      notifyWarning('Your clipboard is empty. Copy an npub and try again.');
      return;
    }
    searchQuery.value = npub;
    triggerImmediateSearch();
  } catch (error) {
    debug('Failed to paste npub from clipboard', error);
    notifyError('Unable to read from your clipboard. Please paste manually.');
  }
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

onMounted(() => {
  redirectToCreatorIfPresent();
  if (hasQuery.value) {
    void runSearch();
  } else {
    initialLoadComplete.value = true;
  }
  void loadFeatured();
});
</script>


<style scoped>

.fixed-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: clamp(20px, 2vw, 32px);
}

@media (min-width: 1100px) {
  .fixed-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (min-width: 1360px) {
  .fixed-grid {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }
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

.badge {
  font-weight: 600;
  letter-spacing: 0.01em;
}

.badge-featured {
  background: var(--accent-200);
  color: var(--text-1);
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

.page-shell {
  padding-inline: clamp(1.5rem, 4vw, 3rem);
}

.find-creators-content {
  width: min(100%, 160rem);
  margin: 0 auto;
  padding-block-end: 3rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: clamp(2.5rem, 2.25vw, 3.25rem);
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

.empty-illustration {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.empty-illustration__halo {
  width: 108px;
  height: 108px;
  display: grid;
  place-items: center;
  border-radius: 26px;
  background: color-mix(in srgb, var(--accent-200) 24%, transparent);
  border: 1px solid var(--surface-contrast-border);
  box-shadow:
    0 10px 30px rgba(15, 23, 42, 0.06),
    0 18px 46px rgba(15, 23, 42, 0.08);
}

.empty-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
}

.badge-toggle {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
  width: 100%;
  min-width: 180px;
}

.badge-toggle__helper {
  line-height: 1.35;
}

.empty-actions {
  width: 100%;
  max-width: 640px;
}

.sample-queries .q-btn {
  width: 100%;
}

@media (min-width: 600px) {
  .sample-queries .q-btn {
    width: auto;
  }

  .badge-toggle {
    width: auto;
  }
}

.empty-ctas .q-btn {
  min-width: 180px;
}

.helper-text {
  max-width: 540px;
  margin: 0 auto;
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

.search-results-toolbar {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--surface-contrast-border);
  background: color-mix(in srgb, var(--surface-2) 85%, transparent);
  gap: 10px;
}

.toolbar-controls {
  flex-wrap: wrap;
}

.filters-group {
  flex-wrap: wrap;
}

.filter-chip {
  border: 1px solid var(--surface-contrast-border);
}

.sort-select {
  min-width: 160px;
}

.view-mode-toggle {
  min-width: 164px;
}

.grouped-results {
  width: 100%;
}

.grouped-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grouped-heading {
  margin: 0;
}


.result-skeleton,
.featured-skeleton {
  border-radius: 16px;
  height: 240px;
}

@media (min-width: 768px) {
  .find-creators-content {
    padding-block-end: 3.5rem;
  }
}

@media (min-width: 1600px) {
  .find-creators-content {
    width: min(100%, 180rem);
  }
}

@media (min-width: 1920px) {
  .find-creators-content {
    width: min(100%, 200rem);
  }
}
</style>
