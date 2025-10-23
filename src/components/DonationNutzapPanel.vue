<template>
  <section class="nutzap-panel">
    <div v-if="panelLoading" class="nutzap-panel__skeleton">
      <div class="nutzap-panel__skeleton-header">
        <q-skeleton type="circle" size="56px" />
        <div class="column q-gutter-xs q-pl-sm">
          <q-skeleton type="text" width="140px" />
          <q-skeleton type="text" width="120px" />
        </div>
      </div>
      <div class="row q-col-gutter-sm q-mt-md">
        <div class="col">
          <q-skeleton type="rect" class="nutzap-panel__skeleton-card" />
        </div>
        <div class="col">
          <q-skeleton type="rect" class="nutzap-panel__skeleton-card" />
        </div>
      </div>
    </div>
    <q-banner
      v-else-if="panelError"
      rounded
      dense
      class="nutzap-panel__error text-1"
      role="status"
      aria-live="polite"
    >
      <template #avatar>
        <q-icon name="warning" size="20px" />
      </template>
      {{ panelError }}
    </q-banner>
    <template v-else>
      <div class="nutzap-panel__header">
        <q-avatar size="60px" class="nutzap-panel__avatar">
          <img
            v-if="showAvatarImage"
            :src="avatarUrl"
            :alt="avatarAlt"
            @error="onAvatarError"
          />
          <span v-else class="nutzap-panel__avatar-initial">{{ initials }}</span>
        </q-avatar>
        <div class="nutzap-panel__headline">
          <div class="nutzap-panel__name">{{ supporterDisplayName }}</div>
          <div class="nutzap-panel__tagline text-2">{{ t('DonationPrompt.nutzap.tagline') }}</div>
        </div>
      </div>

      <div class="nutzap-panel__section">
        <div class="nutzap-panel__section-title">{{ t('DonationPrompt.nutzap.tiersHeading') }}</div>
        <div v-if="limitedTiers.length" class="nutzap-panel__tier-grid">
          <button
            v-for="tier in limitedTiers"
            :key="tier.id"
            type="button"
            class="nutzap-panel__tier"
            :class="{ 'nutzap-panel__tier--active': tier.id === selectedTierId }"
            @click="selectTier(tier.id)"
          >
            <div class="nutzap-panel__tier-name">{{ tier.title }}</div>
            <div class="nutzap-panel__tier-price">{{ formatPrice(tier) }}</div>
            <div class="nutzap-panel__tier-frequency text-2">{{ frequencyLabel(tier) }}</div>
          </button>
        </div>
        <div v-else class="nutzap-panel__empty text-2">
          {{ t('DonationPrompt.nutzap.tiersEmpty') }}
        </div>
      </div>

      <div class="nutzap-panel__section">
        <div class="nutzap-panel__section-title">{{ t('DonationPrompt.nutzap.donateHeading') }}</div>
        <q-input
          v-model.number="amount"
          type="number"
          dense
          outlined
          :label="t('DonationPrompt.nutzap.amountLabel')"
          min="1"
        />
        <div v-if="sendError" class="nutzap-panel__send-error text-negative text-caption q-mt-xs">
          {{ sendError }}
        </div>
        <q-btn
          color="accent"
          unelevated
          class="nutzap-panel__cta q-mt-sm"
          :label="t('DonationPrompt.nutzap.donateCta')"
          :loading="isSending"
          :disable="isSendDisabled"
          @click="sendNutzapDonation"
        />
      </div>

      <div class="nutzap-panel__section">
        <div class="nutzap-panel__section-title">{{ t('DonationPrompt.nutzap.trustedMintsHeading') }}</div>
        <div v-if="trustedMints.length" class="nutzap-panel__mint-list">
          <q-chip
            v-for="mint in trustedMints"
            :key="mint"
            dense
            clickable
            class="nutzap-panel__mint-chip"
            tag="a"
            :href="mint"
            target="_blank"
            rel="noopener"
          >
            {{ mint }}
          </q-chip>
        </div>
        <div v-else class="nutzap-panel__empty text-2">
          {{ t('DonationPrompt.nutzap.trustedMintsEmpty') }}
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { v4 as uuidv4 } from 'uuid'
import { fetchNutzapProfile } from 'stores/nostr'
import { queryNutzapTiers } from '@/nostr/relayClient'
import { useNutzapStore } from 'stores/nutzap'
import { notifyError, notifySuccess } from 'src/js/notify'

interface NormalizedTier {
  id: string
  title: string
  price: number | null
  frequency: 'one_time' | 'monthly' | 'yearly'
}

defineOptions({
  name: 'DonationNutzapPanel'
})

const props = defineProps<{
  supporterNpub: string
  supporterDisplayName: string
  supporterAvatarUrl?: string | null
}>()

const { t } = useI18n()

const nutzapStore = useNutzapStore()

const panelLoading = ref(true)
const panelError = ref('')
const profile = ref<{ hexPub: string; trustedMints: string[] } | null>(null)
const tiers = ref<NormalizedTier[]>([])
const selectedTierId = ref<string | null>(null)
const amount = ref<number | null>(null)
const sending = ref(false)
const sendError = ref('')
const avatarLoadFailed = ref(false)
const supporterNpubValue = computed(() => props.supporterNpub?.trim() ?? '')

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0
})

const avatarUrl = computed(() => (props.supporterAvatarUrl || '').trim())
const showAvatarImage = computed(() => Boolean(avatarUrl.value) && !avatarLoadFailed.value)
const avatarAlt = computed(() => t('DonationPrompt.nutzap.avatarAlt', { name: props.supporterDisplayName }))
const initials = computed(() => {
  const name = props.supporterDisplayName?.trim()
  return name ? name[0]?.toUpperCase() || 'F' : 'F'
})

const trustedMints = computed(() => profile.value?.trustedMints ?? [])
const limitedTiers = computed(() => tiers.value.slice(0, 3))
const isSending = computed(() => sending.value || nutzapStore.loading)
const isSendDisabled = computed(() => {
  if (!amount.value || amount.value <= 0) {
    return true
  }
  return isSending.value
})

watch(
  () => supporterNpubValue.value,
  () => {
    void loadData()
  }
)

onMounted(() => {
  void loadData()
})

async function loadData() {
  const npub = supporterNpubValue.value
  panelLoading.value = true
  panelError.value = ''
  profile.value = null
  tiers.value = []
  selectedTierId.value = null
  amount.value = null

  if (!npub) {
    panelError.value = t('DonationPrompt.nutzap.errors.profileMissing')
    panelLoading.value = false
    return
  }

  try {
    const profileResult = await fetchNutzapProfile(npub)
    if (!profileResult) {
      panelError.value = t('DonationPrompt.nutzap.errors.profileMissing')
      return
    }
    profile.value = {
      hexPub: profileResult.hexPub,
      trustedMints: Array.isArray(profileResult.trustedMints)
        ? profileResult.trustedMints.filter((mint): mint is string => typeof mint === 'string' && mint.length > 0)
        : []
    }

    try {
      const tierEvent = await queryNutzapTiers(profileResult.hexPub)
      if (tierEvent?.content) {
        const parsed = JSON.parse(tierEvent.content)
        if (Array.isArray(parsed)) {
          tiers.value = parsed
            .map(parseTier)
            .filter((tier): tier is NormalizedTier => tier !== null)
            .sort(sortTiers)
        }
      }
    } catch (error) {
      console.warn('[donation] failed to load Nutzap tiers', error)
    }

    const pricedTier = tiers.value.find((tier) => tier.price !== null)
    if (pricedTier) {
      selectedTierId.value = pricedTier.id
      amount.value = pricedTier.price
    } else {
      amount.value = 1000
    }
  } catch (error) {
    console.error('[donation] failed to load Nutzap profile', error)
    panelError.value = t('DonationPrompt.nutzap.errors.loadFailed')
  } finally {
    panelLoading.value = false
  }
}

function onAvatarError() {
  avatarLoadFailed.value = true
}

function parseTier(raw: any): NormalizedTier | null {
  if (!raw) {
    return null
  }
  const id = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id : uuidv4()
  const titleSource =
    (typeof raw.title === 'string' && raw.title.trim()) ||
    (typeof raw.name === 'string' && raw.name.trim()) ||
    ''
  const title = titleSource || t('DonationPrompt.nutzap.defaultTierName')

  let price: number | null = null
  const priceCandidates = [
    raw.price,
    raw.price_sats,
    raw.priceSats,
    raw.amount,
    raw.amount_sats,
    raw.amountSats
  ]
  for (const candidate of priceCandidates) {
    if (candidate !== undefined && candidate !== null) {
      const numeric = Number(candidate)
      if (Number.isFinite(numeric)) {
        price = numeric
        break
      }
    }
  }
  if (price === null && (raw.price_msat || raw.amount_msat || raw.amountMsat)) {
    const msats = Number(raw.price_msat ?? raw.amount_msat ?? raw.amountMsat)
    if (Number.isFinite(msats)) {
      price = Math.max(0, Math.round(msats / 1000))
    }
  }

  return {
    id,
    title,
    price,
    frequency: normalizeFrequency(raw.frequency ?? raw.cadence ?? raw.interval)
  }
}

function normalizeFrequency(input: unknown): NormalizedTier['frequency'] {
  if (typeof input !== 'string') {
    return 'monthly'
  }
  const value = input.trim().toLowerCase()
  if (!value) {
    return 'monthly'
  }
  if (value.includes('year')) {
    return 'yearly'
  }
  if (value.includes('one') || value.includes('single')) {
    return 'one_time'
  }
  return 'monthly'
}

function sortTiers(a: NormalizedTier, b: NormalizedTier) {
  const priceA = a.price ?? Number.POSITIVE_INFINITY
  const priceB = b.price ?? Number.POSITIVE_INFINITY
  if (priceA !== priceB) {
    return priceA - priceB
  }
  return a.title.localeCompare(b.title)
}

function formatPrice(tier: NormalizedTier): string {
  if (tier.price === null) {
    return t('DonationPrompt.nutzap.flexibleAmount')
  }
  return t('DonationPrompt.nutzap.priceLabel', { amount: numberFormatter.format(tier.price) })
}

function frequencyLabel(tier: NormalizedTier): string {
  return t(`DonationPrompt.nutzap.frequency.${tier.frequency}`)
}

function selectTier(tierId: string) {
  selectedTierId.value = tierId
  const tier = tiers.value.find((item) => item.id === tierId)
  if (tier && tier.price !== null) {
    amount.value = tier.price
    sendError.value = ''
  }
}

async function sendNutzapDonation() {
  if (!amount.value || amount.value <= 0) {
    sendError.value = t('DonationPrompt.nutzap.errors.invalidAmount')
    return
  }
  sendError.value = ''
  sending.value = true
  try {
    await nutzapStore.send({
      npub: supporterNpubValue.value,
      amount: Math.round(amount.value),
      periods: 1,
      startDate: Math.floor(Date.now() / 1000)
    })
    notifySuccess(t('DonationPrompt.nutzap.notifications.success'))
  } catch (error) {
    console.error('[donation] failed to send Nutzap donation', error)
    const message = error instanceof Error ? error.message : ''
    const fallback = message || t('DonationPrompt.nutzap.notifications.failure')
    notifyError(fallback)
    sendError.value = fallback
  } finally {
    sending.value = false
  }
}
</script>

<style scoped>
.nutzap-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.nutzap-panel__skeleton-card {
  height: 96px;
  border-radius: 12px;
}

.nutzap-panel__error {
  background-color: var(--surface-2);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
}

.nutzap-panel__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nutzap-panel__avatar {
  background-color: var(--surface-2);
  color: var(--text-1);
}

.nutzap-panel__avatar-initial {
  font-size: 1.25rem;
  font-weight: 600;
}

.nutzap-panel__headline {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nutzap-panel__name {
  font-size: 1.1rem;
  font-weight: 600;
}

.nutzap-panel__section {
  background: var(--surface-2);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 12px;
}

.nutzap-panel__section-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.nutzap-panel__tier-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.nutzap-panel__tier {
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 10px;
  padding: 10px;
  text-align: left;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.nutzap-panel__tier:hover,
.nutzap-panel__tier:focus {
  border-color: var(--accent-200);
  box-shadow: 0 0 0 2px rgba(93, 135, 255, 0.15);
}

.nutzap-panel__tier--active {
  border-color: var(--accent-500);
  box-shadow: 0 0 0 2px rgba(93, 135, 255, 0.25);
}

.nutzap-panel__tier-name {
  font-weight: 600;
  margin-bottom: 4px;
}

.nutzap-panel__tier-price {
  font-size: 0.95rem;
  font-weight: 600;
}

.nutzap-panel__tier-frequency {
  font-size: 0.8rem;
}

.nutzap-panel__empty {
  font-size: 0.85rem;
}

.nutzap-panel__cta {
  align-self: flex-start;
}

.nutzap-panel__mint-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.nutzap-panel__mint-chip {
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  color: var(--text-1);
}

.nutzap-panel__send-error {
  line-height: 1.3;
}

.nutzap-panel__skeleton-header {
  display: flex;
  align-items: center;
}
</style>
