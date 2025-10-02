<template>
  <div class="bg-surface-1 text-1 q-pa-md">
    <div class="q-mb-md">
      <q-btn flat color="primary" to="/find-creators">{{
        $t("CreatorHub.profile.back")
      }}</q-btn>
    </div>
    <q-banner v-if="isGuest" class="q-mb-md bg-surface-2 text-2" icon="info">
      You're browsing as a guest. Finish setup to subscribe.
      <template #action>
        <q-btn flat color="primary" label="Finish setup" @click="gotoWelcome" />
      </template>
    </q-banner>
    <div class="bg-surface-2 q-pa-sm q-mb-md row items-center q-gutter-x-sm text-h5">
      <div>{{ profile.display_name || creatorNpub }}</div>
      <q-btn flat dense icon="content_copy" @click="copy(profileUrl)" />
    </div>
    <div v-if="profile.picture" class="q-mb-md">
      <img :src="profile.picture" style="max-width: 150px" />
    </div>
    <div v-if="profile.about" class="q-mb-md">{{ profile.about }}</div>
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
    <div v-if="followers !== null" class="text-caption q-mb-md">
      {{ $t("FindCreators.labels.followers") }}: {{ followers }} |
      {{ $t("FindCreators.labels.following") }}: {{ following }}
    </div>

    <div>
      <div class="row items-center q-mb-sm">
        <div class="text-h6 q-mr-sm">
          {{ $t("CreatorHub.profile.tiers") }}
        </div>
        <q-spinner-dots
          v-if="refreshingTiers && !loadingTiers"
          size="sm"
          class="text-2"
        />
      </div>
      <div v-if="loadingTiers" class="row justify-center q-pa-md">
        <q-spinner-hourglass />
      </div>
      <template v-else>
        <q-banner v-if="decodeError" class="q-mb-md bg-surface-2">
          {{ decodeError }}
        </q-banner>
        <template v-else>
          <q-banner
            v-if="tierFetchError && !tiers.length"
            class="q-mb-md bg-surface-2"
          >
            Failed to load tiers – check relay connectivity
            <template #action>
              <q-btn flat color="primary" @click="retryFetchTiers">Retry</q-btn>
            </template>
          </q-banner>
          <div v-else-if="!tiers.length" class="text-body1 q-mb-md">
            Creator has no subscription tiers
          </div>
          <div v-else>
            <q-expansion-item
              v-for="t in tiers"
              :key="t.id"
              class="q-mb-md tier-item bg-surface-2"
              expand-separator
            >
              <template #header>
                <div class="row items-center justify-between full-width">
                  <div class="text-subtitle1">{{ t.name }}</div>
                  <div class="text-subtitle2">
                    {{ getPrice(t) }} sats/month
                    <span v-if="priceStore.bitcoinPrice">
                      ({{ formatFiat(getPrice(t)) }})
                    </span>
                  </div>
                </div>
              </template>
              <div class="q-px-md q-pb-md">
                <div class="text-body1 q-mb-sm">{{ t.description }}</div>
                <div v-if="t.media && t.media.length">
                  <MediaPreview
                    v-for="(m, idx) in t.media"
                    :key="idx"
                    :url="m.url"
                    class="q-mt-sm"
                  />
                </div>
                <ul class="q-pl-md q-mb-none">
                  <li v-for="benefit in t.benefits" :key="benefit">
                    {{ benefit }}
                  </li>
                </ul>
                <div class="q-mt-md text-right subscribe-container">
                  <q-btn
                    label="Subscribe"
                    class="subscribe-btn"
                    :disable="isGuest"
                    @click="openSubscribe(t)"
                  >
                    <q-tooltip v-if="isGuest">Finish setup to subscribe</q-tooltip>
                  </q-btn>
                </div>
                <PaywalledContent
                  v-if="creatorHex"
                  :creator-npub="creatorHex"
                  :tier-id="t.id"
                  class="q-mt-md"
                >
                  <div>Protected content visible to subscribers.</div>
                </PaywalledContent>
              </div>
            </q-expansion-item>
          </div>
          <q-banner
            v-if="tierFetchError && tiers.length"
            class="q-mt-md bg-surface-2"
          >
            Failed to refresh tiers – check relay connectivity
            <template #action>
              <q-btn flat color="primary" @click="retryFetchTiers">Retry</q-btn>
            </template>
          </q-banner>
        </template>
      </template>
    </div>
  </div>
</template>

<script lang="ts">
import {
  defineComponent,
  ref,
  onMounted,
  onBeforeUnmount,
  computed,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCreatorsStore } from "stores/creators";
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
import MediaPreview from "components/MediaPreview.vue";
import { isTrustedUrl } from "src/utils/sanitize-url";
import { useClipboard } from "src/composables/useClipboard";
import { useWelcomeStore } from "stores/welcome";

export default defineComponent({
  name: "PublicCreatorProfilePage",
  components: { PaywalledContent, SubscriptionReceipt, MediaPreview, SetupRequiredDialog },
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
        await creators.fetchTierDefinitions(creatorHex);
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

      const profilePromise = nostr
        .getProfile(creatorHex)
        .then((p) => {
          if (!p) return;
          if (p.picture && !isTrustedUrl(p.picture)) {
            delete (p as any).picture;
          }
          profile.value = { ...p };
        })
        .catch(() => {});

      const followersPromise = nostr
        .fetchFollowerCount(creatorHex)
        .then((count) => {
          followers.value = count;
        })
        .catch(() => {});

      const followingPromise = nostr
        .fetchFollowingCount(creatorHex)
        .then((count) => {
          following.value = count;
        })
        .catch(() => {});

      await Promise.all([profilePromise, followersPromise, followingPromise]);
      await tierPromise;
    };
    // initialization handled in onMounted

    const retryFetchTiers = () => {
      void fetchTiers()
    }

    const openSubscribe = (tier: any) => {
      if (!creatorHex) {
        return
      }
      selectedTier.value = tier
      if (isGuest.value || !welcomeStore.welcomeCompleted) {
        showSetupDialog.value = true
        return
      }
      if (!nostr.hasIdentity) {
        showSetupDialog.value = true
        return
      }
      showSubscribeDialog.value = true
    }

    const gotoWelcome = () => {
      router.push({ path: '/welcome', query: { redirect: route.fullPath } })
    }

    let usedFundstrOnly = false;

    onMounted(async () => {
      try {
        await nostr.initNdkReadOnly({ fundstrOnly: true })
        usedFundstrOnly = true
      } catch (e) {
        // ignore
      }
      await loadProfile()

      if (!creatorHex) return
      const tierId = route.query.tierId as string | undefined
      if (!nostr.hasIdentity || !tierId) return
      const tryOpen = () => {
        const t = tiers.value.find((ti: any) => ti.id === tierId)
        if (t) {
          openSubscribe(t)
          router.replace({
            name: 'PublicCreatorProfile',
            params: { npubOrHex: creatorNpub },
          })
          return true
        }
        return false
      }
      if (!tryOpen()) {
        const stop = watch(tiers, () => {
          if (tryOpen()) stop()
        })
      }
    })

    onBeforeUnmount(() => {
      if (usedFundstrOnly) {
        usedFundstrOnly = false
        void nostr
          .initNdkReadOnly({ fundstrOnly: false })
          .catch(() => {})
      }
    })

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

    const profileUrl = computed(() => buildProfileUrl(creatorNpub, router))

    return {
      creatorNpub,
      creatorHex,
      decodeError,
      profile,
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
      // no markdown rendering needed
      formatFiat,
      getPrice,
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
.tier-item .subscribe-btn {
  display: inline-flex;
  background-color: var(--accent-500);
  color: var(--text-inverse);
  transition: opacity 0.2s, background-color 0.2s;
}

.tier-item .subscribe-btn:hover,
.tier-item .subscribe-btn:active {
  background-color: var(--accent-600);
}

@media (hover: hover) {
  .tier-item .subscribe-btn {
    opacity: 0;
  }

  .tier-item:hover .subscribe-btn {
    opacity: 1;
  }
}
</style>
