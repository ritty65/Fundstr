<template>
  <div class="profile-page bg-surface-1 text-1">
    <div class="profile-page__inner q-pa-md">
      <div
        v-if="decodeError"
        class="profile-notice profile-notice--error bg-negative text-white"
        role="alert"
      >
        {{ decodeError }}
      </div>

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
              <button
                class="profile-copy-btn"
                type="button"
                :aria-label="$t('CreatorHub.profile.copyProfileLink')"
                data-testid="copy-profile-link"
                @click="copy(profileUrl)"
              >
                <span aria-hidden="true">{{ $t('CreatorHub.profile.copyProfileLink') }}</span>
              </button>
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
            <ul v-if="metadataChips.length" class="profile-hero__chips" role="list">
              <li v-for="chip in metadataChips" :key="chip.id" class="profile-chip" role="listitem">
                <a
                  v-if="chip.href"
                  :href="chip.href"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {{ chip.label }}
                </a>
                <span v-else>{{ chip.label }}</span>
              </li>
            </ul>
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
          <header class="profile-section__header">
            <h2 class="profile-section__title text-h5">
              {{ $t('CreatorHub.profile.sections.tiers') }}
            </h2>
            <span v-if="refreshingTiers && !loadingTiers" class="profile-section__status text-2">
              {{ refreshingLabel }}
            </span>
          </header>
          <div v-if="loadingTiers" class="profile-section__state">
            {{ loadingLabel }}
          </div>
          <template v-else>
            <div v-if="tierFetchError && !tiers.length" class="profile-notice profile-notice--muted bg-surface-2">
              <div>{{ $t('CreatorHub.profile.tierLoadError') }}</div>
              <button
                type="button"
                class="profile-retry-btn"
                data-testid="retry-tier-fetch"
                @click="retryFetchTiers"
              >
                {{ retryLabel }}
              </button>
            </div>
            <div v-else-if="!tiers.length" class="profile-section__state text-2">
              {{ $t('CreatorHub.profile.noTiers') }}
            </div>
            <div v-else class="profile-tier-list">
              <article v-for="tier in tiers" :key="tier.id || tier.name" class="profile-tier-card">
                <header class="profile-tier-card__header">
                  <h3 class="profile-tier-card__title text-subtitle1">{{ tier.name }}</h3>
                  <div class="profile-tier-card__price">
                    <strong class="profile-tier-card__sats">{{ formatSats(getPrice(tier)) }} sats</strong>
                    <span v-if="formatFiat(getPrice(tier))" class="profile-tier-card__fiat">{{ formatFiat(getPrice(tier)) }}</span>
                    <span v-if="frequencyLabel(tier)" class="profile-tier-card__frequency">{{ frequencyLabel(tier) }}</span>
                  </div>
                </header>
                <p v-if="tier.description" class="profile-tier-card__description text-2">
                  {{ tier.description }}
                </p>
                <ul v-if="tierBenefits(tier).length" class="profile-tier-card__benefits">
                  <li v-for="benefit in tierBenefits(tier)" :key="benefit" class="profile-tier-card__benefit">
                    {{ benefit }}
                  </li>
                </ul>
              </article>
            </div>
            <div v-if="tierFetchError && tiers.length" class="profile-notice profile-notice--muted bg-surface-2">
              <div>{{ $t('CreatorHub.profile.tierRefreshError') }}</div>
              <button
                type="button"
                class="profile-retry-btn"
                data-testid="retry-tier-refresh"
                @click="retryFetchTiers"
              >
                {{ retryLabel }}
              </button>
            </div>
          </template>
        </section>
      </main>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCreatorsStore, fetchFundstrProfileBundle } from "stores/creators";
import { usePriceStore } from "stores/price";
import { useUiStore } from "stores/ui";
import { useI18n } from "vue-i18n";
import { isTrustedUrl } from "src/utils/sanitize-url";
import { useClipboard } from "src/composables/useClipboard";
import { daysToFrequency, type SubscriptionFrequency } from "src/constants/subscriptionFrequency";
import { deriveCreatorKeys } from "src/utils/nostrKeys";
import { buildProfileUrl } from "src/utils/profileUrl";

export default defineComponent({
  name: "PublicCreatorProfilePage",
  setup() {
    const route = useRoute();
    const router = useRouter();
    const creatorParam = (route.params.npubOrHex ?? route.params.npub) as string | undefined;
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
    const priceStore = usePriceStore();
    const uiStore = useUiStore();
    const { t } = useI18n();
    const { copy } = useClipboard();

    const profile = ref<any>({});
    const followers = ref<number | null>(null);
    const following = ref<number | null>(null);
    const loadingTiers = ref(true);
    const refreshingTiers = ref(false);

    const creatorTierList = computed(() =>
      creatorHex ? creators.tiersMap[creatorHex] : undefined,
    );
    const tiers = computed(() => creatorTierList.value ?? []);
    const hasInitialTierData = computed(() => creatorTierList.value !== undefined);
    const tierFetchError = computed(() => creators.tierFetchError);

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
          const { profile: profileData, followers: followersCount, following: followingCount } = bundle;
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

    const retryFetchTiers = () => {
      void fetchTiers();
    };

    onMounted(async () => {
      await loadProfile();
    });

    function formatFiat(sats: number): string {
      if (!priceStore.bitcoinPrice) return "";
      const value = (priceStore.bitcoinPrice / 100000000) * sats;
      return uiStore.formatCurrency(value, "USD", true);
    }

    function formatSats(sats: number): string {
      const locale = typeof navigator !== "undefined" ? navigator.language : undefined;
      return new Intl.NumberFormat(locale).format(sats);
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

    const tierBenefits = (tier: any): string[] => {
      if (Array.isArray(tier?.benefits)) {
        return tier.benefits.filter(
          (benefit) => typeof benefit === "string" && benefit.trim().length > 0,
        );
      }
      if (typeof tier?.benefits === "string") {
        return tier.benefits ? [tier.benefits] : [];
      }
      return [];
    };

    const translationWithFallback = (key: string, fallback: string) => {
      const translated = t(key);
      return translated === key ? fallback : translated;
    };

    const retryLabel = computed(() =>
      translationWithFallback("CreatorHub.profile.retry", "Retry"),
    );

    const refreshingLabel = computed(() =>
      translationWithFallback("CreatorHub.profile.refreshingTiers", "Refreshing…"),
    );

    const loadingLabel = computed(() =>
      translationWithFallback("CreatorHub.profile.loadingTiers", "Loading tiers…"),
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
      metadataChips,
      tiers,
      followers,
      following,
      hasFollowerStats,
      loadingTiers,
      refreshingTiers,
      tierFetchError,
      retryLabel,
      refreshingLabel,
      loadingLabel,
      tierBenefits,
      formatFiat,
      formatSats,
      getPrice,
      frequencyLabel,
      retryFetchTiers,
      copy,
      profileUrl,
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

.profile-copy-btn {
  border: 1px solid var(--surface-contrast-border);
  background: transparent;
  color: var(--text-2);
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.2s ease;
}

.profile-copy-btn:hover,
.profile-copy-btn:focus {
  background: var(--surface-contrast-border);
}

.profile-copy-btn:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
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
  padding: 0;
  list-style: none;
}

.profile-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--surface-contrast-border);
  background: var(--surface-1);
  font-size: 0.85rem;
}

.profile-chip a {
  color: inherit;
  text-decoration: none;
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

.profile-section__title {
  margin: 0;
}

.profile-section__status {
  margin-left: auto;
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

.profile-tier-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.profile-tier-card {
  background: var(--surface-2);
  border-radius: 1rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.05);
}

.profile-tier-card__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  align-items: flex-start;
}

.profile-tier-card__title {
  margin: 0;
  font-weight: 600;
}

.profile-tier-card__price {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: right;
}

.profile-tier-card__sats {
  font-size: 1.25rem;
}

.profile-tier-card__fiat,
.profile-tier-card__frequency {
  color: var(--text-2);
  font-size: 0.85rem;
}

.profile-tier-card__description {
  margin: 0;
}

.profile-tier-card__benefits {
  margin: 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.profile-tier-card__benefit {
  line-height: 1.4;
}

.profile-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  margin-bottom: 1.5rem;
}

.profile-notice--muted {
  color: var(--text-1);
  margin-top: 1rem;
}

.profile-retry-btn {
  background: var(--accent-500);
  color: var(--text-inverse);
  border: none;
  border-radius: 999px;
  padding: 0.35rem 0.9rem;
  cursor: pointer;
  font-size: 0.85rem;
}

.profile-retry-btn:hover,
.profile-retry-btn:focus {
  background: var(--accent-600);
}

.profile-retry-btn:focus-visible {
  outline: 2px solid var(--accent-200);
  outline-offset: 2px;
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

  .profile-tier-card__price {
    text-align: left;
    align-items: flex-start;
  }
}
</style>
