<template>
  <QPage class="find-creators-wrapper">
    <NostrRelayErrorBanner />
    <iframe
      ref="iframeEl"
      src="/find-creators.html"
      class="find-creators-frame"
      title="Find Creators"
    />
    <DonateDialog v-model="showDonateDialog" @confirm="handleDonate" />
    <SubscribeDialog
      v-model="showSubscribeDialog"
      :tier="selectedTier"
      :supporter-pubkey="nostr.pubkey"
      :creator-pubkey="dialogNpub"
      @confirm="confirmSubscribe"
    />
    <SendTokenDialog />
    <QDialog v-model="showTierDialog">
      <QCard class="tier-dialog">
        <QCardSection class="row items-center justify-between">
          <div class="text-h6">Subscription Tiers</div>
          <QBtn dense flat icon="close" @click="showTierDialog = false" />
        </QCardSection>
        <QSeparator />
        <QCardSection v-if="loadingProfile" class="row justify-center q-pa-md">
          <q-spinner-hourglass />
        </QCardSection>
        <QCardSection v-else-if="nutzapProfile">
          <div class="text-subtitle2 q-mb-xs">P2PK public key</div>
          <div class="text-caption q-mb-sm" style="word-break: break-all">
            {{ nutzapProfile.p2pkPubkey }}
          </div>
          <div class="text-subtitle2 q-mb-xs">Trusted mints</div>
          <ul class="q-pl-md q-mb-sm text-caption">
            <li
              v-for="m in nutzapProfile.trustedMints"
              :key="m"
              style="word-break: break-all"
            >
              {{ m }}
            </li>
          </ul>
          <div class="text-subtitle2 q-mb-xs">Relays</div>
          <ul class="q-pl-md text-caption">
            <li
              v-for="r in nutzapProfile.relays"
              :key="r"
              style="word-break: break-all"
            >
              {{ r }}
            </li>
          </ul>
        </QCardSection>
        <QCardSection v-else>
          <div class="text-center">No Nutzap profile published</div>
        </QCardSection>
        <QCardSection>
          <div
            v-if="loadingTiers"
            class="column items-center q-gutter-sm q-pa-md text-center"
          >
            <q-spinner-hourglass />
            <div class="text-caption text-2">Loading tiers…</div>
          </div>
          <div
            v-else-if="tierFetchError"
            class="column items-center q-pa-md q-gutter-md"
          >
            <QBanner
              class="full-width"
              dense
              rounded
              color="negative"
              text-color="white"
              icon="warning"
            >
              We couldn't load subscription tiers. Please check your connection and
              try again.
            </QBanner>
            <QBtn flat color="primary" label="Retry" @click="retryFetchTiers" />
          </div>
          <div
            v-else-if="!tiers.length"
            class="column items-center q-pa-md q-gutter-sm text-center"
          >
            <div class="full-width">Creator has no subscription tiers</div>
            <QBtn flat color="primary" label="Retry" @click="retryFetchTiers" />
          </div>
          <div v-else>
            <QCard
              v-for="t in tiers"
              :key="t.id"
              flat
              bordered
              class="q-mb-md tier-card"
            >
              <QCardSection>
                <div class="row items-center justify-between">
                  <div class="text-subtitle1">{{ t.name }}</div>
                  <div class="text-subtitle2 text-primary">
                    {{ getPrice(t) }} sats/month
                  </div>
                </div>
                <div class="q-mt-sm">{{ t.description }}</div>
                <div v-if="t.media && t.media.length">
                  <MediaPreview
                    v-for="(m, idx) in t.media"
                    :key="idx"
                    :url="m.url"
                    class="q-mt-sm"
                  />
                </div>
                <ul class="q-pl-md q-mt-xs text-caption">
                  <li v-for="b in t.benefits" :key="b">{{ b }}</li>
                </ul>
              </QCardSection>
              <QCardActions align="right" class="subscribe-container">
                <QBtn
                  label="Subscribe"
                  color="primary"
                  class="subscribe-btn"
                  @click="openSubscribe(t)"
                />
              </QCardActions>
            </QCard>
          </div>
        </QCardSection>
      </QCard>
    </QDialog>
  </QPage>
</template>

<script setup lang="ts">
import {
  ref,
  computed,
  watch,
  onMounted,
  onBeforeUnmount,
  nextTick,
} from "vue";
import DonateDialog from "components/DonateDialog.vue";
import SubscribeDialog from "components/SubscribeDialog.vue";
import SendTokenDialog from "components/SendTokenDialog.vue";
import MediaPreview from "components/MediaPreview.vue";
import NostrRelayErrorBanner from "components/NostrRelayErrorBanner.vue";

defineOptions({ components: { MediaPreview } });
import { useSendTokensStore } from "stores/sendTokensStore";
import { useDonationPresetsStore } from "stores/donationPresets";
import { useCreatorsStore } from "stores/creators";
import { useNostrStore } from "stores/nostr";
import { notifyWarning } from "src/js/notify";
import { useRouter, useRoute } from "vue-router";
import { useMessengerStore } from "stores/messenger";
import { useI18n } from "vue-i18n";
import {
  QDialog,
  QCard,
  QCardSection,
  QCardActions,
  QBtn,
  QBanner,
  QSeparator,
  QPage,
  useQuasar,
} from "quasar";
import { nip19 } from "nostr-tools";
import { queryNutzapProfile, toHex } from "@/nostr/relayClient";
import type { NostrEvent } from "@/nostr/relayClient";
import { fallbackDiscoverRelays } from "@/nostr/discovery";
import { FUNDSTR_REQ_URL, WS_FIRST_TIMEOUT_MS } from "@/nutzap/relayEndpoints";
import {
  parseNutzapProfileEvent,
  type NutzapProfileDetails,
} from "@/nutzap/profileCache";
import type { PrefillCreatorCacheEntry } from "stores/creators";

const props = defineProps<{ npubOrHex?: string }>();

const iframeEl = ref<HTMLIFrameElement | null>(null);
const iframeLoaded = ref(false);
const showDonateDialog = ref(false);
const selectedPubkey = ref("");
const showTierDialog = ref(false);
const loadingTiers = ref(false);
const dialogPubkey = ref(""); // always 64-char hex
const dialogNpub = computed(() => {
  const hex = dialogPubkey.value;
  if (hex.length === 64 && /^[0-9a-f]{64}$/i.test(hex))
    return nip19.npubEncode(hex);
  return "";
});

const sendTokensStore = useSendTokensStore();
const donationStore = useDonationPresetsStore();
const creators = useCreatorsStore();
const nostr = useNostrStore();
const messenger = useMessengerStore();
const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const $q = useQuasar();
const tiers = computed(() => creators.tiersMap[dialogPubkey.value] || []);
const CUSTOM_LINK_WS_TIMEOUT_MS = Math.min(WS_FIRST_TIMEOUT_MS, 1200);
let usedFundstrOnly = false;
const tierFetchError = computed(() => creators.tierFetchError);
const showSubscribeDialog = ref(false);
const selectedTier = ref<any>(null);
const nutzapProfile = ref<NutzapProfileDetails | null>(null);
const loadingProfile = ref(false);
const lastRelayHints = ref<string[]>([]);
let tierTimeout: ReturnType<typeof setTimeout> | null = null;

const prefillEntries = computed(() => creators.prefillCacheEntries);
let lastPrefillSignature = "";

function sendPrefillCache(entries?: PrefillCreatorCacheEntry[]) {
  if (!iframeEl.value || !iframeLoaded.value) return;
  const payload = entries ?? prefillEntries.value;
  if (!payload.length) return;
  const serialized = JSON.stringify(payload);
  if (serialized === lastPrefillSignature) return;
  lastPrefillSignature = serialized;
  iframeEl.value.contentWindow?.postMessage(
    { type: "prefillCache", creators: payload },
    "*",
  );
}

// Deep-link: show tiers dialog immediately (spinner until data resolves)
watch(
  () => props.npubOrHex,
  (value) => {
    if (typeof value === "string" && value.trim()) {
      showTierDialog.value = true;
      void viewCreatorProfile(value, { openDialog: false });
    }
  },
  { immediate: true },
);

watch(
  prefillEntries,
  (entries) => {
    if (!entries.length) {
      lastPrefillSignature = "";
      return;
    }
    if (iframeLoaded.value) {
      sendPrefillCache(entries);
    }
  },
  { deep: true },
);

function sendTheme() {
  iframeEl.value?.contentWindow?.postMessage(
    { type: "set-theme", dark: $q.dark.isActive },
    "*",
  );
}

function onIframeLoad() {
  iframeLoaded.value = true;
  sendTheme();
  sendPrefillCache();
}

watch(
  () => $q.dark.isActive,
  () => {
    if (iframeLoaded.value) sendTheme();
  },
);

function getPrice(t: any): number {
  return t.price_sats ?? t.price ?? 0;
}

async function fetchProfileWithFallback(
  pubkeyInput: string,
  opts: { fundstrOnly?: boolean } = {},
) {
  let hex: string;
  try {
    hex = toHex(pubkeyInput);
  } catch (err) {
    console.error("Invalid pubkey for profile fetch", err);
    return {
      event: null,
      details: null,
      relayHints: [],
      pubkeyHex: "",
    };
  }

  const relayHints = new Set<string>();
  const fundstrOnly = opts.fundstrOnly === true;
  let event: NostrEvent | null = null;
  try {
    event = await queryNutzapProfile(hex, {
      httpBase: FUNDSTR_REQ_URL,
      allowFanoutFallback: false,
      wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
    });
  } catch (e) {
    console.error("Failed to query Nutzap profile", e);
  }

  if (!event && !fundstrOnly) {
    try {
      const discovered = await fallbackDiscoverRelays(hex);
      for (const url of discovered) relayHints.add(url);
      if (relayHints.size) {
        event = await queryNutzapProfile(hex, {
          httpBase: FUNDSTR_REQ_URL,
          fanout: Array.from(relayHints),
          allowFanoutFallback: true,
          wsTimeoutMs: CUSTOM_LINK_WS_TIMEOUT_MS,
        });
      }
    } catch (e) {
      console.error("NIP-65 discovery failed", e);
    }
  }

  if (event) {
    for (const tag of event.tags || []) {
      if (tag[0] === "relay" && typeof tag[1] === "string" && tag[1]) {
        relayHints.add(tag[1]);
      }
    }
  }

  const details = parseNutzapProfileEvent(event);
  if (details) {
    for (const relay of details.relays) relayHints.add(relay);
  }

  return {
    event,
    details,
    relayHints: Array.from(relayHints),
    pubkeyHex: hex,
  };
}

async function viewCreatorProfile(
  pubkeyInput: string,
  opts: { openDialog?: boolean; fundstrOnly?: boolean } = {},
) {
  const trimmed = typeof pubkeyInput === "string" ? pubkeyInput.trim() : "";
  if (!trimmed) return;

  const { openDialog = true, fundstrOnly = true } = opts;
  let pubkeyHex: string;
  try {
    pubkeyHex = toHex(trimmed);
  } catch (e) {
    console.error("Invalid creator pubkey", e);
    loadingProfile.value = false;
    loadingTiers.value = false;
    return;
  }

  dialogPubkey.value = pubkeyHex;
  selectedPubkey.value = pubkeyHex;
  selectedTier.value = null;

  const cache = await creators.ensureCreatorCacheFromDexie(pubkeyHex);
  const cachedProfile = cache?.profileDetails ?? null;
  const cachedProfileLoaded = cache?.profileLoaded === true;
  const cachedTiersLoaded = cache?.tiersLoaded === true;

  if (cachedProfileLoaded) {
    nutzapProfile.value = cachedProfile;
    lastRelayHints.value = cachedProfile?.relays
      ? [...cachedProfile.relays]
      : [];
  } else {
    nutzapProfile.value = null;
    lastRelayHints.value = [];
  }

  loadingProfile.value = !cachedProfileLoaded;
  const needsTierFetch = !cachedTiersLoaded;
  loadingTiers.value = needsTierFetch;

  if (tierTimeout) {
    clearTimeout(tierTimeout);
    tierTimeout = null;
  }
  if (needsTierFetch) {
    tierTimeout = setTimeout(() => {
      loadingTiers.value = false;
    }, 5000);
  }

  let profileResult: Awaited<ReturnType<typeof fetchProfileWithFallback>> | null =
    null;
  if (!cachedProfileLoaded) {
    try {
      profileResult = await fetchProfileWithFallback(trimmed, { fundstrOnly });
    } catch (e) {
      console.error("Failed to fetch creator profile", e);
    }

    if (profileResult && profileResult.pubkeyHex) {
      dialogPubkey.value = profileResult.pubkeyHex;
      selectedPubkey.value = profileResult.pubkeyHex;
      nutzapProfile.value = profileResult.details ?? null;
      lastRelayHints.value = profileResult.relayHints;
      creators
        .saveProfileCache(
          profileResult.pubkeyHex,
          profileResult.event,
          profileResult.details,
        )
        .catch((err) =>
          console.error("Failed to cache Nutzap profile", err),
        );
    }
  }

  loadingProfile.value = false;

  if (needsTierFetch) {
    try {
      await creators.fetchTierDefinitions(pubkeyHex, {
        relayHints: lastRelayHints.value,
        fundstrOnly,
      });
    } catch (e) {
      console.error("Failed to fetch tier definitions", e);
    } finally {
      if (tierTimeout) {
        clearTimeout(tierTimeout);
        tierTimeout = null;
      }
      loadingTiers.value = false;
    }
  } else {
    if (tierTimeout) {
      clearTimeout(tierTimeout);
      tierTimeout = null;
    }
    loadingTiers.value = false;
  }

  if (openDialog) {
    await nextTick();
    showTierDialog.value = true;
  }
}

function onMessage(ev: MessageEvent) {
  if (ev.data && ev.data.type === "donate" && ev.data.pubkey) {
    try {
      selectedPubkey.value = toHex(ev.data.pubkey);
    } catch {
      selectedPubkey.value = ev.data.pubkey;
    }
    showDonateDialog.value = true;
  } else if (ev.data && ev.data.type === "viewProfile" && ev.data.pubkey) {
    // Creator iframe deep link: open dialog first, populate once data loads
    showTierDialog.value = true;
    void viewCreatorProfile(ev.data.pubkey, { openDialog: false });
  } else if (ev.data && ev.data.type === "startChat" && ev.data.pubkey) {
    const pubkey = nostr.resolvePubkey(ev.data.pubkey);
    router.push({ path: "/nostr-messenger", query: { pubkey } });
    const stop = watch(
      () => messenger.started,
      (started) => {
        if (started) {
          messenger.startChat(pubkey);
          stop();
        }
      },
    );
  }
}

watch(tiers, (val) => {
  if (val.length > 0) {
    loadingTiers.value = false;
    if (tierTimeout) clearTimeout(tierTimeout);
  }
});

watch(tierFetchError, (val) => {
  if (val) {
    loadingTiers.value = false;
    if (tierTimeout) clearTimeout(tierTimeout);
  }
});

watch(
  () => $q.dark.isActive,
  () => {
    sendTheme();
  },
);

watch(showTierDialog, (val) => {
  if (!val) {
    nutzapProfile.value = null;
    loadingProfile.value = false;
    lastRelayHints.value = [];
  }
});

function openSubscribe(tier: any) {
  selectedTier.value = tier;
  showSubscribeDialog.value = true;
}

function retryFetchTiers() {
  if (!dialogPubkey.value) return;
  loadingTiers.value = true;
  if (tierTimeout) clearTimeout(tierTimeout);
  tierTimeout = setTimeout(() => {
    loadingTiers.value = false;
  }, 5000);
  creators.fetchTierDefinitions(dialogPubkey.value, {
    relayHints: lastRelayHints.value,
    fundstrOnly: true,
  });
}

function confirmSubscribe({ bucketId, periods, amount, startDate, total }: any) {
  // Nutzap transaction is handled within SubscribeDialog.
  // Close surrounding dialogs and process any additional UI updates here.
  showSubscribeDialog.value = false;
  showTierDialog.value = false;
}

function handleDonate({
  bucketId,
  locked,
  type,
  amount,
  periods,
  message,
}: any) {
  if (!selectedPubkey.value) return;
  if (type === "one-time") {
    sendTokensStore.clearSendData();
    sendTokensStore.recipientPubkey = selectedPubkey.value;
    sendTokensStore.sendViaNostr = true;
    sendTokensStore.sendData.bucketId = bucketId;
    sendTokensStore.sendData.amount = amount;
    sendTokensStore.sendData.memo = message;
    sendTokensStore.sendData.p2pkPubkey = locked ? selectedPubkey.value : "";
    sendTokensStore.showLockInput = locked;
    showDonateDialog.value = false;
    sendTokensStore.showSendTokens = true;
  } else {
    donationStore.createDonationPreset(
      periods,
      amount,
      selectedPubkey.value,
      bucketId,
    );
    showDonateDialog.value = false;
  }
}

onMounted(async () => {
  window.addEventListener("message", onMessage);
  iframeEl.value?.addEventListener("load", onIframeLoad);
  const npub = route.query.npub;
  try {
    if (typeof npub === "string" && npub) {
      await nostr.initNdkReadOnly({ fundstrOnly: true });
      usedFundstrOnly = true;
    } else {
      await nostr.initNdkReadOnly();
    }
  } catch (e: any) {
    notifyWarning("Failed to connect to Nostr relays", e?.message);
  }

  if (typeof npub === "string" && npub) {
    try {
      nip19.decode(npub);
      router.replace({
        name: "PublicCreatorProfile",
        params: { npubOrHex: npub },
      });
      return;
    } catch {
      if (iframeEl.value) {
        iframeEl.value.addEventListener(
          "load",
          () => {
            iframeEl.value?.contentWindow?.postMessage(
              { type: "prefillSearch", npub },
              "*",
            );
          },
          { once: true },
        );
      }
    }
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("message", onMessage);
  iframeEl.value?.removeEventListener("load", onIframeLoad);
  if (tierTimeout) clearTimeout(tierTimeout);
  nutzapProfile.value = null;
  loadingProfile.value = false;
  if (usedFundstrOnly) {
    usedFundstrOnly = false;
    void nostr
      .initNdkReadOnly({ fundstrOnly: false })
      .catch(() => {});
  }
});
</script>

<style scoped>
.find-creators-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 0;
  margin: 0;
}

.find-creators-frame {
  border: none;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
}

.tier-dialog {
  width: 100%;
  max-width: 500px;
}

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
