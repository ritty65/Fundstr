<template>
  <q-page class="fundstr-supporters q-pa-xl-xl q-pa-lg-md q-pa-md bg-surface-1 text-1">
    <CreatorProfileModal
      :show="showProfileModal"
      :pubkey="selectedProfilePubkey"
      @close="showProfileModal = false"
      @message="startChat"
      @donate="donate"
    />
    <DonateDialog v-model="showDonateDialog" :creator-pubkey="selectedPubkey" @confirm="handleDonate" />
    <SendTokenDialog />

    <div class="hero text-center q-mx-auto">
      <h1 class="text-h3 text-bold q-mb-md">Fundstr Supporters</h1>
      <p class="text-subtitle1 text-2 q-mb-xl">
        These Nostr public keys belong to early supporters and donors who help Fundstr grow.
        We are grateful for their contributions to privacy-preserving creator tools.
      </p>
      <div v-if="canShowSupportCta" class="q-mt-md">
        <q-btn color="primary" unelevated @click="supportFundstr">Want to support?</q-btn>
      </div>
    </div>

    <section class="supporters-section">
      <div v-if="loadingSupporters" class="row q-col-gutter-lg" aria-label="Loading supporters">
        <div
          v-for="placeholder in skeletonPlaceholders"
          :key="placeholder"
          class="col-12 col-sm-6 col-lg-4"
        >
          <q-skeleton type="rect" class="supporter-skeleton bg-surface-2" />
        </div>
      </div>

      <q-banner
        v-else-if="supportersError"
        rounded
        dense
        class="status-banner text-1"
        role="status"
        aria-live="polite"
      >
        <template #avatar>
          <q-icon name="warning" size="20px" />
        </template>
        <span class="status-banner__text">{{ supportersError }}</span>
      </q-banner>

      <template v-else>
        <q-banner
          v-if="supportersWarnings.length"
          rounded
          dense
          class="status-banner text-1 q-mb-lg"
          role="status"
          aria-live="polite"
        >
          <template #avatar>
            <q-icon name="info" size="20px" />
          </template>
          <div class="column">
            <span v-for="(warning, index) in supportersWarnings" :key="index" class="status-banner__text">
              {{ warning }}
            </span>
          </div>
        </q-banner>

        <div v-if="supporterProfiles.length" class="supporters-grid">
          <CreatorCard
            v-for="profile in supporterProfiles"
            :key="profile.pubkey"
            :profile="profile"
            featured
            @view-tiers="viewProfile"
            @message="startChat"
            @donate="donate"
          />
        </div>

        <div
          v-else
          class="empty-state column items-center text-center q-pt-xl q-pb-xl q-px-md text-2"
        >
          <q-icon name="favorite" size="4rem" class="q-mb-md text-accent-500" aria-hidden="true" />
          <div class="text-h6 text-1">Supporter profiles coming soon</div>
          <p class="text-body1 q-mt-sm q-mb-none">
            We&apos;re fetching supporter data from the discovery service. Please check back shortly.
          </p>
        </div>
      </template>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { nip19 } from 'nostr-tools';
import CreatorProfileModal from 'components/CreatorProfileModal.vue';
import CreatorCard from 'components/CreatorCard.vue';
import DonateDialog from 'components/DonateDialog.vue';
import SendTokenDialog from 'components/SendTokenDialog.vue';
import { createFundstrDiscoveryClient } from 'src/api/fundstrDiscovery';
import type { Creator } from 'src/lib/fundstrApi';
import { SUPPORTERS } from 'src/data/supporters';
import { useRouter } from 'vue-router';
import { useSendTokensStore } from 'stores/sendTokensStore';
import { useDonationPresetsStore } from 'stores/donationPresets';
import { useNostrStore } from 'stores/nostr';
import { useDonationPrompt } from '@/composables/useDonationPrompt';

const discoveryClient = createFundstrDiscoveryClient();
const router = useRouter();
const sendTokensStore = useSendTokensStore();
const donationStore = useDonationPresetsStore();
const nostr = useNostrStore();
const { open: openDonationPrompt, hasPaymentRails } = useDonationPrompt();
const canShowSupportCta = hasPaymentRails;

const loadingSupporters = ref(false);
const supportersError = ref('');
const supportersWarnings = ref<string[]>([]);
const supporterProfiles = ref<Creator[]>([]);

const supporterNpubs = computed(() =>
  SUPPORTERS.map((supporter) => supporter.npub).filter((npub) => typeof npub === 'string' && npub.trim().length > 0),
);

const skeletonPlaceholders = computed(() => {
  const count = supporterNpubs.value.length || 3;
  return Array.from({ length: count }, (_, index) => index);
});

onMounted(() => {
  void loadSupporterProfiles();
});

async function loadSupporterProfiles() {
  if (!supporterNpubs.value.length) {
    supporterProfiles.value = [];
    return;
  }

  loadingSupporters.value = true;
  supportersError.value = '';
  supportersWarnings.value = [];

  try {
    const response = await discoveryClient.getCreatorsByPubkeys({
      npubs: supporterNpubs.value,
      fresh: false,
      swr: true,
    });

    const results = Array.isArray(response.results) ? response.results : [];
    const warnings = Array.isArray(response.warnings)
      ? response.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
      : [];
    supportersWarnings.value = warnings;

    const profilesByHex = new Map<string, Creator>();
    for (const creator of results) {
      if (!creator || typeof creator.pubkey !== 'string') {
        continue;
      }
      const normalizedPubkey = creator.pubkey.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/i.test(normalizedPubkey)) {
        continue;
      }
      profilesByHex.set(normalizedPubkey, { ...creator, featured: true });
    }

    const resolvedProfiles: Creator[] = [];
    for (const npub of supporterNpubs.value) {
      const hex = decodeNpubToHex(npub);
      if (!hex) {
        continue;
      }
      const profile = profilesByHex.get(hex);
      if (profile) {
        resolvedProfiles.push(profile);
      }
    }

    supporterProfiles.value = resolvedProfiles;
  } catch (error) {
    console.error('[supporters] Failed to load supporter profiles', error);
    supportersError.value =
      error instanceof Error && error.message
        ? error.message
        : 'Unable to load supporter profiles right now. Please try again later.';
  } finally {
    loadingSupporters.value = false;
  }
}

function decodeNpubToHex(identifier: string): string {
  const trimmed = identifier.trim();
  if (!trimmed) {
    return '';
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.data instanceof Uint8Array) {
      return Array.from(decoded.data)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
        .toLowerCase();
    }
    if (typeof decoded.data === 'string') {
      return decoded.data.toLowerCase();
    }
    if (decoded.data && typeof (decoded.data as any).pubkey === 'string') {
      return String((decoded.data as any).pubkey).toLowerCase();
    }
  } catch (error) {
    console.warn('[supporters] Unable to decode npub', { identifier, error });
  }
  return '';
}

const showDonateDialog = ref(false);
const selectedPubkey = ref('');
const showProfileModal = ref(false);
const selectedProfilePubkey = ref('');

function viewProfile(pubkey: string) {
  selectedProfilePubkey.value = pubkey;
  showProfileModal.value = true;
}

function startChat(pubkey: string) {
  const resolvedPubkey = nostr.resolvePubkey(pubkey);
  const url = router.resolve({ path: '/nostr-messenger', query: { pubkey: resolvedPubkey } }).href;
  window.open(url, '_blank');
}

function donate(pubkey: string) {
  selectedPubkey.value = pubkey;
  showDonateDialog.value = true;
}

function supportFundstr() {
  const opened = openDonationPrompt({ bypassGate: true, defaultTab: 'nutzap' });
  console.info('[supporters] Want to support CTA clicked', { opened });
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
  if (type === 'one-time') {
    sendTokensStore.clearSendData();
    sendTokensStore.recipientPubkey = selectedPubkey.value;
    sendTokensStore.sendViaNostr = true;
    sendTokensStore.sendData.bucketId = bucketId;
    sendTokensStore.sendData.amount = amount;
    sendTokensStore.sendData.memo = message;
    sendTokensStore.sendData.p2pkPubkey = locked ? selectedPubkey.value : '';
    sendTokensStore.showLockInput = locked;
    sendTokensStore.showSendTokens = true;
  } else {
    donationStore.createDonationPreset(periods, amount, selectedPubkey.value, bucketId);
    donationStore.showCreatePresetDialog = true;
  }
  showDonateDialog.value = false;
}
</script>

<style scoped>
.fundstr-supporters {
  max-width: 1100px;
  margin: 0 auto;
}

.hero p {
  max-width: 720px;
  margin-left: auto;
  margin-right: auto;
}

.supporters-section {
  margin-top: 48px;
}

.supporters-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.supporter-skeleton {
  height: 320px;
  border-radius: 16px;
}

.empty-state {
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 16px;
  background-color: var(--surface-2);
}

.status-banner {
  background-color: var(--surface-2);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 12px 16px;
}

.status-banner__text {
  line-height: 1.4;
}
</style>
