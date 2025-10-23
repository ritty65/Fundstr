<template>
  <q-dialog v-model="visible" persistent>
    <q-card class="q-pa-md" style="min-width: 300px">
      <q-card-section class="text-h6">Support Fundstr</q-card-section>
      <q-card-section>
        <div v-if="noAddress" class="text-2">
          Donation address not configured.
        </div>
        <template v-else>
          <q-tabs v-model="tab" dense class="text-primary">
            <q-tab name="lightning" label="Lightning" />
            <q-tab name="bitcoin" label="Bitcoin" />
          </q-tabs>
          <q-separator />
          <q-tab-panels v-model="tab" animated>
            <q-tab-panel name="lightning" class="q-pt-md">
              <div v-if="lightning">
                <div class="text-center q-mb-md">
                  <vue-qrcode :value="lightningQRCode" :options="{ width: 200 }" />
                </div>
                <q-input
                  :model-value="lightning"
                  readonly
                  dense
                  outlined
                  label="Lightning"
                >
                  <template #append>
                    <q-btn
                      flat
                      icon="content_copy"
                      @click="copy(lightning)"
                      aria-label="Copy Lightning address"
                    />
                  </template>
                </q-input>
              </div>
              <div v-else class="text-2">No Lightning address configured.</div>
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
        </template>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Never Ask Again" @click="never" />
        <q-btn flat label="Remind Me Later" @click="later" />
        <q-btn color="primary" label="Donate Now" @click="donate" :disable="noAddress" />
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
  later,
  lightning,
  lightningQRCode,
  never,
  noAddress,
  open,
  tab,
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
</style>
