<template>
  <div class="public-profile bg-surface-1 text-1">
    <div class="public-profile__inner q-pa-md">
      <q-banner v-if="decodeError" class="public-profile__banner bg-negative text-white">
        {{ decodeError }}
      </q-banner>

      <section class="public-profile__header bg-surface-2">
        <div class="public-profile__avatar" aria-hidden="true">
          <q-skeleton
            v-if="profileLoading && !profileAvatar"
            type="circle"
            class="public-profile__avatar-skeleton"
          />
          <img v-else-if="profileAvatar" :src="profileAvatar" :alt="profileDisplayName" />
          <div v-else class="public-profile__avatar-placeholder">{{ profileInitials }}</div>
        </div>
        <div class="public-profile__info">
          <div class="public-profile__heading">
            <div class="public-profile__name-wrapper">
              <q-skeleton
                v-if="profileLoading && !profileDisplayName"
                type="text"
                class="public-profile__skeleton-line public-profile__skeleton-name"
              />
              <h1 v-else class="public-profile__name text-h4">{{ profileDisplayName }}</h1>
            </div>
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
          <p v-if="profileBio" class="public-profile__bio text-body2">{{ profileBio }}</p>
          <q-skeleton
            v-else-if="profileLoading"
            type="text"
            class="public-profile__skeleton-line"
          />
        </div>
      </section>

      <main class="public-profile__content" aria-live="polite">
        <q-banner
          v-if="shouldShowRetry"
          class="public-profile__banner public-profile__banner--inline bg-warning text-dark"
        >
          {{ profileError || tiersError || $t('CreatorHub.profile.noFundstrData') }}
          <template #action>
            <q-btn flat dense color="primary" :label="$t('CreatorHub.profile.retry')" @click="refreshProfile" />
          </template>
        </q-banner>

        <section class="public-profile__section">
          <header class="public-profile__section-header">
            <h2 class="public-profile__section-title text-h5">
              {{ $t('CreatorHub.profile.infrastructureDetails') }}
            </h2>
          </header>
          <div class="public-profile__grid">
            <div class="public-profile__info-item">
              <span class="public-profile__label text-2">
                {{ $t('CreatorHub.profile.tierAddressLabel') }}
              </span>
              <div class="public-profile__value">
                <q-skeleton
                  v-if="profileLoading && !tierAddress"
                  type="text"
                  class="public-profile__skeleton-line"
                />
                <template v-else>
                  <span v-if="tierAddress" class="public-profile__mono">{{ tierAddress }}</span>
                  <span v-else class="text-2">—</span>
                </template>
              </div>
            </div>
            <div class="public-profile__info-item">
              <span class="public-profile__label text-2">
                {{ $t('CreatorHub.profile.p2pkLabel') }}
              </span>
              <div class="public-profile__value">
                <q-skeleton
                  v-if="profileLoading && !p2pkPubkey"
                  type="text"
                  class="public-profile__skeleton-line"
                />
                <template v-else>
                  <span v-if="p2pkPubkey" class="public-profile__mono">{{ p2pkPubkey }}</span>
                  <span v-else class="text-2">—</span>
                </template>
              </div>
            </div>
          </div>
        </section>

        <section class="public-profile__section">
          <header class="public-profile__section-header">
            <h2 class="public-profile__section-title text-h6">
              {{ $t('CreatorHub.profile.trustedMintsLabel') }}
            </h2>
          </header>
          <div v-if="profileLoading && !trustedMints.length" class="public-profile__state public-profile__state--list">
            <q-skeleton v-for="n in 2" :key="n" type="text" class="public-profile__skeleton-line" />
          </div>
          <ul v-else-if="trustedMints.length" class="public-profile__list">
            <li v-for="mint in trustedMints" :key="mint" class="public-profile__list-item">
              {{ mint }}
            </li>
          </ul>
          <div v-else class="public-profile__state text-2">—</div>
        </section>

        <section class="public-profile__section">
          <header class="public-profile__section-header">
            <h2 class="public-profile__section-title text-h6">
              {{ $t('CreatorHub.profile.relaysLabel') }}
            </h2>
          </header>
          <div v-if="profileLoading && !relays.length" class="public-profile__state public-profile__state--list">
            <q-skeleton v-for="n in 2" :key="n" type="text" class="public-profile__skeleton-line" />
          </div>
          <ul v-else-if="relays.length" class="public-profile__list">
            <li v-for="relay in relays" :key="relay" class="public-profile__list-item">
              {{ relay }}
            </li>
          </ul>
          <div v-else class="public-profile__state text-2">—</div>
        </section>

        <section class="public-profile__section">
          <header class="public-profile__section-header">
            <h2 class="public-profile__section-title text-h5">
              {{ $t('CreatorHub.profile.sections.tiers') }}
            </h2>
          </header>
          <div v-if="tiersLoading" class="public-profile__state">
            <q-skeleton v-for="n in 2" :key="`tier-${n}`" type="rect" class="public-profile__tier-skeleton" />
          </div>
          <div v-else-if="tiersError && !tiers.length" class="public-profile__state text-2">
            {{ $t('CreatorHub.profile.tierLoadError') }}
          </div>
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
        </section>
      </main>

      <SubscribeDialog
        v-model="showSubscribeDialog"
        :tier="selectedTier"
        :creator-pubkey="creatorHex || ''"
        @confirm="confirmSubscribe"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import SubscribeDialog from "components/SubscribeDialog.vue";
import TierSummaryCard from "components/TierSummaryCard.vue";
import { useClipboard } from "src/composables/useClipboard";
import { useWelcomeStore } from "stores/welcome";
import { usePriceStore } from "stores/price";
import { useUiStore } from "stores/ui";
import { useNostrStore } from "stores/nostr";
import { usePublicCreatorProfile } from "src/composables/usePublicCreatorProfile";
import { buildProfileUrl } from "src/utils/profileUrl";
import { deriveCreatorKeys } from "src/utils/nostrKeys";
import { isTrustedUrl } from "src/utils/sanitize-url";
import {
  daysToFrequency,
  type SubscriptionFrequency,
} from "src/constants/subscriptionFrequency";

export default defineComponent({
  name: "PublicCreatorProfilePage",
  components: {
    TierSummaryCard,
  },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const welcomeStore = useWelcomeStore();
    const priceStore = usePriceStore();
    const uiStore = useUiStore();
    const nostr = useNostrStore();
    const { copy } = useClipboard();

    const decodeError = ref<string | null>(null);
    const creatorNpub = ref("");
    const creatorHexRef = ref<string | null>(null);

    function resolveCreator(param?: string) {
      decodeError.value = null;
      if (!param) {
        creatorNpub.value = "";
        creatorHexRef.value = null;
        return;
      }
      try {
        const keys = deriveCreatorKeys(param);
        creatorNpub.value = keys.npub;
        creatorHexRef.value = keys.hex;
      } catch (err) {
        creatorNpub.value = param;
        creatorHexRef.value = null;
        decodeError.value =
          "We couldn't load this creator profile. Double-check the link and try again.";
      }
    }

    resolveCreator((route.params.npubOrHex ?? route.params.npub) as string | undefined);

    watch(
      () => [route.params.npubOrHex, route.params.npub],
      ([next, fallback]) => {
        resolveCreator((next ?? fallback) as string | undefined);
      },
    );

    const {
      profileEvent,
      profileDetails,
      profileLoading,
      profileError,
      tierEvent,
      tiers,
      tiersLoading,
      tiersError,
      refresh,
    } = usePublicCreatorProfile(creatorHexRef);

    const showSubscribeDialog = ref(false);
    const selectedTier = ref<any>(null);

    const isGuest = computed(() => !welcomeStore.welcomeCompleted);

    const profileData = computed<Record<string, any>>(() => {
      const event = profileEvent.value;
      if (!event?.content) return {};
      try {
        const parsed = JSON.parse(event.content);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, any>;
        }
      } catch (err) {
        console.warn("Failed to parse profile content", err);
      }
      return {};
    });

    const profileDisplayName = computed(
      () =>
        profileData.value.display_name ||
        profileData.value.name ||
        profileData.value.nip05 ||
        creatorNpub.value,
    );

    const profileHandle = computed(() => {
      if (profileData.value.name) return profileData.value.name;
      if (profileData.value.nip05 && typeof profileData.value.nip05 === "string") {
        return profileData.value.nip05.split("@")[0] || "";
      }
      return "";
    });

    const profileAvatar = computed(() => {
      const picture = profileData.value.picture;
      if (typeof picture === "string" && picture && isTrustedUrl(picture)) {
        return picture;
      }
      return "";
    });

    const profileInitials = computed(() => {
      const text = profileDisplayName.value || creatorNpub.value;
      return text ? text.trim().charAt(0).toUpperCase() : "";
    });

    const profileBio = computed(() => {
      if (typeof profileData.value.about === "string" && profileData.value.about.trim()) {
        return profileData.value.about.trim();
      }
      if (typeof profileData.value.bio === "string" && profileData.value.bio.trim()) {
        return profileData.value.bio.trim();
      }
      return "";
    });

    const tierAddress = computed(() => profileDetails.value?.tierAddr ?? "");
    const p2pkPubkey = computed(() => profileDetails.value?.p2pkPubkey ?? "");
    const trustedMints = computed(() => profileDetails.value?.trustedMints ?? []);
    const relays = computed(() => profileDetails.value?.relays ?? []);

    const hasFundstrData = computed(
      () =>
        !!creatorHexRef.value &&
        (!!profileEvent.value || !!tierEvent.value || !!trustedMints.value.length || !!relays.value.length),
    );

    const shouldShowRetry = computed(
      () =>
        !!creatorHexRef.value &&
        !profileLoading.value &&
        !tiersLoading.value &&
        !hasFundstrData.value &&
        (!!profileError.value || !!tiersError.value || !profileEvent.value || !tierEvent.value),
    );

    const profileUrl = computed(() => buildProfileUrl(creatorNpub.value, router));

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

    const creatorHex = computed(() => creatorHexRef.value);

    const refreshProfile = async () => {
      if (!creatorHexRef.value) return;
      await refresh();
    };

    const openSubscribe = (tier: any) => {
      if (!creatorHexRef.value || isGuest.value || !nostr.hasIdentity) {
        return;
      }
      selectedTier.value = tier;
      showSubscribeDialog.value = true;
    };

    const confirmSubscribe = () => {
      showSubscribeDialog.value = false;
    };

    onMounted(async () => {
      if (creatorHexRef.value) {
        await refresh();
      }

      if (!creatorHexRef.value) return;
      const tierId = route.query.tierId as string | undefined;
      if (!nostr.hasIdentity || !tierId) return;

      const tryOpen = () => {
        const match = tiers.value.find((ti: any) => ti.id === tierId);
        if (match) {
          openSubscribe(match);
          router.replace({
            name: "PublicCreatorProfile",
            params: { npubOrHex: creatorNpub.value },
          });
          return true;
        }
        return false;
      };

      if (!tryOpen()) {
        const stop = watch(
          tiers,
          () => {
            if (tryOpen()) stop();
          },
          { immediate: false },
        );
      }
    });

    watch(creatorHexRef, async (value, oldValue) => {
      if (value && value !== oldValue) {
        await refresh();
      }
    });

    return {
      creatorHex,
      creatorNpub,
      decodeError,
      profileLoading,
      profileError,
      tiersLoading,
      tiersError,
      profileDisplayName,
      profileHandle,
      profileAvatar,
      profileInitials,
      profileBio,
      tierAddress,
      p2pkPubkey,
      trustedMints,
      relays,
      tiers,
      isGuest,
      profileUrl,
      showSubscribeDialog,
      selectedTier,
      openSubscribe,
      confirmSubscribe,
      formatFiat,
      getPrice,
      frequencyLabel,
      copy,
      shouldShowRetry,
      refreshProfile,
    };
  },
});
</script>

<style scoped>
.public-profile {
  min-height: 100%;
  width: 100%;
}

.public-profile__inner {
  max-width: 960px;
  margin: 0 auto;
  width: 100%;
}

.public-profile__banner {
  margin-bottom: 1.5rem;
  border-radius: 1rem;
}

.public-profile__banner--inline {
  margin-bottom: 0;
}

.public-profile__header {
  display: flex;
  gap: 1.5rem;
  align-items: center;
  padding: 2rem;
  border-radius: 1.5rem;
  margin-bottom: 2.5rem;
  border: 1px solid var(--surface-contrast-border);
  box-shadow: 0 22px 45px rgba(15, 23, 42, 0.28);
  background: linear-gradient(
    135deg,
    rgba(57, 97, 252, 0.15),
    rgba(81, 183, 250, 0.05)
  );
  backdrop-filter: blur(12px);
}

.public-profile__avatar {
  flex-shrink: 0;
  width: 112px;
  height: 112px;
  border-radius: 50%;
  overflow: hidden;
  background: var(--surface-1);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 3px solid var(--surface-1);
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

.public-profile__avatar-skeleton {
  width: 100%;
  height: 100%;
}

.public-profile__info {
  flex: 1;
  min-width: 0;
}

.public-profile__heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.public-profile__name-wrapper {
  display: flex;
  align-items: center;
  min-height: 2.5rem;
}

.public-profile__name {
  margin: 0;
  font-weight: 600;
}

.public-profile__handle {
  margin: 0.25rem 0 0;
}

.public-profile__bio {
  margin: 0.75rem 0 0;
}

.public-profile__content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.public-profile__section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  padding: 2rem;
  border-radius: 1.5rem;
  border: 1px solid var(--surface-contrast-border);
  background: var(--surface-2);
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.22);
}

.public-profile__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.public-profile__section-title {
  margin: 0;
}

.public-profile__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.5rem;
}

.public-profile__info-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.public-profile__label {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
}

.public-profile__value {
  font-size: 0.95rem;
  word-break: break-word;
}

.public-profile__mono {
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 0.9rem;
}

.public-profile__state {
  padding: 1.5rem 0;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  flex-direction: column;
  gap: 0.75rem;
}

.public-profile__state--list {
  align-items: flex-start;
}

.public-profile__tier-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.public-profile__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.public-profile__list-item {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid var(--surface-contrast-border);
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 0.9rem;
  word-break: break-word;
}

.public-profile__skeleton-line {
  width: 180px;
  max-width: 100%;
}

.public-profile__skeleton-name {
  height: 1.75rem;
}

.public-profile__tier-skeleton {
  width: 100%;
  height: 160px;
  border-radius: 1rem;
}

@media (max-width: 600px) {
  .public-profile__header {
    flex-direction: column;
    align-items: flex-start;
    padding: 1.5rem;
  }

  .public-profile__avatar {
    width: 96px;
    height: 96px;
  }

  .public-profile__section {
    padding: 1.5rem;
  }
}
</style>
