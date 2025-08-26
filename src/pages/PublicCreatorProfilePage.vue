<template>
  <div
    :class="[
      $q.dark.isActive ? 'bg-dark text-white' : 'bg-white text-dark',
      'q-pa-md',
    ]"
  >
    <div class="q-mb-md">
      <q-btn flat color="primary" to="/find-creators">{{
        $t("CreatorHub.profile.back")
      }}</q-btn>
    </div>
    <div class="text-h5 q-mb-md row items-center q-gutter-x-sm">
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
      :creator-pubkey="creatorHex"
      @confirm="confirmSubscribe"
    />
    <SubscriptionReceipt
      v-model="showReceiptDialog"
      :receipts="receiptList"
    />
    <div v-if="followers !== null" class="text-caption q-mb-md">
      {{ $t("FindCreators.labels.followers") }}: {{ followers }} |
      {{ $t("FindCreators.labels.following") }}: {{ following }}
    </div>

    <div>
      <div class="text-h6 q-mb-sm">
        {{ $t("CreatorHub.profile.tiers") }}
      </div>
      <div v-if="loadingTiers" class="row justify-center q-pa-md">
        <q-spinner-hourglass />
      </div>
      <q-banner v-else-if="tierFetchError" class="q-mb-md">
        Failed to load tiers – check relay connectivity
        <template #action>
          <q-btn flat color="primary" @click="retryFetchTiers">Retry</q-btn>
        </template>
      </q-banner>
      <div v-else-if="!tiers.length" class="text-body1 q-mb-md">
        Creator has no subscription tiers
      </div>
      <div v-else>
        <q-card
          v-for="t in tiers"
          :key="t.id"
          flat
          bordered
          class="q-mb-md tier-card"
        >
          <q-card-section class="row items-center justify-between bg-grey-2">
            <div class="text-subtitle1">{{ t.name }}</div>
            <div class="text-subtitle2">
              {{ getPrice(t) }} sats/month
              <span v-if="priceStore.bitcoinPrice">
                ({{ formatFiat(getPrice(t)) }})
              </span>
            </div>
          </q-card-section>
          <q-card-section>
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
                color="primary"
                class="subscribe-btn"
                @click="openSubscribe(t)"
              />
            </div>
            <PaywalledContent
              :creator-npub="creatorHex"
              :tier-id="t.id"
              class="q-mt-md"
            >
              <div>Protected content visible to subscribers.</div>
            </PaywalledContent>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useCreatorsStore } from "stores/creators";
import { useNostrStore } from "stores/nostr";
import { buildProfileUrl } from "src/utils/profileUrl";
import { nip19 } from "nostr-tools";

import { usePriceStore } from "stores/price";
import { useUiStore } from "stores/ui";
import SubscribeDialog from "components/SubscribeDialog.vue";
import SubscriptionReceipt from "components/SubscriptionReceipt.vue";
import { useI18n } from "vue-i18n";
import PaywalledContent from "components/PaywalledContent.vue";
import MediaPreview from "components/MediaPreview.vue";
import { isTrustedUrl } from "src/utils/sanitize-url";
import { useClipboard } from "src/composables/useClipboard";

export default defineComponent({
  name: "PublicCreatorProfilePage",
  components: { PaywalledContent, SubscriptionReceipt, MediaPreview },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const creatorNpub = route.params.npub as string;
    let creatorHex = creatorNpub;
    try {
      const decoded = nip19.decode(creatorNpub);
      if (typeof decoded.data === "string") {
        creatorHex = decoded.data;
      }
    } catch (e) {
      // ignore decode error and keep original value
    }
    const creators = useCreatorsStore();
    const nostr = useNostrStore();
    const priceStore = usePriceStore();
    const uiStore = useUiStore();
    const { t } = useI18n();
    const { copy } = useClipboard();
    const bitcoinPrice = computed(() => priceStore.bitcoinPrice);
    const profile = ref<any>({});
    const tiers = computed(() => creators.tiersMap[creatorHex] || []);
    const showSubscribeDialog = ref(false);
    const showReceiptDialog = ref(false);
    const receiptList = ref<any[]>([]);
    const selectedTier = ref<any>(null);
    const followers = ref<number | null>(null);
    const following = ref<number | null>(null);
    const loadingTiers = ref(true);
    const tierFetchError = computed(() => creators.tierFetchError);

    const fetchTiers = async () => {
      loadingTiers.value = true;
      try {
        await creators.fetchTierDefinitions(creatorHex);
      } finally {
        loadingTiers.value = false;
      }
    };

    const loadProfile = async () => {
      await fetchTiers()
      const p = await nostr.getProfile(creatorHex)
      if (p) {
        if (p.picture && !isTrustedUrl(p.picture)) {
          delete (p as any).picture
        }
        profile.value = { ...p }
      }
      followers.value = await nostr.fetchFollowerCount(creatorHex)
      following.value = await nostr.fetchFollowingCount(creatorHex)
    }
    // initialization handled in onMounted

    const retryFetchTiers = () => {
      fetchTiers()
    }

    const openSubscribe = (tier: any) => {
      selectedTier.value = tier
      if (!nostr.pubkey && !nostr.signer) {
        router.push({
          path: '/nostr-login',
          query: { redirect: route.fullPath, tierId: tier.id },
        })
        return
      }
      showSubscribeDialog.value = true
    }

    onMounted(async () => {
      try {
        await nostr.initNdkReadOnly()
      } catch (e) {
        // ignore
      }
      await loadProfile()

      const tierId = route.query.tierId as string | undefined
      if (!nostr.pubkey || !tierId) return
      const tryOpen = () => {
        const t = tiers.value.find((ti: any) => ti.id === tierId)
        if (t) {
          openSubscribe(t)
          router.replace({
            name: 'PublicCreatorProfile',
            params: { npub: creatorNpub },
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
      profile,
      tiers,
      showSubscribeDialog,
      showReceiptDialog,
      receiptList,
      selectedTier,
      followers,
      following,
      loadingTiers,
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
    };
  },
});
</script>

<style scoped>
.tier-card .subscribe-btn {
  display: inline-flex;
}

@media (hover: hover) {
  .tier-card .subscribe-btn {
    display: none;
  }

  .tier-card:hover .subscribe-btn {
    display: inline-flex;
  }
}
</style>
