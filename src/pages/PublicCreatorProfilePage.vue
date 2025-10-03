<template>
  <div class="public-profile bg-surface-1 text-1">
    <div class="public-profile__inner q-pa-md">
      <q-banner v-if="decodeError" class="public-profile__banner bg-negative text-white">
        {{ decodeError }}
      </q-banner>

      <section class="public-profile__hero" :class="{ 'public-profile__hero--with-banner': heroBannerUrl }">
        <div
          v-if="heroBannerUrl"
          class="public-profile__hero-banner"
          :style="heroBannerStyle"
          role="presentation"
        />
        <div class="public-profile__hero-content bg-surface-2">
          <div class="public-profile__avatar" aria-hidden="true">
            <img v-if="profileAvatar" :src="profileAvatar" :alt="profileDisplayName" />
            <div v-else class="public-profile__avatar-placeholder">{{ profileInitials }}</div>
          </div>
          <div class="public-profile__details">
            <div class="public-profile__heading">
              <h1 class="public-profile__name text-h4">{{ profileDisplayName }}</h1>
              <q-btn
                flat
                round
                dense
                icon="content_copy"
                :aria-label="$t('CreatorHub.profile.copyProfileLink')"
                @click="copy(profileUrl)"
              />
            </div>
            <p v-if="profileHandle" class="public-profile__handle text-2">@{{ profileHandle }}</p>
            <div v-if="hasFollowerStats" class="public-profile__stats text-2">
              <span v-if="followers !== null">
                {{ $t('CreatorHub.profile.followers', { count: followers }) }}
              </span>
              <span v-if="following !== null">
                {{ $t('CreatorHub.profile.following', { count: following }) }}
              </span>
            </div>
            <div v-if="metadataChips.length" class="public-profile__chips" role="list">
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

      <main class="public-profile__content">
        <section class="public-profile__section">
          <header class="public-profile__section-header">
            <h2 class="public-profile__section-title text-h5">
              {{ $t('CreatorHub.profile.sections.about') }}
            </h2>
          </header>
          <div class="public-profile__section-body">
            <p v-if="profile.about" class="public-profile__section-text text-body1">{{ profile.about }}</p>
            <p v-else class="public-profile__section-text text-2">
              {{ $t('CreatorHub.profile.noAbout') }}
            </p>
          </div>
        </section>

        <section class="public-profile__section" aria-live="polite">
          <header class="public-profile__section-header public-profile__section-header--with-spinner">
            <h2 class="public-profile__section-title text-h5">
              {{ $t('CreatorHub.profile.sections.tiers') }}
            </h2>
            <q-spinner-dots
              v-if="refreshingTiers && !loadingTiers"
              size="sm"
              class="public-profile__spinner text-2"
            />
          </header>
          <div v-if="loadingTiers" class="public-profile__state">
            <q-spinner-hourglass />
          </div>
          <template v-else>
            <q-banner
              v-if="tierFetchError && !tiers.length"
              class="public-profile__banner bg-surface-2"
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
                <q-btn flat color="primary" :label="retryLabel" @click="retryFetchTiers" />
              </template>
            </q-banner>
            <div v-else-if="!tiers.length" class="public-profile__state text-2">
              {{ $t('CreatorHub.profile.noTiers') }}
            </div>
            <div v-else class="public-profile__tier-list">
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
              </TierSummaryCard>
            </div>
            <q-banner
              v-if="tierFetchError && tiers.length"
              class="public-profile__banner bg-surface-2"
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
    SubscriptionReceipt,
    SetupRequiredDialog,
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
      metadataChips,
      hasFollowerStats,
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
    };
  },
});
</script>

<style scoped>
.public-profile {
  min-height: 100%;
}

.public-profile__inner {
  max-width: 1100px;
  margin: 0 auto;
}

.public-profile__banner {
  margin-bottom: 1.5rem;
  border-radius: 1rem;
}

.public-profile__hero {
  position: relative;
  margin-bottom: 2.5rem;
}

.public-profile__hero--with-banner .public-profile__hero-content {
  backdrop-filter: blur(8px);
}

.public-profile__hero-banner {
  position: absolute;
  inset: 0;
  background-size: cover;
  background-position: center;
  border-radius: 1.5rem;
  opacity: 0.4;
  filter: saturate(0.9);
}

.public-profile__hero-content {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.75rem;
  border-radius: 1.5rem;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.public-profile__avatar {
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

.public-profile__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.public-profile__avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: var(--accent-600);
  font-size: 2.5rem;
  font-weight: 600;
}

.public-profile__details {
  flex: 1;
  min-width: 0;
}

.public-profile__heading {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.public-profile__name {
  margin: 0;
  font-weight: 600;
}

.public-profile__handle {
  margin: 0.25rem 0 0;
}

.public-profile__stats {
  margin-top: 0.5rem;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.public-profile__chips {
  margin-top: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.public-profile__content {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
}

.public-profile__section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.public-profile__section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.public-profile__section-header--with-spinner {
  justify-content: space-between;
}

.public-profile__spinner {
  margin-left: auto;
}

.public-profile__section-title {
  margin: 0;
}

.public-profile__section-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.public-profile__section-text {
  margin: 0;
}

.public-profile__state {
  padding: 2rem 0;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
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

.public-profile__tier-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

@media (max-width: 600px) {
  .public-profile__hero-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .public-profile__avatar {
    width: 96px;
    height: 96px;
  }
}
</style>
