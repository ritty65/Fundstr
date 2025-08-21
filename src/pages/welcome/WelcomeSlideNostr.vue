<template>
  <section role="region" :aria-labelledby="id" class="q-pa-md flex flex-center">
    <div class="text-center q-mx-auto" style="max-width:600px">
      <q-icon name="badge" size="4em" color="primary" />
      <h1 :id="id" tabindex="-1" class="q-mt-md">{{ t('Welcome.nostr.title') }}</h1>
      <p class="q-mt-sm">{{ t('Welcome.nostr.lead') }}</p>
      <div class="q-gutter-y-md q-mt-md">
        <q-btn
            color="primary"
            :label="connected ? t('Welcome.nostr.connected') : t('Welcome.nostr.connect')"
            @click="connectNip07"
            :disable="!hasNip07 || connected"
            :loading="connecting"
            :icon="connected ? 'check' : undefined"
          />
      <div v-if="!hasNip07" class="text-caption">
        <div>{{ t('Welcome.nostr.installHint') }}</div>
        <div>{{ t('Welcome.nostr.installBrowser', { browser: browserLabel }) }}</div>
        <ul class="q-mt-xs">
          <li v-for="ext in suggestedExtensions" :key="ext.name">
            <a :href="ext.url" target="_blank" class="text-primary">{{ ext.name }}</a>
          </li>
        </ul>
      </div>
        <q-btn color="primary" :label="t('Welcome.nostr.generate')" @click="generate" />
        <q-form @submit.prevent="importKey">
          <q-input v-model="nsec" :label="t('Welcome.nostr.importPlaceholder')" autocomplete="off" />
          <div v-if="error" class="text-negative text-caption">{{ error }}</div>
          <q-btn class="q-mt-sm" color="primary" type="submit" :disable="!nsec" :label="t('Welcome.nostr.import')" />
        </q-form>
        <div v-if="npub" class="text-positive text-caption">{{ npub }}</div>
        <q-btn flat color="primary" @click="skip" :label="t('Welcome.nostr.skip')" />
      </div>
      <NostrBackupDialog v-model="showBackup" :nsec="backupNsec" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useNostrStore } from 'src/stores/nostr'
import { useWelcomeStore } from 'src/stores/welcome'
import NostrBackupDialog from 'src/components/welcome/NostrBackupDialog.vue'
import { nip19 } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils'

const { t } = useI18n()
const $q = useQuasar()
const nostr = useNostrStore()
const welcome = useWelcomeStore()
const id = 'welcome-nostr-title'

const nsec = ref('')
const error = ref('')
const npub = ref('')
const showBackup = ref(false)
const backupNsec = ref('')
const connecting = ref(false)
const connected = ref(false)

const hasNip07 = computed(() => typeof window !== 'undefined' && !!(window as any).nostr?.getPublicKey)

type BrowserKind = 'chromium' | 'firefox' | 'safari' | 'unknown'
const browser = ref<BrowserKind>('unknown')

if (typeof navigator !== 'undefined') {
  const ua = navigator.userAgent
  if (/firefox/i.test(ua)) browser.value = 'firefox'
  else if (/safari/i.test(ua) && !/chrome|chromium|crios|edg/i.test(ua)) browser.value = 'safari'
  else if (/chrome|chromium|crios|edg/i.test(ua)) browser.value = 'chromium'
}

const browserLabel = computed(() => {
  switch (browser.value) {
    case 'chromium':
      return 'Chromium'
    case 'firefox':
      return 'Firefox'
    case 'safari':
      return 'Safari'
    default:
      return t('Welcome.nostr.unknownBrowser')
  }
})

interface ExtensionLink {
  name: string
  url: string
  browsers: BrowserKind[]
}

const extensions: ExtensionLink[] = [
  {
    name: 'Alby',
    url: 'https://github.com/getAlby/lightning-browser-extension',
    browsers: ['chromium', 'firefox'],
  },
  { name: 'nos2x', url: 'https://github.com/fiatjaf/nos2x', browsers: ['chromium'] },
  { name: 'nos2x-fox', url: 'https://github.com/diegogurpegui/nos2x-fox', browsers: ['firefox'] },
  { name: 'nostr-keyx', url: 'https://github.com/susumuota/nostr-keyx', browsers: ['chromium'] },
  { name: 'AKA Profiles', url: 'https://github.com/neilck/aka-extension', browsers: ['chromium'] },
  { name: 'Frost2x', url: 'https://github.com/FROSTR-ORG/frost2x', browsers: ['chromium'] },
  { name: 'Keys.Band', url: 'https://github.com/toastr-space/keys-band', browsers: ['chromium'] },
  { name: 'horse', url: 'https://github.com/fiatjaf/horse', browsers: ['chromium'] },
  { name: 'Nostore', url: 'https://github.com/ursuscamp/nostore', browsers: ['safari'] },
  {
    name: 'Blockcore Wallet',
    url: 'https://github.com/block-core/blockcore-wallet',
    browsers: ['chromium', 'firefox'],
  },
]

const suggestedExtensions = computed(() => {
  const list = extensions.filter((e) => e.browsers.includes(browser.value))
  return list.length ? list : extensions
})

async function connectNip07() {
  error.value = ''
  connecting.value = true
  try {
    if (!nostr.signer) {
      await nostr.connectBrowserSigner()
    }
    welcome.nostrSetupCompleted = true
    npub.value = nostr.npub
    connected.value = true
    $q.notify({ type: 'positive', message: t('Welcome.nostr.connected') })
  } catch (e) {
    const msg = t('Welcome.nostr.errorConnect')
    error.value = msg
    $q.notify({ type: 'negative', message: msg })
  } finally {
    connecting.value = false
  }
}

async function generate() {
  error.value = ''
  await nostr.initWalletSeedPrivateKeySigner()
  welcome.nostrSetupCompleted = true
  npub.value = nostr.npub
  backupNsec.value = nostr.activePrivateKeyNsec
  nsec.value = nostr.activePrivateKeyNsec
  showBackup.value = true
}

async function importKey() {
  error.value = ''
  const input = nsec.value.trim()
  let nsecToUse = ''
  if (input.startsWith('nsec1')) {
    try {
      nip19.decode(input)
      nsecToUse = input
    } catch {
      error.value = t('Welcome.nostr.errorInvalid')
      return
    }
  } else if (/^[0-9a-fA-F]{64}$/.test(input)) {
    try {
      nsecToUse = nip19.nsecEncode(hexToBytes(input))
    } catch {
      error.value = t('Welcome.nostr.errorInvalid')
      return
    }
  } else {
    error.value = t('Welcome.nostr.errorInvalid')
    return
  }
  try {
    await nostr.initPrivateKeySigner(nsecToUse)
    welcome.nostrSetupCompleted = true
    npub.value = nostr.npub
    backupNsec.value = nostr.activePrivateKeyNsec
    showBackup.value = true
    nsec.value = ''
  } catch {
    error.value = t('Welcome.nostr.errorInvalid')
  }
}

function skip() {
  nsec.value = ''
  error.value = ''
  npub.value = ''
  connected.value = false
}
</script>

<style scoped>
h1 {
  font-weight: bold;
}
</style>
