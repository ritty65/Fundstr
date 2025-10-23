<template>
  <section class="cashu-panel">
    <div v-if="panelLoading" class="cashu-panel__skeleton">
      <div class="cashu-panel__skeleton-header">
        <q-skeleton type="circle" size="56px" />
        <div class="column q-gutter-xs q-pl-sm">
          <q-skeleton type="text" width="140px" />
          <q-skeleton type="text" width="120px" />
        </div>
      </div>
      <div class="row q-col-gutter-sm q-mt-md">
        <div class="col">
          <q-skeleton type="rect" class="cashu-panel__skeleton-card" />
        </div>
        <div class="col">
          <q-skeleton type="rect" class="cashu-panel__skeleton-card" />
        </div>
      </div>
    </div>
    <q-banner
      v-else-if="panelError"
      rounded
      dense
      class="cashu-panel__error text-1"
      role="status"
      aria-live="polite"
    >
      <template #avatar>
        <q-icon name="warning" size="20px" />
      </template>
      {{ panelError }}
    </q-banner>
    <template v-else>
      <div class="cashu-panel__header">
        <q-avatar size="60px" class="cashu-panel__avatar">
          <img
            v-if="showAvatarImage"
            :src="avatarUrl"
            :alt="avatarAlt"
            @error="onAvatarError"
          />
          <span v-else class="cashu-panel__avatar-initial">{{ initials }}</span>
        </q-avatar>
        <div class="cashu-panel__headline">
          <div class="cashu-panel__name">{{ supporterDisplayName }}</div>
          <div class="cashu-panel__tagline text-2">{{ t('DonationPrompt.cashu.tagline') }}</div>
        </div>
      </div>

      <div class="cashu-panel__section">
        <div class="cashu-panel__section-title">{{ t('DonationPrompt.cashu.donateHeading') }}</div>
        <div v-if="presetAmounts.length" class="cashu-panel__preset-wrapper">
          <div class="cashu-panel__preset-label text-2">
            {{ t('DonationPrompt.cashu.quickPresetsLabel') }}
          </div>
          <div class="cashu-panel__preset-grid">
            <button
              v-for="preset in presetAmounts"
              :key="preset"
              type="button"
              class="cashu-panel__preset"
              :class="{ 'cashu-panel__preset--active': preset === activePreset }"
              @click="selectPreset(preset)"
            >
              {{ t('DonationPrompt.cashu.priceLabel', { amount: numberFormatter.format(preset) }) }}
            </button>
          </div>
        </div>
        <q-input
          v-model.number="amount"
          type="number"
          dense
          outlined
          :label="t('DonationPrompt.cashu.amountLabel')"
          min="1"
          :disable="isAuthBlocked"
        />
        <div v-if="sendError" class="cashu-panel__send-error text-negative text-caption q-mt-xs">
          {{ sendError }}
        </div>
        <div v-if="ctaMode" class="cashu-panel__auth-cta q-mt-sm">
          <div class="cashu-panel__cta-title">
            {{
              t(
                ctaMode === 'signin'
                  ? 'DonationPrompt.cashu.ctas.signInTitle'
                  : 'DonationPrompt.cashu.ctas.setupTitle'
              )
            }}
          </div>
          <div class="cashu-panel__cta-description text-2">
            {{
              t(
                ctaMode === 'signin'
                  ? 'DonationPrompt.cashu.ctas.signInDescription'
                  : 'DonationPrompt.cashu.ctas.setupDescription'
              )
            }}
          </div>
          <q-btn
            color="accent"
            unelevated
            class="cashu-panel__cta-button q-mt-sm"
            :label="
              t(
                ctaMode === 'signin'
                  ? 'DonationPrompt.cashu.ctas.signInCta'
                  : 'DonationPrompt.cashu.ctas.setupCta'
              )
            "
            @click="ctaMode === 'signin' ? handleSignIn() : handleWalletSetup()"
          />
          <div v-if="ctaMode === 'setup'" class="cashu-panel__quick-links q-mt-sm">
            <div class="cashu-panel__quick-links-label text-2">
              {{ t('DonationPrompt.cashu.ctas.quickLinksLabel') }}
            </div>
            <div class="cashu-panel__quick-links-grid">
              <q-btn
                v-for="link in walletQuickLinks"
                :key="link.href"
                outline
                color="accent"
                size="sm"
                class="cashu-panel__quick-link"
                :label="t(link.labelKey)"
                :href="link.href"
                target="_blank"
                rel="noopener"
              />
            </div>
          </div>
        </div>
        <q-btn
          v-else
          color="accent"
          unelevated
          class="cashu-panel__cta q-mt-sm"
          :label="t('DonationPrompt.cashu.donateCta')"
          :loading="isSending"
          :disable="isSendDisabled"
          @click="sendCashuDonation"
        />
        <div v-if="showExplainer" class="cashu-panel__explainer q-mt-md">
          <div class="cashu-panel__explainer-title text-1">
            {{ t('DonationPrompt.cashu.explainer.heading') }}
          </div>
          <p class="cashu-panel__explainer-body text-2">
            {{ t('DonationPrompt.cashu.explainer.body') }}
          </p>
        </div>
      </div>

      <div class="cashu-panel__section">
        <div class="cashu-panel__section-title">{{ t('DonationPrompt.cashu.trustedMintsHeading') }}</div>
        <div v-if="trustedMints.length" class="cashu-panel__mint-list">
          <q-chip
            v-for="mint in trustedMints"
            :key="mint"
            dense
            clickable
            class="cashu-panel__mint-chip"
            tag="a"
            :href="mint"
            target="_blank"
            rel="noopener"
          >
            {{ mint }}
          </q-chip>
        </div>
        <div v-else class="cashu-panel__empty text-2">
          {{ t('DonationPrompt.cashu.trustedMintsEmpty') }}
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchNutzapProfile, useNostrStore } from 'stores/nostr'
import { useMintsStore } from 'stores/mints'
import { queryNutzapTiers } from '@/nostr/relayClient'
import { useCashuStore } from 'stores/cashu'
import { notifyError, notifySuccess } from 'src/js/notify'
import { useDonationPrompt, CASHU_SUPPORTER_NPUB } from '@/composables/useDonationPrompt'

defineOptions({
  name: 'DonationCashuPanel'
})

const props = defineProps<{
  supporterNpub: string
  supporterDisplayName: string
  supporterAvatarUrl?: string | null
}>()

const { t } = useI18n()

const router = useRouter()
const { close } = useDonationPrompt()
const cashuStore = useCashuStore()
const nostrStore = useNostrStore()
const mintsStore = useMintsStore()

const { pubkey } = storeToRefs(nostrStore)
const { mints, activeMintUrl } = storeToRefs(mintsStore)

const panelLoading = ref(true)
const panelError = ref('')
const profile = ref<{ hexPub: string; trustedMints: string[] } | null>(null)
const amount = ref<number | null>(null)
const sending = ref(false)
const sendError = ref('')
const avatarLoadFailed = ref(false)
const supporterNpubValue = computed(() => (props.supporterNpub?.trim() || CASHU_SUPPORTER_NPUB).trim())
const presetAmounts = ref<number[]>([])
const activePreset = ref<number | null>(null)

type CtaMode = 'signin' | 'setup' | null

const isSignedIn = computed(() => Boolean(pubkey.value && pubkey.value.trim()))
const hasWalletSetup = computed(
  () => mints.value.length > 0 && Boolean(activeMintUrl.value && activeMintUrl.value.trim())
)
const ctaMode = computed<CtaMode>(() => {
  if (!isSignedIn.value) {
    return 'signin'
  }
  if (!hasWalletSetup.value) {
    return 'setup'
  }
  return null
})
const isAuthBlocked = computed(() => ctaMode.value !== null)
const showExplainer = computed(() => !isAuthBlocked.value)

const walletQuickLinks = [
  {
    labelKey: 'DonationPrompt.cashu.ctas.quickLinkDesktop',
    href: 'https://cashu.space/wallet'
  },
  {
    labelKey: 'DonationPrompt.cashu.ctas.quickLinkMobile',
    href: 'https://cashu.space/apps'
  }
] as const

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 0
})

const avatarUrl = computed(() => (props.supporterAvatarUrl || '').trim())
const showAvatarImage = computed(() => Boolean(avatarUrl.value) && !avatarLoadFailed.value)
const avatarAlt = computed(() => t('DonationPrompt.cashu.avatarAlt', { name: props.supporterDisplayName }))
const initials = computed(() => {
  const name = props.supporterDisplayName?.trim()
  return name ? name[0]?.toUpperCase() || 'F' : 'F'
})

const trustedMints = computed(() => profile.value?.trustedMints ?? [])
const isSending = computed(() => sending.value || cashuStore.loading)
const isSendDisabled = computed(() => {
  if (isAuthBlocked.value) {
    return true
  }
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

watch(ctaMode, () => {
  sendError.value = ''
})

onMounted(() => {
  void loadData()
})

async function loadData() {
  const npub = supporterNpubValue.value
  panelLoading.value = true
  panelError.value = ''
  profile.value = null
  amount.value = null
  presetAmounts.value = []
  activePreset.value = null

  if (!npub) {
    panelError.value = t('DonationPrompt.cashu.errors.profileMissing')
    panelLoading.value = false
    return
  }

  try {
    const profileResult = await fetchNutzapProfile(npub)
    if (!profileResult) {
      panelError.value = t('DonationPrompt.cashu.errors.profileMissing')
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
          const extracted = parsed
            .map(extractTierAmount)
            .filter((value): value is number => Number.isFinite(value) && value > 0)
            .map((value) => Math.round(value))
          const unique = Array.from(new Set(extracted)).sort((a, b) => a - b)
          presetAmounts.value = unique
        }
      }
    } catch (error) {
      console.warn('[donation] failed to load Cashu tiers', error)
    }

    const suggested = presetAmounts.value[presetAmounts.value.length - 1]
    if (typeof suggested === 'number') {
      amount.value = suggested
      activePreset.value = suggested
    } else {
      amount.value = 1000
    }
  } catch (error) {
    console.error('[donation] failed to load Cashu profile', error)
    panelError.value = t('DonationPrompt.cashu.errors.loadFailed')
  } finally {
    panelLoading.value = false
  }
}

function onAvatarError() {
  avatarLoadFailed.value = true
}

function extractTierAmount(raw: any): number | null {
  if (!raw) {
    return null
  }

  const priceCandidates = [raw.price, raw.price_sats, raw.priceSats, raw.amount, raw.amount_sats, raw.amountSats]
  for (const candidate of priceCandidates) {
    if (candidate !== undefined && candidate !== null) {
      const numeric = Number(candidate)
      if (Number.isFinite(numeric)) {
        return numeric
      }
    }
  }

  if (raw.price_msat || raw.amount_msat || raw.amountMsat) {
    const msats = Number(raw.price_msat ?? raw.amount_msat ?? raw.amountMsat)
    if (Number.isFinite(msats)) {
      return Math.max(0, Math.round(msats / 1000))
    }
  }

  return null
}

function selectPreset(preset: number) {
  activePreset.value = preset
  amount.value = preset
  sendError.value = ''
}

async function sendCashuDonation() {
  if (isAuthBlocked.value) {
    return
  }
  if (!amount.value || amount.value <= 0) {
    sendError.value = t('DonationPrompt.cashu.errors.invalidAmount')
    return
  }
  sendError.value = ''
  sending.value = true
  try {
    await cashuStore.send({
      npub: supporterNpubValue.value,
      amount: Math.round(amount.value),
      periods: 1,
      startDate: Math.floor(Date.now() / 1000)
    })
    notifySuccess(t('DonationPrompt.cashu.notifications.success'))
  } catch (error) {
    console.error('[donation] failed to send Cashu donation', error)
    const message = error instanceof Error ? error.message : ''
    const lowered = message.toLowerCase()
    const fallback = lowered.includes('nostr')
      ? t('DonationPrompt.cashu.notifications.dmFailure')
      : t('DonationPrompt.cashu.notifications.failure')
    const finalMessage = message || fallback
    notifyError(finalMessage)
    sendError.value = finalMessage
  } finally {
    sending.value = false
  }
}

async function handleSignIn() {
  close()
  await router.push('/nostr-login')
}

async function handleWalletSetup() {
  close()
  await router.push('/wallet')
}

watch(amount, (value) => {
  if (value === null) {
    activePreset.value = null
    return
  }

  if (!presetAmounts.value.includes(value)) {
    activePreset.value = null
  }
})
</script>

<style scoped>
.cashu-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cashu-panel__skeleton-card {
  height: 96px;
  border-radius: 12px;
}

.cashu-panel__error {
  background-color: var(--surface-2);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
}

.cashu-panel__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cashu-panel__avatar {
  background-color: var(--surface-2);
  color: var(--text-1);
}

.cashu-panel__avatar-initial {
  font-size: 1.25rem;
  font-weight: 600;
}

.cashu-panel__headline {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cashu-panel__name {
  font-size: 1.1rem;
  font-weight: 600;
}

.cashu-panel__section {
  background: var(--surface-2);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 12px;
}

.cashu-panel__section-title {
  font-weight: 600;
  margin-bottom: 8px;
}

.cashu-panel__preset-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.cashu-panel__preset-label {
  font-size: 0.85rem;
}

.cashu-panel__preset-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cashu-panel__preset {
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 999px;
  padding: 6px 12px;
  font-weight: 600;
  font-size: 0.9rem;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.cashu-panel__preset:hover,
.cashu-panel__preset:focus {
  border-color: var(--accent-200);
  box-shadow: 0 0 0 2px rgba(93, 135, 255, 0.15);
}

.cashu-panel__auth-cta {
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cashu-panel__cta-title {
  font-weight: 600;
}

.cashu-panel__cta-button {
  align-self: flex-start;
}

.cashu-panel__quick-links {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cashu-panel__quick-links-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cashu-panel__quick-link {
  border-radius: 999px;
  padding: 4px 12px;
}

.cashu-panel__explainer {
  background: rgba(93, 135, 255, 0.08);
  border-radius: 10px;
  padding: 12px;
}

.cashu-panel__explainer-title {
  font-weight: 600;
  margin-bottom: 4px;
}

.cashu-panel__preset--active {
  border-color: var(--accent-500);
  box-shadow: 0 0 0 2px rgba(93, 135, 255, 0.25);
}

.cashu-panel__empty {
  font-size: 0.85rem;
}

.cashu-panel__cta {
  align-self: flex-start;
}

.cashu-panel__mint-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cashu-panel__mint-chip {
  background: var(--surface-1);
  border: 1px solid var(--surface-contrast-border, rgba(0, 0, 0, 0.08));
  color: var(--text-1);
}

.cashu-panel__send-error {
  line-height: 1.3;
}

.cashu-panel__skeleton-header {
  display: flex;
  align-items: center;
}
</style>
