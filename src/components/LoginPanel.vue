<template>
  <div class="flex flex-col space-y-4">
    <q-btn color="primary" class="w-full" @click="loginWithNip07"
      >Login with Browser Signer</q-btn
    >
    <q-input v-model="nsec" type="password" label="nsec" outlined dense />
    <q-input
      v-model="pin"
      :type="showPin ? 'text' : 'password'"
      label="Unlock PIN / Password"
      outlined
      dense
      :error="Boolean(errorMessage)"
      :error-message="errorMessage"
    >
      <template #append>
        <q-icon
          :name="showPin ? 'visibility_off' : 'visibility'"
          class="cursor-pointer"
          @click="showPin = !showPin"
        />
      </template>
    </q-input>
    <div class="text-negative text-xs">
      Keep your nsec secret – it never leaves your browser.
    </div>
    <q-btn color="primary" outline class="w-full" @click="loginNsec"
      >Login with nsec</q-btn
    >
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useNostrAuth } from "src/composables/useNostrAuth";
import { useNostrStore } from "src/stores/nostr";
import { nip19, getPublicKey } from "nostr-tools";
import { isValidNpub } from "src/utils/validators";

const { loginWithExtension, loginWithSecret } = useNostrAuth();
const nsec = ref("");
const pin = ref("");
const showPin = ref(false);
const errorMessage = ref("");
const nostr = useNostrStore();

async function ensureEncryptionReady() {
  errorMessage.value = "";
  if (!pin.value.trim()) {
    errorMessage.value = "PIN required";
    throw new Error("PIN required");
  }
  if (nostr.encryptionKey) return;
  if (nostr.hasEncryptedSecrets()) {
    await nostr.unlockWithPin(pin.value.trim());
  } else {
    await nostr.setEncryptionKeyFromPin(pin.value.trim());
  }
}

async function loginWithNip07() {
  try {
    await ensureEncryptionReady();
    await loginWithExtension();
    if (!isValidNpub(nostr.npub)) {
      throw new Error("Invalid Nostr Public Key");
    }
  } catch (e: any) {
    errorMessage.value = e?.message || "Invalid Nostr Public Key";
  }
}

async function loginNsec() {
  if (!nsec.value) return;
  errorMessage.value = "";
  try {
    const decoded = nip19.decode(nsec.value);
    const pub = getPublicKey(decoded.data as Uint8Array);
    const encoded = nip19.npubEncode(pub);
    if (!isValidNpub(encoded)) {
      throw new Error("Invalid Nostr Public Key");
    }
    await ensureEncryptionReady();
    await loginWithSecret(nsec.value);
  } catch (e: any) {
    errorMessage.value = e?.message || "Invalid Nostr Public Key";
  }
}
</script>
