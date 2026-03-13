<template>
  <div class="profile-page bg-surface-1 text-1">
    <div class="profile-page__inner">
      <div class="profile-page__back q-mb-md">
        <q-btn flat color="primary" to="/find-creators">{{
          $t("CreatorHub.profile.back")
        }}</q-btn>
      </div>

      <q-banner
        v-if="decodeError"
        class="profile-page__banner profile-page__banner--error text-white"
      >
        {{ decodeError }}
      </q-banner>

      <q-banner
        v-if="fallbackActive && fallbackBannerText"
        class="profile-page__banner profile-page__banner--warning text-1"
        icon="cloud_off"
        aria-live="polite"
      >
        <div>{{ fallbackBannerText }}</div>
        <div v-if="fallbackRelaysLabel" class="text-caption q-mt-xs text-2">
          {{ fallbackRelaysLabel }}
        </div>
      </q-banner>

      <section
        class="profile-hero"
        :class="{
          'profile-hero--with-banner': heroBannerUrl,
          'profile-hero--with-status-banner': hasStatusBanner,
        }"
      >
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
            <div v-else class="profile-hero__avatar-placeholder">
              {{ profileInitials }}
            </div>
          </div>
          <div class="profile-hero__details">
            <div class="profile-hero__heading">
              <h1 class="profile-hero__name text-h4">
                {{ profileDisplayName }}
              </h1>
              <q-btn
                flat
                round
                dense
                icon="content_copy"
                :aria-label="$t('CreatorHub.profile.copyProfileLink')"
                @click="copy(profileUrl)"
              />
            </div>
            <p v-if="profileHandle" class="profile-hero__handle text-2">
              @{{ profileHandle }}
            </p>
            <div v-if="hasFollowerStats" class="profile-hero__stats text-2">
              <span v-if="followers !== null">
                {{ $t("CreatorHub.profile.followers", { count: followers }) }}
              </span>
              <span v-if="following !== null">
                {{ $t("CreatorHub.profile.following", { count: following }) }}
              </span>
            </div>
            <div
              v-if="metadataChips.length"
              class="profile-hero__chips"
              role="list"
            >
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
            <div class="profile-hero__support bg-surface-1 text-1">
              <div class="profile-hero__support-copy">
                <div class="profile-hero__support-eyebrow">
                  Support this creator
                </div>
                <div class="profile-hero__support-title">
                  {{ supportHeadline }}
                </div>
                <p class="profile-hero__support-text text-2 q-mb-none">
                  {{ supportMicrocopy }}
                </p>
                <div
                  v-if="supportHighlights.length"
                  class="profile-hero__support-highlights"
                  role="list"
                >
                  <div
                    v-for="highlight in supportHighlights"
                    :key="highlight.label"
                    class="profile-hero__support-highlight"
                    role="listitem"
                  >
                    <span class="profile-hero__support-highlight-label">
                      {{ highlight.label }}
                    </span>
                    <span class="profile-hero__support-highlight-value">
                      {{ highlight.value }}
                    </span>
                  </div>
                </div>
                <div
                  v-if="supportReadiness"
                  class="profile-hero__support-status"
                  :class="`is-${supportReadiness.tone}`"
                >
                  <q-icon :name="supportReadiness.icon" size="18px" />
                  <div>
                    <div class="text-body2 text-weight-medium">
                      {{ supportReadiness.title }}
                    </div>
                    <div class="text-caption q-mt-xs">
                      {{ supportReadiness.message }}
                    </div>
                  </div>
                </div>
                <div
                  v-if="featuredTier"
                  class="profile-hero__tier-spotlight bg-surface-2"
                >
                  <div class="profile-hero__tier-spotlight-copy">
                    <div class="profile-hero__tier-spotlight-label">
                      Recommended tier
                    </div>
                    <div class="text-body1 text-weight-medium text-1">
                      {{ featuredTier.name || featuredTier.title }}
                    </div>
                    <div class="text-caption text-2">
                      {{ featuredTierSummary }}
                    </div>
                  </div>
                  <div
                    v-if="featuredTierMediaLabels.length"
                    class="profile-hero__tier-spotlight-badges"
                  >
                    <q-chip
                      v-for="label in featuredTierMediaLabels"
                      :key="label"
                      dense
                      outline
                    >
                      {{ label }}
                    </q-chip>
                  </div>
                </div>
              </div>
              <div class="profile-hero__support-actions">
                <q-btn
                  color="primary"
                  unelevated
                  no-caps
                  label="Donate once"
                  :disable="!creatorHex"
                  @click="openDonate"
                />
                <q-btn
                  flat
                  color="primary"
                  no-caps
                  label="Message"
                  :disable="!creatorHex"
                  @click="startMessage"
                />
                <q-btn
                  outline
                  color="primary"
                  no-caps
                  :label="tiers.length ? 'Browse tiers' : 'Read more'"
                  @click="scrollToTiers"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <main class="profile-layout">
        <section class="profile-section">
          <header class="profile-section__header">
            <h2 class="profile-section__title text-h5">
              {{ $t("CreatorHub.profile.sections.about") }}
            </h2>
          </header>
          <div class="profile-section__body">
            <p v-if="aboutText" class="profile-section__text text-body1">
              {{ aboutText }}
            </p>
            <p v-else class="profile-section__text text-2">
              {{
                $t(
                  "CreatorHub.profile.noAbout",
                  "This creator hasn't shared an about section yet. Their latest updates are available to subscribers.",
                )
              }}
            </p>
          </div>
        </section>

        <q-banner
          v-if="isGuest"
          class="profile-page__banner bg-surface-2 text-2"
          icon="info"
        >
          {{ $t("CreatorHub.profile.guestCta") }}
          <template #action>
            <q-btn
              flat
              color="primary"
              :label="$t('CreatorHub.profile.finishSetup')"
              @click="gotoWelcome"
            />
          </template>
        </q-banner>

        <div class="profile-tier-grid">
          <section
            ref="tiersSectionRef"
            class="profile-section profile-section--tiers"
            :class="{ 'profile-section--focused': isTierFocusActive }"
            aria-live="polite"
          >
            <header
              class="profile-section__header profile-section__header--with-spinner"
            >
              <h2 class="profile-section__title text-h5">
                {{ $t("CreatorHub.profile.sections.tiers") }}
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
                {{ $t("CreatorHub.profile.tierLoadError") }}
                <template #action>
                  <button
                    type="button"
                    class="profile-retry-hidden"
                    tabindex="-1"
                    aria-hidden="true"
                    @click="retryFetchTiers"
                  >
                    {{ retryLabel }}
                  </button>
                  <q-btn
                    flat
                    color="primary"
                    :label="retryLabel"
                    @click="retryFetchTiers"
                  />
                </template>
              </q-banner>
              <div
                v-else-if="!tiers.length"
                class="profile-section__state text-2"
              >
                {{ $t("CreatorHub.profile.noTiers") }}
              </div>
              <div v-else class="profile-tier-list">
                <TierSummaryCard
                  v-for="t in tiers"
                  :key="t.id"
                  :tier="t"
                  :price-sats="getPrice(t)"
                  :price-fiat="formatFiat(getPrice(t))"
                  :frequency-label="frequencyLabel(t)"
                  :badges="tierBadges(t)"
                  :subscribe-label="''"
                  :subscribe-disabled="false"
                  :collapse-media="false"
                >
                  <template #actions>
                    <button
                      type="button"
                      class="profile-tier-list__subscribe"
                      :title="
                        needsSignerSetupTooltip
                          ? $t('CreatorHub.profile.guestTooltip')
                          : ''
                      "
                      @click="openSubscribe(t)"
                    >
                      {{ $t("CreatorHub.profile.subscribeCta") }}
                    </button>
                  </template>
                  <template #footer-note>
                    {{ tierSupportNote }}
                  </template>
                  <template v-if="creatorHex" #default>
                    <PaywalledContent
                      :creator-npub="creatorHex"
                      :tier-id="t.id"
                      class="profile-tier__paywalled"
                    >
                      <div>{{ $t("CreatorHub.profile.paywalledPreview") }}</div>
                    </PaywalledContent>
                  </template>
                </TierSummaryCard>
              </div>
              <q-banner
                v-if="tierFetchError && tiers.length"
                class="profile-page__banner bg-surface-2"
              >
                {{ $t("CreatorHub.profile.tierRefreshError") }}
                <template #action>
                  <button
                    type="button"
                    class="profile-retry-hidden"
                    tabindex="-1"
                    aria-hidden="true"
                    @click="retryFetchTiers"
                  >
                    {{ retryLabel }}
                  </button>
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

          <section class="profile-section profile-section--support-details">
            <header class="profile-section__header">
              <h2 class="profile-section__title text-h5">Support details</h2>
            </header>
            <div class="profile-section__body">
              <q-expansion-item
                dense
                dense-toggle
                switch-toggle-side
                class="profile-detail-expansion"
                :label="$t('CreatorHub.profile.howCashuWorks.title')"
                caption="Learn how private Cashu support works on Fundstr."
              >
                <div class="profile-card__media">
                  <div class="profile-card__media-main">
                    <div class="profile-card__video">
                      <video
                        controls
                        preload="metadata"
                        playsinline
                        poster="https://m.primal.net/HsMt.jpg"
                      >
                        <source
                          src="https://m.primal.net/HsMt.mp4"
                          type="video/mp4"
                        />
                        {{ $t("CreatorHub.profile.howCashuWorks.intro") }}
                      </video>
                      <div class="sr-only">
                        <a
                          href="https://m.primal.net/HsMt.mp4"
                          target="_blank"
                          rel="noopener"
                        >
                          {{ $t("CreatorHub.profile.howCashuWorks.title") }}
                        </a>
                      </div>
                    </div>
                    <p class="profile-card__caption profile-card__text text-2">
                      {{ $t("CreatorHub.profile.howCashuWorks.intro") }}
                    </p>
                  </div>
                  <div
                    v-if="howCashuWorksHighlight || howCashuWorksList.length"
                    class="profile-card__media-aside"
                  >
                    <div
                      v-if="howCashuWorksHighlight"
                      class="profile-card__highlight text-body2"
                    >
                      <span class="profile-card__highlight-label text-2">
                        {{ $t("CreatorHub.profile.howCashuWorks.title") }}
                      </span>
                      <p class="profile-card__highlight-text">
                        {{ howCashuWorksHighlight }}
                      </p>
                    </div>
                    <ul
                      v-if="howCashuWorksList.length"
                      class="profile-card__list"
                    >
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
              </q-expansion-item>

              <q-expansion-item
                dense
                dense-toggle
                switch-toggle-side
                class="profile-detail-expansion q-mt-md"
                :label="$t('CreatorHub.profile.sections.infrastructure')"
                caption="Inspect payout pointer, trusted mints, and relay details."
              >
                <article class="profile-card">
                  <h3 class="profile-card__title text-subtitle1">
                    {{ $t("CreatorHub.profile.infrastructureDetails") }}
                  </h3>
                  <div v-if="profile.p2pkPubkey" class="profile-card__row">
                    <div class="profile-card__label text-2">
                      <span>{{ $t("CreatorHub.profile.p2pkLabel") }}</span>
                      <q-btn
                        flat
                        dense
                        round
                        size="sm"
                        class="profile-card__info-btn"
                        icon="info"
                        :aria-label="
                          $t('FindCreators.explainers.tooltips.p2pk')
                        "
                      >
                        <q-tooltip anchor="top middle" self="bottom middle">
                          {{ $t("FindCreators.explainers.tooltips.p2pk") }}
                        </q-tooltip>
                      </q-btn>
                    </div>
                    <code class="profile-card__value">{{
                      profile.p2pkPubkey
                    }}</code>
                  </div>
                  <div class="profile-card__row">
                    <div class="profile-card__label text-2">
                      <span>{{
                        $t("CreatorHub.profile.trustedMintsLabel")
                      }}</span>
                      <q-btn
                        flat
                        dense
                        round
                        size="sm"
                        class="profile-card__info-btn"
                        icon="info"
                        :aria-label="
                          $t('FindCreators.explainers.tooltips.trustedMints')
                        "
                      >
                        <q-tooltip anchor="top middle" self="bottom middle">
                          {{
                            $t("FindCreators.explainers.tooltips.trustedMints")
                          }}
                        </q-tooltip>
                      </q-btn>
                    </div>
                    <MintSafetyList :mints="trustedMints" />
                  </div>
                  <div class="profile-card__row">
                    <div class="profile-card__label text-2">
                      <span>{{ $t("CreatorHub.profile.relaysLabel") }}</span>
                      <q-btn
                        flat
                        dense
                        round
                        size="sm"
                        class="profile-card__info-btn"
                        icon="info"
                        :aria-label="
                          $t('FindCreators.explainers.tooltips.relays')
                        "
                      >
                        <q-tooltip anchor="top middle" self="bottom middle">
                          {{ $t("FindCreators.explainers.tooltips.relays") }}
                        </q-tooltip>
                      </q-btn>
                    </div>
                    <RelayBadgeList :relays="relayList" />
                  </div>
                </article>
              </q-expansion-item>
            </div>
          </section>
        </div>

        <section class="profile-section">
          <header class="profile-section__header">
            <h2 class="profile-section__title text-h5">
              {{ $t("CreatorHub.profile.sections.faq") }}
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
              {{
                $t(
                  "CreatorHub.profile.noFaq",
                  "No FAQs published yet. Have a question? The creator may answer it in their private member-only posts.",
                )
              }}
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
      <DonateDialog
        v-model="showDonateDialog"
        :creator-pubkey="creatorHex || ''"
        :creator-trusted-mints="trustedMints"
        :creator-name="profileDisplayName"
        @confirm="handleDonate"
      />
      <SetupRequiredDialog
        v-model="showSetupDialog"
        :tier-id="selectedTier?.id"
        :tier-name="selectedTier?.name"
      />
      <SubscriptionReceipt
        v-model="showReceiptDialog"
        :receipts="receiptList"
      />
      <SendTokenDialog />
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
  nextTick,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  useCreatorsStore,
  creatorHasVerifiedNip05,
  fetchFundstrProfileBundle,
  FundstrProfileFetchError,
  type FundstrProfileBundle,
} from "stores/creators";
import { useNostrStore, fetchNutzapProfile } from "stores/nostr";
import { queryNutzapTiers } from "@/nostr/relayClient";
import { parseTiersContent } from "@/nutzap/profileShared";
import {
  buildProfileUrl,
  extractCreatorIdentifier,
  preferredCreatorPublicIdentifier,
} from "src/utils/profileUrl";
import { deriveCreatorKeys } from "src/utils/nostrKeys";
import { useDiscovery } from "src/api/fundstrDiscovery";

import { usePriceStore } from "stores/price";
import { useUiStore } from "stores/ui";
import SubscribeDialog from "components/SubscribeDialog.vue";
import DonateDialog from "components/DonateDialog.vue";
import SendTokenDialog from "components/SendTokenDialog.vue";
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
import { usePhonebookEnrichment } from "src/utils/phonebookEnrichment";
import {
  determineMediaType,
  normalizeTierMediaItems,
  normalizeMediaUrl,
} from "src/utils/validateMedia";
import { useWelcomeStore } from "stores/welcome";
import {
  daysToFrequency,
  type SubscriptionFrequency,
} from "src/constants/subscriptionFrequency";
import { useSendTokensStore } from "stores/sendTokensStore";
import { useDonationPresetsStore } from "stores/donationPresets";
import { useMessengerStore } from "stores/messenger";
import { useMintsStore } from "stores/mints";
import { describeMintPaymentCapabilities } from "src/utils/paymentCapabilities";

export default defineComponent({
  name: "PublicCreatorProfilePage",
  components: {
    PaywalledContent,
    DonateDialog,
    SendTokenDialog,
    SubscriptionReceipt,
    SetupRequiredDialog,
    MintSafetyList,
    RelayBadgeList,
    TierSummaryCard,
  },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const creatorParam = (route.params.npubOrHex ?? route.params.npub) as
      | string
      | undefined;
    const discovery = useDiscovery();
    const decodeError = ref<string | null>(null);
    const creatorNpub = ref<string>(creatorParam ?? "");
    const creatorHex = ref<string | null>(null);
    const resolvingCreatorIdentifier = ref(false);
    const decodeFailureMessage =
      "We couldn't load this creator profile. Double-check the link and try again.";

    const currentCreatorParam = ref<string>(creatorParam ?? "");

    const resolveHexFromDiscovery = async (identifier: string) => {
      if (!identifier.includes("@")) {
        return null;
      }

      try {
        const response = await discovery.getCreators({
          q: identifier,
          fresh: true,
          timeoutMs: 8_000,
        });
        const exactMatches = response.results.filter((creator) => {
          if (!creator?.pubkey || typeof creator.nip05 !== "string") {
            return false;
          }
          return (
            creator.nip05.trim().toLowerCase() === identifier.toLowerCase()
          );
        });

        if (exactMatches.length === 1) {
          return exactMatches[0].pubkey.trim().toLowerCase();
        }
      } catch (error) {
        console.warn("[creator-profile] Failed to resolve creator identifier", {
          identifier,
          error,
        });
      }

      return null;
    };

    const updateCreatorKeys = async (param: string | undefined) => {
      const nextParam = extractCreatorIdentifier(
        typeof param === "string" ? param : "",
      );
      creatorNpub.value = nextParam;
      creatorHex.value = null;
      decodeError.value = null;
      if (!nextParam) {
        return;
      }
      try {
        const keys = deriveCreatorKeys(nextParam);
        creatorNpub.value = keys.npub;
        creatorHex.value = keys.hex;
        return;
      } catch {
        resolvingCreatorIdentifier.value = true;
      }

      try {
        const resolvedHex = await resolveHexFromDiscovery(nextParam);
        if (!resolvedHex) {
          decodeError.value = decodeFailureMessage;
          return;
        }
        const keys = deriveCreatorKeys(resolvedHex);
        creatorNpub.value = keys.npub;
        creatorHex.value = keys.hex;
      } catch {
        decodeError.value = decodeFailureMessage;
      } finally {
        resolvingCreatorIdentifier.value = false;
      }
    };
    const creators = useCreatorsStore();
    const nostr = useNostrStore();
    const priceStore = usePriceStore();
    const uiStore = useUiStore();
    const welcomeStore = useWelcomeStore();
    const sendTokensStore = useSendTokensStore();
    const donationStore = useDonationPresetsStore();
    const messenger = useMessengerStore();
    const mintsStore = useMintsStore();
    const { t } = useI18n();
    const { copy } = useClipboard();
    const bitcoinPrice = computed(() => priceStore.bitcoinPrice);
    const profile = ref<any>({});
    const profileMeta = computed<ProfileMeta>(() =>
      normalizeMeta(profile.value ?? {}),
    );
    const { mergeInto: mergePhonebookMeta, loadPhonebookProfile } =
      usePhonebookEnrichment(creatorHex);
    const enrichedProfileMeta = computed<ProfileMeta>(() =>
      mergePhonebookMeta(profileMeta.value),
    );
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
    const hasInitialTierData = computed(
      () => creatorTierList.value !== undefined,
    );
    const showSubscribeDialog = ref(false);
    const showDonateDialog = ref(false);
    const showSetupDialog = ref(false);
    const showReceiptDialog = ref(false);
    const receiptList = ref<any[]>([]);
    const selectedTier = ref<any>(null);
    const tiersSectionRef = ref<HTMLElement | null>(null);
    const followers = ref<number | null>(null);
    const following = ref<number | null>(null);
    const loadingTiers = ref(true);
    const refreshingTiers = ref(false);
    const refreshTaskCount = ref(0);
    const autoRefreshQueued = ref(false);
    const tierFetchError = computed(() => creators.tierFetchError);
    const isGuest = computed(() => !welcomeStore.welcomeCompleted);
    const needsSignerSetupTooltip = computed(
      () => isGuest.value || !nostr.hasIdentity,
    );
    const hasStatusBanner = computed(() =>
      Boolean(
        decodeError.value || (fallbackActive.value && fallbackBannerText.value),
      ),
    );
    const isTierFocusActive = computed(() => route.query.tab === "tiers");

    const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const clearAutoRefreshTimer = () => {
      if (refreshTimer !== null) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    };

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

    const normalizeMintUrl = (value: string | null | undefined) => {
      if (typeof value !== "string") {
        return "";
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return "";
      }
      try {
        const parsed = new URL(trimmed);
        parsed.hash = "";
        parsed.search = "";
        const normalizedPath = parsed.pathname.replace(/\/+$/, "");
        parsed.pathname = normalizedPath || "/";
        return `${parsed.origin}${
          parsed.pathname === "/" ? "" : parsed.pathname
        }`;
      } catch {
        return trimmed.replace(/\/+$/, "");
      }
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
            typeof tier.intervalDays === "number"
              ? tier.intervalDays
              : undefined;
          const benefits = Array.isArray(tier.benefits)
            ? tier.benefits
                .map((benefit) =>
                  typeof benefit === "string" ? benefit : String(benefit),
                )
                .filter((benefit) => benefit.length > 0)
            : [];
          const media = normalizeTierMediaItems(tier.media ?? [])
            .map((item) => ({
              url: item.url,
              type:
                item.type ?? determineMediaType(normalizeMediaUrl(item.url)),
              title: item.title ?? "",
            }))
            .sort((a, b) => a.url.localeCompare(b.url));
          return {
            id,
            name,
            price:
              typeof priceRaw === "number" ? Math.round(priceRaw) : undefined,
            description,
            frequency,
            intervalDays,
            benefits,
            media,
          };
        })
        .filter(
          (
            tier,
          ): tier is {
            id: string;
            name: string;
            price?: number;
            description: string;
            frequency?: string;
            intervalDays?: number;
            benefits: string[];
            media: Array<{ url: string; type: string; title: string }>;
          } => tier !== null,
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      return JSON.stringify(normalized);
    };

    const tiersEqual = (a: any[] | undefined, b: any[] | undefined): boolean =>
      normalizeTierSnapshot(a) === normalizeTierSnapshot(b);

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
        console.error(
          "[creator-profile] Failed to refresh tier definitions",
          error,
        );
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
        clearAutoRefreshTimer();
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
          typeof relayProfile.tierAddr === "string"
            ? relayProfile.tierAddr
            : "";
        const currentP2pk =
          typeof profile.value.p2pkPubkey === "string"
            ? profile.value.p2pkPubkey
            : typeof cachedDetails?.p2pkPubkey === "string"
            ? cachedDetails.p2pkPubkey
            : "";
        const currentDisplayName =
          typeof profile.value.display_name === "string"
            ? profile.value.display_name
            : typeof profile.value.name === "string"
            ? profile.value.name
            : "";
        const currentAbout =
          typeof profile.value.about === "string" ? profile.value.about : "";
        const currentPicture =
          typeof profile.value.picture === "string"
            ? profile.value.picture
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
        if (
          relayProfile.p2pkPubkey &&
          relayProfile.p2pkPubkey !== currentP2pk
        ) {
          updates.p2pkPubkey = relayProfile.p2pkPubkey;
          hasDiff = true;
        }
        if (
          typeof relayProfile.display_name === "string" &&
          relayProfile.display_name.trim() &&
          relayProfile.display_name.trim() !== currentDisplayName
        ) {
          updates.display_name = relayProfile.display_name.trim();
          hasDiff = true;
        }
        if (
          typeof relayProfile.name === "string" &&
          relayProfile.name.trim() &&
          !updates.display_name &&
          relayProfile.name.trim() !== currentDisplayName
        ) {
          updates.name = relayProfile.name.trim();
          hasDiff = true;
        }
        if (
          typeof relayProfile.about === "string" &&
          relayProfile.about.trim() &&
          relayProfile.about.trim() !== currentAbout
        ) {
          updates.about = relayProfile.about.trim();
          hasDiff = true;
        }
        if (
          typeof relayProfile.picture === "string" &&
          relayProfile.picture.trim() &&
          relayProfile.picture.trim() !== currentPicture &&
          isTrustedUrl(relayProfile.picture.trim())
        ) {
          updates.picture = relayProfile.picture.trim();
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

        const cachedTierList = creators.tiersMap[creatorHex.value] ?? [];
        const needsRelayTiers =
          (!Array.isArray(bundle?.tiers) || bundle!.tiers.length === 0) &&
          (!Array.isArray(cachedTierList) || cachedTierList.length === 0);
        if (needsRelayTiers) {
          try {
            const relayTierEvent = await queryNutzapTiers(creatorHex.value);
            const relayTiers = parseTiersContent(relayTierEvent?.content)
              .map((tier) => ({
                id: tier.id,
                name: tier.title,
                price_sats: tier.price,
                frequency: tier.frequency,
                description: tier.description ?? "",
                media: Array.isArray(tier.media) ? [...tier.media] : [],
              }))
              .filter((tier) => typeof tier.id === "string" && tier.id.trim());
            if (relayTiers.length > 0) {
              applyBundleTierList(relayTiers);
              loadingTiers.value = false;
              creators.tierFetchError = false;
            }
          } catch (error) {
            console.warn(
              "[creator-profile] Failed to hydrate relay tiers",
              error,
            );
          }
        }
      } catch (error) {
        console.error(
          "[creator-profile] Failed to refresh relay profile",
          error,
        );
        fallbackActive.value = true;
        fallbackFailed.value = true;
      } finally {
        endRefresh();
      }
    };

    const loadProfile = async ({ forceRelayRefresh = false } = {}) => {
      if (!creatorHex.value) {
        return;
      }

      let shouldFetchStandaloneTiers = true;

      const profilePromise = fetchFundstrProfileBundle(creatorHex.value, {
        forceRefresh: true,
      })
        .then(async (bundle) => {
          if (!bundle) return;
          const {
            profile: profileData,
            followers: followersCount,
            following: followingCount,
          } = bundle;
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
            const { trustedMints, relays, tierAddr, p2pkPubkey } =
              bundle.profileDetails;
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
            shouldFetchStandaloneTiers = false;
            loadingTiers.value = false;
            creators.tierFetchError = false;
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

      await profilePromise;

      if (shouldFetchStandaloneTiers) {
        await fetchTiers();
      }
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
      creatorHex,
      (next, prev) => {
        if (next && next !== prev) {
          void loadPhonebookProfile();
        }
      },
      { immediate: true },
    );

    watch(
      () => (route.params.npubOrHex ?? route.params.npub) as string | undefined,
      async (nextParam) => {
        const normalized = typeof nextParam === "string" ? nextParam : "";
        if (normalized === currentCreatorParam.value) {
          return;
        }
        currentCreatorParam.value = normalized;
        resetCreatorState();
        await updateCreatorKeys(nextParam);
        await loadProfile();
        scheduleAutoRefresh();
      },
    );

    const retryFetchTiers = () => {
      void fetchTiers();
    };

    const startingSupportPrice = computed(() => {
      const prices = tiers.value
        .map((tier: any) => getPrice(tier))
        .filter((price) => price > 0);
      if (!prices.length) {
        return 0;
      }

      return Math.min(...prices);
    });

    const supportHeadline = computed(() => {
      if (!startingSupportPrice.value) {
        return "One-time Cashu support is available.";
      }

      const fiat = formatFiat(startingSupportPrice.value);
      return `Subscriptions start at ${startingSupportPrice.value} sats${
        fiat ? ` (${fiat})` : ""
      }.`;
    });

    const supportMicrocopy = computed(() => {
      if (isGuest.value || !nostr.hasIdentity) {
        return "Finish setup to donate privately, subscribe, or start a chat with this creator.";
      }

      return tiers.value.length
        ? "Send a one-time gift now, open a chat, or choose a recurring tier below."
        : "Send a one-time gift now or start a private conversation with this creator.";
    });

    const supportReadiness = computed(() => {
      if (isGuest.value || !nostr.hasIdentity) {
        return {
          tone: "info" as const,
          icon: "info",
          title: "Finish setup to verify payment options",
          message:
            "After setup, Fundstr can check whether your current mint is ready for one-time gifts or subscriptions on this creator page.",
        };
      }

      if (!activeMintLabel.value) {
        return {
          tone: "warning" as const,
          icon: "account_balance_wallet",
          title: "Select an active mint",
          message:
            "Choose a wallet mint before donating or subscribing so Fundstr can verify payment compatibility.",
        };
      }

      if (
        normalizedTrustedMints.value.length > 0 &&
        !activeMintTrustedByCreator.value
      ) {
        return {
          tone: "warning" as const,
          icon: "swap_horiz",
          title: "Switch to a creator-trusted mint",
          message:
            "Your current wallet mint is not on this creator's trusted list. Switch mints before sending support.",
        };
      }

      if (activeMintCapability.value.capability === "exact") {
        return {
          tone: "warning" as const,
          icon: "warning",
          title: "Exact-match one-time gifts only",
          message:
            "This mint can still support exact one-time gifts, but subscriptions and locked support need a split-capable mint.",
        };
      }

      if (activeMintCapability.value.capability === "unknown") {
        return {
          tone: "warning" as const,
          icon: "help_outline",
          title: "Verify your current mint",
          message:
            "Fundstr cannot verify split support for the current mint yet. Flexible one-time gifts and subscriptions work best on a verified split-capable mint.",
        };
      }

      return {
        tone: "positive" as const,
        icon: "check_circle",
        title: "Current mint is ready for support",
        message: normalizedTrustedMints.value.length
          ? "Your current mint is creator-trusted and split-capable for flexible gifts and recurring tiers."
          : "Your current mint is split-capable for flexible gifts and recurring tiers.",
      };
    });

    const tierSupportNote = computed(() => {
      if (isGuest.value || !nostr.hasIdentity) {
        return t("CreatorHub.profile.subscribeMicrocopy");
      }

      if (!activeMintLabel.value) {
        return "Select an active mint in Wallet before locking a tier.";
      }

      if (
        normalizedTrustedMints.value.length > 0 &&
        !activeMintTrustedByCreator.value
      ) {
        return "Switch to a creator-trusted mint before subscribing.";
      }

      if (activeMintCapability.value.capability === "exact") {
        return "This mint is exact-match only. Switch to a split-capable mint before subscribing.";
      }

      if (activeMintCapability.value.capability === "unknown") {
        return "Verify your current mint supports split ecash before subscribing.";
      }

      return t("CreatorHub.profile.subscribeMicrocopy");
    });

    const ensureSupporterReady = () => {
      if (isGuest.value || !welcomeStore.welcomeCompleted) {
        gotoWelcome();
        return false;
      }

      if (!nostr.hasIdentity) {
        void router.push({
          path: "/nostr-login",
          query: { redirect: route.fullPath },
        });
        return false;
      }

      return true;
    };

    const scrollToTiers = () => {
      tiersSectionRef.value?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    };

    const openDonate = () => {
      if (!creatorHex.value) {
        return;
      }

      if (!ensureSupporterReady()) {
        return;
      }

      showDonateDialog.value = true;
    };

    const startMessage = () => {
      if (!creatorHex.value) {
        return;
      }

      if (!ensureSupporterReady()) {
        return;
      }

      messenger.startChat(creatorHex.value);
      void router.push({
        path: "/nostr-messenger",
        query: { pubkey: creatorHex.value },
      });
    };

    const openSubscribe = async (tier: any) => {
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

      showSetupDialog.value = false;
      showSubscribeDialog.value = false;
      await nextTick();
      showSubscribeDialog.value = true;
    };

    const gotoWelcome = () => {
      router.push({ path: "/welcome", query: { redirect: route.fullPath } });
    };

    const applyRouteFocusHint = async () => {
      if (route.query.tab !== "tiers") {
        return;
      }

      await nextTick();
      scrollToTiers();
    };

    onMounted(async () => {
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handleVisibilityChange);
      }

      await updateCreatorKeys(creatorParam);
      await loadProfile({ forceRelayRefresh: true });
      scheduleAutoRefresh();
      await applyRouteFocusHint();

      if (!creatorHex.value) return;
      const tierId = route.query.tierId as string | undefined;
      if (!nostr.hasIdentity || !tierId) return;
      const tryOpen = () => {
        const t = tiers.value.find((ti: any) => ti.id === tierId);
        if (t) {
          openSubscribe(t);
          router.replace({
            name: "PublicCreatorProfile",
            params: { npubOrHex: publicRouteIdentifier.value },
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
      void applyRouteFocusHint();
    });

    watch(
      () => route.query.tab,
      () => {
        void applyRouteFocusHint();
      },
    );

    onUnmounted(() => {
      clearAutoRefreshTimer();
      if (typeof document !== "undefined") {
        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange,
        );
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

    const handleDonate = ({
      bucketId,
      locked,
      type,
      amount,
      periods,
      message,
    }: any) => {
      if (!creatorHex.value) return;
      if (type === "one-time") {
        sendTokensStore.clearSendData();
        sendTokensStore.recipientPubkey = creatorHex.value;
        sendTokensStore.sendViaNostr = true;
        sendTokensStore.sendData.bucketId = bucketId;
        sendTokensStore.sendData.amount = amount;
        sendTokensStore.sendData.memo = message;
        sendTokensStore.sendData.p2pkPubkey = locked ? creatorHex.value : "";
        sendTokensStore.showLockInput = locked;
        sendTokensStore.showSendTokens = true;
      } else {
        donationStore.createDonationPreset(
          periods,
          amount,
          creatorHex.value,
          bucketId,
        );
        donationStore.showCreatePresetDialog = true;
      }
      showDonateDialog.value = false;
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

    const profileHasVerifiedNip05 = computed(() =>
      creatorHasVerifiedNip05({
        pubkey: creatorHex.value ?? "",
        profile: {
          ...(profile.value ?? {}),
          ...(enrichedProfileMeta.value ?? {}),
        },
        nip05:
          typeof enrichedProfileMeta.value.nip05 === "string"
            ? enrichedProfileMeta.value.nip05
            : null,
        nip05Verified:
          (profile.value?.nip05Verified as boolean | null | undefined) ?? null,
      } as any),
    );

    const publicRouteIdentifier = computed(() =>
      preferredCreatorPublicIdentifier({
        fallbackIdentifier: creatorNpub.value,
        nip05:
          typeof enrichedProfileMeta.value.nip05 === "string"
            ? enrichedProfileMeta.value.nip05
            : null,
        nip05Verified: profileHasVerifiedNip05.value,
      }),
    );

    const profileUrl = computed(() =>
      buildProfileUrl(publicRouteIdentifier.value, router),
    );

    const profileDisplayName = computed(() =>
      displayNameFromProfile(enrichedProfileMeta.value, creatorNpub.value),
    );

    const profileHandle = computed(() => {
      const name =
        typeof enrichedProfileMeta.value.name === "string"
          ? enrichedProfileMeta.value.name.trim()
          : "";
      if (name) return name;
      const nip05 =
        typeof enrichedProfileMeta.value.nip05 === "string"
          ? enrichedProfileMeta.value.nip05.trim()
          : "";
      return nip05.includes("@") ? nip05.split("@")[0] || "" : nip05;
    });

    const profileAvatar = computed(() =>
      safeImageSrc(
        enrichedProfileMeta.value.picture,
        profileDisplayName.value,
        160,
      ),
    );

    const heroBannerUrl = computed(() => {
      const banner =
        profile.value.banner || profile.value.cover || profile.value.header;
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

    const profileInitials = computed(() =>
      initialFromName(profileDisplayName.value),
    );

    const aboutText = computed(() => {
      const about =
        typeof enrichedProfileMeta.value.about === "string"
          ? enrichedProfileMeta.value.about.trim()
          : "";
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
        (enrichedProfileMeta.value.website as string | null | undefined) ??
          (profile.value?.website as string | null | undefined) ??
          null,
      ),
    );

    const nip05Chip = computed(() => {
      const nip05 = enrichedProfileMeta.value.nip05;
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

    const lightningAddress = computed(
      () =>
        profile.value.lud16 ||
        profile.value.lud06 ||
        profile.value.lightning_address,
    );

    const metadataChips = computed(() => {
      const chips: Array<{
        id: string;
        icon: string;
        label: string;
        href?: string;
      }> = [];
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

    const normalizedTrustedMints = computed(() =>
      trustedMints.value
        .map((mint) => normalizeMintUrl(mint))
        .filter((mint): mint is string => Boolean(mint)),
    );

    const activeMintLabel = computed(() => {
      const normalized = normalizeMintUrl(mintsStore.activeMintUrl);
      return normalized || "";
    });

    const activeMintCapability = computed(() =>
      describeMintPaymentCapabilities(mintsStore.activeInfo as any),
    );

    const activeMintTrustedByCreator = computed(() => {
      if (!normalizedTrustedMints.value.length) {
        return true;
      }
      if (!activeMintLabel.value) {
        return false;
      }
      return normalizedTrustedMints.value.includes(activeMintLabel.value);
    });

    const supportHighlights = computed(() => {
      const highlights: Array<{ label: string; value: string }> = [];

      if (startingSupportPrice.value > 0) {
        const fiat = formatFiat(startingSupportPrice.value);
        highlights.push({
          label: "Starts at",
          value: `${startingSupportPrice.value.toLocaleString()} sats${
            fiat ? ` (${fiat})` : ""
          }`,
        });
      }

      if (tiers.value.length > 0) {
        highlights.push({
          label: "Tiers",
          value: `${tiers.value.length}`,
        });
      }

      if (trustedMints.value.length > 0) {
        highlights.push({
          label: "Trusted mints",
          value: `${trustedMints.value.length}`,
        });
      }

      if (!highlights.length && activeMintLabel.value) {
        let compactLabel = activeMintLabel.value;
        try {
          compactLabel = new URL(activeMintLabel.value).host;
        } catch {
          compactLabel = activeMintLabel.value;
        }
        highlights.push({ label: "Current mint", value: compactLabel });
      }

      return highlights.slice(0, 3);
    });

    const summarizeTierMedia = (tier: any): string[] => {
      const items = normalizeTierMediaItems(tier?.media ?? []);
      if (!items.length) {
        return [];
      }

      const labels = new Set<string>();
      for (const item of items) {
        const type =
          item.type || determineMediaType(normalizeMediaUrl(item.url));
        if (type === "youtube" || type === "video") {
          labels.add("Video preview");
        } else if (type === "audio") {
          labels.add("Audio preview");
        } else if (type === "image") {
          labels.add("Image preview");
        } else {
          labels.add("External link");
        }
      }
      return Array.from(labels).slice(0, 3);
    };

    const featuredTier = computed(() => {
      if (!tiers.value.length) {
        return null;
      }

      return (
        tiers.value.find(
          (tier: any) => normalizeTierMediaItems(tier?.media ?? []).length > 0,
        ) ?? tiers.value[0]
      );
    });

    const featuredTierSummary = computed(() => {
      if (!featuredTier.value) {
        return "";
      }

      const price = getPrice(featuredTier.value);
      const fiat = formatFiat(price);
      return `${price.toLocaleString()} sats / ${frequencyLabel(
        featuredTier.value,
      )}${fiat ? ` (${fiat})` : ""}`;
    });

    const featuredTierMediaLabels = computed(() =>
      featuredTier.value ? summarizeTierMedia(featuredTier.value) : [],
    );

    const tierBadges = (tier: any) => summarizeTierMedia(tier);

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
      const translationKey = "CreatorHub.profile.howCashuWorks.points";
      const items = t(translationKey, {
        returnObjects: true,
      }) as unknown;

      if (Array.isArray(items)) {
        return (items as unknown[]).reduce<string[]>((acc, item) => {
          if (typeof item !== "string") return acc;
          const trimmed = item.trim();
          if (trimmed && trimmed !== translationKey) {
            acc.push(trimmed);
          }
          return acc;
        }, []);
      }

      if (typeof items === "string") {
        const trimmed = items.trim();
        return trimmed && trimmed !== translationKey ? [trimmed] : [];
      }

      return [];
    });

    const howCashuWorksHighlight = computed(
      () => howCashuWorksList.value[0] || "",
    );

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
      showDonateDialog,
      showSubscribeDialog,
      showSetupDialog,
      showReceiptDialog,
      receiptList,
      selectedTier,
      tiersSectionRef,
      followers,
      following,
      loadingTiers,
      refreshingTiers,
      tierFetchError,
      isTierFocusActive,
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
      hasStatusBanner,
      // no markdown rendering needed
      formatFiat,
      getPrice,
      frequencyLabel,
      supportHeadline,
      supportMicrocopy,
      supportHighlights,
      supportReadiness,
      featuredTier,
      featuredTierSummary,
      featuredTierMediaLabels,
      tierBadges,
      tierSupportNote,
      scrollToTiers,
      openDonate,
      startMessage,
      openSubscribe,
      handleDonate,
      confirmSubscribe,
      retryFetchTiers,
      copy,
      profileUrl,
      isGuest,
      needsSignerSetupTooltip,
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
  max-width: 110rem;
  margin: 0 auto;
  padding: clamp(1.25rem, 4vw, 3rem) clamp(1.5rem, 6vw, 4rem);
}

.profile-page__banner {
  margin-bottom: 1rem;
  border-radius: 1rem;
  border: 1px solid var(--surface-contrast-border);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08);
}

.profile-page__banner--warning {
  background: color-mix(in srgb, #f4c242 18%, var(--surface-2));
}

.profile-page__banner--error {
  background: color-mix(in srgb, #b42318 22%, var(--surface-2));
}

.profile-hero {
  position: relative;
  margin: 0 0 2.5rem;
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

.profile-hero--with-banner .profile-hero__content {
  margin-top: -4rem;
  position: relative;
  z-index: 1;
}

.profile-hero--with-banner .profile-hero__avatar {
  margin-top: -60px;
  border: 4px solid var(--surface-2);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.profile-hero--with-status-banner .profile-hero__content {
  margin-top: 0;
}

.profile-hero--with-status-banner .profile-hero__avatar {
  margin-top: 0;
}

@media (max-width: 767px) {
  .profile-hero--with-banner .profile-hero__content {
    margin-top: -3rem;
  }

  .profile-hero--with-banner .profile-hero__avatar {
    margin-top: -50px;
  }
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

.profile-hero__support {
  margin-top: 1.1rem;
  padding: 1rem 1.1rem;
  border-radius: 1rem;
  border: 1px solid var(--surface-contrast-border);
  display: grid;
  gap: 1rem;
}

.profile-hero__support-eyebrow {
  display: inline-flex;
  align-self: flex-start;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-200) 28%, transparent);
  color: var(--accent-600);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.profile-hero__support-copy {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-width: 0;
}

.profile-hero__support-title {
  font-size: 1.05rem;
  font-weight: 700;
}

.profile-hero__support-text {
  line-height: 1.5;
}

.profile-hero__support-highlights {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}

.profile-hero__support-highlight {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.38rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--surface-contrast-border);
  background: color-mix(in srgb, var(--surface-2) 84%, transparent);
}

.profile-hero__support-highlight-label {
  color: var(--text-2);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.profile-hero__support-highlight-value {
  font-size: 0.86rem;
  font-weight: 600;
}

.profile-hero__support-status {
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
  padding: 0.8rem 0.9rem;
  border-radius: 0.9rem;
  border: 1px solid var(--surface-contrast-border);
}

.profile-hero__support-status.is-info {
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
}

.profile-hero__support-status.is-warning {
  background: color-mix(in srgb, #f4c242 16%, var(--surface-2));
}

.profile-hero__support-status.is-positive {
  background: color-mix(in srgb, #12725b 12%, var(--surface-2));
}

.profile-hero__tier-spotlight {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 0.95rem;
  border-radius: 0.95rem;
  border: 1px solid var(--surface-contrast-border);
}

.profile-hero__tier-spotlight-copy {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.profile-hero__tier-spotlight-label {
  color: var(--text-2);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.profile-hero__tier-spotlight-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.profile-hero__support-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.profile-hero__support-actions .q-btn {
  min-width: 10rem;
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

.profile-section--focused {
  scroll-margin-top: 1.5rem;
}

.profile-section--focused .profile-section__header {
  padding: 0.9rem 1rem;
  border-radius: 1rem;
  background: color-mix(in srgb, var(--accent-200) 24%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-500) 24%, transparent);
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
  align-items: start;
}

.profile-section--tiers,
.profile-section--support-details {
  grid-column: 1 / -1;
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
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
  align-items: stretch;
}

.profile-tier-list__subscribe {
  border: 0;
  border-radius: 999px;
  padding: 0.75rem 1.2rem;
  background: var(--accent-500);
  color: var(--text-inverse);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: transform 140ms ease, background 140ms ease, box-shadow 140ms ease;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--accent-500) 20%, transparent);
}

.profile-tier-list__subscribe:hover {
  background: var(--accent-600);
  transform: translateY(-1px);
}

.profile-tier-list__subscribe:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent-200) 65%, white);
  outline-offset: 3px;
}

.profile-tier__paywalled {
  margin-top: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: rgba(0, 0, 0, 0.04);
}

.profile-detail-expansion {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 1rem;
  background: var(--surface-2);
}

.profile-detail-expansion :deep(.q-item) {
  border-radius: 1rem;
}

.profile-detail-expansion :deep(.q-item__label--caption) {
  color: var(--text-2);
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
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }
}

.profile-card__media-main,
.profile-card__media-aside {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-card__media-main {
  grid-column: 1 / -1;
}

.profile-card__media-aside {
  gap: 1.25rem;
  grid-column: 1 / -1;
}

.profile-card__video {
  position: relative;
  width: 100%;
  max-width: none;
  margin-inline: 0;
  border-radius: 1.25rem;
  overflow: hidden;
  background: linear-gradient(
    135deg,
    rgba(15, 23, 42, 0.85),
    rgba(30, 64, 175, 0.55)
  );
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.4);
}

.profile-card__video video {
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 16 / 9;
  max-height: clamp(360px, 50vw, 780px);
  object-fit: cover;
  background: #000;
}

.profile-card__caption {
  margin: 0;
  line-height: 1.6;
  font-size: clamp(0.95rem, 0.9rem + 0.25vw, 1.15rem);
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
    max-width: 130rem;
  }
}

@media (max-width: 359px) {
  .profile-page__inner {
    padding-inline: clamp(1rem, 5vw, 1.25rem);
  }
}

@media (min-width: 1440px) {
  .profile-page__inner {
    max-width: 150rem;
    padding-inline: clamp(2rem, 6vw, 5rem);
  }
}

@media (min-width: 1680px) {
  .profile-page__inner {
    max-width: 160rem;
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

  .profile-hero__support-actions {
    flex-direction: column;
  }

  .profile-hero__support-actions .q-btn {
    width: 100%;
    min-width: 0;
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
  .profile-layout {
    display: grid;
    grid-template-columns: minmax(0, 3.5fr) minmax(320px, 1fr);
    align-items: start;
    gap: 2rem;
  }

  .profile-tier-grid {
    grid-column: 1 / -1;
    grid-template-columns: minmax(0, 2.85fr) minmax(320px, 2fr);
    grid-template-areas: "tiers tiers";
  }

  .profile-section--tiers {
    grid-area: tiers;
  }

  .profile-hero__support {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: flex-end;
  }

  .profile-hero__support-actions {
    justify-content: flex-end;
  }
}
</style>
