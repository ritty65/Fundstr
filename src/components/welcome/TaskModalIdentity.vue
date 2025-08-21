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
import { ref, computed, watch } from 'vue'
import { useNostrStore, SignerType } from 'src/stores/nostr'

const props = defineProps<{ modelValue?: boolean; inline?: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void; (e: 'done'): void }>()

const model = ref(props.modelValue ?? false)
watch(() => props.modelValue, v => (model.value = v ?? false))
watch(model, v => emit('update:modelValue', v))

const inline = computed(() => !!props.inline)

const nostr = useNostrStore()
const nsec = ref('')

const hasNip07 = computed(
  () => typeof window !== 'undefined' && !!(window as any).nostr?.getPublicKey,
)

async function connectNip07() {
  try {
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
  emit('done')
  if (!inline.value) model.value = false
}
</script>
