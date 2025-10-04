<template>
  <div class="profile-page bg-surface-1 text-1">
    <div class="profile-page__inner q-pa-md">
      <div class="profile-page__back q-mb-md">
        <q-btn flat color="primary" to="/find-creators">{{
          $t("CreatorHub.profile.back")
        }}</q-btn>
      </div>

      <q-banner
        v-if="showGuestBanner"
        class="profile-page__banner bg-surface-2 text-2"
        icon="info"
      >
        {{ $t("CreatorHub.profile.guestCta") }}
        <template #action>
          <q-btn flat color="primary" :label="$t('CreatorHub.profile.finishSetup')" @click="gotoWelcome" />
        </template>
      </q-banner>

      <q-banner v-if="decodeError" class="profile-page__banner bg-negative text-white">
        {{ decodeError }}
      </q-banner>

      <section class="profile-summary bg-surface-2">
        <header class="profile-summary__header">
          <h2 class="profile-summary__title text-subtitle1">
            {{ $t('CreatorHub.profile.summary.title') }}
          </h2>
        </header>
        <div class="profile-summary__primary">
          <div class="profile-summary__avatar" aria-hidden="true">
            <img v-if="profileAvatar" :src="profileAvatar" :alt="profileDisplayName" />
            <div v-else class="profile-summary__avatar-placeholder">{{ profileInitials }}</div>
          </div>
          <div class="profile-summary__details">
            <div class="profile-summary__heading">
              <h1 class="profile-summary__name text-h5">{{ profileDisplayName }}</h1>
              <q-btn
                flat
                round
                dense
                icon="content_copy"
                :aria-label="$t('CreatorHub.profile.copyProfileLink')"
                @click="copy(profileUrl)"
              />
            </div>
            <p v-if="profileHandle" class="profile-summary__handle text-2">@{{ profileHandle }}</p>
            <div v-if="hasFollowerStats" class="profile-summary__stats text-2">
              <span v-if="followers !== null">
                {{ $t('CreatorHub.profile.followers', { count: followers }) }}
              </span>
              <span v-if="following !== null">
                {{ $t('CreatorHub.profile.following', { count: following }) }}
              </span>
            </div>
            <div v-if="metadataChips.length" class="profile-summary__chips" role="list">
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
        <div class="profile-summary__meta">
          <div v-if="profile.p2pkPubkey" class="profile-summary__item">
            <div class="profile-summary__label text-2">
              <span>{{ $t('CreatorHub.profile.p2pkLabel') }}</span>
              <q-btn
                flat
                dense
                round
                size="sm"
                class="profile-summary__info-btn"
                icon="info"
                :aria-label="$t('FindCreators.explainers.tooltips.p2pk')"
              >
                <q-tooltip anchor="top middle" self="bottom middle">
                  {{ $t('FindCreators.explainers.tooltips.p2pk') }}
                </q-tooltip>
              </q-btn>
            </div>
            <code class="profile-summary__value">{{ profile.p2pkPubkey }}</code>
          </div>
          <div v-if="trustedMints.length" class="profile-summary__item">
            <div class="profile-summary__label text-2">
              <span>{{ $t('CreatorHub.profile.trustedMintsLabel') }}</span>
            </div>
            <MintSafetyList :mints="trustedMints" />
          </div>
          <div v-if="relayList.length" class="profile-summary__item">
            <div class="profile-summary__label text-2">
              <span>{{ $t('CreatorHub.profile.relaysLabel') }}</span>
            </div>
            <RelayBadgeList :relays="relayList" />
          </div>
        </div>
      </section>

      <main class="profile-layout">
        <section class="profile-section profile-section--tiers" aria-live="polite">
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
                @subscribe="openSubscribe"
              >
                <template v-if="isGuest" #subscribe-tooltip>
                  <q-tooltip>{{ $t('CreatorHub.profile.guestTooltip') }}</q-tooltip>
                </template>
                <template #footer-note>
                  {{ $t('CreatorHub.profile.subscribeMicrocopy') }}
                </template>
                <template v-if="creatorHex && shouldShowPaywallPreview" #default>
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

        <section class="profile-expansions">
          <q-expansion-item class="profile-expansion" dense expand-separator>
            <template #header>
              <div class="profile-expansion__header">
                <span class="profile-expansion__title text-subtitle1">
                  {{ $t('CreatorHub.profile.sections.about') }}
                </span>
              </div>
            </template>
            <div class="profile-expansion__body">
              <p v-if="profile.about" class="profile-expansion__text text-body1">{{ profile.about }}</p>
              <p v-else class="profile-expansion__text text-2">
                {{ $t('CreatorHub.profile.noAbout') }}
              </p>
            </div>
          </q-expansion-item>

          <q-expansion-item
            v-if="hasInfrastructureDetails"
            class="profile-expansion"
            dense
            expand-separator
          >
            <template #header>
              <div class="profile-expansion__header">
                <span class="profile-expansion__title text-subtitle1">
                  {{ $t('CreatorHub.profile.sections.infrastructure') }}
                </span>
              </div>
            </template>
            <div class="profile-expansion__body">
              <div class="profile-expansion__grid">
                <div v-if="profile.p2pkPubkey" class="profile-expansion__item">
                  <div class="profile-expansion__label text-2">
                    <span>{{ $t('CreatorHub.profile.p2pkLabel') }}</span>
                    <q-btn
                      flat
                      dense
                      round
                      size="sm"
                      class="profile-summary__info-btn"
                      icon="info"
                      :aria-label="$t('FindCreators.explainers.tooltips.p2pk')"
                    >
                      <q-tooltip anchor="top middle" self="bottom middle">
                        {{ $t('FindCreators.explainers.tooltips.p2pk') }}
                      </q-tooltip>
                    </q-btn>
                  </div>
                  <code class="profile-expansion__value">{{ profile.p2pkPubkey }}</code>
                </div>
                <div v-if="trustedMints.length" class="profile-expansion__item">
                  <div class="profile-expansion__label text-2">
                    <span>{{ $t('CreatorHub.profile.trustedMintsLabel') }}</span>
                    <q-btn
                      flat
                      dense
                      round
                      size="sm"
                      class="profile-summary__info-btn"
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
                <div v-if="relayList.length" class="profile-expansion__item">
                  <div class="profile-expansion__label text-2">
                    <span>{{ $t('CreatorHub.profile.relaysLabel') }}</span>
                    <q-btn
                      flat
                      dense
                      round
                      size="sm"
                      class="profile-summary__info-btn"
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
              </div>
            </div>
          </q-expansion-item>

          <q-expansion-item class="profile-expansion" dense expand-separator>
            <template #header>
              <div class="profile-expansion__header">
                <span class="profile-expansion__title text-subtitle1">
                  {{ $t('CreatorHub.profile.howNutzapWorks.title') }}
                </span>
              </div>
            </template>
            <div class="profile-expansion__body">
              <p class="profile-expansion__text text-2">
                {{ $t('CreatorHub.profile.howNutzapWorks.intro') }}
              </p>
              <ul class="profile-expansion__list">
                <li
                  v-for="(item, index) in howNutzapWorksList"
                  :key="index"
                  class="profile-expansion__list-item text-2"
                >
                  {{ item }}
                </li>
              </ul>
            </div>
          </q-expansion-item>

          <q-expansion-item class="profile-expansion" dense expand-separator>
            <template #header>
              <div class="profile-expansion__header">
                <span class="profile-expansion__title text-subtitle1">
                  {{ $t('CreatorHub.profile.sections.faq') }}
                </span>
              </div>
            </template>
            <div class="profile-expansion__body">
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
              <p v-else class="profile-expansion__text text-2">
                {{ $t('CreatorHub.profile.noFaq') }}
              </p>
            </div>
          </q-expansion-item>
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
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCreatorsStore, fetchFundstrProfileBundle } from "stores/creators";
import { useNostrStore } from "stores/nostr";
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

    const setCreatorFromParam = (param: string | undefined) => {
      decodeError.value = null;
      creatorNpub.value = param ?? "";
      creatorHex.value = null;

      if (!param) {
        decodeError.value = decodeFailureMessage;
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

    setCreatorFromParam(creatorParam);
    const creators = useCreatorsStore();
    const nostr = useNostrStore();
    const priceStore = usePriceStore();
    const uiStore = useUiStore();
    const welcomeStore = useWelcomeStore();
    const { t } = useI18n();
    const { copy } = useClipboard();
    const bitcoinPrice = computed(() => priceStore.bitcoinPrice);
    const profile = ref<any>({});
    const creatorTierList = computed(() =>
      creatorHex.value ? creators.tiersMap[creatorHex.value] : undefined,
    );
    const tiers = computed(() => creatorTierList.value ?? []);
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
    const tierFetchError = computed(() => creators.tierFetchError);
    const isGuest = computed(() => !welcomeStore.welcomeCompleted);

    const parseBooleanQuery = (value: unknown): boolean | null => {
      if (typeof value === "boolean") return value;
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["1", "true", "yes", "on"].includes(normalized)) return true;
        if (["0", "false", "no", "off"].includes(normalized)) return false;
      }
      return null;
    };

    const showGuestBanner = computed(() => {
      if (!isGuest.value) return false;
      const explicit =
        parseBooleanQuery(route.query.showGuestCta) ??
        parseBooleanQuery(route.query.showGuestBanner);
      if (explicit !== null) return explicit;
      const explicitHide = parseBooleanQuery(route.query.hideGuestCta);
      if (explicitHide !== null) return !explicitHide;
      return false;
    });

    const shouldShowPaywallPreview = computed(() => {
      const explicit =
        parseBooleanQuery(route.query.showPaywallPreview) ??
        parseBooleanQuery(route.query.showPreviews) ??
        parseBooleanQuery(route.query.showPreview) ??
        parseBooleanQuery(route.query.preview);
      if (explicit !== null) return explicit;
      if (!isGuest.value) return true;
      return false;
    });

    const fetchTiers = async () => {
      const hex = creatorHex.value;
      if (!hex) {
        loadingTiers.value = false;
        return;
      }
      if (!hasInitialTierData.value) {
        loadingTiers.value = true;
      }
      refreshingTiers.value = true;
      try {
        await creators.fetchTierDefinitions(hex, { fundstrOnly: true });
      } finally {
        if (creatorHex.value !== hex) {
          return;
        }
        refreshingTiers.value = false;
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
        refreshingTiers.value = false;
      }
    });

    const resetProfileState = () => {
      profile.value = {};
      followers.value = null;
      following.value = null;
      selectedTier.value = null;
      loadingTiers.value = true;
      refreshingTiers.value = false;
    };

    watch(
      () => (route.params.npubOrHex ?? route.params.npub) as string | undefined,
      async (next, prev) => {
        if (next === prev) {
          return;
        }
        setCreatorFromParam(next);
        resetProfileState();
        await loadProfile();
      },
    );

    const loadProfile = async () => {
      const targetHex = creatorHex.value;
      const tierPromise = fetchTiers();

      if (!targetHex) {
        await tierPromise;
        return;
      }

      const profilePromise = fetchFundstrProfileBundle(targetHex)
        .then((bundle) => {
          if (!bundle || creatorHex.value !== targetHex) return;
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
          if (typeof followersCount === "number") {
            followers.value = followersCount;
          }
          if (typeof followingCount === "number") {
            following.value = followingCount;
          }
        })
        .catch(() => {});

      await Promise.all([profilePromise, tierPromise]);
    };
    // initialization handled in onMounted

    const retryFetchTiers = () => {
      void fetchTiers();
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
      await loadProfile();

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

    const profileDisplayName = computed(
      () =>
        profile.value.display_name ||
        profile.value.name ||
        profile.value.nip05 ||
        creatorNpub.value,
    );

    const profileHandle = computed(() => {
      if (profile.value.name) return profile.value.name;
      if (profile.value.nip05 && typeof profile.value.nip05 === "string") {
        return profile.value.nip05.split("@")[0] || "";
      }
      return "";
    });

    const profileAvatar = computed(() => profile.value.picture || "");

    const profileInitials = computed(() => {
      const text = profileDisplayName.value || creatorNpub.value;
      return text ? text.trim().charAt(0).toUpperCase() : "";
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

    const sanitizedWebsite = computed(() => normalizeUrl(profile.value.website));

    const nip05Chip = computed(() => {
      const nip05 = profile.value.nip05;
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

    const hasInfrastructureDetails = computed(
      () =>
        Boolean(profile.value.p2pkPubkey) ||
        trustedMints.value.length > 0 ||
        relayList.value.length > 0,
    );

    const howNutzapWorksList = computed(() => {
      const items = t("CreatorHub.profile.howNutzapWorks.points", {
        returnObjects: true,
      }) as unknown;
      if (Array.isArray(items)) {
        return items as string[];
      }
      return typeof items === "string" ? [items] : [];
    });

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

    return {
      creatorNpub,
      creatorHex,
      decodeError,
      profile,
      profileDisplayName,
      profileHandle,
      profileAvatar,
      profileInitials,
      tiers,
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
      hasInfrastructureDetails,
      howNutzapWorksList,
      faqEntries,
      retryLabel,
      // no markdown rendering needed
      formatFiat,
      getPrice,
      frequencyLabel,
      openSubscribe,
      confirmSubscribe,
      retryFetchTiers,
      copy,
      profileUrl,
      isGuest,
      showGuestBanner,
      shouldShowPaywallPreview,
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
  max-width: 1100px;
  margin: 0 auto;
}

.profile-page__banner {
  margin-bottom: 1.5rem;
  border-radius: 1rem;
}

.profile-summary {
  margin-bottom: 2rem;
  padding: 1.5rem;
  border-radius: 1.5rem;
  background: var(--surface-2);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.profile-summary__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.profile-summary__title {
  margin: 0;
  font-weight: 600;
  color: var(--text-2);
}

.profile-summary__primary {
  display: flex;
  gap: 1.25rem;
  align-items: center;
  flex-wrap: wrap;
}

.profile-summary__avatar {
  flex-shrink: 0;
  width: 104px;
  height: 104px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid var(--surface-1);
  background: var(--surface-1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  font-weight: 600;
}

.profile-summary__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-summary__avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: var(--text-2);
}

.profile-summary__details {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile-summary__heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.profile-summary__name {
  margin: 0;
  font-weight: 600;
}

.profile-summary__handle {
  margin: 0;
}

.profile-summary__stats {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.profile-summary__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.profile-summary__meta {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.profile-summary__item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile-summary__label {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-2);
}

.profile-summary__info-btn {
  color: var(--text-2);
  min-width: 0;
  padding: 0;
}

.profile-summary__info-btn :deep(.q-btn__content) {
  padding: 0;
}

.profile-summary__info-btn :deep(.q-icon) {
  font-size: 1rem;
}

.profile-summary__info-btn:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

.profile-summary__value {
  word-break: break-word;
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 0.85rem;
}

.profile-layout {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.profile-section {
  background: var(--surface-2);
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.06);
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

.profile-tier-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-tier__paywalled {
  margin-top: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: rgba(0, 0, 0, 0.04);
}

.profile-expansions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.profile-expansion {
  border-radius: 1rem;
  background: var(--surface-2);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.profile-expansion__header {
  padding: 1rem 1.25rem;
}

.profile-expansion__title {
  font-weight: 600;
}

.profile-expansion__body {
  padding: 0 1.25rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-expansion__text {
  margin: 0;
}

.profile-expansion__grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.profile-expansion__item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile-expansion__label {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-2);
}

.profile-expansion__value {
  word-break: break-word;
  font-family: 'Roboto Mono', 'Courier New', monospace;
  font-size: 0.85rem;
}

.profile-expansion__list {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.profile-expansion__list-item {
  position: relative;
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

@media (max-width: 767px) {
  .profile-summary__primary {
    align-items: flex-start;
  }

  .profile-summary__avatar {
    width: 88px;
    height: 88px;
  }

  .profile-section {
    padding: 1.25rem;
  }

  .profile-expansion__header {
    padding: 0.75rem 1rem;
  }

  .profile-expansion__body {
    padding: 0 1rem 1rem;
  }
}
</style>
