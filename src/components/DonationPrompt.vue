<template>
  <q-dialog v-model="visible" persistent>
    <q-card class="q-pa-md donation-card">
      <q-card-section class="text-h6">
        {{ t('DonationPrompt.title', { name: supporterDisplayName }) }}
      </q-card-section>
      <q-card-section>
        <q-tabs v-model="tab" dense class="text-primary donation-tabs">
          <q-tab name="nutzap" :label="t('DonationPrompt.tabs.nutzap')" />
          <q-tab name="liquid" :label="t('DonationPrompt.tabs.liquid')" />
          <q-tab name="bitcoin" :label="t('DonationPrompt.tabs.bitcoin')" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="tab" animated>
          <q-tab-panel name="nutzap" class="q-pt-md">
            <DonationNutzapPanel
              :supporter-npub="nutzapSupporterNpub"
              :supporter-display-name="supporterDisplayName"
              :supporter-avatar-url="supporterAvatarUrl"
            />
          </q-tab-panel>
          <q-tab-panel name="liquid" class="q-pt-md">
            <div v-if="liquid">
              <div class="text-center q-mb-md">
                <vue-qrcode :value="liquidQRCode" :options="{ width: 200 }" />
              </div>
              <q-input
                :model-value="liquid"
                readonly
                dense
                outlined
                :label="t('DonationPrompt.labels.liquid')"
              >
                <template #append>
                  <q-btn
                    flat
                    icon="content_copy"
                    @click="copy(liquid)"
                    :aria-label="t('DonationPrompt.actions.copyLiquid')"
                  />
                </template>
              </q-input>
            </div>
            <div v-else class="text-2">{{ t('DonationPrompt.status.noLiquid') }}</div>
          </q-tab-panel>
          <q-tab-panel name="bitcoin" class="q-pt-md">
            <div v-if="bitcoin">
              <div class="text-center q-mb-md">
                <vue-qrcode :value="bitcoinQRCode" :options="{ width: 200 }" />
              </div>
              <q-input
                :model-value="bitcoin"
                readonly
                dense
                outlined
                :label="t('DonationPrompt.labels.bitcoin')"
              >
                <template #append>
                  <q-btn
                    flat
                    icon="content_copy"
                    @click="copy(bitcoin)"
                    :aria-label="t('DonationPrompt.actions.copyBitcoin')"
                  />
                </template>
              </q-input>
            </div>
            <div v-else class="text-2">{{ t('DonationPrompt.status.noBitcoin') }}</div>
          </q-tab-panel>
        </q-tab-panels>
        <div v-if="showTierPreview" class="donation-tier-preview q-mt-lg">
          <div class="donation-tier-preview__title">{{ t('DonationPrompt.membership.heading') }}</div>
          <div v-if="tiersLoading" class="text-2 q-mt-xs">{{ t('DonationPrompt.membership.loading') }}</div>
          <div v-else-if="tiersError" class="donation-tier-preview__error q-mt-xs">
            <span>{{ tiersError }}</span>
            <q-btn
              flat
              dense
              no-caps
              class="q-ml-xs"
              :label="t('DonationPrompt.membership.retry')"
              @click="reloadSupporterTiers"
            />
          </div>
          <ul v-else-if="supporterTierPreviews.length" class="donation-tier-preview__list q-mt-sm">
            <li v-for="tier in supporterTierPreviews" :key="tier.id" class="donation-tier-preview__item">
              <span class="donation-tier-preview__name">{{ tier.name }}</span>
              <span class="donation-tier-preview__meta">
                {{ formatTierPriceLabel(tier.priceLabel) }}<span v-if="tier.cadenceLabel"> / {{ tier.cadenceLabel }}</span>
              </span>
            </li>
          </ul>
          <div v-else class="text-2 q-mt-xs">{{ t('DonationPrompt.membership.empty') }}</div>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat :label="t('DonationPrompt.buttons.never')" @click="never" />
        <q-btn flat :label="t('DonationPrompt.buttons.later')" @click="later" />
        <q-btn
          v-if="tab !== 'nutzap'"
          color="primary"
          :label="donateButtonLabel"
          @click="donate"
          :disable="isDonateDisabled"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VueQrcode from '@chenfengyuan/vue-qrcode'
import { useDonationPrompt } from '@/composables/useDonationPrompt'
import DonationNutzapPanel from './DonationNutzapPanel.vue'

defineOptions({
  name: 'DonationPrompt'
})

const emit = defineEmits<{ (event: 'opened'): void }>()

const { t } = useI18n()

const {
  bitcoin,
  bitcoinQRCode,
  copy,
  donate,
  getDefaultTab,
  later,
  liquid,
  liquidQRCode,
  never,
  nutzapSupporterNpub,
  open,
  reloadSupporterTiers,
  showTierPreview,
  supporterDisplayName,
  supporterAvatarUrl,
  supporterTierPreviews,
  tab,
  tiersError,
  tiersLoading,
  visible
} = useDonationPrompt()

const donateButtonLabel = computed(() => {
  const topTier = supporterTierPreviews.value[0]
  if (topTier) {
    const translatedPrice = formatTierPriceLabel(topTier.priceLabel)
    if (topTier.priceLabel === 'Flexible amount') {
      return t('DonationPrompt.buttons.joinFlexible', { name: topTier.name })
    }
    return t('DonationPrompt.buttons.joinTierWithPrice', {
      name: topTier.name,
      price: translatedPrice,
    })
  }
  return t('DonationPrompt.buttons.donate')
})

const isDonateDisabled = computed(() => {
  if (tab.value === 'liquid') {
    return !liquid.value
  }
  if (tab.value === 'bitcoin') {
    return !bitcoin.value
  }
  return false
})

function formatTierPriceLabel(label: string) {
  return label === 'Flexible amount' ? t('DonationPrompt.membership.flexibleAmount') : label
}

onMounted(() => {
  open({ defaultTab: getDefaultTab() })
})

watch(
  () => visible.value,
  (isVisible, wasVisible) => {
    if (isVisible && !wasVisible) {
      emit('opened')
    }
  }
)

defineExpose({
  visible
})
</script>

<style scoped>
.donation-card {
  min-width: 320px;
}

.donation-tabs {
  margin-bottom: 8px;
}

.donation-tier-preview__title {
  font-weight: 600;
  font-size: 0.95rem;
}

.donation-tier-preview__list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.donation-tier-preview__item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 4px 0;
}

.donation-tier-preview__name {
  font-weight: 500;
}

.donation-tier-preview__meta {
  color: var(--text-2);
  font-size: 0.85rem;
}

.donation-tier-preview__error {
  display: flex;
  align-items: center;
  color: var(--negative, #c10015);
  font-size: 0.85rem;
}
</style>
