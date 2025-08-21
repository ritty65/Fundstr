<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center q-mx-auto" style="max-width: 600px">
      <q-icon name="factory" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">
        {{ t('Welcome.mints.title') }}
      </h1>
      <p class="q-mt-sm">{{ t('Welcome.mints.lead') }}</p>
      <p class="text-caption q-mt-sm">{{ t('Welcome.mints.primer') }}</p>
      <p class="text-caption q-mt-sm">
        These mints were recommended by other Nostr users.
        Read reviews at
        <a
          href="https://bitcoinmints.com"
          target="_blank"
          rel="noopener"
          >bitcoinmints.com</a
        >.
        Be careful and do your own research before using a mint.
      </p>
      <div class="q-mt-sm">
        <q-btn
          flat
          dense
          icon="factory"
          @click="showCatalog = true"
          label="Click to browse mints"
          :disable="!recommendedMints.length"
        />
      </div>
      <q-form class="q-mt-md" @submit.prevent="connect">
        <q-select
          v-model="url"
          :options="recommendedMints"
          :option-label="(opt) => opt.label || opt.url"
          option-value="url"
          emit-value
          map-options
          use-input
          input-debounce="0"
          @new-value="onNewValue"
          :placeholder="t('Welcome.mints.placeholder')"
        />
        <div v-if="error" class="text-negative text-caption q-mt-xs">{{ error }}</div>
        <q-btn color="primary" class="q-mt-md" :loading="loading" type="submit" :label="t('Welcome.mints.connect')" />
      </q-form>
      <div v-if="connected.length" class="q-mt-md">
        <div
          v-for="m in connected"
          :key="m.url"
          class="row items-center justify-between q-my-xs"
        >
          <div class="row items-center">
            <q-icon name="check" color="positive" class="q-mr-sm" />
            <span>{{ m.nickname || m.url }}</span>
          </div>
          <q-btn flat dense icon="delete" color="negative" @click="remove(m.url)" />
        </div>
        <q-btn
          flat
          color="primary"
          class="q-mt-sm"
          @click="addAnother"
          :label="t('Welcome.mints.addAnother')"
        />
      </div>
      <q-dialog v-model="showCatalog">
        <q-card style="min-width:300px">
          <q-card-section>
            <div class="text-h6">{{ t('Welcome.mints.browse') }}</div>
          </q-card-section>
          <q-list>
            <q-item
              v-for="mint in recommendedMints"
              :key="mint.url"
              clickable
              @click="selectMint(mint.url)"
            >
              <q-item-section>{{ mint.label || mint.url }}</q-item-section>
            </q-item>
          </q-list>
          <q-card-actions align="right">
            <q-btn flat :label="t('global.actions.close.label')" v-close-popup />
          </q-card-actions>
        </q-card>
      </q-dialog>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useWelcomeStore } from 'src/stores/welcome'
import { useMintsStore } from 'src/stores/mints'

const { t } = useI18n()
const $q = useQuasar()
const welcome = useWelcomeStore()
const mints = useMintsStore()
const id = 'welcome-mints-title'
const url = ref((process.env.RECOMMENDED_MINT_URL as string) || '')
const error = ref('')
const loading = ref(false)
const connected = ref<any[]>([])
const showCatalog = ref(false)
const recommendedMints = ref<{ label: string; url: string }[]>([])

async function loadRecommendedMints() {
  try {
    const resp = await fetch('/mints.json')
    if (!resp.ok) throw new Error('network')
    const data = await resp.json()
    recommendedMints.value = Array.isArray(data)
      ? data.map((m: any) => ({ url: m.url, label: m.label || m.url }))
      : []
    if (!recommendedMints.value.length && process.env.RECOMMENDED_MINTS) {
      recommendedMints.value = (process.env.RECOMMENDED_MINTS as string)
        .split(',')
        .map((u) => ({ url: u.trim(), label: u.trim() }))
    }
    if (!recommendedMints.value.length && process.env.RECOMMENDED_MINT_URL) {
      recommendedMints.value.push({
        url: process.env.RECOMMENDED_MINT_URL as string,
        label: process.env.RECOMMENDED_MINT_URL as string,
      })
    }
  } catch {
    if (process.env.RECOMMENDED_MINTS) {
      recommendedMints.value = (process.env.RECOMMENDED_MINTS as string)
        .split(',')
        .map((u) => ({ url: u.trim(), label: u.trim() }))
    } else if (process.env.RECOMMENDED_MINT_URL) {
      recommendedMints.value.push({
        url: process.env.RECOMMENDED_MINT_URL as string,
        label: process.env.RECOMMENDED_MINT_URL as string,
      })
    } else {
      $q.notify({ type: 'negative', message: t('Welcome.mints.errorLoad') })
    }
  }
}

onMounted(() => {
  if (mints.mints.length > 0) {
    welcome.mintConnected = true
    connected.value = [...mints.mints]
  }
  loadRecommendedMints()
})

async function connect() {
  error.value = ''
  let input = url.value.trim()
  if (!input) {
    error.value = t('Welcome.mints.errorInvalid')
    return
  }
  if (!/^https?:\/\//i.test(input)) {
    input = 'https://' + input
  }
  if (/\s/.test(input) || !input.includes('.')) {
    error.value = t('Welcome.mints.errorInvalid')
    return
  }
  loading.value = true
  const base = input.replace(/\/$/, '')
  try {
    await fetch(base + '/keys', { method: 'GET', mode: 'no-cors' })
    const infoResp = await fetch(base + '/info')
    const info = await infoResp.json()
    if (!info?.name) {
      throw new Error('noname')
    }
    if (!info?.version) {
      throw new Error('noversion')
    }
  } catch (e: any) {
    if (e.message === 'noname') {
      error.value = t('Welcome.mints.errorNoName')
    } else if (e.message === 'noversion') {
      error.value = t('Welcome.mints.errorNoVersion')
    } else {
      error.value = t('Welcome.mints.errorUnreachable')
    }
    loading.value = false
    return
  }
  try {
    const mint = await mints.addMint({ url: input }, true)
    connected.value.push(mint)
    welcome.mintConnected = mints.mints.length > 0
    url.value = ''
  } catch {
    error.value = t('Welcome.mints.errorResponse')
  } finally {
    loading.value = false
  }
}

function addAnother() {
  url.value = ''
  error.value = ''
}

function selectMint(mintUrl: string) {
  showCatalog.value = false
  url.value = mintUrl
  connect()
}

function onNewValue(val: string, done: (val: any, mode?: string) => void) {
  const opt = { url: val, label: val }
  done(opt, 'add-unique')
}

async function remove(mintUrl: string) {
  await mints.removeMint(mintUrl)
  connected.value = connected.value.filter((m) => m.url !== mintUrl)
  welcome.mintConnected = mints.mints.length > 0
}
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
