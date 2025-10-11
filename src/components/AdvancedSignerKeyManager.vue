<template>
  <q-expansion-item
    v-model="expanded"
    dense
    dense-toggle
    switch-toggle-side
    class="advanced-signer-card"
  >
    <template #header>
      <div class="row items-start items-md-center justify-between full-width q-gutter-sm">
        <div class="column q-gutter-xs">
          <div class="text-body1 text-weight-medium text-1">Advanced signer keys</div>
          <div class="text-caption text-2">
            Generate or import a dedicated Nutzap signer when you are not using the Fundstr identity.
          </div>
        </div>
        <q-chip v-if="keyBadge" dense size="sm" color="primary" text-color="white">
          {{ keyBadge }}
        </q-chip>
      </div>
    </template>

    <div class="column q-gutter-md q-mt-sm">
      <div v-if="usingStoreIdentity" class="text-body2 text-2">
        The shared Fundstr signer is active. Disconnect it from Creator Studio to manage a dedicated Nutzap key.
      </div>
      <template v-else>
        <q-input
          v-model="keyImportValue"
          label="Secret key (nsec or hex)"
          dense
          filled
          autocomplete="off"
        />
        <div class="row q-gutter-sm">
          <q-btn outline color="primary" label="Import" @click="importSecretKey" />
          <q-btn color="primary" label="Generate new" @click="generateNewSecret" />
        </div>
        <q-input v-model="keySecretHex" label="Secret (hex)" dense filled readonly />
        <q-input v-model="keyNsec" label="Secret (nsec)" dense filled readonly />
        <q-input v-model="keyNpub" label="Public (npub)" dense filled readonly />
      </template>
    </div>
  </q-expansion-item>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { getPublicKey as getNostrPublicKey, generateSecretKey, nip19 } from 'nostr-tools';
import { notifyError, notifySuccess, notifyWarning } from 'src/js/notify';
import { useNutzapSignerWorkspace } from 'src/nutzap/useNutzapSignerWorkspace';

const authorInput = ref('');

const {
  keySecretHex,
  keyNsec,
  keyPublicHex,
  keyNpub,
  keyImportValue,
  advancedKeyManagementOpen,
  usingStoreIdentity,
} = useNutzapSignerWorkspace(authorInput);

const expanded = computed({
  get: () => advancedKeyManagementOpen.value,
  set: value => {
    advancedKeyManagementOpen.value = value;
  },
});

watch(
  usingStoreIdentity,
  value => {
    expanded.value = !value;
  },
  { immediate: true }
);

const keyBadge = computed(() => {
  const trimmed = keyPublicHex.value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 16) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
});

function ensureActionsAllowed(): boolean {
  if (usingStoreIdentity.value) {
    notifyWarning('Switch to a dedicated Nutzap signer to manage secret keys.');
    return false;
  }
  return true;
}

function safeEncodeNpub(pubHex: string) {
  try {
    return nip19.npubEncode(pubHex);
  } catch {
    return '';
  }
}

function applySecretBytes(sk: Uint8Array) {
  const secretHex = bytesToHex(sk);
  const publicHex = getNostrPublicKey(sk);
  keySecretHex.value = secretHex;
  keyPublicHex.value = publicHex;
  keyNpub.value = safeEncodeNpub(publicHex) || publicHex;
  keyNsec.value = nip19.nsecEncode(sk);
  keyImportValue.value = '';
  authorInput.value = keyNpub.value || publicHex;
}

function generateNewSecret() {
  if (!ensureActionsAllowed()) {
    return;
  }
  const secret = generateSecretKey();
  applySecretBytes(secret);
  notifySuccess('Generated new secret key.');
}

function importSecretKey() {
  if (!ensureActionsAllowed()) {
    return;
  }
  const trimmed = keyImportValue.value.trim();
  if (!trimmed) {
    notifyWarning('Enter a private key to import.');
    return;
  }

  try {
    if (/^nsec/i.test(trimmed)) {
      const decoded = nip19.decode(trimmed);
      if (decoded.type !== 'nsec' || !decoded.data) {
        throw new Error('Invalid nsec key.');
      }
      const data = decoded.data instanceof Uint8Array ? decoded.data : hexToBytes(String(decoded.data));
      applySecretBytes(data);
      notifySuccess('Secret key imported.');
      return;
    }

    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      applySecretBytes(hexToBytes(trimmed));
      notifySuccess('Secret key imported.');
      return;
    }

    throw new Error('Enter a valid nsec or 64-character hex secret key.');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : 'Unable to import key.');
  }
}
</script>

<style scoped>
.advanced-signer-card {
  border-radius: 12px;
  border: 1px solid var(--surface-contrast-border);
  padding: 12px;
}
</style>
