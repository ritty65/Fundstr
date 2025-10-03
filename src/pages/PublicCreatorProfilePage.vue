<template>
  <div class="public-profile bg-surface-1 text-1">
    <div class="public-profile__inner q-pa-md">
      <q-banner v-if="decodeError" class="public-profile__banner bg-negative text-white">
        {{ decodeError }}
      </q-banner>

      <section class="public-profile__header bg-surface-2">
        <div class="public-profile__avatar" aria-hidden="true">
          <img v-if="profileAvatar" :src="profileAvatar" :alt="profileDisplayName" />
          <div v-else class="public-profile__avatar-placeholder">{{ profileInitials }}</div>
        </div>
        <div class="public-profile__info">
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
          <p v-if="profileBio" class="public-profile__bio text-body2">{{ profileBio }}</p>
        </div>
      </section>

      <main class="public-profile__content" aria-live="polite">
        <section class="public-profile__section">
          <header class="public-profile__section-header">
            <h2 class="public-profile__section-title text-h5">
              {{ $t('CreatorHub.profile.sections.infrastructure') }}
            </h2>
            <q-spinner-hourglass
              v-if="loadingProfile"
              size="18px"
              class="public-profile__spinner"
            />
          </header>
          <div v-if="nutzapProfile" class="public-profile__infrastructure">
            <div v-if="nutzapProfile.p2pkPubkey" class="public-profile__subsection">
              <div class="public-profile__subsection-label text-2">
                <span>{{ $t('CreatorHub.profile.p2pkLabel') }}</span>
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  class="public-profile__info-btn"
                  icon="info"
                  :aria-label="$t('FindCreators.explainers.tooltips.p2pk')"
                >
                  <q-tooltip anchor="top middle" self="bottom middle">
                    {{ $t('FindCreators.explainers.tooltips.p2pk') }}
                  </q-tooltip>
                </q-btn>
              </div>
              <code class="public-profile__subsection-value">
                {{ nutzapProfile.p2pkPubkey }}
              </code>
            </div>
            <div class="public-profile__subsection">
              <div class="public-profile__subsection-label text-2">
                <span>{{ $t('CreatorHub.profile.trustedMintsLabel') }}</span>
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  class="public-profile__info-btn"
                  icon="info"
                  :aria-label="$t('FindCreators.explainers.tooltips.trustedMints')"
                >
                  <q-tooltip anchor="top middle" self="bottom middle">
                    {{ $t('FindCreators.explainers.tooltips.trustedMints') }}
                  </q-tooltip>
                </q-btn>
              </div>
              <MintSafetyList :mints="nutzapProfile.trustedMints" />
            </div>
            <div class="public-profile__subsection">
              <div class="public-profile__subsection-label text-2">
                <span>{{ $t('CreatorHub.profile.relaysLabel') }}</span>
                <q-btn
                  flat
                  dense
                  round
                  size="sm"
                  class="public-profile__info-btn"
                  icon="info"
                  :aria-label="$t('FindCreators.explainers.tooltips.relays')"
                >
                  <q-tooltip anchor="top middle" self="bottom middle">
                    {{ $t('FindCreators.explainers.tooltips.relays') }}
                  </q-tooltip>
                </q-btn>
              </div>
              <RelayBadgeList :relays="nutzapProfile.relays" />
            </div>
            <div v-if="nutzapProfile.tierAddr" class="public-profile__subsection">
              <div class="public-profile__subsection-label text-2">
                <span>Tier address</span>
              </div>
              <code class="public-profile__subsection-value">
                {{ nutzapProfile.tierAddr }}
              </code>
            </div>
          </div>
          <div v-else-if="loadingProfile" class="public-profile__state text-2">
            Loading infrastructure…
          </div>
          <div v-else class="public-profile__state text-2">
            Creator hasn't published infrastructure details yet.
          </div>
        </section>
        <section class="public-profile__section">
          <header class="public-profile__section-header">
            <h2 class="public-profile__section-title text-h5">
              {{ $t('CreatorHub.profile.sections.tiers') }}
            </h2>
          </header>
          <div v-if="loadingTiers" class="public-profile__state">
            <q-spinner-hourglass />
          </div>
          <div v-else-if="tierFetchError && !tiers.length" class="public-profile__state text-2">
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
import { defineComponent, ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  useCreatorsStore,
  fetchFundstrProfileBundle,
  fetchPublicNutzapProfile,
} from "stores/creators";
import { useNostrStore } from "stores/nostr";
import { buildProfileUrl } from "src/utils/profileUrl";
import { deriveCreatorKeys } from "src/utils/nostrKeys";

import { usePriceStore } from "stores/price";
import { useUiStore } from "stores/ui";
import SubscribeDialog from "components/SubscribeDialog.vue";
import TierSummaryCard from "components/TierSummaryCard.vue";
import MintSafetyList from "components/MintSafetyList.vue";
import RelayBadgeList from "components/RelayBadgeList.vue";
import { isTrustedUrl } from "src/utils/sanitize-url";
import { useClipboard } from "src/composables/useClipboard";
import { useWelcomeStore } from "stores/welcome";
import {
  daysToFrequency,
  type SubscriptionFrequency,
} from "src/constants/subscriptionFrequency";
import type { NutzapProfileDetails } from "@/nutzap/profileCache";

export default defineComponent({
  name: "PublicCreatorProfilePage",
  components: {
    TierSummaryCard,
    MintSafetyList,
    RelayBadgeList,
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
    const { copy } = useClipboard();
    const profile = ref<any>({});
    const nutzapProfile = ref<NutzapProfileDetails | null>(null);
    const loadingProfile = ref(false);
    const creatorTierList = computed(() =>
      creatorHex ? creators.tiersMap[creatorHex] : undefined,
    );
    const tiers = computed(() => creatorTierList.value ?? []);
    const hasInitialTierData = computed(
      () => creatorTierList.value !== undefined,
    );
    const showSubscribeDialog = ref(false);
    const selectedTier = ref<any>(null);
    const loadingTiers = ref(true);
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
      try {
        await creators.fetchTierDefinitions(creatorHex, { fundstrOnly: true });
      } finally {
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

    const loadProfile = async () => {
      const tierPromise = fetchTiers();

      if (!creatorHex) {
        nutzapProfile.value = null;
        loadingProfile.value = false;
        await tierPromise;
        return;
      }

      loadingProfile.value = true;
      nutzapProfile.value = null;
      const profilePromise = fetchFundstrProfileBundle(creatorHex)
        .then((bundle) => {
          if (!bundle) return;
          const { profile: profileData } = bundle;
          if (profileData) {
            const nextProfile = { ...profileData };
            if (nextProfile.picture && !isTrustedUrl(nextProfile.picture)) {
              delete nextProfile.picture;
            }
            profile.value = nextProfile;
          }
        })
        .catch(() => {});

      const nutzapPromise = fetchPublicNutzapProfile(creatorHex)
        .then((result) => {
          nutzapProfile.value = result?.details ?? null;
        })
        .catch((error) => {
          console.error("Failed to load Nutzap profile", error);
          nutzapProfile.value = null;
        })
        .finally(() => {
          loadingProfile.value = false;
        });

      await Promise.all([profilePromise, tierPromise, nutzapPromise]);
    };
    // initialization handled in onMounted

    const openSubscribe = (tier: any) => {
      if (!creatorHex || isGuest.value || !nostr.hasIdentity) {
        return;
      }
      selectedTier.value = tier;
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

    const profileInitials = computed(() => {
      const text = profileDisplayName.value || creatorNpub;
      return text ? text.trim().charAt(0).toUpperCase() : "";
    });

    const profileBio = computed(() => {
      if (typeof profile.value.about === "string" && profile.value.about.trim()) {
        return profile.value.about.trim();
      }
      if (typeof profile.value.bio === "string" && profile.value.bio.trim()) {
        return profile.value.bio.trim();
      }
      return "";
    });

    return {
      creatorNpub,
      creatorHex,
      decodeError,
      profile,
      nutzapProfile,
      profileDisplayName,
      profileHandle,
      profileAvatar,
      profileInitials,
      profileBio,
      tiers,
      showSubscribeDialog,
      selectedTier,
      loadingTiers,
      tierFetchError,
      loadingProfile,
      formatFiat,
      getPrice,
      frequencyLabel,
      openSubscribe,
      confirmSubscribe,
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

.public-profile__info {
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

.public-profile__bio {
  margin: 0.75rem 0 0;
}

.public-profile__content {
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
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

.public-profile__state {
  padding: 2rem 0;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
  flex-direction: column;
  gap: 0.75rem;
}

.public-profile__spinner {
  margin-left: 0.5rem;
}

.public-profile__infrastructure {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.public-profile__subsection {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.public-profile__subsection-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
}

.public-profile__info-btn {
  color: var(--text-2);
}

.public-profile__subsection-value {
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.08);
  border: 1px solid var(--surface-contrast-border);
  word-break: break-all;
  font-family: "JetBrains Mono", "Fira Mono", "Menlo", monospace;
  font-size: 0.9rem;
}

.public-profile__tier-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
