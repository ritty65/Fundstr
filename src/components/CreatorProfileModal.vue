<template>
  <q-dialog
    v-model="showLocal"
    backdrop-filter="blur(6px)"
    class="profile-dialog"
    :class="dialogClasses"
    :maximized="isDialogMaximized"
    content-class="profile-dialog__inner"
  >
    <q-card class="profile-card" :class="{ 'profile-card--two-column': isTwoColumnViewport }">
      <div class="profile-layout" :class="{ 'profile-layout--two-column': isTwoColumnViewport }">
        <div class="profile-layout__hero" :class="{ 'profile-layout__hero--desktop': isTwoColumnViewport }">
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
                    <div v-if="creatorPubkey && !props.compact" class="hero-identity">
                      <div class="hero-identity__row">
                        <span class="hero-identity__label text-2">npub</span>
                        <span class="hero-identity__value">{{ creatorNpub }}</span>
                        <q-btn
                          flat
                          dense
                          round
                          icon="content_copy"
                          class="hero-identity__copy"
                          aria-label="Copy creator npub to clipboard"
                          @click="copyIdentity(creatorNpub, 'npub')"
                        >
                          <q-tooltip v-model="copiedState.npub" anchor="top middle" self="bottom middle">
                            Copied
                          </q-tooltip>
                        </q-btn>
                      </div>
                      <div class="hero-identity__row">
                        <span class="hero-identity__label text-2">pubkey</span>
                        <span class="hero-identity__value">{{ creatorPubkey }}</span>
                        <q-btn
                          flat
                          dense
                          round
                          icon="content_copy"
                          class="hero-identity__copy"
                          aria-label="Copy creator pubkey to clipboard"
                          @click="copyIdentity(creatorPubkey, 'pubkey')"
                        >
                          <q-tooltip v-model="copiedState.pubkey" anchor="top middle" self="bottom middle">
                            Copied
                          </q-tooltip>
                        </q-btn>
                      </div>
                      <div v-if="identityLinks.length" class="hero-identity__links">
                        <a
                          v-for="link in identityLinks"
                          :key="link.label"
                          class="hero-identity__link"
                          :href="link.url"
                          target="_blank"
                          rel="noopener"
                        >
                          {{ link.label }}
                        </a>
                      </div>
                    </div>
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
                      :class="{
                        'hero-actions--inline': isHeroActionsInline,
                        'hero-actions--preview-grid': props.compact,
                      }"
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
                    <div
                      v-if="props.compact && (trustedRankValue !== null || followersDisplay || lightningAddress)"
                      class="hero-snapshot-strip"
                      aria-label="Creator snapshot"
                    >
                      <div
                        v-if="trustedRankValue !== null"
                        class="hero-snapshot-pill hero-snapshot-pill--trusted"
                      >
                        <q-icon name="shield" size="14px" />
                        <span>Trusted {{ trustedRankValue }}</span>
                      </div>
                      <div v-if="followersDisplay" class="hero-snapshot-pill">
                        <q-icon name="groups" size="14px" />
                        <span>{{ followersDisplay }} followers</span>
                      </div>
                      <div v-if="lightningAddress" class="hero-snapshot-pill">
                        <q-icon name="bolt" size="14px" />
                        <span>Lightning ready</span>
                      </div>
                    </div>
                    <div v-if="creatorPubkey && props.compact" class="hero-identity hero-identity--compact">
                      <div v-if="identityLinks.length" class="hero-identity__links hero-identity__links--compact">
                        <a
                          v-for="link in identityLinks"
                          :key="link.label"
                          class="hero-identity__link"
                          :href="link.url"
                          target="_blank"
                          rel="noopener"
                        >
                          {{ link.label }}
                        </a>
                      </div>
                      <details class="hero-identity__details">
                        <summary class="hero-identity__summary">View public keys and copy tools</summary>
                        <div class="hero-identity__details-body">
                          <div class="hero-identity__row">
                            <span class="hero-identity__label text-2">npub</span>
                            <span class="hero-identity__value">{{ creatorNpub }}</span>
                            <q-btn
                              flat
                              dense
                              round
                              icon="content_copy"
                              class="hero-identity__copy"
                              aria-label="Copy creator npub to clipboard"
                              @click="copyIdentity(creatorNpub, 'npub')"
                            >
                              <q-tooltip v-model="copiedState.npub" anchor="top middle" self="bottom middle">
                                Copied
                              </q-tooltip>
                            </q-btn>
                          </div>
                          <div class="hero-identity__row">
                            <span class="hero-identity__label text-2">pubkey</span>
                            <span class="hero-identity__value">{{ creatorPubkey }}</span>
                            <q-btn
                              flat
                              dense
                              round
                              icon="content_copy"
                              class="hero-identity__copy"
                              aria-label="Copy creator pubkey to clipboard"
                              @click="copyIdentity(creatorPubkey, 'pubkey')"
                            >
                              <q-tooltip v-model="copiedState.pubkey" anchor="top middle" self="bottom middle">
                                Copied
                              </q-tooltip>
                            </q-btn>
                          </div>
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              </div>
            </q-card-section>
          </div>
        </div>

        <div class="profile-layout__content" :class="{ 'profile-layout__content--desktop': isTwoColumnViewport }">
          <div class="profile-layout__body">
            <q-card-section v-if="loading" class="loading-state">
              <q-spinner color="accent" size="42px" />
            </q-card-section>

            <template v-else>
              <q-card-section v-if="statusBannerMessage" class="status-banner" role="status" aria-live="polite">
                <div class="status-banner__message">{{ statusBannerMessage }}</div>
                <q-btn
                  v-if="loadError"
                  dense
                  no-caps
                  color="accent"
                  label="Retry"
                  class="status-banner__action"
                  @click="loadCreatorProfile(pubkey, true)"
                />
              </q-card-section>

              <q-card-section v-if="refreshNotice" class="refresh-banner" role="status" aria-live="polite">
                <div class="refresh-banner__message">Refreshing…</div>
              </q-card-section>

              <q-card-section v-if="creator" class="profile-tabs-section">
                <q-tabs
                  v-model="activeTab"
                  class="profile-tabs"
                  dense
                  align="left"
                  no-caps
                  indicator-color="accent"
                  active-color="accent"
                  active-bg-color="transparent"
                >
                  <q-tab name="profile" label="Profile" />
                  <q-tab name="tiers" label="Tiers" />
                </q-tabs>
              </q-card-section>

              <q-tab-panels v-if="creator" v-model="activeTab" animated class="profile-tab-panels">
                <q-tab-panel name="profile" class="profile-tab-panel">
                  <div
                    class="highlights-section"
                    :class="{ 'highlights-section--compact': props.compact }"
                  >
                    <div class="snapshot-intro">
                      <div class="snapshot-intro__eyebrow">{{ snapshotEyebrow }}</div>
                      <div class="section-heading">{{ highlightsHeading }}</div>
                      <div class="snapshot-intro__helper text-body2 text-2">
                        {{ highlightsHelperText }}
                      </div>
                    </div>
                    <div
                      v-if="hasHighlights"
                      class="highlights-grid"
                      :class="{ 'highlights-grid--compact': props.compact }"
                    >
                      <div
                        v-if="trustedRankValue !== null"
                        class="highlight-item highlight-item--full highlight-item--hero highlight-item--trusted"
                      >
                        <div class="highlight-header">
                          <div class="highlight-header__copy">
                            <div class="highlight-label text-2">Trusted rank (NIP-85)</div>
                            <div class="highlight-kicker text-2">Discovery trust context</div>
                          </div>
                          <div
                            v-if="trustedMetrics?.providerLabel"
                            class="highlight-badge text-caption"
                          >
                            {{ trustedMetrics.providerLabel }}
                          </div>
                        </div>
                        <div class="highlight-value highlight-value--hero highlight-value--trusted">
                          <q-icon name="shield" size="24px" />
                          <span>{{ trustedRankValue }}</span>
                        </div>
                        <div class="highlight-copy text-body2 text-2">
                          Provider-signed trust context for discovery.
                        </div>
                        <div class="highlight-meta-row text-caption text-2">
                          <span v-if="trustedRankProviderText">{{ trustedRankProviderText }}</span>
                          <span v-if="trustedRankFreshness">{{ trustedRankFreshness }}</span>
                        </div>
                        <details class="highlight-details">
                          <summary class="highlight-details__summary">
                            How NIP-85 works
                          </summary>
                          <div class="highlight-details__body text-body2 text-2">
                            Fundstr does not calculate this score, and it never
                            controls payments, subscriptions, or access.
                          </div>
                          <div class="trusted-rank-info-links">
                            <a
                              v-for="link in trustedRankInfoLinks"
                              :key="link.id"
                              class="trusted-rank-info-link"
                              :href="link.href"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {{ link.label }}
                            </a>
                          </div>
                        </details>
                      </div>
                      <div
                        v-if="followersDisplay"
                        class="highlight-item highlight-item--metric"
                      >
                        <div class="highlight-header">
                          <div class="highlight-label text-2">Followers</div>
                          <q-icon
                            name="groups"
                            size="16px"
                            class="highlight-header__icon"
                          />
                        </div>
                        <div class="highlight-value highlight-value--metric">
                          {{ followersDisplay }}
                        </div>
                        <div class="highlight-copy text-body2 text-2">
                          Public follower count visible on this profile.
                        </div>
                      </div>
                      <div
                        v-if="lightningAddress"
                        class="highlight-item highlight-item--detail"
                      >
                        <div class="highlight-header">
                          <div class="highlight-label text-2">Lightning address</div>
                          <q-icon
                            name="bolt"
                            size="16px"
                            class="highlight-header__icon"
                          />
                        </div>
                        <div class="highlight-value highlight-value--mono">
                          <span>{{ lightningAddress }}</span>
                          <q-btn
                            flat
                            dense
                            round
                            icon="content_copy"
                            class="highlight-copy"
                            aria-label="Copy lightning address"
                            @click="copyIdentity(lightningAddress, 'lightning')"
                          >
                            <q-tooltip v-model="copiedState.lightning" anchor="top middle" self="bottom middle">
                              Copied
                            </q-tooltip>
                          </q-btn>
                        </div>
                        <div class="highlight-copy text-body2 text-2">
                          Direct lightning support is available for this profile.
                        </div>
                      </div>
                      <div
                        v-if="websiteUrl"
                        class="highlight-item highlight-item--detail"
                      >
                        <div class="highlight-header">
                          <div class="highlight-label text-2">Website</div>
                          <q-icon
                            name="public"
                            size="16px"
                            class="highlight-header__icon"
                          />
                        </div>
                        <a class="highlight-link" :href="websiteUrl" target="_blank" rel="noopener">
                          {{ websiteLabel }}
                        </a>
                        <div class="highlight-copy text-body2 text-2">
                          Open the creator&rsquo;s external site in a new tab.
                        </div>
                      </div>
                      <div
                        v-if="highlightStatusChips.length"
                        class="highlight-item highlight-item--full highlight-item--status"
                      >
                        <div class="highlight-header">
                          <div class="highlight-label text-2">Status</div>
                          <q-icon
                            name="verified"
                            size="16px"
                            class="highlight-header__icon"
                          />
                        </div>
                        <div class="highlight-chips" role="list">
                          <span
                            v-for="chip in highlightStatusChips"
                            :key="chip.key"
                            class="status-chip"
                            :class="chip.variant"
                            role="listitem"
                            tabindex="0"
                            :aria-label="chip.ariaLabel"
                          >
                            <q-icon v-if="chip.icon" :name="chip.icon" size="14px" />
                            <span>{{ chip.label }}</span>
                          </span>
                        </div>
                        <div class="highlight-copy text-body2 text-2">
                          Extra profile signals that help explain this creator&rsquo;s current discovery state.
                        </div>
                      </div>
                    </div>
                    <div v-else class="empty-state">
                      No highlights available yet
                    </div>
                  </div>
                  <div
                    v-if="showNotesSection"
                    class="notes-section"
                    :class="{ 'notes-section--compact': props.compact }"
                  >
                    <div class="notes-section__header">
                      <div class="section-heading">{{ notesSectionHeading }}</div>
                      <div v-if="props.compact" class="notes-section__helper text-body2 text-2">
                        One recent public post to help you scan activity without turning the preview into a feed.
                      </div>
                    </div>
                    <div class="notes-list" role="list">
                      <template v-if="notesLoading">
                        <div
                          v-for="index in notesSkeletonCount"
                          :key="`note-skeleton-${index}`"
                          class="note-card note-card--skeleton"
                          :class="{ 'note-card--compact': props.compact }"
                        >
                          <q-skeleton type="text" width="85%" />
                          <q-skeleton type="text" width="72%" />
                          <q-skeleton type="text" width="58%" />
                          <div class="note-meta">
                            <q-skeleton type="text" width="120px" />
                          </div>
                        </div>
                      </template>
                      <template v-else>
                        <div
                          v-for="note in visibleRecentNotes"
                          :key="note.id"
                          class="note-card"
                          :class="{ 'note-card--compact': props.compact }"
                          role="listitem"
                        >
                          <div class="note-content text-1">
                            {{ note.content }}
                          </div>
                          <div class="note-meta">
                            <span class="note-timestamp text-2">{{ formatNoteTimestamp(note.created_at) }}</span>
                            <a
                              class="note-link"
                              :href="`https://njump.me/${note.id}`"
                              target="_blank"
                              rel="noopener"
                            >
                              View on Nostr
                            </a>
                          </div>
                        </div>
                        <div v-if="!visibleRecentNotes.length" class="notes-empty text-2">
                          No recent notes yet
                          <div v-if="notesError" class="notes-empty__error">
                            {{ notesError }}
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
                </q-tab-panel>
                <q-tab-panel name="tiers" class="profile-tab-panel">
                  <div class="tiers-section">
                    <div class="section-heading">Subscription tiers</div>
                    <div
                      v-if="hasTiers"
                      class="tiers-carousel"
                      role="region"
                      aria-roledescription="carousel"
                      aria-label="Creator subscription tiers"
                    >
                      <div
                        class="tiers-carousel__viewport"
                        ref="carouselViewportRef"
                        tabindex="0"
                        role="group"
                        :aria-label="activeTierAnnouncement"
                        aria-live="polite"
                        @keydown="onCarouselKeydown"
                      >
                        <TierDetailsPanel
                          v-for="(tier, index) in tiers"
                          :key="tier.id"
                          class="tiers-carousel__slide"
                          :is-active="index === activeTierIndex"
                          :tier-name="tier.name"
                          :tier-id="tier.id"
                          :price-label="`${formatTierPrice(tier)} sats`"
                          :frequency-label="tierFrequencyLabel(tier)"
                          :summary="tierSummary(tier)"
                          :description="hasTierDescription(tier) ? tierDescription(tier) : null"
                          :benefits="tierBenefits(tier)"
                          :welcome-message="tier.welcomeMessage"
                          :media-items="tierMediaItems(tier)"
                          :total="tiers.length"
                          :index="index"
                          @subscribe="handleSubscribe"
                        />
                      </div>

                      <div class="tiers-carousel__controls" role="group" aria-label="Tier navigation controls">
                        <div class="tiers-carousel__controls-inner">
                          <q-btn
                            flat
                            round
                            icon="chevron_left"
                            class="tiers-carousel__control"
                            :disable="!canGoPrevious"
                            aria-label="View previous tier"
                            @click="goToPreviousTier"
                          />
                          <div class="tiers-carousel__dots" role="tablist" aria-label="Select tier">
                            <button
                              v-for="(tier, index) in tiers"
                              :key="`dot-${tier.id}`"
                              class="tiers-carousel__dot"
                              :class="{ 'tiers-carousel__dot--active': index === activeTierIndex }"
                              role="tab"
                              type="button"
                              :aria-selected="index === activeTierIndex"
                              :tabindex="index === activeTierIndex ? 0 : -1"
                              :aria-label="`Show tier ${index + 1} of ${tiers.length}: ${tier.name}`"
                              @click="setActiveTier(index)"
                              @keydown.enter.prevent="setActiveTier(index)"
                              @keydown.space.prevent="setActiveTier(index)"
                            />
                          </div>
                          <q-btn
                            flat
                            round
                            icon="chevron_right"
                            class="tiers-carousel__control"
                            :disable="!canGoNext"
                            aria-label="View next tier"
                            @click="goToNextTier"
                          />
                        </div>
                      </div>
                    </div>
                    <div v-else-if="!loadError" class="empty-state">
                      <div>No subscription tiers found for this creator.</div>
                      <div v-if="tierFetchFailed" class="empty-state__subtext text-2">
                        We couldn&#39;t load tiers right now. Please try again.
                      </div>
                    </div>
                  </div>
                </q-tab-panel>
              </q-tab-panels>

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
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { nip19 } from 'nostr-tools';
import TierDetailsPanel from 'components/TierDetailsPanel.vue';
import { formatMsatToSats } from 'src/lib/fundstrApi';
import { NETWORK_CHANGE_WARNING } from 'src/api/fundstrDiscovery';
import {
  getFreeRelayFallbackStatus,
  onFreeRelayFallbackStatusChange,
} from 'src/boot/ndk';
import { useNetworkStatus, waitForOnline } from 'src/composables/useNetworkStatus';
import { notifyError } from 'src/js/notify';
import { useNostrStore } from 'src/stores/nostr';
import {
  displayNameFromProfile,
  isTrustedUrl,
  normalizeMeta,
  safeImageSrc,
  type ProfileMeta,
} from 'src/utils/profile';
import { filterValidMedia } from 'src/utils/validateMedia';
import type { Tier, TierMedia as TierMediaItem } from 'stores/types';
import {
  FundstrProfileFetchError,
  creatorTrustedMetrics,
  creatorIsSignalOnly,
  mergeCreatorProfileWithFallback,
  useCreatorsStore,
} from 'stores/creators';
import type { CreatorProfile } from 'stores/creators';
import {
  TRUSTED_RANK_INFO_LINKS,
  formatTrustedRankFreshness,
  trustedRankProviderLine,
} from 'src/utils/trustedRank';

const props = defineProps<{
  show: boolean;
  pubkey: string;
  initialProfile?: CreatorProfile | null;
  initialTab?: 'profile' | 'tiers';
  compact?: boolean;
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
const loadError = ref<string | null>(null);
const creator = ref<CreatorProfile | null>(null);
const tiers = ref<TierDetails[]>([]);
const showLocal = ref(false);
const isMobileViewport = computed(() => $q.screen.lt.sm);
const isDesktopViewport = computed(() => $q.screen.gt.sm);
const isCompactDesktopPreview = computed(
  () => props.compact === true && $q.screen.width >= 1180,
);
const isTwoColumnViewport = computed(
  () =>
    (props.compact === true && isCompactDesktopPreview.value) ||
    (!props.compact && $q.screen.width >= 1280),
);
const isDialogMaximized = computed(() => isMobileViewport.value || (!props.compact && isDesktopViewport.value));
const relayFallbackStatus = ref(getFreeRelayFallbackStatus());
let relayFallbackUnsubscribe: (() => void) | null = null;
const dialogClasses = computed(() => ({
  'profile-dialog--compact': props.compact === true,
  'profile-dialog--preview-desktop': isCompactDesktopPreview.value,
  'profile-dialog--maximized': isDialogMaximized.value,
  'profile-dialog--mobile': isMobileViewport.value,
  'profile-dialog--desktop': isDesktopViewport.value,
}));
const activeTierIndex = ref(0);
const isBioExpanded = ref(false);
const activeTab = ref<'profile' | 'tiers'>('profile');
const carouselViewportRef = ref<HTMLElement | null>(null);
const creatorsStore = useCreatorsStore();
const nostrStore = useNostrStore();
const { isOnline, wasOfflineRecently } = useNetworkStatus();

let currentRequestId = 0;
let retryRequestId = 0;
let notesRequestId = 0;

const recentNotes = ref<Array<{ content: string; created_at: number; id: string }>>([]);
const notesLoading = ref(false);
const notesError = ref<string | null>(null);
const notesRequestLimit = computed(() => (props.compact ? 1 : 3));
const notesSkeletonCount = computed(() => (props.compact ? 1 : 3));
const visibleRecentNotes = computed(() =>
  recentNotes.value.slice(0, notesRequestLimit.value),
);
const notesSectionHeading = computed(() =>
  props.compact ? 'Latest note' : 'Latest notes',
);
const snapshotEyebrow = computed(() =>
  props.compact ? 'Quick view' : 'Quick snapshot',
);
const highlightsHeading = computed(() =>
  props.compact ? 'Snapshot' : 'Profile highlights',
);
const highlightsHelperText = computed(() =>
  props.compact
    ? 'Key trust and profile signals before you message, donate, or subscribe.'
    : 'Fast trust and profile signals before you message, donate, or subscribe.',
);
const showNotesSection = computed(() => {
  if (!props.compact) {
    return true;
  }
  return notesLoading.value || visibleRecentNotes.value.length > 0;
});

function resolveInitialTab(tab?: string | null): 'profile' | 'tiers' {
  return tab === 'tiers' ? 'tiers' : 'profile';
}

function getInitialProfileFallback(pubkey: string | null | undefined): CreatorProfile | null {
  if (!pubkey) {
    return null;
  }
  const initialProfile = props.initialProfile;
  if (initialProfile && initialProfile.pubkey === pubkey) {
    return initialProfile;
  }
  return null;
}

const activeTierAnnouncement = computed(() => {
  const total = tiers.value.length;
  if (!total) {
    return 'No subscription tiers available yet';
  }
  const index = Math.min(Math.max(activeTierIndex.value, 0), total - 1);
  const tier = tiers.value[index];
  if (!tier) {
    return 'No subscription tiers available yet';
  }
  return `Viewing tier ${index + 1} of ${total}: ${tier.name}`;
});
const relayFallbackNotice = computed(() => {
  if (!relayFallbackStatus.value.unreachable) {
    return '';
  }
  if (creator.value) {
    return '';
  }
  return "We're having trouble reaching relays right now. Discovery fallback didn't respond.";
});
const statusBannerMessage = computed(() => loadError.value ?? relayFallbackNotice.value);

const canGoPrevious = computed(() => activeTierIndex.value > 0);
const canGoNext = computed(() => activeTierIndex.value < tiers.value.length - 1);

function setActiveTier(index: number) {
  if (!Number.isInteger(index)) return;
  const total = tiers.value.length;
  if (!total) {
    activeTierIndex.value = 0;
    return;
  }
  const nextIndex = Math.min(Math.max(index, 0), total - 1);
  activeTierIndex.value = nextIndex;
}

function goToPreviousTier() {
  if (!canGoPrevious.value) {
    return;
  }
  setActiveTier(activeTierIndex.value - 1);
}

function goToNextTier() {
  if (!canGoNext.value) {
    return;
  }
  setActiveTier(activeTierIndex.value + 1);
}

function formatTierPeriod(tier: Tier): string | null {
  if (typeof tier.frequency === 'string' && tier.frequency.trim()) {
    return tier.frequency.trim();
  }
  const intervalDays = Number.isFinite(tier.intervalDays) ? Number(tier.intervalDays) : null;
  if (intervalDays && intervalDays > 0) {
    if (intervalDays === 1) {
      return 'Daily';
    }
    if (intervalDays === 7) {
      return 'Weekly';
    }
    if (intervalDays === 30) {
      return 'Monthly';
    }
    return `${intervalDays} days`;
  }
  return null;
}

function mapTierToDetails(tier: Tier): TierDetails {
  const description = typeof tier.description === 'string' ? tier.description.trim() : '';
  const benefits = Array.isArray(tier.benefits)
    ? tier.benefits
        .filter((benefit): benefit is string => typeof benefit === 'string')
        .map((benefit) => benefit.trim())
        .filter((benefit) => benefit.length > 0)
    : [];
  const media = filterValidMedia(
    Array.isArray(tier.media)
      ? tier.media
          .map((item) => {
            if (!item || typeof item !== 'object') {
              return null;
            }
            const normalized = item as TierMediaItem;
            const url = typeof normalized.url === 'string' ? normalized.url.trim() : '';
            if (!url) {
              return null;
            }
            return {
              ...normalized,
              url,
            };
          })
          .filter((item): item is TierMediaItem => Boolean(item))
      : [],
  );
  const priceMsat =
    typeof tier.price_sats === 'number' && Number.isFinite(tier.price_sats)
      ? Math.max(0, tier.price_sats) * 1000
      : null;
  const welcomeMessage =
    typeof tier.welcomeMessage === 'string' && tier.welcomeMessage.trim()
      ? tier.welcomeMessage
      : null;

  return {
    id: tier.id,
    name: tier.name || 'Subscription tier',
    description: description.length ? description : null,
    priceMsat,
    benefits,
    media,
    welcomeMessage,
    periodLabel: formatTierPeriod(tier),
  };
}

function mapTiersForDisplay(source: Tier[] | null | undefined): TierDetails[] {
  if (!Array.isArray(source)) {
    return [];
  }
  return source.map((tier) => mapTierToDetails(tier));
}

function syncStateFromStore(pubkey: string | null | undefined, fallback?: CreatorProfile | null) {
  if (!pubkey) {
    creator.value = fallback ?? null;
    tiers.value = [];
    activeTierIndex.value = 0;
    return;
  }

  const storeProfile = creatorsStore.buildCreatorProfileFromCache(pubkey);
  const resolvedProfile = mergeCreatorProfileWithFallback(fallback, storeProfile);
  creator.value = resolvedProfile;

  const storeTiers = creatorsStore.getCreatorTiers(pubkey);
  const tierSource =
    storeTiers ??
    (resolvedProfile?.tiers as Tier[] | undefined) ??
    (fallback?.tiers as Tier[] | undefined) ??
    null;
  tiers.value = mapTiersForDisplay(tierSource);

  if (!tiers.value.length) {
    activeTierIndex.value = 0;
  }
}

function onCarouselKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented) {
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    goToNextTier();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    goToPreviousTier();
  } else if (event.key === 'Home') {
    event.preventDefault();
    setActiveTier(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    setActiveTier(tiers.value.length - 1);
  }
}

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

const creatorPubkey = computed(() => creator.value?.pubkey ?? props.pubkey ?? '');

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

const refreshNotice = computed(() => creator.value?.refreshedInBackground === true);

watch(aboutText, () => {
  isBioExpanded.value = false;
});

watch(
  () => props.pubkey,
  (pubkey) => {
    if (!showLocal.value) {
      return;
    }
    if (!pubkey) {
      resetState();
      return;
    }
    syncStateFromStore(pubkey, getInitialProfileFallback(pubkey));
  },
  { immediate: true },
);

onMounted(() => {
  relayFallbackUnsubscribe = onFreeRelayFallbackStatusChange((status) => {
    relayFallbackStatus.value = status;
  });
});

onUnmounted(() => {
  relayFallbackUnsubscribe?.();
  relayFallbackUnsubscribe = null;
});

watch(
  () => (showLocal.value && props.pubkey ? creatorsStore.warmCache[props.pubkey] : null),
  () => {
    if (!showLocal.value || !props.pubkey) {
      return;
    }
    syncStateFromStore(props.pubkey, getInitialProfileFallback(props.pubkey));
    activeTierIndex.value = 0;
  },
  { immediate: true, deep: true },
);

watch(
  () => props.initialProfile,
  (initialProfile) => {
    if (!showLocal.value || !props.pubkey || !initialProfile) {
      return;
    }

    if (initialProfile.pubkey === props.pubkey) {
      syncStateFromStore(props.pubkey, initialProfile);
    }
  },
  { deep: true },
);

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
const tierFetchFailed = computed(() => creator.value?.tierFetchFailed === true);

const showStickyFooter = computed(
  () => hasTiers.value && $q.screen.lt.md && activeTab.value === 'tiers',
);
const isHeroActionsInline = computed(() => $q.screen.gt.sm && !props.compact);

const primaryTierId = computed(() => tiers.value[0]?.id ?? '');

const identityLinks = computed(() => {
  const npub = creatorNpub.value;
  if (!npub) {
    return [];
  }
  return [
    { label: 'Open in client', url: `https://njump.me/${npub}` },
    { label: 'View in explorer', url: `https://nostr.band/${npub}` },
  ];
});

const copiedState = ref({ npub: false, pubkey: false, lightning: false });
const copyTimeouts: Partial<Record<'npub' | 'pubkey' | 'lightning', number>> = {};
const trustedMetrics = computed(() => creatorTrustedMetrics(creator.value as any));
const trustedRankValue = computed(() => trustedMetrics.value?.rank ?? null);
const trustedRankProviderText = computed(() =>
  trustedRankProviderLine(trustedMetrics.value?.providerLabel),
);
const trustedRankFreshness = computed(() =>
  formatTrustedRankFreshness(trustedMetrics.value?.createdAt),
);
const trustedRankInfoLinks = TRUSTED_RANK_INFO_LINKS.map((link) => ({
  ...link,
}));

async function copyIdentity(value: string, key: 'npub' | 'pubkey' | 'lightning') {
  if (!value) {
    return;
  }
  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error('Clipboard unavailable');
    }
    await navigator.clipboard.writeText(value);
    copiedState.value[key] = true;
    if (copyTimeouts[key]) {
      window.clearTimeout(copyTimeouts[key]);
    }
    copyTimeouts[key] = window.setTimeout(() => {
      copiedState.value[key] = false;
    }, 1400);
  } catch (error) {
    console.error('[CreatorProfileModal] Failed to copy identity', error);
    notifyError('Unable to copy to clipboard.');
  }
}

const followersDisplay = computed(() => {
  const followers = creator.value?.followers;
  if (followers === null || followers === undefined) {
    return '';
  }
  if (typeof followers === 'number' && Number.isFinite(followers)) {
    return followers.toLocaleString();
  }
  if (typeof followers === 'string' && followers.trim()) {
    return followers.trim();
  }
  return '';
});

const lightningAddress = computed(() => {
  const metaRecord = creatorMeta.value as Record<string, unknown>;
  const profileRecord = (creator.value?.profile ?? {}) as Record<string, unknown>;
  const extraRecord = (creator.value as Record<string, unknown> | null | undefined) ?? {};
  const candidates = [
    metaRecord.lud16,
    metaRecord.lud06,
    profileRecord.lud16,
    profileRecord.lud06,
    extraRecord.lud16,
    extraRecord.lud06,
  ];
  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return typeof value === 'string' ? value.trim() : '';
});

const websiteUrl = computed(() => {
  const raw = typeof creatorMeta.value.website === 'string' ? creatorMeta.value.website.trim() : '';
  if (!raw) {
    return '';
  }
  if (isTrustedUrl(raw)) {
    return raw;
  }
  const withScheme = `https://${raw}`;
  return isTrustedUrl(withScheme) ? withScheme : '';
});

const websiteLabel = computed(() => {
  if (!websiteUrl.value) {
    return '';
  }
  return websiteUrl.value.replace(/^https?:\/\//, '');
});

const highlightStatusChips = computed(() => {
  const chips: Array<{ key: string; label: string; icon?: string; variant?: string; ariaLabel: string }> = [];

  if (creator.value?.featured) {
    chips.push({
      key: 'featured',
      label: 'Featured',
      icon: 'workspace_premium',
      variant: 'accent',
      ariaLabel: 'Featured creator',
    });
  }

  if (creator.value && creatorIsSignalOnly(creator.value as any)) {
    chips.push({
      key: 'signal-only',
      label: 'Signal only',
      icon: 'sensors',
      variant: 'warning',
      ariaLabel: 'Signal-only profile',
    });
  }

  if (creator.value?.cacheHit) {
    chips.push({
      key: 'cache-hit',
      label: 'Cache hit',
      icon: 'data_thresholding',
      variant: 'neutral',
      ariaLabel: 'Cached profile result',
    });
  }

  return chips;
});

const hasHighlights = computed(() =>
  Boolean(
      followersDisplay.value ||
      trustedRankValue.value !== null ||
      lightningAddress.value ||
      websiteUrl.value ||
      highlightStatusChips.value.length,
  ),
);

watch(
  tiers,
  (newTiers) => {
    if (!newTiers.length) {
      activeTierIndex.value = 0;
      return;
    }
    const maxIndex = newTiers.length - 1;
    if (activeTierIndex.value > maxIndex) {
      activeTierIndex.value = maxIndex;
    }
  },
  { deep: true },
);

watch(
  () => props.show,
  (visible) => {
    showLocal.value = visible;
    if (visible && props.pubkey) {
      activeTab.value = resolveInitialTab(props.initialTab);
      syncStateFromStore(props.pubkey, getInitialProfileFallback(props.pubkey));
      void loadCreatorProfile(props.pubkey);
      void loadRecentNotes(props.pubkey);
    }
    if (!visible) {
      cancelActiveRequest();
      cancelRecentNotesRequest();
      resetState();
    }
  },
  { immediate: true },
);

watch(
  () => props.initialTab,
  (nextTab) => {
    if (!showLocal.value) {
      return;
    }
    activeTab.value = resolveInitialTab(nextTab);
  },
);

watch(
  () => props.compact,
  () => {
    if (!showLocal.value || !props.pubkey) {
      return;
    }
    void loadRecentNotes(props.pubkey);
  },
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
      void loadCreatorProfile(newPubkey);
      void loadRecentNotes(newPubkey);
    }
  },
);

async function loadCreatorProfile(pubkey: string, forceRefresh = false) {
  if (!pubkey) {
    creator.value = null;
    tiers.value = [];
    return;
  }

  const fallbackProfile = getInitialProfileFallback(pubkey);
  const requestId = ++currentRequestId;
  loading.value = true;
  loadError.value = null;

  syncStateFromStore(pubkey, fallbackProfile);

  try {
    const profile = await creatorsStore.fetchCreator(pubkey, forceRefresh);
    if (requestId !== currentRequestId) {
      return;
    }

    if (!profile) {
      loadError.value = "We couldn't refresh this creator right now. Showing saved details.";
      return;
    }

    syncStateFromStore(pubkey, profile);
    activeTierIndex.value = 0;
    isBioExpanded.value = false;
  } catch (error) {
    if (requestId === currentRequestId) {
      console.error('[CreatorProfileModal] Failed to load creator profile', error);
      if (!isOnline.value || wasOfflineRecently.value) {
        loadError.value = NETWORK_CHANGE_WARNING;
        const retryId = (retryRequestId += 1);
        void waitForOnline().then(() => {
          if (retryId === retryRequestId && requestId === currentRequestId && showLocal.value) {
            void loadCreatorProfile(pubkey);
          }
        });
        return;
      }
      let message = "We couldn't refresh this creator right now.";
      if (error instanceof FundstrProfileFetchError && error.fallbackAttempted) {
        message = "Discovery and relay fallback couldn't load this creator right now.";
      } else if (error instanceof Error && error.message) {
        message = error.message;
      }
      const hasFallbackData = Boolean(creator.value);
      if (hasFallbackData) {
        message = `${message} Showing saved details.`;
      }
      loadError.value = message;
    }
  } finally {
    if (requestId === currentRequestId) {
      loading.value = false;
    }
  }
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
  if (!tiers.value.length) {
    return;
  }

  const tierId = primaryTierId.value;
  if (tierId) {
    const targetIndex = tiers.value.findIndex((tier) => tier.id === tierId);
    if (targetIndex >= 0) {
      setActiveTier(targetIndex);
    }
  } else {
    setActiveTier(0);
  }

  if (typeof window !== 'undefined') {
    window.requestAnimationFrame(() => {
      const viewport = carouselViewportRef.value;
      viewport?.focus();
      viewport?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }
}

function tierFrequencyLabel(tier: TierDetails): string | null {
  return tier.periodLabel;
}

function formatTierPrice(tier: TierDetails): string {
  if (typeof tier.priceMsat !== 'number' || !Number.isFinite(tier.priceMsat)) {
    return formatMsatToSats(0);
  }
  return formatMsatToSats(tier.priceMsat);
}

function tierSummary(tier: TierDetails): string | null {
  const perks = tierBenefits(tier);
  const cadence = typeof tier.periodLabel === 'string' ? tier.periodLabel.trim() : '';

  const highlightedPerks = perks.slice(0, 2);
  const remainingPerks = Math.max(perks.length - highlightedPerks.length, 0);
  const summaryParts: string[] = [];

  if (highlightedPerks.length) {
    const perkSummary = highlightedPerks.join(', ');
    const moreSuffix = remainingPerks > 0 ? ` +${remainingPerks} more` : '';
    summaryParts.push(`Perks: ${perkSummary}${moreSuffix}`);
  }

  if (cadence) {
    summaryParts.push(`Cadence: ${cadence}`);
  }

  if (!summaryParts.length) {
    return null;
  }

  return summaryParts.join(' • ');
}

function tierBenefits(tier: TierDetails): string[] {
  return Array.isArray(tier.benefits) ? tier.benefits : [];
}

function tierMediaItems(tier: TierDetails): TierMediaItem[] {
  return Array.isArray(tier.media) ? tier.media : [];
}

function hasTierDescription(tier: TierDetails): boolean {
  if (!tier.description) return false;
  return tier.description.trim().length > 0;
}

function tierDescription(tier: TierDetails): string {
  return (tier.description ?? '').trim();
}

function cancelActiveRequest() {
  currentRequestId += 1;
  loading.value = false;
}

function cancelRecentNotesRequest() {
  notesRequestId += 1;
  notesLoading.value = false;
}

async function loadRecentNotes(pubkey: string) {
  if (!pubkey) {
    recentNotes.value = [];
    notesLoading.value = false;
    notesError.value = null;
    return;
  }

  const requestId = ++notesRequestId;
  notesLoading.value = true;
  notesError.value = null;

  try {
    const notes = await nostrStore.fetchRecentNotes(
      pubkey,
      notesRequestLimit.value,
    );
    if (requestId !== notesRequestId) {
      return;
    }
    recentNotes.value = notes;
  } catch (error) {
    if (requestId === notesRequestId) {
      console.error('[CreatorProfileModal] Failed to load recent notes', error);
      notesError.value = 'Unable to load recent notes right now.';
      recentNotes.value = [];
    }
  } finally {
    if (requestId === notesRequestId) {
      notesLoading.value = false;
    }
  }
}

function formatNoteTimestamp(createdAt?: number | null) {
  if (!createdAt) {
    return '';
  }
  const date = new Date(createdAt * 1000);
  const diffSeconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (!Number.isFinite(diffSeconds)) {
    return date.toLocaleString();
  }
  if (diffSeconds < 60) {
    return 'Just now';
  }
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return date.toLocaleDateString();
}

function resetState() {
  creator.value = null;
  tiers.value = [];
  activeTierIndex.value = 0;
  activeTab.value = 'profile';
  isBioExpanded.value = false;
  loadError.value = null;
  recentNotes.value = [];
  notesLoading.value = false;
  notesError.value = null;
}
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
  padding: clamp(12px, 2.2vh, 18px) clamp(12px, 3.2vw, 24px);
  box-sizing: border-box;
}

.profile-dialog--mobile .profile-dialog__inner {
  padding: 0;
  align-items: stretch;
}

.profile-card {
  width: min(100%, 1680px);
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
  max-height: min(98vh, 1600px);
  min-height: 0;
}

.profile-dialog--compact .profile-card {
  width: min(100%, 1380px);
  height: min(95vh, 1020px);
  max-height: min(95vh, 1020px);
}

.profile-dialog--preview-desktop .profile-card {
  width: min(100%, 1520px);
  min-width: min(1220px, calc(100vw - 72px));
  height: min(93vh, 960px);
  max-height: min(93vh, 960px);
}

.profile-dialog--compact .profile-layout__body {
  gap: 24px;
  padding: clamp(18px, 3vh, 28px) clamp(18px, 3.2vw, 30px);
}

.profile-dialog--preview-desktop .profile-layout__body {
  gap: 22px;
  padding: 20px 30px 30px;
  margin-top: 0;
}

.profile-dialog--compact .hero-panel {
  padding: clamp(20px, 2.4vw, 28px) clamp(20px, 2.8vw, 28px)
    clamp(18px, 2.2vw, 22px);
}

.profile-dialog--preview-desktop .hero-panel {
  padding: 24px 22px 20px;
}

.profile-dialog--compact .hero-meta {
  gap: 10px;
}

.profile-dialog--compact .hero-name {
  font-size: clamp(2rem, 1.6vw + 1.45rem, 2.95rem);
}

.profile-dialog--preview-desktop .hero-name {
  max-width: 12ch;
  font-size: clamp(1.7rem, 0.95vw + 1.2rem, 2.35rem);
}

.profile-dialog--compact .hero-handle {
  font-size: clamp(1.08rem, 0.4vw + 1rem, 1.28rem);
}

.profile-dialog--preview-desktop .hero-handle {
  font-size: 1rem;
}

.profile-dialog--compact .hero-about {
  font-size: clamp(0.96rem, 0.18vw + 0.94rem, 1.08rem);
  line-height: 1.5;
}

.profile-dialog--preview-desktop .hero-about {
  max-width: 28ch;
  font-size: 0.98rem;
  line-height: 1.52;
}

.profile-dialog--compact .hero-about--clamped {
  -webkit-line-clamp: 2;
}

.profile-dialog--compact .hero-actions {
  margin-top: 14px;
  gap: 10px;
}

.profile-dialog--preview-desktop .hero-actions {
  margin-top: 10px;
}

.profile-dialog--compact .profile-tabs-section {
  padding-top: 2px;
}

.profile-card--two-column {
  width: min(100%, 1760px);
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
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto 1fr;
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
  padding-right: clamp(0px, 0.6vw, 12px);
}

.profile-layout__body {
  display: flex;
  flex-direction: column;
  gap: clamp(12px, 2.4vh, 24px);
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  padding: clamp(12px, 2.6vh, 20px) clamp(10px, 3vw, 18px);
  scrollbar-gutter: stable;
  width: 100%;
  margin-top: clamp(12px, 2.6vh, 20px);
}

.profile-layout--two-column .profile-layout__body {
  margin-top: 0;
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

.profile-dialog--preview-desktop .hero-layout {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: stretch;
}

.profile-layout__hero--desktop .hero-layout {
  flex-direction: column;
  align-items: stretch;
  gap: clamp(18px, 2vw, 28px);
}

.profile-dialog--compact-wide .profile-layout__hero--desktop .hero-layout {
  flex-direction: row;
  align-items: flex-start;
  gap: 20px;
  flex-wrap: nowrap;
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

.profile-dialog--preview-desktop .hero-avatar {
  padding: 4px;
  border-radius: 18px;
}

.profile-dialog--compact-wide .hero-avatar {
  padding: 4px;
  border-radius: 18px;
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

.profile-dialog--preview-desktop .hero-meta {
  gap: 10px;
}

.profile-dialog--compact-wide .hero-meta {
  gap: 12px;
}

.hero-name {
  font-size: clamp(2.4rem, 2.4vw + 1.6rem, 3.4rem);
  font-weight: 800;
  letter-spacing: 0.01em;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.hero-handle {
  font-size: clamp(1.25rem, 0.8vw + 1.1rem, 1.6rem);
  font-weight: 700;
  color: color-mix(in srgb, var(--text-1) 92%, var(--text-2) 8%);
  letter-spacing: 0.045em;
  overflow-wrap: anywhere;
}

.hero-identity {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-2) 80%, var(--surface-1) 20%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 70%, transparent);
}

.hero-identity--compact {
  gap: 10px;
  margin-top: 2px;
  padding: 12px 14px;
}

.profile-dialog--preview-desktop .hero-identity--compact {
  max-width: 100%;
}

.hero-identity__row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.hero-identity__label {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.hero-identity__value {
  font-size: 0.95rem;
  color: var(--text-1);
  overflow-wrap: anywhere;
}

.hero-identity__copy {
  color: var(--text-2);
}

.hero-identity__links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding-left: 2px;
}

.hero-identity__links--compact {
  padding-left: 0;
}

.hero-identity__link {
  font-size: 0.9rem;
  color: var(--accent-500);
  font-weight: 600;
  text-decoration: none;
}

.hero-identity__link:hover,
.hero-identity__link:focus-visible {
  text-decoration: underline;
}

.hero-identity__details {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hero-identity__summary {
  cursor: pointer;
  list-style: none;
  color: var(--accent-500);
  font-size: 0.92rem;
  font-weight: 700;
}

.hero-identity__summary::-webkit-details-marker {
  display: none;
}

.hero-identity__summary::before {
  content: '+';
  margin-right: 0.45rem;
}

.hero-identity__details[open] .hero-identity__summary::before {
  content: '-';
}

.hero-identity__details-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hero-about {
  color: color-mix(in srgb, var(--text-1) 96%, var(--text-2) 4%);
  font-size: clamp(1.2rem, 0.8vw + 1.1rem, 1.6rem);
  font-weight: 550;
  letter-spacing: 0.01em;
  line-height: 1.7;
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

.hero-actions--preview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: stretch;
  width: 100%;
}

.profile-dialog--preview-desktop .hero-actions--preview-grid {
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

.hero-actions--preview-grid .action-button.subscribe {
  grid-column: 1 / -1;
}

.profile-dialog--preview-desktop .hero-actions--preview-grid .action-button.subscribe {
  grid-column: 1 / -1;
}

.hero-actions--preview-grid .action-button {
  width: 100%;
}

.hero-snapshot-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}

.profile-dialog--preview-desktop .hero-snapshot-strip {
  display: none;
  margin-top: 8px;
  gap: 8px;
}

.profile-dialog--compact-wide .hero-snapshot-strip {
  margin-top: 10px;
}

.hero-snapshot-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.75rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-2) 82%, var(--surface-1) 18%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 72%, transparent);
  color: var(--text-1);
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1;
}

.hero-snapshot-pill--trusted {
  background: color-mix(in srgb, var(--accent-200) 22%, var(--surface-1) 78%);
  border-color: color-mix(in srgb, var(--accent-500) 30%, transparent);
  color: var(--accent-500);
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

.profile-dialog--preview-desktop .close-btn {
  top: 16px;
  right: 16px;
}

.profile-dialog--compact-wide .close-btn {
  top: 16px;
  right: 16px;
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 48px 28px;
}

.status-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  margin: 0 clamp(14px, 4.6vw, 24px);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-2) 84%, var(--surface-1) 16%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 82%, transparent);
  color: var(--text-1);
}

.status-banner__message {
  flex: 1 1 auto;
  font-weight: 600;
  line-height: 1.5;
}

.status-banner__action {
  flex-shrink: 0;
}

.refresh-banner {
  margin: 0 clamp(14px, 4.6vw, 24px);
  padding: 10px 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--accent-200) 22%, var(--surface-1) 78%);
  border: 1px solid color-mix(in srgb, var(--accent-200) 65%, transparent);
  color: var(--text-1);
  font-weight: 600;
}

.refresh-banner__message {
  line-height: 1.4;
}

.profile-tabs-section {
  padding: 0 clamp(14px, 4.6vw, 24px);
}

.profile-dialog--preview-desktop .profile-tabs-section {
  padding: 0 30px;
}

.profile-tabs {
  color: var(--tab-inactive);
}

.profile-tabs :deep(.q-tab--active) {
  color: var(--tab-active);
}

.profile-tab-panels {
  padding: 0;
  background: transparent;
}

.profile-tab-panel {
  padding: 0;
}

.section-divider {
  opacity: 1;
  background: color-mix(in srgb, var(--surface-contrast-border) 90%, transparent);
  margin: 0 28px;
}

.tiers-section {
  padding: clamp(10px, 2vh, 16px) clamp(14px, 4.6vw, 24px) clamp(16px, 3vh, 24px);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.highlights-section {
  padding: clamp(10px, 2vh, 16px) clamp(14px, 4.6vw, 24px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-dialog--preview-desktop .highlights-section {
  padding: 12px 30px 0;
}

.highlights-section--compact {
  gap: 18px;
}

.snapshot-intro {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-dialog--compact-wide .snapshot-intro {
  gap: 6px;
}

.snapshot-intro__eyebrow {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding: 0.35rem 0.72rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-200) 26%, transparent);
  color: var(--accent-600);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.snapshot-intro__helper {
  max-width: 42rem;
  line-height: 1.55;
}

.profile-dialog--preview-desktop .snapshot-intro__helper {
  max-width: 50rem;
  font-size: 1rem;
}

.profile-dialog--compact-wide .section-heading {
  font-size: clamp(1.35rem, 0.55vw + 1.18rem, 1.85rem);
}

.profile-dialog--compact-wide .snapshot-intro__helper {
  max-width: none;
  font-size: 0.98rem;
}

.highlights-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.highlights-grid--compact {
  gap: 18px;
}

.profile-dialog--preview-desktop .highlights-grid--compact {
  grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  gap: 18px;
}

.profile-dialog--compact-wide .highlights-grid--compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.notes-section {
  padding: clamp(10px, 2vh, 16px) clamp(14px, 4.6vw, 24px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.notes-section--compact {
  gap: 14px;
}

.profile-dialog--preview-desktop .notes-section--compact {
  padding: 6px 30px 30px;
}

.notes-section__header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notes-section__helper {
  max-width: 38rem;
  line-height: 1.55;
}

.profile-dialog--compact-wide .notes-section--compact {
  padding-top: 0;
}

.notes-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.note-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 16px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-2) 85%, var(--surface-1) 15%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 75%, transparent);
}

.note-card--compact {
  padding: 16px 18px;
  gap: 12px;
}

.profile-dialog--preview-desktop .note-card--compact {
  max-width: none;
}

.note-card--skeleton {
  gap: 8px;
}

.note-content {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.note-card--compact .note-content {
  -webkit-line-clamp: 4;
}

.note-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.note-link {
  color: var(--accent-500);
  font-weight: 600;
  text-decoration: none;
}

.note-link:hover,
.note-link:focus-visible {
  text-decoration: underline;
}

.notes-empty {
  padding: 10px 2px;
}

.notes-empty__error {
  margin-top: 6px;
  color: var(--text-2);
}

.highlight-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface-1) 90%, var(--surface-2) 10%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 70%, transparent);
  box-shadow: 0 16px 34px rgba(10, 16, 32, 0.12);
}

.highlight-item--full {
  grid-column: 1 / -1;
}

.highlight-item--hero {
  padding: 20px 22px;
  gap: 12px;
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent-200) 16%, var(--surface-1) 84%) 0%,
    color-mix(in srgb, var(--surface-1) 90%, var(--surface-2) 10%) 100%
  );
  box-shadow: 0 20px 44px rgba(10, 16, 32, 0.16);
}

.profile-dialog--preview-desktop .highlight-item--hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 18px;
  align-items: start;
  padding: 18px 20px;
}

.profile-dialog--preview-desktop .highlight-item--hero .highlight-header {
  grid-column: 1 / 2;
}

.profile-dialog--preview-desktop .highlight-item--hero .highlight-value--hero {
  grid-column: 2 / 3;
  grid-row: 1 / span 2;
  justify-self: end;
  align-self: center;
  font-size: clamp(2.7rem, 1.8vw + 1.55rem, 3.8rem);
}

.profile-dialog--preview-desktop .highlight-item--hero .highlight-copy,
.profile-dialog--preview-desktop .highlight-item--hero .highlight-meta-row,
.profile-dialog--preview-desktop .highlight-item--hero .highlight-details {
  grid-column: 1 / -1;
}

.profile-dialog--compact-wide .highlight-item--hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px 18px;
  align-items: start;
  padding: 18px 20px;
}

.profile-dialog--compact-wide .highlight-item--hero .highlight-header {
  grid-column: 1 / 2;
}

.profile-dialog--compact-wide .highlight-item--hero .highlight-value--hero {
  grid-column: 2 / 3;
  grid-row: 1 / span 2;
  justify-self: end;
  align-self: center;
  font-size: clamp(2.6rem, 2vw + 1.4rem, 3.4rem);
}

.profile-dialog--compact-wide .highlight-item--hero .highlight-copy,
.profile-dialog--compact-wide .highlight-item--hero .highlight-meta-row,
.profile-dialog--compact-wide .highlight-item--hero .highlight-details {
  grid-column: 1 / -1;
}

.highlight-item--metric,
.highlight-item--detail {
  min-height: 156px;
}

.profile-dialog--preview-desktop .highlight-item--metric,
.profile-dialog--preview-desktop .highlight-item--detail {
  min-height: 0;
}

.profile-dialog--compact-wide .highlight-item--metric,
.profile-dialog--compact-wide .highlight-item--detail {
  min-height: 0;
}

.highlight-item--status {
  gap: 12px;
}

.profile-dialog--preview-desktop .highlight-item--status {
  min-height: 0;
}

.profile-dialog--preview-desktop .highlight-item--status,
.profile-dialog--preview-desktop .highlight-item--hero {
  grid-column: 1 / -1;
}

.highlight-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.highlight-header__copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.highlight-header__icon {
  color: color-mix(in srgb, var(--text-1) 86%, var(--accent-500) 14%);
}

.highlight-label {
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.8rem;
}

.highlight-kicker {
  font-size: 0.9rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.highlight-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.4rem 0.65rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-1) 70%, var(--accent-200) 30%);
  border: 1px solid color-mix(in srgb, var(--accent-500) 24%, transparent);
  color: var(--accent-600);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.highlight-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-1);
  display: inline-flex;
  align-items: center;
  gap: 10px;
  overflow-wrap: anywhere;
}

.highlight-value--hero {
  font-size: clamp(2.6rem, 2vw + 2rem, 4rem);
  font-weight: 800;
  line-height: 1;
}

.highlight-value--metric {
  font-size: clamp(1.9rem, 1vw + 1.6rem, 2.6rem);
  font-weight: 800;
  line-height: 1.05;
}

.highlight-value--mono {
  font-family: var(--font-mono, 'Fira Code', monospace);
  font-size: 1rem;
}

.highlight-item--trusted {
  background: color-mix(in srgb, var(--accent-200) 14%, var(--surface-1) 86%);
  border-color: color-mix(in srgb, var(--accent-500) 24%, var(--surface-contrast-border));
}

.highlight-item--hero.highlight-item--trusted {
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--accent-200) 26%, var(--surface-1) 74%) 0%,
    color-mix(in srgb, var(--surface-1) 88%, var(--surface-2) 12%) 100%
  );
  border-color: color-mix(in srgb, var(--accent-500) 30%, var(--surface-contrast-border));
}

.highlight-value--trusted {
  color: var(--accent-500);
}

.highlight-meta {
  line-height: 1.5;
}

.highlight-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  line-height: 1.5;
}

.highlight-details {
  margin-top: 2px;
}

.highlight-details[open] {
  padding-top: 2px;
}

.highlight-details__summary {
  cursor: pointer;
  color: var(--accent-500);
  font-weight: 700;
  list-style: none;
}

.highlight-details__summary::-webkit-details-marker {
  display: none;
}

.highlight-details__summary::before {
  content: '+';
  margin-right: 0.45rem;
}

.highlight-details[open] .highlight-details__summary::before {
  content: '-';
}

.highlight-details__body {
  margin-top: 0.7rem;
  line-height: 1.55;
}

.trusted-rank-info-links {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 0.75rem;
}

.trusted-rank-info-link {
  color: var(--accent-500);
  font-weight: 600;
  text-decoration: none;
}

.trusted-rank-info-link:hover,
.trusted-rank-info-link:focus-visible {
  text-decoration: underline;
}

.highlight-copy {
  color: var(--text-2);
  line-height: 1.55;
}

.highlight-link {
  color: var(--accent-500);
  font-weight: 600;
  text-decoration: none;
  overflow-wrap: anywhere;
}

.highlight-link:hover,
.highlight-link:focus-visible {
  text-decoration: underline;
}

.highlight-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
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

.status-chip.neutral {
  background: color-mix(in srgb, var(--chip-bg) 60%, transparent);
  border-color: color-mix(in srgb, var(--surface-contrast-border) 70%, transparent);
}

.status-chip.warning {
  color: #b16900;
  background: color-mix(in srgb, #b16900 14%, var(--chip-bg));
  border-color: color-mix(in srgb, #b16900 28%, transparent);
}

.status-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-200);
  transform: translateY(-1px);
}

.section-heading {
  font-size: clamp(1.6rem, 1vw + 1.4rem, 2.2rem);
  font-weight: 700;
}

.tiers-carousel {
  display: flex;
  flex-direction: column;
  gap: clamp(18px, 2vw, 24px);
  padding: clamp(16px, 2.4vw, 24px);
  border-radius: clamp(20px, 2vw, 28px);
  background: color-mix(in srgb, var(--surface-1) 96%, var(--surface-2) 4%);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 55%, transparent);
}

.tiers-carousel__viewport {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: clamp(18px, 2.2vw, 28px);
  padding: clamp(12px, 1.8vw, 20px);
  outline: 2px solid transparent;
  outline-offset: 2px;
  border-radius: clamp(14px, 1.6vw, 22px);
}

.tiers-carousel__viewport:focus-visible {
  outline-color: color-mix(in srgb, var(--accent-200) 55%, transparent);
}

.tiers-carousel__slide {
  width: 100%;
}

.tiers-carousel__controls {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(10px, 1.6vw, 18px);
  width: 100%;
}

.tiers-carousel__controls-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(16px, 2.4vw, 28px);
  width: 100%;
  flex-wrap: wrap;
}

.tiers-carousel__control {
  color: var(--text-1);
  background: color-mix(in srgb, var(--surface-2) 88%, transparent);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 75%, transparent);
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  border-radius: 999px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.tiers-carousel__control .q-icon {
  font-size: 1.35rem;
}

.tiers-carousel__control:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-500) 40%, transparent),
    0 12px 30px rgba(15, 23, 42, 0.16);
}

.tiers-carousel__control:enabled:hover {
  color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-200) 25%, var(--surface-2) 75%);
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.18);
}

.tiers-carousel__control:enabled:active {
  transform: translateY(0);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.16);
}

.tiers-carousel__dots {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(12px, 2vw, 18px);
  padding: 8px 16px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-2) 86%, transparent);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.tiers-carousel__dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-contrast-border) 82%, transparent);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: transform 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.tiers-carousel__dot--active {
  background: var(--accent-500);
  transform: scale(1.15);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--accent-500) 35%, transparent);
}

.tiers-carousel__dot:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-500) 45%, transparent);
}

.tiers-carousel__dot:hover {
  background: color-mix(in srgb, var(--accent-500) 30%, transparent);
}

.empty-state {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-state__subtext {
  font-size: 0.95rem;
}
@media (min-width: 768px) {
  .profile-layout__body {
    padding: clamp(16px, 3vh, 24px) clamp(14px, 4vw, 24px);
  }

  .profile-layout--two-column .profile-layout__body {
    padding: clamp(18px, 3.2vh, 26px) clamp(18px, 4vw, 28px);
  }

  .tiers-carousel {
    gap: clamp(18px, 2vw, 24px);
  }

  .tiers-carousel__controls {
    gap: clamp(12px, 1.4vw, 18px);
  }

  .tiers-carousel__controls-inner {
    gap: clamp(18px, 2.4vw, 32px);
  }

  .tiers-carousel__control {
    width: 52px;
    height: 52px;
    min-width: 52px;
    min-height: 52px;
  }
}
@media (max-width: 599px) {

  .profile-dialog--compact .hero-panel {
    padding: 20px 18px 18px;
  }

  .profile-dialog--compact .hero-name {
    font-size: clamp(2.15rem, 9vw, 3.05rem);
  }

  .profile-dialog--compact .hero-handle {
    font-size: 1.08rem;
  }

  .profile-dialog--compact .hero-about {
    font-size: 1rem;
  }

  .hero-snapshot-strip {
    gap: 8px;
  }

  .hero-snapshot-pill {
    font-size: 0.82rem;
  }

  .profile-layout__body {
    padding: 15px 12px 18px;
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
    padding: 10px 16px 20px;
  }

  .highlights-section {
    padding: 10px 16px 20px;
  }

  .notes-section {
    padding: 10px 16px 20px;
  }

  .highlights-grid {
    grid-template-columns: 1fr;
  }

  .highlight-item {
    min-height: 0;
  }

  .highlight-item--hero {
    padding: 18px;
  }

  .highlight-value--hero {
    font-size: 2.35rem;
  }

  .highlight-value--metric {
    font-size: 1.85rem;
  }

  .highlight-header {
    flex-direction: column;
  }

  .highlight-badge {
    width: fit-content;
  }

  .tiers-carousel {
    padding: 16px;
    border-radius: 22px;
  }

  .tiers-carousel__viewport {
    padding: 12px 14px;
    gap: 20px;
  }

  .tiers-carousel__controls {
    gap: 12px;
  }

  .tiers-carousel__controls-inner {
    gap: 14px;
  }

  .tiers-carousel__dots {
    padding: 6px 10px;
  }

  .tiers-carousel__control {
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
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
    padding: clamp(14px, 2.6vh, 24px) clamp(18px, 4.2vw, 32px);
  }

  .profile-layout__hero--desktop .hero-rail {
    padding-right: clamp(12px, 1.6vw, 24px);
  }

  .profile-layout__hero--desktop .hero-panel {
    padding: clamp(40px, 6vh, 64px) clamp(36px, 4vw, 56px);
  }

  .profile-dialog--compact .profile-layout__hero--desktop .hero-panel {
    padding: clamp(24px, 2.8vw, 34px) clamp(22px, 2.8vw, 30px)
      clamp(20px, 2.4vw, 24px);
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

  .profile-dialog--compact .highlights-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  }

  .profile-dialog--compact .highlight-item--hero,
  .profile-dialog--compact .highlight-item--status {
    grid-column: 1 / -1;
  }

  .profile-dialog--compact .note-card {
    max-width: none;
  }

  .profile-layout--two-column .profile-layout__body {
    padding: clamp(18px, 3vh, 28px) 0;
  }

  .tiers-section {
    padding: clamp(16px, 2vh, 24px) 0 clamp(20px, 3vh, 28px);
    gap: 24px;
  }

  .tiers-carousel {
    padding: clamp(18px, 2vw, 26px);
  }

  .tiers-carousel__viewport {
    padding: clamp(14px, 1.4vw, 20px);
    gap: clamp(20px, 1.8vw, 28px);
  }

  .tiers-carousel__controls {
    gap: clamp(14px, 1.2vw, 20px);
  }

  .tiers-carousel__controls-inner {
    gap: clamp(20px, 2.4vw, 32px);
    max-width: 480px;
  }

  .empty-state {
    padding: 32px 48px;
  }
}
@media (min-width: 1180px) {
  .profile-dialog--preview-desktop .profile-layout--two-column {
    grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
    grid-template-rows: 1fr;
    column-gap: 0;
  }

  .profile-dialog--preview-desktop .profile-layout__hero--desktop {
    border-right: 1px solid color-mix(in srgb, var(--surface-contrast-border) 75%, transparent);
  }

  .profile-dialog--preview-desktop .profile-layout__hero--desktop .hero-rail {
    height: 100%;
    overflow-y: auto;
    padding-right: 0;
  }

  .profile-dialog--preview-desktop .profile-layout__hero--desktop .hero-panel {
    min-height: 100%;
  }

  .profile-dialog--preview-desktop .profile-layout__content--desktop {
    padding-right: 0;
  }
}
@media (min-width: 1280px) {
  .profile-layout--two-column {
    grid-template-columns: minmax(340px, clamp(440px, 32vw, 620px)) minmax(0, 1fr);
    grid-template-rows: 1fr;
    column-gap: clamp(40px, 4vw, 88px);
  }

  .profile-dialog--preview-desktop .profile-layout--two-column {
    grid-template-columns: minmax(300px, 340px) minmax(0, 1fr);
    column-gap: 0;
  }

  .hero-actions--inline .action-button {
    flex: 1 1 200px;
  }
}
</style>
