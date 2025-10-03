<template>
  <div class="profile-page bg-surface-1 text-1">
    <div class="profile-page__inner q-pa-md">
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

      <section class="profile-hero" :class="{ 'profile-hero--with-banner': heroBannerUrl }">
        <div
          v-if="heroBannerUrl"
          class="profile-hero__banner"
          :style="heroBannerStyle"
          role="presentation"
        />
        <div class="profile-hero__content bg-surface-2">
          <div class="profile-hero__avatar" aria-hidden="true">
            <img v-if="profileAvatar" :src="profileAvatar" :alt="profileDisplayName" />
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

      <main class="profile-layout">
        <section class="profile-section">
          <header class="profile-section__header">
            <h2 class="profile-section__title text-h5">
              {{ $t('CreatorHub.profile.sections.about') }}
            </h2>
          </header>
          <div class="profile-section__body">
            <p v-if="profile.about" class="profile-section__text text-body1">{{ profile.about }}</p>
            <p v-else class="profile-section__text text-2">
              {{ $t('CreatorHub.profile.noAbout') }}
            </p>
          </div>
        </section>

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
            <NutzapExplainer
              class="profile-tier-explainer"
              :is-guest="isGuest"
              @start-onboarding="gotoWelcome"
            />
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
                {{ $t('CreatorHub.profile.howNutzapWorks.title') }}
              </h3>
              <p class="profile-card__text text-2">
                {{ $t('CreatorHub.profile.howNutzapWorks.intro') }}
              </p>
              <ul class="profile-card__list">
                <li
                  v-for="(item, index) in howNutzapWorksList"
                  :key="index"
                  class="profile-card__list-item text-2"
                >
                  {{ item }}
                </li>
              </ul>
            </article>
          </div>
        </section>

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
import NutzapExplainer from "components/NutzapExplainer.vue";
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
    NutzapExplainer,
    TierSummaryCard,
  },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const creatorParam =
      (route.params.npubOrHex ?? route.params.npub) as string | undefined;
    const decodeError = ref<string | null>(null);
    let creatorNpub = creatorParam ?? "";
    let creatorHex: string | null = null;
    try {
      const keys = deriveCreatorKeys(creatorParam);
      creatorNpub = keys.npub;
      creatorHex = keys.hex;
    } catch (err) {
      decodeError.value =
        "We couldn't load this creator profile. Double-check the link and try again.";
    }
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
      creatorHex ? creators.tiersMap[creatorHex] : undefined,
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

    const fetchTiers = async () => {
      if (!creatorHex) {
        loadingTiers.value = false;
        return;
      }
      if (!hasInitialTierData.value) {
        loadingTiers.value = true;
      }
      refreshingTiers.value = true;
      try {
        await creators.fetchTierDefinitions(creatorHex, { fundstrOnly: true });
      } finally {
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

    const loadProfile = async () => {
      const tierPromise = fetchTiers();

      if (!creatorHex) {
        await tierPromise;
        return;
      }

      const profilePromise = fetchFundstrProfileBundle(creatorHex)
        .then((bundle) => {
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
      if (!creatorHex) {
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

      if (!creatorHex) return;
      const tierId = route.query.tierId as string | undefined;
      if (!nostr.hasIdentity || !tierId) return;
      const tryOpen = () => {
        const t = tiers.value.find((ti: any) => ti.id === tierId);
        if (t) {
          openSubscribe(t);
          router.replace({
            name: "PublicCreatorProfile",
            params: { npubOrHex: creatorNpub },
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

    const profileUrl = computed(() => buildProfileUrl(creatorNpub, router));

    const profileDisplayName = computed(
      () =>
        profile.value.display_name ||
        profile.value.name ||
        profile.value.nip05 ||
        creatorNpub,
    );

    const profileHandle = computed(() => {
      if (profile.value.name) return profile.value.name;
      if (profile.value.nip05 && typeof profile.value.nip05 === "string") {
        return profile.value.nip05.split("@")[0] || "";
      }
      return "";
    });

    const profileAvatar = computed(() => profile.value.picture || "");

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

    const profileInitials = computed(() => {
      const text = profileDisplayName.value || creatorNpub;
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
      heroBannerUrl,
      heroBannerStyle,
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

.profile-hero {
  position: relative;
  margin-bottom: 2.5rem;
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

.profile-tier-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-tier-explainer {
  margin-bottom: 1.5rem;
}

.profile-tier__paywalled {
  margin-top: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.75rem;
  background: rgba(0, 0, 0, 0.04);
}

.profile-section--infrastructure .profile-section__body {
  gap: 1.5rem;
}

.profile-infrastructure {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1.5rem;
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
  .profile-hero__content {
    flex-direction: column;
    align-items: flex-start;
  }

  .profile-hero__avatar {
    width: 100px;
    height: 100px;
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
</style>
