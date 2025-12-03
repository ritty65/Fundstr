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
          :disable="connected"
          :loading="connecting"
          :icon="connected ? 'check' : undefined"
        />
        <div v-if="waitingForNip07" class="text-caption">
          {{ t('Welcome.nostr.waitingExtension') }}
        </div>
        <div v-else-if="!nip07Detected" class="text-caption">
          <div>{{ t('Welcome.nostr.installHint') }}</div>
          <div>{{ t('Welcome.nostr.installBrowser', { browser: browserLabel }) }}</div>
          <ul class="q-mt-xs">
            <li v-for="ext in suggestedExtensions" :key="ext.name">
              <a :href="ext.url" target="_blank" class="text-primary">{{ ext.name }}</a>
            </li>
          </ul>
        </div>
        <div v-else-if="!nip07Available && !connected" class="text-caption">
          {{ t('Welcome.nostr.lockedHint') }}
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
import { ref, computed, onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useQuasar } from 'quasar'
import { useNostrStore } from 'src/stores/nostr'
import { useWelcomeStore } from 'src/stores/welcome'
import { useNostrAuth } from 'src/composables/useNostrAuth'
import NostrBackupDialog from 'src/components/welcome/NostrBackupDialog.vue'
import { nip19 } from 'nostr-tools'
import { hexToBytes } from '@noble/hashes/utils'

const { t } = useI18n()
const $q = useQuasar()
const nostr = useNostrStore()
const welcome = useWelcomeStore()
const { loginWithExtension, loginWithSecret } = useNostrAuth()
const id = 'welcome-nostr-title'

const nsec = ref('')
const error = ref('')
const npub = ref('')
const showBackup = ref(false)
const backupNsec = ref('')
const connecting = ref(false)
const connected = ref(false)
const nip07Detected = ref(false)
const nip07Available = ref(false)
const waitingForNip07 = ref(true)
let refreshPromise: Promise<void> | null = null
let checkInterval: ReturnType<typeof setInterval> | null = null
let checkTimeout: ReturnType<typeof setTimeout> | null = null
const maxWaitForNip07Ms = 15000
let nip07WaitStartedAt = 0

const refreshNip07Status = async (force = false) => {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      nip07Detected.value = typeof window !== 'undefined' && Boolean((window as any).nostr)

      if (nip07Detected.value) {
        waitingForNip07.value = false
      }

      if (!nip07Detected.value) {
        nip07Available.value = false
        return
      }

      nip07Available.value = await nostr.checkNip07Signer(force)
    } catch (e) {
      nip07Available.value = false
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

onMounted(() => {
  nip07WaitStartedAt = Date.now()
  refreshNip07Status()
  checkInterval = window.setInterval(async () => {
    const elapsed = Date.now() - nip07WaitStartedAt
    waitingForNip07.value = !nip07Detected.value && elapsed < maxWaitForNip07Ms

    await refreshNip07Status()

    if (nip07Detected.value || elapsed >= maxWaitForNip07Ms) {
      waitingForNip07.value = false
      if (checkInterval) {
        clearInterval(checkInterval)
        checkInterval = null
      }
    }
  }, 500)
  checkTimeout = window.setTimeout(() => {
    waitingForNip07.value = false
    if (checkInterval) {
      clearInterval(checkInterval)
      checkInterval = null
    }
  }, maxWaitForNip07Ms)
})

onBeforeUnmount(() => {
  if (checkInterval) clearInterval(checkInterval)
  if (checkTimeout) clearTimeout(checkTimeout)
})

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

type Nip07ErrorResolution = { message: string; retryable?: boolean }

function resolveNip07Error(): Nip07ErrorResolution {
  const cause = nostr.nip07LastFailureCause
  if (!nip07Detected.value || cause === 'extension-missing') {
    return { message: t('Welcome.nostr.errorMissingExtension') }
  }
  if (cause === 'enable-failed') {
    return { message: t('Welcome.nostr.errorEnableTimeout'), retryable: true }
  }
  if (cause === 'user-failed') {
    return { message: t('Welcome.nostr.errorUserDenied') }
  }

  return { message: t('Welcome.nostr.errorConnect'), retryable: true }
}

async function connectNip07(options: { allowRetry?: boolean } = {}) {
  const { allowRetry = true } = options
  error.value = ''
  connecting.value = true
  try {
    await refreshNip07Status(true)
    const available = nip07Available.value
    if (!available) throw new Error('NIP-07 unavailable')
    if (!nostr.signer) {
      await nostr.connectBrowserSigner()
    }
    await loginWithExtension()
    welcome.nostrSetupCompleted = true
    npub.value = nostr.npub
    connected.value = true
    nip07Available.value = true
    $q.notify({ type: 'positive', message: t('Welcome.nostr.connected') })
  } catch (e) {
    const { message, retryable } = resolveNip07Error()
    if (retryable && allowRetry) {
      const delayMs = Math.min(750 * Math.max(1, nostr.nip07RetryAttempts || 1), 4000)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return connectNip07({ allowRetry: false })
    }

    error.value = message
    $q.notify({ type: 'negative', message })
  } finally {
    connecting.value = false
  }
}

async function generate() {
  error.value = ''
  await nostr.initWalletSeedPrivateKeySigner()
  await loginWithSecret(nostr.activePrivateKeyNsec)
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
      await loginWithSecret(nostr.activePrivateKeyNsec)
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
