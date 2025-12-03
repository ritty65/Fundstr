<template>
  <q-dialog v-if="!inline" v-model="model">
    <q-card style="min-width:320px">
      <q-card-section class="text-h6">Nostr Identity</q-card-section>
      <q-separator />
      <q-card-section class="q-gutter-sm">
        <q-btn
          v-if="hasNip07"
          unelevated
          color="primary"
          class="full-width"
          label="Use NIP-07"
          @click="connectNip07"
        />
        <div v-if="connectError" class="text-negative text-caption">{{ connectError }}</div>
        <q-btn
          unelevated
          color="primary"
          class="full-width"
          label="Generate new key"
          @click="generateKey"
        />
        <q-form @submit.prevent="importKey" class="full-width">
          <q-input v-model="nsec" label="Import nsec" autocomplete="off" />
          <q-btn
            unelevated
            color="primary"
            class="full-width q-mt-sm"
            :disable="!nsec"
            label="Import"
            type="submit"
          />
        </q-form>
      </q-card-section>
    </q-card>
  </q-dialog>
  <div v-else>
    <q-card flat>
      <q-card-section class="text-h6">Nostr Identity</q-card-section>
      <q-separator />
      <q-card-section class="q-gutter-sm">
        <q-btn
          v-if="hasNip07"
          unelevated
          color="primary"
          class="full-width"
          label="Use NIP-07"
          @click="connectNip07"
        />
        <div v-if="connectError" class="text-negative text-caption">{{ connectError }}</div>
        <q-btn
          unelevated
          color="primary"
          class="full-width"
          label="Generate new key"
          @click="generateKey"
        />
        <q-form @submit.prevent="importKey" class="full-width">
          <q-input v-model="nsec" label="Import nsec" autocomplete="off" />
          <q-btn
            unelevated
            color="primary"
            class="full-width q-mt-sm"
            :disable="!nsec"
            label="Import"
            type="submit"
          />
        </q-form>
      </q-card-section>
    </q-card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { SignerType, useNostrStore } from 'src/stores/nostr'

const props = defineProps<{ modelValue?: boolean; inline?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'done'): void }>()

const model = ref(props.modelValue ?? false)
watch(() => props.modelValue, v => (model.value = v ?? false))
watch(model, v => emit('update:modelValue', v))

const inline = computed(() => !!props.inline)

const { t } = useI18n()
const $q = useQuasar()
const nostr = useNostrStore()
const nsec = ref('')
const connectError = ref('')

const hasNip07 = ref(false)
onMounted(() => {
  const maxWaitMs = 15000
  const startedAt = Date.now()

  const check = () => {
    if (typeof window !== 'undefined' && (window as any).nostr?.getPublicKey) {
      hasNip07.value = true
      clearInterval(interval)
      clearTimeout(timeout)
    }

    if (Date.now() - startedAt >= maxWaitMs) {
      clearInterval(interval)
    }
  }
  const interval = setInterval(check, 500)
  const timeout = setTimeout(() => clearInterval(interval), maxWaitMs)
  check()
})

type Nip07ErrorResolution = { message: string; retryable?: boolean }

function resolveNip07Error(): Nip07ErrorResolution {
  const cause = nostr.nip07LastFailureCause
  if (cause === 'extension-missing') {
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
  connectError.value = ''
  try {
    const available = await nostr.checkNip07Signer(true)
    if (!available) throw new Error('NIP-07 unavailable')
    const pk = await (window as any).nostr.getPublicKey()
    const test = {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: 'test',
    }
    await (window as any).nostr.signEvent(test)
    await nostr.connectBrowserSigner()
    nostr.setPubkey(pk)
    nostr.signerType = SignerType.NIP07
    close()
  } catch (e) {
    const { message, retryable } = resolveNip07Error()
    if (retryable && allowRetry) {
      const delayMs = Math.min(750 * Math.max(1, nostr.nip07RetryAttempts || 1), 4000)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
      return connectNip07({ allowRetry: false })
    }

    connectError.value = message
    $q.notify({ type: 'negative', message })
    console.error(e)
  }
}

async function generateKey() {
  await nostr.initWalletSeedPrivateKeySigner()
  close()
}

async function importKey() {
  try {
    await nostr.initPrivateKeySigner(nsec.value.trim())
    close()
  } catch (e) {
    console.error(e)
  }
}

function close() {
  connectError.value = ''
  emit('done')
  if (!inline.value) model.value = false
}
</script>
