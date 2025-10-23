<template>
  <q-dialog v-model="visible" persistent>
    <q-card class="q-pa-md" style="min-width: 300px">
      <q-card-section class="text-h6">Support {{ supporterDisplayName }}</q-card-section>
      <q-card-section>
        <div v-if="noAddress" class="text-2">
          Donation address not configured.
        </div>
        <template v-else>
          <q-tabs v-model="tab" dense class="text-primary">
            <q-tab name="liquid" label="Liquid" />
            <q-tab name="bitcoin" label="Bitcoin" />
          </q-tabs>
          <q-separator />
          <q-tab-panels v-model="tab" animated>
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
                  label="Liquid"
                >
                  <template #append>
                    <q-btn
                      flat
                      icon="content_copy"
                      @click="copy(liquid)"
                      aria-label="Copy Liquid address"
                    />
                  </template>
                </q-input>
              </div>
              <div v-else class="text-2">No Liquid address configured.</div>
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
                  label="Bitcoin"
                >
                  <template #append>
                    <q-btn
                      flat
                      icon="content_copy"
                      @click="copy(bitcoin)"
                      aria-label="Copy Bitcoin address"
                    />
                  </template>
                </q-input>
              </div>
              <div v-else class="text-2">No Bitcoin address configured.</div>
            </q-tab-panel>
          </q-tab-panels>
          <div v-if="showTierPreview" class="donation-tier-preview q-mt-lg">
            <div class="donation-tier-preview__title">Membership tiers</div>
            <div v-if="tiersLoading" class="text-2 q-mt-xs">Loading supporter tiers…</div>
            <div v-else-if="tiersError" class="donation-tier-preview__error q-mt-xs">
              <span>{{ tiersError }}</span>
              <q-btn flat dense no-caps class="q-ml-xs" label="Retry" @click="reloadSupporterTiers" />
            </div>
            <ul v-else-if="supporterTierPreviews.length" class="donation-tier-preview__list q-mt-sm">
              <li v-for="tier in supporterTierPreviews" :key="tier.id" class="donation-tier-preview__item">
                <span class="donation-tier-preview__name">{{ tier.name }}</span>
                <span class="donation-tier-preview__meta">
                  {{ tier.priceLabel }}<span v-if="tier.cadenceLabel"> / {{ tier.cadenceLabel }}</span>
                </span>
              </li>
            </ul>
            <div v-else class="text-2 q-mt-xs">No tier information available right now.</div>
          </div>
        </template>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Never Ask Again" @click="never" />
        <q-btn flat label="Remind Me Later" @click="later" />
        <q-btn color="primary" :label="donateLabel" @click="donate" :disable="noAddress" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import VueQrcode from '@chenfengyuan/vue-qrcode'
import { useDonationPrompt } from '@/composables/useDonationPrompt'

defineOptions({
  name: 'DonationPrompt'
})

const emit = defineEmits<{ (event: 'opened'): void }>()

const {
  bitcoin,
  bitcoinQRCode,
  copy,
  donate,
  donateLabel,
  later,
  liquid,
  liquidQRCode,
  never,
  noAddress,
  open,
  reloadSupporterTiers,
  showTierPreview,
  supporterDisplayName,
  supporterTierPreviews,
  tab,
  tiersError,
  tiersLoading,
  visible
} = useDonationPrompt()

onMounted(() => {
  open()
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
