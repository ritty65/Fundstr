<template>
  <q-dialog v-model="visible" persistent>
    <q-card class="q-pa-md donation-card">
      <q-card-section class="text-h6">
        {{ t('DonationPrompt.title', { name: supporterDisplayName }) }}
      </q-card-section>
      <q-card-section>
        <q-tabs v-model="tab" dense class="text-primary donation-tabs">
          <q-tab name="cashu" :label="t('DonationPrompt.tabs.cashu')" />
          <q-tab name="liquid" :label="t('DonationPrompt.tabs.liquid')" />
          <q-tab name="bitcoin" :label="t('DonationPrompt.tabs.bitcoin')" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="tab" animated>
          <q-tab-panel name="cashu" class="q-pt-md">
            <DonationCashuPanel
              :supporter-npub="cashuSupporterNpub"
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
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat :label="t('DonationPrompt.buttons.never')" @click="never" />
        <q-btn flat :label="t('DonationPrompt.buttons.later')" @click="later" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import VueQrcode from '@chenfengyuan/vue-qrcode'
import { useDonationPrompt } from '@/composables/useDonationPrompt'
import DonationCashuPanel from './DonationCashuPanel.vue'

defineOptions({
  name: 'DonationPrompt'
})

const emit = defineEmits<{ (event: 'opened'): void }>()

const { t } = useI18n()

const {
  bitcoin,
  bitcoinQRCode,
  copy,
  getDefaultTab,
  later,
  liquid,
  liquidQRCode,
  never,
  cashuSupporterNpub,
  open,
  supporterDisplayName,
  supporterAvatarUrl,
  tab,
  visible
} = useDonationPrompt()

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

</style>
