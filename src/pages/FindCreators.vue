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
        <QCardSection class="tier-dialog__top">
          <div class="tier-dialog__hero">
            <div class="tier-dialog__identity">
              <div class="tier-dialog__avatar">
                <img
                  v-if="heroAvatarUrl"
                  :src="heroAvatarUrl"
                  :alt="`${heroTitle} avatar`"
                  class="tier-dialog__avatar-image"
                />
                <div v-else class="tier-dialog__avatar-fallback">
                  {{ heroInitial }}
                </div>
              </div>
              <div class="tier-dialog__meta">
                <div class="tier-dialog__title text-1">{{ heroTitle }}</div>
                <div v-if="heroAbout" class="tier-dialog__subtitle text-2">
                  {{ heroAbout }}
                </div>
              </div>
            </div>
            <div class="tier-dialog__actions">
              <QBtn
                color="primary"
                unelevated
                class="tier-dialog__cta"
                label="Subscribe"
                :disable="!canSubscribe"
                @click="openHeroSubscribe"
              />
              <QBtn
                outline
                color="primary"
                class="tier-dialog__cta"
                icon="volunteer_activism"
                label="Donate"
                :disable="!dialogPubkey"
                @click="openHeroDonate"
              />
              <QBtn
                outline
                color="primary"
                class="tier-dialog__cta"
                icon="chat"
                label="Message"
                :disable="!dialogPubkey"
                @click="startChatWithCreator"
              />
              <QBtn
                dense
                flat
                round
                icon="close"
                class="tier-dialog__close"
                @click="showTierDialog = false"
              />
            </div>
          </div>
        </QCardSection>
        <QSeparator />
        <QCardSection class="tier-dialog__body">
          <div class="tier-dialog__grid">
            <section class="tier-dialog__column tier-dialog__column--primary">
              <div class="section-header">
                <div>
                  <h3 class="section-title">Subscription tiers</h3>
                  <p class="section-caption text-2">
                    Choose a tier that matches your support cadence.
                  </p>
                </div>
              </div>
              <div class="tier-list">
                <div
                  v-if="loadingTiers"
                  class="tier-list__state tier-list__state--loading"
                >
                  <q-spinner-hourglass size="24px" />
                  <div class="text-caption text-2">Loading tiers…</div>
                </div>
                <div
                  v-else-if="tierFetchError"
                  class="tier-list__state tier-list__state--error"
                >
                  <QBanner
                    class="full-width"
                    dense
                    rounded
                    color="negative"
                    text-color="white"
                    icon="warning"
                  >
                    We couldn't load subscription tiers. Please check your connection and try again.
                  </QBanner>
                  <QBtn flat color="primary" label="Retry" @click="retryFetchTiers" />
                </div>
                <div
                  v-else-if="!tiers.length"
                  class="tier-list__state tier-list__state--empty"
                >
                  <div class="text-1">Creator has no subscription tiers yet.</div>
                  <QBtn flat color="primary" label="Retry" @click="retryFetchTiers" />
                </div>
                <div v-else class="tier-card-grid">
                  <article
                    v-for="t in tiers"
                    :key="t.id"
                    class="tier-card"
                  >
                    <header class="tier-card__header">
                      <div>
                        <h4 class="tier-card__title">{{ t.name }}</h4>
                        <p v-if="t.description" class="tier-card__description text-2">
                          {{ t.description }}
                        </p>
                      </div>
                      <div class="tier-card__pricing">
                        <div class="tier-card__sats">
                          {{ formatSats(getPrice(t)) }} sats
                        </div>
                        <div v-if="formatFiat(getPrice(t))" class="tier-card__fiat text-2">
                          ≈ {{ formatFiat(getPrice(t)) }}
                        </div>
                        <div class="tier-card__frequency text-2">
                          {{ frequencyLabel(t) }}
                        </div>
                      </div>
                    </header>
                    <div
                      v-if="Array.isArray(t.benefits) && t.benefits.length"
                      class="tier-card__benefits"
                    >
                      <h5 class="tier-card__section-title text-2">Benefits</h5>
                      <ul class="tier-card__benefit-list">
                        <li
                          v-for="benefit in t.benefits"
                          :key="benefit"
                          class="tier-card__benefit"
                        >
                          {{ benefit }}
                        </li>
                      </ul>
                    </div>
                    <div v-if="t.media && t.media.length" class="tier-card__media">
                      <MediaPreview
                        v-for="(m, idx) in t.media"
                        :key="idx"
                        :url="m.url"
                      />
                    </div>
                    <footer class="tier-card__footer">
                      <QBtn
                        color="primary"
                        class="tier-card__subscribe"
                        label="Subscribe"
                        @click="openSubscribe(t)"
                      />
                    </footer>
                  </article>
                </div>
              </div>
            </section>
            <aside class="tier-dialog__column tier-dialog__column--secondary">
              <section v-if="highlightBenefits.length" class="info-panel">
                <h3 class="section-title">Benefit highlights</h3>
                <ul class="benefit-list">
                  <li
                    v-for="benefit in highlightBenefits"
                    :key="benefit"
                    class="benefit-list__item"
                  >
                    {{ benefit }}
                  </li>
                </ul>
              </section>
              <section class="info-panel">
                <div class="info-panel__header">
                  <h3 class="section-title">Infrastructure trust</h3>
                  <q-spinner-hourglass
                    v-if="loadingProfile"
                    size="18px"
                    class="info-panel__spinner"
                  />
                </div>
                <div v-if="nutzapProfile" class="info-panel__body">
                  <div v-if="nutzapProfile.p2pkPubkey" class="info-subsection">
                    <div class="info-subsection__label text-2">P2PK public key</div>
                    <code class="info-subsection__value">{{ nutzapProfile.p2pkPubkey }}</code>
                  </div>
                  <div class="info-subsection">
                    <div class="info-subsection__label text-2">Trusted mints</div>
                    <MintSafetyList :mints="nutzapProfile.trustedMints" />
                  </div>
                  <div class="info-subsection">
                    <div class="info-subsection__label text-2">Relays</div>
                    <RelayBadgeList :relays="nutzapProfile.relays" />
                  </div>
                </div>
                <div
                  v-else-if="loadingProfile"
                  class="info-panel__body info-panel__body--state text-2"
                >
                  Loading infrastructure…
                </div>
                <div
                  v-else
                  class="info-panel__body info-panel__body--state text-2"
                >
                  Creator hasn't published infrastructure details yet.
                </div>
              </section>
            </aside>
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
import MintSafetyList from "components/MintSafetyList.vue";
import RelayBadgeList from "components/RelayBadgeList.vue";

defineOptions({ components: { MediaPreview, MintSafetyList, RelayBadgeList } });
import { useSendTokensStore } from "stores/sendTokensStore";
import { useDonationPresetsStore } from "stores/donationPresets";
import { useCreatorsStore } from "stores/creators";
import { useNostrStore } from "stores/nostr";
import { notifyWarning } from "src/js/notify";
import { useRouter, useRoute } from "vue-router";
import { useMessengerStore } from "stores/messenger";
import {
  QDialog,
  QCard,
  QCardSection,
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
import { usePriceStore } from "stores/price";
import { useUiStore } from "stores/ui";
import {
  daysToFrequency,
  type SubscriptionFrequency,
} from "src/constants/subscriptionFrequency";
import { isTrustedUrl } from "src/utils/sanitize-url";

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
const $q = useQuasar();
const priceStore = usePriceStore();
const uiStore = useUiStore();
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
type HeroMetadata = {
  displayName?: string;
  name?: string;
  about?: string;
  picture?: string;
};
const heroMetadata = ref<HeroMetadata>({});

const canSubscribe = computed(
  () => !loadingTiers.value && !tierFetchError.value && tiers.value.length > 0,
);
const heroTitle = computed(() => {
  const display = heroMetadata.value.displayName?.trim();
  if (display) return display;
  const name = heroMetadata.value.name?.trim();
  if (name) return name;
  const npub = dialogNpub.value;
  if (npub) return `${npub.slice(0, 10)}…${npub.slice(-6)}`;
  const hex = dialogPubkey.value;
  if (hex) return `${hex.slice(0, 8)}…${hex.slice(-4)}`;
  return "Creator";
});
const heroAbout = computed(() => heroMetadata.value.about?.trim() ?? "");
const heroAvatarUrl = computed(() => {
  const candidate = heroMetadata.value.picture?.trim();
  if (candidate && isTrustedUrl(candidate)) return candidate;
  return "";
});
const heroInitial = computed(() =>
  heroTitle.value ? heroTitle.value.charAt(0).toUpperCase() : "C",
);
const highlightBenefits = computed(() => {
  const seen = new Set<string>();
  const benefits: string[] = [];
  for (const tier of tiers.value) {
    if (!Array.isArray(tier?.benefits)) continue;
    for (const rawBenefit of tier.benefits as string[]) {
      if (benefits.length >= 6) break;
      if (typeof rawBenefit !== "string") continue;
      const normalized = rawBenefit.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      benefits.push(normalized);
    }
    if (benefits.length >= 6) break;
  }
  return benefits;
});

function hasHeroMetadata(meta: HeroMetadata): boolean {
  return [meta.displayName, meta.name, meta.about, meta.picture].some(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

function extractHeroMetadata(source: any): HeroMetadata {
  const metadata: HeroMetadata = {};
  if (!source) return metadata;

  const fromObject = (obj: Record<string, any>) => {
    if (typeof obj.display_name === "string") {
      metadata.displayName = obj.display_name;
    }
    if (typeof obj.name === "string") {
      metadata.name = obj.name;
    }
    if (typeof obj.about === "string") {
      metadata.about = obj.about;
    }
    if (typeof obj.picture === "string") {
      metadata.picture = obj.picture;
    } else if (typeof obj.image === "string") {
      metadata.picture = obj.image;
    }
  };

  if (source.profile && typeof source.profile === "object") {
    fromObject(source.profile as Record<string, any>);
  }

  const eventContent =
    typeof source.profileEvent?.content === "string"
      ? source.profileEvent.content
      : typeof source.event?.content === "string"
        ? source.event.content
        : typeof source.content === "string"
          ? source.content
          : "";

  if (eventContent) {
    try {
      const parsed = JSON.parse(eventContent) as Record<string, any>;
      if (parsed && typeof parsed === "object") {
        fromObject(parsed);
      }
    } catch (error) {
      console.warn("Failed to parse profile metadata", error);
    }
  }

  return metadata;
}

function updateHeroMetadata(source: any, options: { preserveExisting?: boolean } = {}) {
  const { preserveExisting = false } = options;
  const next = extractHeroMetadata(source);
  if (preserveExisting && !hasHeroMetadata(next)) {
    return;
  }
  heroMetadata.value = next;
}

function formatSats(value: number): string {
  return new Intl.NumberFormat(navigator.language).format(value);
}

function formatFiat(sats: number): string {
  const price = Number(priceStore.bitcoinPrice);
  if (!price) return "";
  const usdValue = (price / 100000000) * sats;
  return uiStore.formatCurrency(usdValue, "USD", true);
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

function openHeroSubscribe() {
  if (!tiers.value.length) return;
  openSubscribe(tiers.value[0]);
}

function openHeroDonate() {
  if (!dialogPubkey.value) return;
  selectedPubkey.value = dialogPubkey.value;
  showDonateDialog.value = true;
}

function startChatWithCreator() {
  if (!dialogPubkey.value) return;
  const pubkey = nostr.resolvePubkey(dialogPubkey.value);
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

  updateHeroMetadata(cache);

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
      updateHeroMetadata(profileResult, { preserveExisting: true });
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
    heroMetadata.value = {};
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
  max-width: 960px;
  background: var(--surface-2);
  color: var(--text-1);
}

.tier-dialog__top {
  padding: 1.5rem 1.75rem 1.25rem;
}

.tier-dialog__body {
  padding: 1.5rem 1.75rem 1.75rem;
}

.tier-dialog__hero {
  display: flex;
  align-items: stretch;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.tier-dialog__identity {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
  flex: 1 1 auto;
}

.tier-dialog__avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: var(--surface-1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--accent-500);
  border: 2px solid var(--surface-contrast-border);
  overflow: hidden;
}

.tier-dialog__avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.tier-dialog__avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--accent-200);
  color: var(--accent-600);
}

.tier-dialog__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.tier-dialog__title {
  font-size: 1.375rem;
  font-weight: 600;
}

.tier-dialog__subtitle {
  font-size: 0.95rem;
  line-height: 1.4;
  max-width: 48ch;
}

.tier-dialog__actions {
  margin-left: auto;
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.tier-dialog__cta {
  min-width: 140px;
}

.tier-dialog__close {
  color: var(--text-2);
}

.tier-dialog__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: 1.75rem;
}

.tier-dialog__column--secondary {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.section-caption {
  font-size: 0.9rem;
  margin: 0.35rem 0 0;
}

.tier-list__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 2rem 1.5rem;
  text-align: center;
  border: 1px dashed var(--surface-contrast-border);
  border-radius: 1rem;
  background: rgba(0, 0, 0, 0.02);
}

.tier-card-grid {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}

.tier-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 1.25rem;
  padding: 1.25rem 1.5rem;
  box-shadow: 0 16px 28px rgba(18, 18, 23, 0.08);
}

.tier-card__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
}

.tier-card__title {
  font-size: 1.15rem;
  font-weight: 600;
  margin: 0;
}

.tier-card__description {
  margin: 0.5rem 0 0;
  line-height: 1.4;
}

.tier-card__pricing {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.25rem;
  white-space: nowrap;
}

.tier-card__sats {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--accent-500);
}

.tier-card__fiat {
  font-size: 0.85rem;
}

.tier-card__frequency {
  font-size: 0.85rem;
}

.tier-card__benefits {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tier-card__section-title {
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin: 0;
}

.tier-card__benefit-list {
  display: grid;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.tier-card__benefit {
  position: relative;
  padding-left: 1.25rem;
  font-size: 0.95rem;
  line-height: 1.4;
}

.tier-card__benefit::before {
  content: "";
  position: absolute;
  top: 0.55rem;
  left: 0.35rem;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-500);
}

.tier-card__media {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.tier-card__footer {
  margin-top: auto;
  display: flex;
  justify-content: flex-end;
}

.tier-card__subscribe {
  min-width: 140px;
}

.info-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border);
  border-left: 4px solid var(--accent-500);
  border-radius: 1rem;
  padding: 1.25rem 1.5rem;
}

.info-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.info-panel__spinner {
  color: var(--accent-500);
}

.info-panel__body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.info-panel__body--state {
  align-items: center;
  justify-content: center;
  text-align: center;
  min-height: 80px;
}

.info-subsection {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.info-subsection__label {
  font-size: 0.85rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}

.info-subsection__value {
  font-family: "SFMono-Regular", "Fira Code", "Courier New", monospace;
  font-size: 0.85rem;
  word-break: break-all;
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-1);
}

.benefit-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.benefit-list__item {
  padding: 0.5rem 0.75rem;
  border-radius: 0.75rem;
  border: 1px solid var(--surface-contrast-border);
  background: rgba(255, 255, 255, 0.04);
  font-size: 0.95rem;
  line-height: 1.4;
}

@media (max-width: 1080px) {
  .tier-dialog__grid {
    grid-template-columns: 1fr;
  }

  .tier-dialog__actions {
    justify-content: flex-start;
  }
}

@media (max-width: 720px) {
  .tier-dialog__hero {
    flex-direction: column;
    align-items: stretch;
  }

  .tier-dialog__avatar {
    width: 64px;
    height: 64px;
  }

  .tier-dialog__actions {
    width: 100%;
    gap: 0.5rem;
  }

  .tier-dialog__cta {
    flex: 1 1 100%;
    min-width: 0;
  }

  .tier-card {
    padding: 1.1rem 1.25rem;
  }
}
</style>
