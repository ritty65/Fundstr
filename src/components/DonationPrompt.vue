<template>
  <q-dialog v-model="visible" persistent>
    <q-card class="q-pa-md" style="min-width: 300px">
      <q-card-section class="text-h6">Support Fundstr</q-card-section>
      <q-card-section>
        <q-tabs v-model="tab" dense class="text-primary">
          <q-tab name="lightning" label="Lightning" />
          <q-tab name="bitcoin" label="Bitcoin" />
        </q-tabs>
        <q-separator />
        <q-tab-panels v-model="tab" animated>
          <q-tab-panel name="lightning" class="q-pt-md">
            <div class="text-center q-mb-md">
              <vue-qrcode :value="lightningQRCode" :options="{ width: 200 }" />
            </div>
            <q-input v-model="lightning" readonly dense outlined label="Lightning" />
          </q-tab-panel>
          <q-tab-panel name="bitcoin" class="q-pt-md">
            <div class="text-center q-mb-md">
              <vue-qrcode :value="bitcoinQRCode" :options="{ width: 200 }" />
            </div>
            <q-input v-model="bitcoin" readonly dense outlined label="Bitcoin" />
          </q-tab-panel>
        </q-tab-panels>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat label="Never Ask Again" @click="never" />
        <q-btn flat label="Remind Me Later" @click="later" />
        <q-btn color="primary" label="Donate Now" @click="donate" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted, defineAsyncComponent } from 'vue'
import { LOCAL_STORAGE_KEYS } from '@/constants/localStorageKeys'

const VueQrcode = defineAsyncComponent(() => import('@chenfengyuan/vue-qrcode'))

const visible = ref(false)
const tab = ref('lightning')
const lightning = ref(import.meta.env.VITE_DONATION_LIGHTNING || '')
const bitcoin = ref(import.meta.env.VITE_DONATION_BITCOIN || '')
const lightningQRCode = ref(lightning.value ? `lightning:${lightning.value}` : '')
const bitcoinQRCode = ref(bitcoin.value ? `bitcoin:${bitcoin.value}` : '')

const LAUNCH_THRESHOLD = 5
const DAY_THRESHOLD = 7

const getLaunchCount = () => parseInt(localStorage.getItem(LOCAL_STORAGE_KEYS.DONATION_LAUNCH_COUNT) || '0')
const setLaunchCount = (v: number) => localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_LAUNCH_COUNT, v.toString())

onMounted(() => {
  const optOut = localStorage.getItem(LOCAL_STORAGE_KEYS.DONATION_OPT_OUT) === 'true'
  if (optOut) return

  const launchCount = getLaunchCount() + 1
  setLaunchCount(launchCount)

  const lastPrompt = parseInt(
    localStorage.getItem(LOCAL_STORAGE_KEYS.DONATION_LAST_PROMPT) ||
      Date.now().toString()
  )
  const daysSince = (Date.now() - lastPrompt) / (1000 * 60 * 60 * 24)

  if (launchCount >= LAUNCH_THRESHOLD || daysSince >= DAY_THRESHOLD) {
    visible.value = true
  }
})

const donate = () => {
  if (tab.value === 'lightning' && lightning.value) {
    window.open(`lightning:${lightning.value}`, '_blank')
  } else if (tab.value === 'bitcoin' && bitcoin.value) {
    window.open(`bitcoin:${bitcoin.value}`, '_blank')
  }
  localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_LAST_PROMPT, Date.now().toString())
  setLaunchCount(0)
  visible.value = false
}

const later = () => {
  localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_LAST_PROMPT, Date.now().toString())
  setLaunchCount(0)
  visible.value = false
}

const never = () => {
  localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_OPT_OUT, 'true')
  setLaunchCount(0)
  visible.value = false
}
</script>

<script lang="ts">
export default {
  name: 'DonationPrompt',
  components: {
    VueQrcode
  }
}
</script>

<style scoped>
</style>
