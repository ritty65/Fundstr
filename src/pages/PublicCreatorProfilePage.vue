<template>
  <div
    class="profile-page bg-surface-1 text-1"
    :class="{ 'profile-page--custom': isCustomLinkView }"
  >
    <div class="profile-page__inner">
      <div class="profile-page__back q-mb-md">
        <q-btn flat color="primary" to="/find-creators">{{
          $t("CreatorHub.profile.back")
        }}</q-btn>
      </div>

      <q-banner v-if="isGuest" class="profile-page__banner bg-surface-2 text-2" icon="info">
        {{ $t("CreatorHub.profile.guestCta") }}
        <template #action>
          <q-btn flat color="primary" :label="$t('CreatorHub.profile.finishSetup')" @click="gotoWelcome" />
        </template>
      </q-banner>

      <q-banner v-if="decodeError" class="profile-page__banner bg-negative text-white">
        {{ decodeError }}
      </q-banner>

      <q-banner
        v-if="fallbackActive && fallbackBannerText"
        class="profile-page__banner bg-warning text-1"
        icon="cloud_off"
        aria-live="polite"
      >
        <div>{{ fallbackBannerText }}</div>
        <div v-if="fallbackRelaysLabel" class="text-caption q-mt-xs text-2">
          {{ fallbackRelaysLabel }}
        </div>
      </q-banner>

      <div
        class="profile-hero-area"
        :class="{
          'profile-hero-area--with-cta': !!primaryTier,
          'profile-hero-area--with-featured': isCustomLinkView && !!featuredTier,
        }"
      >
        <section class="profile-hero" :class="{ 'profile-hero--with-banner': heroBannerUrl }">
          <div
            v-if="heroBannerUrl"
            class="profile-hero__banner"
            :style="heroBannerStyle"
            role="presentation"
          />
          <div class="profile-hero__content bg-surface-2">
            <div class="profile-hero__avatar" aria-hidden="true">
              <img
                v-if="profileAvatar"
                :src="profileAvatar"
                :alt="profileDisplayName"
                @error="onHeroAvatarError"
              />
              <div v-else class="profile-hero__avatar-placeholder">{{ profileInitials }}</div>
            </div>
            <div class="profile-hero__details">
              <div class="profile-hero__heading">
                <h1 class="profile-hero__name text-h4">{{ profileDisplayName }}</h1>
                <q-btn
                  flat
                  round
                  dense
                  icon="content_copy"
                  :aria-label="$t('CreatorHub.profile.copyProfileLink')"
                  @click="copy(profileUrl)"
                />
              </div>
              <p v-if="profileHandle" class="profile-hero__handle text-2">@{{ profileHandle }}</p>
              <div v-if="hasFollowerStats" class="profile-hero__stats text-2">
                <span v-if="followers !== null">
                  {{ $t('CreatorHub.profile.followers', { count: followers }) }}
                </span>
                <span v-if="following !== null">
                  {{ $t('CreatorHub.profile.following', { count: following }) }}
                </span>
              </div>
              <div v-if="metadataChips.length" class="profile-hero__chips" role="list">
                <q-chip
                  v-for="chip in metadataChips"
                  :key="chip.id"
                  dense
                  outline
                  :icon="chip.icon"
                  :label="chip.label"
                  :tag="chip.href ? 'a' : 'div'"
                  :href="chip.href"
                  :target="chip.href ? '_blank' : undefined"
                  :rel="chip.href ? 'noopener noreferrer' : undefined"
                  :clickable="!!chip.href"
                  role="listitem"
                />
              </div>
            </div>
          </div>
        </section>
        <div
          v-if="primaryTier || featuredTier || showFeaturedTierFallback"
          class="profile-hero-sidebar"
        >
          <section v-if="primaryTier" class="profile-cta bg-surface-2 text-1 q-pa-lg q-gutter-y-sm">
            <div class="profile-cta__header">
              <div class="profile-cta__pricing">
                <span class="profile-cta__sats">{{ primaryPriceSatsDisplay }} sats</span>
                <span v-if="primaryPriceFiat" class="profile-cta__fiat text-2">≈ {{ primaryPriceFiat }}</span>
                <span v-if="primaryFrequencyLabel" class="profile-cta__frequency text-2">
                  {{ primaryFrequencyLabel }}
                </span>
              </div>
              <q-btn
                color="primary"
                class="profile-cta__button"
                :label="$t('CreatorHub.profile.subscribeCta')"
                :disable="isGuest"
                @click="openSubscribe(primaryTier)"
              >
                <q-tooltip v-if="needsSignerSetupTooltip">
                  {{ $t('CreatorHub.profile.guestTooltip') }}
                </q-tooltip>
              </q-btn>
            </div>
            <p class="profile-cta__microcopy text-2">
              {{ $t('CreatorHub.profile.subscribeMicrocopy') }}
            </p>
          </section>

          <section v-if="featuredTier" class="profile-featured-tier bg-surface-2 text-1">
            <TierSummaryCard
              class="tier-card--featured"
              :tier="featuredTier"
              :price-sats="getPrice(featuredTier)"
              :price-fiat="formatFiat(getPrice(featuredTier))"
              :frequency-label="frequencyLabel(featuredTier)"
              :subscribe-label="$t('CreatorHub.profile.subscribeCta')"
              :subscribe-disabled="isGuest"
              :badges="[$t('CreatorHub.profile.featuredTierBadge')]"
              @subscribe="openSubscribe"
            >
              <template v-if="needsSignerSetupTooltip" #subscribe-tooltip>
                <q-tooltip>{{ $t('CreatorHub.profile.guestTooltip') }}</q-tooltip>
              </template>
              <template #footer-note>
                {{ $t('CreatorHub.profile.subscribeMicrocopy') }}
              </template>
              <template v-if="creatorHex" #default>
                <PaywalledContent
                  :creator-npub="creatorHex"
                  :tier-id="featuredTier.id"
                  class="profile-tier__paywalled"
                >
                  <div>{{ $t('CreatorHub.profile.paywalledPreview') }}</div>
                </PaywalledContent>
              </template>
            </TierSummaryCard>
          </section>

          <section
            v-else-if="showFeaturedTierFallback"
            class="profile-featured-tier profile-featured-tier--fallback bg-surface-2 text-1"
          >
            <div class="profile-featured-tier__fallback text-body1">
              {{ $t('CreatorHub.profile.featuredTierMissing') }}
            </div>
            <q-btn
              flat
              color="primary"
              class="profile-featured-tier__cta"
              :label="$t('CreatorHub.profile.featuredTierMissingCta')"
              @click="clearCustomTierLink"
            />
          </section>
        </div>
      </div>

      <main class="profile-layout">
        <section class="profile-section">
          <header class="profile-section__header">
            <h2 class="profile-section__title text-h5">
              {{ $t('CreatorHub.profile.sections.about') }}
            </h2>
          </header>
          <div class="profile-section__body">
            <p v-if="aboutText" class="profile-section__text text-body1">{{ aboutText }}</p>
            <p v-else class="profile-section__text text-2">
              {{ $t('CreatorHub.profile.noAbout') }}
            </p>
          </div>
        </section>

        <div
          class="profile-tier-grid"
          :class="{ 'profile-tier-grid--custom': isCustomLinkView }"
        >
          <section class="profile-section" aria-live="polite">
            <header class="profile-section__header profile-section__header--with-spinner">
              <h2 class="profile-section__title text-h5">
                {{ $t('CreatorHub.profile.sections.tiers') }}
              </h2>
              <q-spinner-dots
                v-if="refreshingTiers && !loadingTiers"
                size="sm"
                class="profile-section__spinner text-2"
              />
            </header>
            <div v-if="loadingTiers" class="profile-section__state">
              <q-spinner-hourglass />
            </div>
            <template v-else>
              <q-banner
                v-if="tierFetchError && !tiers.length"
                class="profile-page__banner bg-surface-2"
              >
                {{ $t('CreatorHub.profile.tierLoadError') }}
                <template #action>
                  <button
                    type="button"
                    class="profile-retry-hidden"
                    tabindex="-1"
                    aria-hidden="true"
                    @click="retryFetchTiers"
                  >{{ retryLabel }}</button>
                  <q-btn
                    flat
                    color="primary"
                    :label="retryLabel"
                    @click="retryFetchTiers"
                  />
                </template>
              </q-banner>
              <div v-else-if="!tiers.length" class="profile-section__state text-2">
                {{ $t('CreatorHub.profile.noTiers') }}
              </div>
                <template v-else>
                  <template v-if="isCustomLinkView">
                    <div
                      v-if="featuredTier && moreOptionsTiers.length"
                      class="profile-tier-more"
                    >
                      <h3 class="profile-tier-more__title text-subtitle1">
                        {{ $t('CreatorHub.profile.moreOptions') }}
                      </h3>
                      <div class="profile-tier-list profile-tier-list--more">
                        <TierSummaryCard
                          v-for="t in moreOptionsTiers"
                          :key="t.id"
                          :tier="t"
                          :price-sats="getPrice(t)"
                          :price-fiat="formatFiat(getPrice(t))"
                          :frequency-label="frequencyLabel(t)"
                          :subscribe-label="$t('CreatorHub.profile.subscribeCta')"
                          :subscribe-disabled="isGuest"
                          :collapse-media="true"
                          @subscribe="openSubscribe"
                        >
                          <template v-if="needsSignerSetupTooltip" #subscribe-tooltip>
                            <q-tooltip>{{ $t('CreatorHub.profile.guestTooltip') }}</q-tooltip>
                          </template>
                          <template #footer-note>
                            {{ $t('CreatorHub.profile.subscribeMicrocopy') }}
                          </template>
                          <template v-if="creatorHex" #default>
                            <PaywalledContent
                              :creator-npub="creatorHex"
                              :tier-id="t.id"
                              class="profile-tier__paywalled"
                            >
                              <div>{{ $t('CreatorHub.profile.paywalledPreview') }}</div>
                            </PaywalledContent>
                          </template>
                        </TierSummaryCard>
                      </div>
                    </div>
                    <div v-else-if="!featuredTier" class="profile-tier-list">
                      <TierSummaryCard
                        v-for="t in tiers"
                        :key="t.id"
                        :tier="t"
                        :price-sats="getPrice(t)"
                        :price-fiat="formatFiat(getPrice(t))"
                        :frequency-label="frequencyLabel(t)"
                        :subscribe-label="$t('CreatorHub.profile.subscribeCta')"
                        :subscribe-disabled="isGuest"
                        :collapse-media="true"
                        @subscribe="openSubscribe"
                      >
                        <template v-if="needsSignerSetupTooltip" #subscribe-tooltip>
                          <q-tooltip>{{ $t('CreatorHub.profile.guestTooltip') }}</q-tooltip>
                        </template>
                        <template #footer-note>
                          {{ $t('CreatorHub.profile.subscribeMicrocopy') }}
                        </template>
                        <template v-if="creatorHex" #default>
                          <PaywalledContent
                            :creator-npub="creatorHex"
                            :tier-id="t.id"
                            class="profile-tier__paywalled"
                          >
                            <div>{{ $t('CreatorHub.profile.paywalledPreview') }}</div>
                          </PaywalledContent>
                        </template>
                      </TierSummaryCard>
                    </div>
                  </template>
                  <div v-else class="profile-tier-list">
                    <TierSummaryCard
                      v-for="t in tiers"
                      :key="t.id"
                      :tier="t"
                      :price-sats="getPrice(t)"
                      :price-fiat="formatFiat(getPrice(t))"
                      :frequency-label="frequencyLabel(t)"
                      :subscribe-label="$t('CreatorHub.profile.subscribeCta')"
                      :subscribe-disabled="isGuest"
                      :collapse-media="false"
                      @subscribe="openSubscribe"
                    >
                      <template v-if="needsSignerSetupTooltip" #subscribe-tooltip>
                        <q-tooltip>{{ $t('CreatorHub.profile.guestTooltip') }}</q-tooltip>
                      </template>
                      <template #footer-note>
                        {{ $t('CreatorHub.profile.subscribeMicrocopy') }}
                      </template>
                      <template v-if="creatorHex" #default>
                        <PaywalledContent
                          :creator-npub="creatorHex"
                          :tier-id="t.id"
                          class="profile-tier__paywalled"
                        >
                          <div>{{ $t('CreatorHub.profile.paywalledPreview') }}</div>
                        </PaywalledContent>
                      </template>
                    </TierSummaryCard>
                  </div>
                </template>
              <q-banner
                v-if="tierFetchError && tiers.length"
                class="profile-page__banner bg-surface-2"
              >
                {{ $t('CreatorHub.profile.tierRefreshError') }}
                <template #action>
                  <button
                    type="button"
                    class="profile-retry-hidden"
                    tabindex="-1"
                    aria-hidden="true"
                    @click="retryFetchTiers"
                  >{{ retryLabel }}</button>
                  <q-btn
                    flat
                    color="primary"
                    :label="retryLabel"
                    @click="retryFetchTiers"
                  />
                </template>
              </q-banner>
            </template>
          </section>

          <section class="profile-section profile-section--infrastructure">
            <header class="profile-section__header">
              <h2 class="profile-section__title text-h5">
                {{ $t('CreatorHub.profile.sections.infrastructure') }}
              </h2>
            </header>
            <div class="profile-section__body profile-infrastructure">
              <article class="profile-card">
                <h3 class="profile-card__title text-subtitle1">
                  {{ $t('CreatorHub.profile.infrastructureDetails') }}
                </h3>
                <div v-if="profile.p2pkPubkey" class="profile-card__row">
                  <div class="profile-card__label text-2">
                    <span>{{ $t('CreatorHub.profile.p2pkLabel') }}</span>
                    <q-btn
                      flat
                      dense
                      round
                      size="sm"
                      class="profile-card__info-btn"
                      icon="info"
                      :aria-label="$t('FindCreators.explainers.tooltips.p2pk')"
                    >
                      <q-tooltip anchor="top middle" self="bottom middle">
                        {{ $t('FindCreators.explainers.tooltips.p2pk') }}
                      </q-tooltip>
                    </q-btn>
                  </div>
                  <code class="profile-card__value">{{ profile.p2pkPubkey }}</code>
                </div>
                <div class="profile-card__row">
                  <div class="profile-card__label text-2">
                    <span>{{ $t('CreatorHub.profile.trustedMintsLabel') }}</span>
                    <q-btn
                      flat
                      dense
                      round
                      size="sm"
                      class="profile-card__info-btn"
                      icon="info"
                      :aria-label="$t('FindCreators.explainers.tooltips.trustedMints')"
                    >
                      <q-tooltip anchor="top middle" self="bottom middle">
                        {{ $t('FindCreators.explainers.tooltips.trustedMints') }}
                      </q-tooltip>
                    </q-btn>
                  </div>
                  <MintSafetyList :mints="trustedMints" />
                </div>
                <div class="profile-card__row">
                  <div class="profile-card__label text-2">
                    <span>{{ $t('CreatorHub.profile.relaysLabel') }}</span>
                    <q-btn
                      flat
                      dense
                      round
                      size="sm"
                      class="profile-card__info-btn"
                      icon="info"
                      :aria-label="$t('FindCreators.explainers.tooltips.relays')"
                    >
                      <q-tooltip anchor="top middle" self="bottom middle">
                        {{ $t('FindCreators.explainers.tooltips.relays') }}
                      </q-tooltip>
                    </q-btn>
                  </div>
                  <RelayBadgeList :relays="relayList" />
                </div>
              </article>
              <article class="profile-card profile-card--copy">
                <h3 class="profile-card__title text-subtitle1">
                  {{ $t('CreatorHub.profile.howCashuWorks.title') }}
                </h3>
                <div class="profile-card__media">
                  <div class="profile-card__media-main">
                    <div class="profile-card__video">
                      <video
                        controls
                        preload="metadata"
                        playsinline
                        poster="https://m.primal.net/HsMt.jpg"
                      >
                        <source src="https://m.primal.net/HsMt.mp4" type="video/mp4" />
                        {{ $t('CreatorHub.profile.howCashuWorks.intro') }}
                      </video>
                      <div class="sr-only">
                        <a href="https://m.primal.net/HsMt.mp4" target="_blank" rel="noopener">
                          {{ $t('CreatorHub.profile.howCashuWorks.title') }}
                        </a>
                      </div>
                    </div>
                    <p class="profile-card__caption profile-card__text text-2">
                      {{ $t('CreatorHub.profile.howCashuWorks.intro') }}
                    </p>
                  </div>
                  <div
                    v-if="howCashuWorksHighlight || howCashuWorksList.length"
                    class="profile-card__media-aside"
                  >
                    <div v-if="howCashuWorksHighlight" class="profile-card__highlight text-body2">
                      <span class="profile-card__highlight-label text-2">
                        {{ $t('CreatorHub.profile.howCashuWorks.title') }}
                      </span>
                      <p class="profile-card__highlight-text">
                        {{ howCashuWorksHighlight }}
                      </p>
                    </div>
                    <ul v-if="howCashuWorksList.length" class="profile-card__list">
                      <li
                        v-for="(item, index) in howCashuWorksList"
                        :key="index"
                        class="profile-card__list-item text-2"
                      >
                        {{ item }}
                      </li>
                    </ul>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>

        <section class="profile-section">
          <header class="profile-section__header">
            <h2 class="profile-section__title text-h5">
              {{ $t('CreatorHub.profile.sections.faq') }}
            </h2>
          </header>
          <div class="profile-section__body">
            <div v-if="faqEntries.length" class="profile-faq">
              <details
                v-for="(faq, index) in faqEntries"
                :key="faq.question + index"
                class="profile-faq__item"
              >
                <summary class="profile-faq__question text-subtitle2">
                  {{ faq.question }}
                </summary>
                <p class="profile-faq__answer text-body2">{{ faq.answer }}</p>
              </details>
            </div>
            <p v-else class="profile-section__text text-2">
              {{ $t('CreatorHub.profile.noFaq') }}
            </p>
          </div>
        </section>
      </main>

      <SubscribeDialog
        v-model="showSubscribeDialog"
        :tier="selectedTier"
        :creator-pubkey="creatorHex || ''"
        @confirm="confirmSubscribe"
      />
      <SetupRequiredDialog v-model="showSetupDialog" :tier-id="selectedTier?.id" />
      <SubscriptionReceipt
        v-model="showReceiptDialog"
        :receipts="receiptList"
      />
    </div>

    <div
      v-if="primaryTier"
      class="profile-cta-mobile bg-surface-2 text-1 q-px-md q-py-sm"
    >
      <div class="profile-cta-mobile__content">
        <div class="profile-cta__pricing">
          <span class="profile-cta__sats">{{ primaryPriceSatsDisplay }} sats</span>
          <span v-if="primaryPriceFiat" class="profile-cta__fiat text-2">≈ {{ primaryPriceFiat }}</span>
        </div>
        <q-btn
          color="primary"
          class="profile-cta__button"
          :label="$t('CreatorHub.profile.subscribeCta')"
          :disable="isGuest"
          @click="openSubscribe(primaryTier)"
        >
          <q-tooltip v-if="needsSignerSetupTooltip">
            {{ $t('CreatorHub.profile.guestTooltip') }}
          </q-tooltip>
        </q-btn>
      </div>
      <p class="profile-cta__microcopy text-2">
        {{ $t('CreatorHub.profile.subscribeMicrocopy') }}
      </p>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  ref,
  onMounted,
  onActivated,
  onUnmounted,
  computed,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  useCreatorsStore,
  fetchFundstrProfileBundle,
  FundstrProfileFetchError,
  type FundstrProfileBundle,
} from "stores/creators";
import { useNostrStore, fetchNutzapProfile } from "stores/nostr";
import { buildProfileUrl } from "src/utils/profileUrl";
import { deriveCreatorKeys } from "src/utils/nostrKeys";

import { usePriceStore } from "stores/price";
import { useUiStore } from "stores/ui";
import SubscribeDialog from "components/SubscribeDialog.vue";
import SubscriptionReceipt from "components/SubscriptionReceipt.vue";
import SetupRequiredDialog from "components/SetupRequiredDialog.vue";
import { useI18n } from "vue-i18n";
import PaywalledContent from "components/PaywalledContent.vue";
import MintSafetyList from "components/MintSafetyList.vue";
import RelayBadgeList from "components/RelayBadgeList.vue";
import TierSummaryCard from "components/TierSummaryCard.vue";
import { isTrustedUrl } from "src/utils/sanitize-url";
import {
  displayNameFromProfile,
  initialFromName,
  normalizeMeta,
  safeImageSrc,
  type ProfileMeta,
} from "src/utils/profile";
import { useClipboard } from "src/composables/useClipboard";
import { useWelcomeStore } from "stores/welcome";
import {
  daysToFrequency,
  type SubscriptionFrequency,
} from "src/constants/subscriptionFrequency";

export default defineComponent({
  name: "PublicCreatorProfilePage",
  components: {
    PaywalledContent,
    SubscriptionReceipt,
    SetupRequiredDialog,
    MintSafetyList,
    RelayBadgeList,
    TierSummaryCard,
  },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const creatorParam =
      (route.params.npubOrHex ?? route.params.npub) as string | undefined;
    const decodeError = ref<string | null>(null);
    const creatorNpub = ref<string>(creatorParam ?? "");
    const creatorHex = ref<string | null>(null);
    const decodeFailureMessage =
      "We couldn't load this creator profile. Double-check the link and try again.";

    const currentCreatorParam = ref<string>(creatorParam ?? "");

    const updateCreatorKeys = (param: string | undefined) => {
      const nextParam = typeof param === "string" ? param : "";
      creatorNpub.value = nextParam;
      creatorHex.value = null;
      decodeError.value = null;
      if (!nextParam) {
        return;
      }
      try {
        const keys = deriveCreatorKeys(param);
        creatorNpub.value = keys.npub;
        creatorHex.value = keys.hex;
      } catch (err) {
        decodeError.value = decodeFailureMessage;
      }
    };

    updateCreatorKeys(creatorParam);
    const creators = useCreatorsStore();
    const nostr = useNostrStore();
    const priceStore = usePriceStore();
    const uiStore = useUiStore();
    const welcomeStore = useWelcomeStore();
    const { t } = useI18n();
    const { copy } = useClipboard();
    const bitcoinPrice = computed(() => priceStore.bitcoinPrice);
    const profile = ref<any>({});
    const profileMeta = computed<ProfileMeta>(() => normalizeMeta(profile.value ?? {}));
    const profileRelayHints = ref<string[]>([]);
    const hasLoadedRelayProfile = ref(false);
    const fallbackActive = ref(false);
    const fallbackFailed = ref(false);
    const fallbackRelays = ref<string[]>([]);
    const profileLoadError = ref<Error | null>(null);
    const creatorTierList = computed(() =>
      creatorHex.value ? creators.tiersMap[creatorHex.value] : undefined,
    );
    const tiers = computed(() => creatorTierList.value ?? []);
    const featuredTier = computed<any | null>(() => {
      if (!isCustomLinkView.value) return null;
      const tierId = customTierId.value;
      if (!tierId) return null;
      const tierList = tiers.value ?? [];
      for (const tier of tierList) {
        if (!tier) continue;
        const candidateId =
          typeof tier.id === "string" || typeof tier.id === "number"
            ? String(tier.id)
            : "";
        if (candidateId === tierId) {
          return tier;
        }
      }
      return null;
    });
    const hasInitialTierData = computed(
      () => creatorTierList.value !== undefined,
    );
    const showSubscribeDialog = ref(false);
    const showSetupDialog = ref(false);
    const showReceiptDialog = ref(false);
    const receiptList = ref<any[]>([]);
    const selectedTier = ref<any>(null);
    const followers = ref<number | null>(null);
    const following = ref<number | null>(null);
    const loadingTiers = ref(true);
    const refreshingTiers = ref(false);
    const refreshTaskCount = ref(0);
    const autoRefreshQueued = ref(false);
    const tierFetchError = computed(() => creators.tierFetchError);
    const moreOptionsTiers = computed(() => {
      if (!isCustomLinkView.value) return [] as any[];
      const tierList = tiers.value ?? [];
      if (!Array.isArray(tierList) || tierList.length === 0) {
        return [] as any[];
      }
      if (!featuredTier.value) {
        return tierList;
      }
      const featuredId =
        typeof featuredTier.value.id === "string" ||
        typeof featuredTier.value.id === "number"
          ? String(featuredTier.value.id)
          : "";
      return tierList.filter((tier: any) => {
        if (!tier) return false;
        const candidateId =
          typeof tier.id === "string" || typeof tier.id === "number"
            ? String(tier.id)
            : "";
        return candidateId !== featuredId;
      });
    });
    const showFeaturedTierFallback = computed(
      () =>
        isCustomLinkView.value &&
        !loadingTiers.value &&
        !featuredTier.value &&
        !tierFetchError.value,
    );
    const isGuest = computed(() => !welcomeStore.welcomeCompleted);
    const needsSignerSetupTooltip = computed(
      () => isGuest.value || !nostr.hasIdentity,
    );

    const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const clearAutoRefreshTimer = () => {
      if (refreshTimer !== null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };

    const customTierId = ref<string | null>(null);
    const isCustomLinkView = computed(
      () => typeof customTierId.value === "string" && customTierId.value.length > 0,
    );
    const syncCustomLinkView = () => {
      const tierId = route.query.tierId;
      customTierId.value =
        typeof tierId === "string" && tierId.length > 0 ? tierId : null;
    };

    watch(() => route.query.tierId, syncCustomLinkView, {
      immediate: true,
    });

    const mergeUniqueUrls = (...lists: Array<string[] | undefined>) => {
      const urls = new Set<string>();
      for (const list of lists) {
        if (!Array.isArray(list)) continue;
        for (const url of list) {
          if (typeof url !== "string") continue;
          const trimmed = url.trim();
          if (!trimmed) continue;
          urls.add(trimmed);
        }
      }
      return Array.from(urls);
    };

    const toStringList = (input: unknown): string[] => {
      const values: string[] = [];
      const append = (value: unknown) => {
        if (typeof value !== "string") return;
        const trimmed = value.trim();
        if (!trimmed) return;
        values.push(trimmed);
      };
      if (Array.isArray(input)) {
        for (const entry of input) {
          append(entry);
        }
      } else if (input instanceof Set) {
        for (const entry of input) {
          append(entry);
        }
      } else if (input && typeof input === "object") {
        for (const key of Object.keys(input as Record<string, unknown>)) {
          append(key);
        }
      } else {
        append(input);
      }
      const unique = Array.from(new Set(values));
      unique.sort((a, b) => a.localeCompare(b));
      return unique;
    };

    const listsEqual = (a: string[], b: string[]): boolean => {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    };

    const normalizeTierSnapshot = (list: unknown): string => {
      if (!Array.isArray(list)) return "[]";
      const normalized = (list as Array<Record<string, any>>)
        .map((tier) => {
          if (!tier || typeof tier !== "object") return null;
          const id = typeof tier.id === "string" ? tier.id : "";
          if (!id) return null;
          const name = typeof tier.name === "string" ? tier.name : "";
          const priceRaw =
            typeof tier.price_sats === "number"
              ? tier.price_sats
              : typeof tier.price === "number"
                ? tier.price
                : undefined;
          const description =
            typeof tier.description === "string" ? tier.description : "";
          const frequency =
            typeof tier.frequency === "string" ? tier.frequency : undefined;
          const intervalDays =
            typeof tier.intervalDays === "number" ? tier.intervalDays : undefined;
          const benefits = Array.isArray(tier.benefits)
            ? tier.benefits
                .map((benefit) =>
                  typeof benefit === "string" ? benefit : String(benefit),
                )
                .filter((benefit) => benefit.length > 0)
            : [];
          return {
            id,
            name,
            price: typeof priceRaw === "number" ? Math.round(priceRaw) : undefined,
            description,
            frequency,
            intervalDays,
            benefits,
          };
        })
        .filter(
          (tier): tier is {
            id: string;
            name: string;
            price?: number;
            description: string;
            frequency?: string;
            intervalDays?: number;
            benefits: string[];
          } => tier !== null,
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      return JSON.stringify(normalized);
    };

    const tiersEqual = (
      a: any[] | undefined,
      b: any[] | undefined,
    ): boolean => normalizeTierSnapshot(a) === normalizeTierSnapshot(b);

    const applyBundleTierList = (tierList: any[] | null | undefined) => {
      if (!creatorHex.value || !Array.isArray(tierList)) return;
      const existing = creators.tiersMap[creatorHex.value];
      if (existing && tiersEqual(existing, tierList)) {
        return;
      }
      creators.tiersMap[creatorHex.value] = tierList.map((tier: any) =>
        tier && typeof tier === "object" ? { ...tier } : tier,
      );
    };

    const beginRefresh = () => {
      refreshTaskCount.value += 1;
      refreshingTiers.value = true;
    };

    const endRefresh = () => {
      if (refreshTaskCount.value > 0) {
        refreshTaskCount.value -= 1;
      }
      if (refreshTaskCount.value <= 0) {
        refreshTaskCount.value = 0;
        refreshingTiers.value = false;
      }
    };

    const resetRefreshState = () => {
      refreshTaskCount.value = 0;
      refreshingTiers.value = false;
      autoRefreshQueued.value = false;
    };

    const resetCreatorState = () => {
      profile.value = {};
      profileRelayHints.value = [];
      hasLoadedRelayProfile.value = false;
      fallbackActive.value = false;
      fallbackFailed.value = false;
      fallbackRelays.value = [];
      profileLoadError.value = null;
      followers.value = null;
      following.value = null;
      loadingTiers.value = true;
      resetRefreshState();
      creators.tierFetchError = false;
      selectedTier.value = null;
      receiptList.value = [];
      showSubscribeDialog.value = false;
      showSetupDialog.value = false;
      showReceiptDialog.value = false;
      clearAutoRefreshTimer();
    };

    const fetchTiers = async () => {
      if (!creatorHex.value) {
        loadingTiers.value = false;
        return;
      }
      if (!hasInitialTierData.value) {
        loadingTiers.value = true;
      }
      beginRefresh();
      creators.tierFetchError = false;
      try {
        await creators.fetchCreator(creatorHex.value, true);
        if (creators.tierFetchError) {
          fallbackActive.value = true;
          fallbackFailed.value = true;
        }
      } catch (error) {
        console.error("[creator-profile] Failed to refresh tier definitions", error);
        creators.tierFetchError = true;
        fallbackActive.value = true;
        fallbackFailed.value = true;
      } finally {
        endRefresh();
        if (!hasInitialTierData.value) {
          loadingTiers.value = false;
        }
      }
    };

    watch(
      hasInitialTierData,
      (hasData) => {
        if (hasData) {
          loadingTiers.value = false;
        }
      },
      { immediate: true },
    );

    watch(tierFetchError, (errored) => {
      if (errored) {
        loadingTiers.value = false;
        resetRefreshState();
        fallbackActive.value = true;
        fallbackFailed.value = true;
      }
    });

    const refreshProfileFromRelay = async (
      bundle: FundstrProfileBundle | null,
      opts: { forceRelayRefresh?: boolean } = {},
    ): Promise<void> => {
      if (!creatorHex.value) return;
      beginRefresh();
      try {
        const shouldForceRefresh =
          opts.forceRelayRefresh === true ||
          fallbackActive.value ||
          !hasLoadedRelayProfile.value;
        let fallbackAttempted = false;
        let relayProfile = await fetchNutzapProfile(creatorHex.value, {
          fundstrOnly: true,
          forceRefresh: shouldForceRefresh,
        });
        if (!relayProfile) {
          fallbackAttempted = true;
          relayProfile = await fetchNutzapProfile(creatorHex.value, {
            forceRefresh: true,
          });
        }
        if (!relayProfile) {
          if (fallbackAttempted) {
            fallbackActive.value = true;
            fallbackFailed.value = true;
          }
          return;
        }

        hasLoadedRelayProfile.value = true;
        if (fallbackAttempted) {
          fallbackActive.value = true;
          fallbackFailed.value = false;
          fallbackRelays.value = mergeUniqueUrls(
            fallbackRelays.value,
            relayProfile.relays,
          );
        }

        const cachedDetails = bundle?.profileDetails ?? null;
        const cachedMints = toStringList(
          cachedDetails?.trustedMints ?? profile.value.trustedMints,
        );
        const cachedRelays = toStringList(
          cachedDetails?.relays ?? profile.value.relays,
        );
        const nextMints = toStringList(relayProfile.trustedMints);
        const nextRelays = toStringList(relayProfile.relays);
        const currentTierAddr =
          typeof profile.value.tierAddr === "string"
            ? profile.value.tierAddr
            : typeof cachedDetails?.tierAddr === "string"
              ? cachedDetails.tierAddr
              : "";
        const nextTierAddr =
          typeof relayProfile.tierAddr === "string" ? relayProfile.tierAddr : "";
        const currentP2pk =
          typeof profile.value.p2pkPubkey === "string"
            ? profile.value.p2pkPubkey
            : typeof cachedDetails?.p2pkPubkey === "string"
              ? cachedDetails.p2pkPubkey
              : "";

        const updates: Record<string, unknown> = {};
        let hasDiff = false;

        if (!listsEqual(cachedMints, nextMints)) {
          updates.trustedMints = nextMints;
          hasDiff = true;
        }
        if (!listsEqual(cachedRelays, nextRelays)) {
          updates.relays = nextRelays;
          hasDiff = true;
        }
        if (nextTierAddr && nextTierAddr !== currentTierAddr) {
          updates.tierAddr = nextTierAddr;
          hasDiff = true;
        }
        if (relayProfile.p2pkPubkey && relayProfile.p2pkPubkey !== currentP2pk) {
          updates.p2pkPubkey = relayProfile.p2pkPubkey;
          hasDiff = true;
        }

        if (Object.keys(updates).length) {
          profile.value = {
            ...profile.value,
            ...updates,
          };
        }
        if (updates.relays) {
          profileRelayHints.value = mergeUniqueUrls(
            profileRelayHints.value,
            nextRelays,
          );
        }

        if (hasDiff && Array.isArray(bundle?.tiers)) {
          applyBundleTierList(bundle!.tiers);
        }
      } catch (error) {
        console.error("[creator-profile] Failed to refresh relay profile", error);
        fallbackActive.value = true;
        fallbackFailed.value = true;
      } finally {
        endRefresh();
      }
    };

    const loadProfile = async ({ forceRelayRefresh = false } = {}) => {
      const tierPromise = fetchTiers();

      if (!creatorHex.value) {
        await tierPromise;
        return;
      }

      const profilePromise = fetchFundstrProfileBundle(creatorHex.value, {
        forceRefresh: true,
      })
        .then(async (bundle) => {
          if (!bundle) return;
          const { profile: profileData, followers: followersCount, following: followingCount } =
            bundle;
          if (profileData) {
            const nextProfile = { ...profileData };
            if (nextProfile.picture && !isTrustedUrl(nextProfile.picture)) {
              delete nextProfile.picture;
            }
            if (nextProfile.banner && !isTrustedUrl(nextProfile.banner)) {
              delete nextProfile.banner;
            }
            profile.value = nextProfile;
          }
          if (bundle.profileDetails) {
            const { trustedMints, relays, tierAddr, p2pkPubkey } = bundle.profileDetails;
            const relayCandidates = toStringList(relays);
            const mintCandidates = toStringList(trustedMints);
            profile.value = {
              ...profile.value,
              trustedMints: mintCandidates,
              relays: relayCandidates,
              ...(tierAddr ? { tierAddr } : {}),
              ...(p2pkPubkey ? { p2pkPubkey } : {}),
            };
            if (relayCandidates.length) {
              profileRelayHints.value = mergeUniqueUrls(
                profileRelayHints.value,
                relayCandidates,
              );
            }
          }
          if (Array.isArray(bundle.tiers)) {
            applyBundleTierList(bundle.tiers);
          }
          if (typeof followersCount === "number") {
            followers.value = followersCount;
          }
          if (typeof followingCount === "number") {
            following.value = followingCount;
          }
          if (bundle.relayHints?.length) {
            profileRelayHints.value = mergeUniqueUrls(
              profileRelayHints.value,
              bundle.relayHints,
            );
          }
          if (bundle.fetchedFromFallback) {
            fallbackActive.value = true;
            fallbackRelays.value = mergeUniqueUrls(
              fallbackRelays.value,
              bundle.relayHints,
            );
          }
          profileLoadError.value = null;
          await refreshProfileFromRelay(bundle, { forceRelayRefresh });
        })
        .catch((err) => {
          const error = err instanceof Error ? err : new Error(String(err));
          profileLoadError.value = error;
          fallbackActive.value = true;
          if (err instanceof FundstrProfileFetchError) {
            fallbackFailed.value = true;
          } else {
            fallbackFailed.value = true;
          }
        });

      await Promise.all([profilePromise, tierPromise]);
    };
    const requestAutoRefresh = () => {
      if (!creatorHex.value) return;
      if (refreshTaskCount.value > 0) {
        autoRefreshQueued.value = true;
        return;
      }
      autoRefreshQueued.value = false;
      void loadProfile({ forceRelayRefresh: true });
    };

    const scheduleAutoRefresh = () => {
      clearAutoRefreshTimer();
      if (!creatorHex.value) return;
      refreshTimer = setInterval(() => {
        requestAutoRefresh();
      }, REFRESH_INTERVAL_MS);
    };

    watch(refreshTaskCount, (count) => {
      if (count === 0 && autoRefreshQueued.value) {
        requestAutoRefresh();
      }
    });

    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") {
        requestAutoRefresh();
      }
    };
    // initialization handled in onMounted

    watch(
      () => (route.params.npubOrHex ?? route.params.npub) as string | undefined,
      async (nextParam) => {
        const normalized = typeof nextParam === "string" ? nextParam : "";
        if (normalized === currentCreatorParam.value) {
          syncCustomLinkView();
          return;
        }
        currentCreatorParam.value = normalized;
        updateCreatorKeys(nextParam);
        resetCreatorState();
        syncCustomLinkView();
        await loadProfile();
        scheduleAutoRefresh();
      },
    );

    const retryFetchTiers = () => {
      void fetchTiers();
    };

    const clearCustomTierLink = () => {
      customTierId.value = null;
      const nextQuery = { ...route.query } as Record<string, any>;
      delete nextQuery.tierId;
      if (!creatorNpub.value) {
        router.replace({ query: nextQuery });
        return;
      }
      router.replace({
        name: "PublicCreatorProfile",
        params: { npubOrHex: creatorNpub.value },
        query: nextQuery,
      });
    };

    const openSubscribe = (tier: any) => {
      if (!creatorHex.value) {
        return;
      }
      selectedTier.value = tier;
      if (isGuest.value || !welcomeStore.welcomeCompleted) {
        showSetupDialog.value = true;
        return;
      }
      if (!nostr.hasIdentity) {
        showSetupDialog.value = true;
        return;
      }
      showSubscribeDialog.value = true;
    };

    const gotoWelcome = () => {
      router.push({ path: "/welcome", query: { redirect: route.fullPath } });
    };

    onMounted(async () => {
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }

      await loadProfile({ forceRelayRefresh: true });
      scheduleAutoRefresh();

      if (!creatorHex.value) return;
      const tierId = route.query.tierId as string | undefined;
      if (!nostr.hasIdentity || !tierId) return;
      const tryOpen = () => {
        const t = tiers.value.find((ti: any) => ti.id === tierId);
        if (t) {
          openSubscribe(t);
          router.replace({
            name: "PublicCreatorProfile",
            params: { npubOrHex: creatorNpub.value },
          });
          return true;
        }
        return false;
      };
      if (!tryOpen()) {
        const stop = watch(tiers, () => {
          if (tryOpen()) stop();
        });
      }
    });

    onActivated(() => {
      requestAutoRefresh();
      scheduleAutoRefresh();
    });

    onUnmounted(() => {
      clearAutoRefreshTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    });

    const formatTs = (ts: number) => {
      const d = new Date(ts * 1000);
      return `${d.getFullYear()}-${("0" + (d.getMonth() + 1)).slice(-2)}-${(
        "0" + d.getDate()
      ).slice(-2)} ${("0" + d.getHours()).slice(-2)}:${(
        "0" + d.getMinutes()
      ).slice(-2)}`;
    };

    const confirmSubscribe = ({
      bucketId,
      periods,
      amount,
      startDate,
      total,
    }: any) => {
      // Transaction already processed in SubscribeDialog.
      showSubscribeDialog.value = false;
    };

    function formatFiat(sats: number): string {
      if (!priceStore.bitcoinPrice) return "";
      const value = (priceStore.bitcoinPrice / 100000000) * sats;
      return uiStore.formatCurrency(value, "USD", true);
    }

    function getPrice(t: any): number {
      return t.price_sats ?? t.price ?? 0;
    }

    function resolveFrequency(tier: any): SubscriptionFrequency {
      if (typeof tier?.frequency === "string") {
        return tier.frequency as SubscriptionFrequency;
      }
      if (typeof tier?.intervalDays === "number") {
        return daysToFrequency(tier.intervalDays);
      }
      if (typeof tier?.intervalDays === "string") {
        const parsed = parseInt(tier.intervalDays, 10);
        if (!Number.isNaN(parsed)) {
          return daysToFrequency(parsed);
        }
      }
      return "monthly";
    }

    function frequencyLabel(tier: any): string {
      const frequency = resolveFrequency(tier);
      switch (frequency) {
        case "weekly":
          return "Every week";
        case "biweekly":
          return "Twice a month";
        default:
          return "Every month";
      }
    }

    const profileUrl = computed(() => buildProfileUrl(creatorNpub.value, router));

    const primaryTier = computed<any | null>(() => {
      if (featuredTier.value) {
        return featuredTier.value;
      }
      const tierList = tiers.value;
      if (!Array.isArray(tierList) || tierList.length === 0) {
        return null;
      }
      let candidate: any | null = null;
      for (const tier of tierList) {
        if (!tier) continue;
        if (!candidate || getPrice(tier) < getPrice(candidate)) {
          candidate = tier;
        }
      }
      return candidate;
    });

    const primaryPriceSats = computed(() =>
      primaryTier.value ? getPrice(primaryTier.value) : 0,
    );

    const primaryPriceFiat = computed(() => {
      if (!primaryTier.value) return "";
      return formatFiat(getPrice(primaryTier.value));
    });

    const primaryFrequencyLabel = computed(() =>
      primaryTier.value ? frequencyLabel(primaryTier.value) : "",
    );

    const primaryPriceSatsDisplay = computed(() => {
      const sats = primaryPriceSats.value;
      return new Intl.NumberFormat(navigator.language).format(sats);
    });

    const profileDisplayName = computed(() =>
      displayNameFromProfile(profileMeta.value, creatorNpub.value),
    );

    const profileHandle = computed(() => {
      const name = typeof profileMeta.value.name === "string" ? profileMeta.value.name.trim() : "";
      if (name) return name;
      const nip05 = typeof profileMeta.value.nip05 === "string" ? profileMeta.value.nip05.trim() : "";
      return nip05.includes("@") ? nip05.split("@")[0] || "" : nip05;
    });

    const profileAvatar = computed(() =>
      safeImageSrc(profileMeta.value.picture, profileDisplayName.value, 160),
    );

    const heroBannerUrl = computed(() => {
      const banner = profile.value.banner || profile.value.cover || profile.value.header;
      if (banner && isTrustedUrl(banner)) {
        return banner;
      }
      return "";
    });

    const heroBannerStyle = computed(() =>
      heroBannerUrl.value
        ? {
            backgroundImage: `url('${heroBannerUrl.value}')`,
          }
        : {},
    );

    const profileInitials = computed(() => initialFromName(profileDisplayName.value));

    const aboutText = computed(() => {
      const about = typeof profileMeta.value.about === "string" ? profileMeta.value.about.trim() : "";
      return about;
    });

    const hasFollowerStats = computed(
      () => followers.value !== null || following.value !== null,
    );

    const normalizeUrl = (value?: string | null) => {
      if (!value || typeof value !== "string") return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const withProtocol = /^(https?:)?\/\//i.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;
      try {
        const url = new URL(withProtocol);
        if (!isTrustedUrl(url.toString())) {
          return null;
        }
        return url.toString();
      } catch (err) {
        return null;
      }
    };

    const sanitizedWebsite = computed(() =>
      normalizeUrl(
        (profileMeta.value.website as string | null | undefined) ??
          (profile.value?.website as string | null | undefined) ??
          null,
      ),
    );

    const nip05Chip = computed(() => {
      const nip05 = profileMeta.value.nip05;
      if (!nip05 || typeof nip05 !== "string") return null;
      const [, domain] = nip05.split("@");
      const link = domain ? normalizeUrl(domain) : null;
      return {
        id: "nip05",
        icon: "verified_user",
        label: nip05,
        href: link ?? undefined,
      };
    });

    const lightningAddress = computed(() =>
      profile.value.lud16 || profile.value.lud06 || profile.value.lightning_address,
    );

    const metadataChips = computed(() => {
      const chips: Array<{ id: string; icon: string; label: string; href?: string }> = [];
      const nip = nip05Chip.value;
      if (nip) {
        chips.push(nip);
      }
      if (sanitizedWebsite.value) {
        chips.push({
          id: "website",
          icon: "language",
          label: new URL(sanitizedWebsite.value).hostname,
          href: sanitizedWebsite.value,
        });
      }
      if (lightningAddress.value) {
        chips.push({
          id: "lightning",
          icon: "bolt",
          label: lightningAddress.value,
          href: `lightning:${lightningAddress.value}`,
        });
      }
      return chips;
    });

    function onHeroAvatarError(event: Event) {
      (event.target as HTMLImageElement).src = safeImageSrc(
        null,
        profileDisplayName.value,
        160,
      );
    }

    const trustedMints = computed(() => {
      const mints = profile.value.trustedMints;
      if (Array.isArray(mints)) {
        return mints;
      }
      return [];
    });

    const relayList = computed(() => {
      const relays = profile.value.relays;
      if (Array.isArray(relays)) {
        return relays;
      }
      if (relays && typeof relays === "object") {
        return Object.keys(relays);
      }
      return [];
    });

    const howCashuWorksList = computed(() => {
      const items = t("CreatorHub.profile.howCashuWorks.points", {
        returnObjects: true,
      }) as unknown;
      if (Array.isArray(items)) {
        return items as string[];
      }
      return typeof items === "string" ? [items] : [];
    });

    const howCashuWorksHighlight = computed(() => howCashuWorksList.value[0] || "");

    const faqEntries = computed(() => {
      const raw = profile.value.faq;
      if (!raw) return [] as Array<{ question: string; answer: string }>;
      if (Array.isArray(raw)) {
        return raw
          .map((entry: any) => ({
            question: entry?.question || entry?.q || "",
            answer: entry?.answer || entry?.a || "",
          }))
          .filter((entry) => entry.question && entry.answer);
      }
      if (typeof raw === "object") {
        return Object.entries(raw)
          .map(([question, answer]) => ({
            question,
            answer: typeof answer === "string" ? answer : "",
          }))
          .filter((entry) => entry.question && entry.answer);
      }
      return [];
    });

    const translationWithFallback = (key: string, fallback: string) => {
      const translated = t(key);
      return translated === key ? fallback : translated;
    };

    const retryLabel = computed(() =>
      translationWithFallback("CreatorHub.profile.retry", "Retry"),
    );

    const fallbackBannerText = computed(() => {
      if (!fallbackActive.value) {
        return "";
      }
      if (fallbackFailed.value) {
        return translationWithFallback(
          "CreatorHub.profile.fallbackFailed",
          "Fundstr relay is unreachable right now. We couldn't load fresh data from public relays.",
        );
      }
      return translationWithFallback(
        "CreatorHub.profile.fallbackActive",
        "Fundstr relay is slow, loading data from public relays…",
      );
    });

    const fallbackRelaysLabel = computed(() => {
      if (!fallbackRelays.value.length) return "";
      return `${translationWithFallback(
        "CreatorHub.profile.fallbackRelaysLabel",
        "Attempting relays:",
      )} ${fallbackRelays.value.join(", ")}`;
    });

    return {
      creatorNpub,
      creatorHex,
      decodeError,
      profile,
      profileLoadError,
      profileDisplayName,
      profileHandle,
      profileAvatar,
      profileInitials,
      aboutText,
      onHeroAvatarError,
      heroBannerUrl,
      heroBannerStyle,
      tiers,
      featuredTier,
      moreOptionsTiers,
      showSubscribeDialog,
      showSetupDialog,
      showReceiptDialog,
      receiptList,
      selectedTier,
      followers,
      following,
      loadingTiers,
      refreshingTiers,
      tierFetchError,
      bitcoinPrice,
      priceStore,
      metadataChips,
      hasFollowerStats,
      trustedMints,
      relayList,
      howCashuWorksList,
      howCashuWorksHighlight,
      faqEntries,
      retryLabel,
      fallbackActive,
      fallbackBannerText,
      fallbackRelaysLabel,
      fallbackFailed,
      // no markdown rendering needed
      formatFiat,
      getPrice,
      frequencyLabel,
      primaryTier,
      primaryPriceFiat,
      primaryPriceSatsDisplay,
      primaryFrequencyLabel,
      openSubscribe,
      confirmSubscribe,
      retryFetchTiers,
      copy,
      profileUrl,
      isGuest,
      needsSignerSetupTooltip,
      isCustomLinkView,
      showFeaturedTierFallback,
      clearCustomTierLink,
      gotoWelcome,
    };
  },
});
</script>

<style scoped>
.profile-page {
  min-height: 100%;
}

.profile-page__inner {
  width: 100%;
  max-width: 96rem;
  margin: 0 auto;
  padding: clamp(1.25rem, 4vw, 3rem) clamp(1.5rem, 6vw, 4rem);
}

.profile-page__banner {
  margin-bottom: 1.5rem;
  border-radius: 1rem;
}

.profile-hero-area {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
  margin-bottom: 2.5rem;
}

.profile-hero {
  position: relative;
  margin: 0;
  grid-column: 1 / -1;
}

.profile-hero__banner {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  border-radius: 1.5rem;
  opacity: 0.4;
  filter: saturate(0.9);
}

.profile-hero__content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.75rem;
  border-radius: 1.5rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.profile-hero__avatar {
  flex-shrink: 0;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--surface-1);
  background: var(--surface-1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  font-weight: 600;
}

.profile-hero__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-hero__details {
  flex: 1;
  min-width: 0;
}

.profile-hero-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.profile-featured-tier {
  border-radius: 1.5rem;
  padding: clamp(1.5rem, 3vw, 2.25rem);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.12);
  border: 1px solid var(--accent-200);
}

.profile-featured-tier--fallback {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-featured-tier__fallback {
  margin: 0;
}

.profile-featured-tier__cta {
  align-self: flex-start;
}

.tier-card--featured {
  border: none;
  box-shadow: none;
  padding: 0;
  background: transparent;
}

.tier-card--featured :deep(.tier-card__header) {
  align-items: flex-start;
}

.tier-card--featured :deep(.tier-card__title) {
  font-size: clamp(1.5rem, 3vw, 2rem);
  font-weight: 700;
}

.tier-card--featured :deep(.tier-card__description) {
  font-size: 1.05rem;
}

.tier-card--featured :deep(.tier-card__sats) {
  font-size: clamp(1.25rem, 3vw, 1.5rem);
  font-weight: 600;
}

.tier-card--featured :deep(.tier-card__subscribe) {
  font-size: 1.05rem;
  padding: 0.85rem 1.5rem;
}

.profile-tier-more {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-tier-more__title {
  margin: 0;
}

.profile-tier-list--more {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
}

.profile-cta {
  position: sticky;
  top: 1rem;
  margin: 0;
  border-radius: 1.25rem;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  z-index: 1;
}

.profile-cta__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.profile-cta__pricing {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex: 1 1 auto;
  min-width: 0;
}

.profile-cta__sats {
  font-size: 1.5rem;
  font-weight: 600;
}

.profile-cta__fiat,
.profile-cta__frequency {
  display: block;
}

.profile-cta__button {
  flex-shrink: 0;
  min-width: 160px;
}

.profile-cta__microcopy {
  margin: 0;
}

.profile-cta-mobile {
  position: sticky;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100%;
  margin: 0 auto;
  border-top-left-radius: 1.25rem;
  border-top-right-radius: 1.25rem;
  box-shadow: 0 -12px 28px rgba(0, 0, 0, 0.12);
  display: none;
  flex-direction: column;
  gap: 0.5rem;
  z-index: 2;
  padding-bottom: calc(env(safe-area-inset-bottom, 0) + 0.25rem);
}

.profile-cta-mobile__content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.profile-hero__heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.profile-hero__name {
  margin: 0;
  font-weight: 600;
}

.profile-hero__handle {
  margin: 0.25rem 0 0;
}

.profile-hero__stats {
  margin-top: 0.5rem;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.profile-hero__chips {
  margin-top: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.profile-layout {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

.profile-section__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.profile-section__header--with-spinner {
  justify-content: space-between;
}

.profile-section__spinner {
  margin-left: auto;
}

.profile-section__title {
  margin: 0;
}

.profile-section__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-section__text {
  margin: 0;
}

.profile-section__state {
  padding: 2rem 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.profile-retry-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  border: 0;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  overflow: hidden;
}


.profile-tier-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 2rem;
}

.profile-tier-grid--custom {
  grid-template-columns: minmax(0, 1fr);
}

.profile-tier-grid > .profile-section {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.profile-tier-grid > .profile-section .profile-section__body {
  flex: 1;
}

.profile-tier-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  align-items: stretch;
}

.profile-page--custom .profile-tier-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

.profile-page--custom .profile-tier-list > * {
  height: 100%;
}

.profile-tier__paywalled {
  margin-top: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: rgba(0, 0, 0, 0.04);
}

.profile-section--infrastructure .profile-section__body {
  flex: 1;
  gap: 1.5rem;
}

.profile-infrastructure {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-auto-rows: auto;
  gap: 1.5rem;
}

@media (min-width: 1024px) {
  .profile-infrastructure {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}

.profile-infrastructure .profile-card {
  height: 100%;
}

.profile-card {
  background: var(--surface-2);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-card__title {
  margin: 0;
  font-weight: 600;
}

.profile-card__row {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.profile-card__label {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.profile-card__info-btn {
  color: var(--text-2);
  min-width: 0;
  padding: 0;
}

.profile-card__info-btn :deep(.q-btn__content) {
  padding: 0;
}

.profile-card__info-btn :deep(.q-icon) {
  font-size: 1rem;
}

.profile-card__info-btn:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

.profile-card__value {
  word-break: break-word;
}

.profile-card__text {
  margin: 0;
}

.profile-card__list {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile-card__list-item {
  position: relative;
}

.profile-card__media {
  display: grid;
  gap: 1.5rem;
}

@media (min-width: 768px) {
  .profile-card__media {
    gap: 1.75rem;
  }
}

@media (min-width: 1024px) {
  .profile-card__media {
    grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  }
}

.profile-card__media-main,
.profile-card__media-aside {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-card__media-aside {
  gap: 1.25rem;
}

.profile-card__video {
  position: relative;
  width: 100%;
  max-width: 48rem;
  margin-inline: auto;
  border-radius: 1.125rem;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.85), rgba(30, 64, 175, 0.55));
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.35);
}

.profile-card__video video {
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 16 / 9;
  max-height: clamp(260px, 45vw, 520px);
  object-fit: cover;
  background: #000;
}

.profile-card__caption {
  margin: 0;
  line-height: 1.6;
}

.profile-card__highlight {
  background: rgba(0, 0, 0, 0.04);
  border-left: 4px solid var(--accent-500);
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.profile-card__highlight-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-card__highlight-text {
  margin: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.profile-faq {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.profile-faq__item {
  border-radius: 0.75rem;
  background: var(--surface-2);
  padding: 0.75rem 1rem;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
}

.profile-faq__question {
  cursor: pointer;
  margin: 0;
  font-weight: 600;
}

.profile-faq__answer {
  margin: 0.75rem 0 0;
}

@media (min-width: 1200px) {
  .profile-page__inner {
    max-width: 110rem;
  }
}

@media (min-width: 1440px) {
  .profile-page__inner {
    max-width: 120rem;
    padding-inline: clamp(2rem, 6vw, 5rem);
  }
}

@media (min-width: 1680px) {
  .profile-page__inner {
    max-width: 128rem;
  }
}

@media (max-width: 767px) {
  .profile-hero__content {
    flex-direction: column;
    align-items: flex-start;
  }

  .profile-hero__avatar {
    width: 100px;
    height: 100px;
  }

  .profile-cta {
    display: none;
  }

  .profile-cta-mobile {
    display: flex;
    max-width: min(100%, 96rem);
  }

  .profile-cta-mobile__content {
    flex-direction: column;
    align-items: stretch;
  }

  .profile-cta__button {
    width: 100%;
    min-width: 0;
  }

  .profile-page__inner {
    padding-bottom: 6.5rem;
  }

  .profile-tier__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .profile-tier__cta {
    align-items: flex-start;
  }

  .profile-tier__subscribe {
    width: 100%;
  }
}

@media (min-width: 1024px) {
  .profile-hero-area--with-cta {
    grid-template-columns: minmax(0, 1.8fr) minmax(320px, 1fr);
    align-items: start;
  }

  .profile-hero-area--with-cta.profile-hero-area--with-featured {
    grid-template-columns: minmax(0, 1.6fr) minmax(360px, 1fr);
  }

  .profile-hero-area--with-featured .profile-hero-sidebar {
    gap: 2rem;
  }

  .tier-card--featured :deep(.tier-card__subscribe) {
    width: 100%;
  }

  .profile-hero-area--with-cta > .profile-hero {
    grid-column: auto;
  }

  .profile-cta {
    top: 2rem;
  }

  .profile-tier-grid:not(.profile-tier-grid--custom) {
    grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
    align-items: start;
  }
}
</style>
