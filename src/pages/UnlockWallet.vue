<template>
  <q-page class="column flex-center q-pa-lg bg-surface-1">
    <div class="q-pa-lg bg-surface-2" style="max-width: 480px; width: 100%">
      <div class="text-h5 q-mb-sm">Unlock Wallet</div>
      <div class="text-body2 q-mb-md">
        Enter your wallet PIN/password to unlock your encrypted data.
      </div>
      <q-input
        v-model="pin"
        :type="showPin ? 'text' : 'password'"
        label="PIN / Password"
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
      <div class="row justify-between q-mt-lg">
        <q-btn color="primary" :loading="unlocking" label="Unlock" @click="unlock" />
        <q-btn flat color="primary" :to="{ path: '/welcome' }">Reset Wallet</q-btn>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useNostrStore } from "src/stores/nostr";
import { useVaultStore } from "src/stores/vault";

const pin = ref("");
const showPin = ref(false);
const errorMessage = ref("");
const unlocking = ref(false);
const router = useRouter();
const route = useRoute();
const nostr = useNostrStore();
const vault = useVaultStore();

async function unlock() {
  errorMessage.value = "";
  if (!pin.value.trim()) {
    errorMessage.value = "PIN required";
    return;
  }
  unlocking.value = true;
  try {
    const pinValue = pin.value.trim();
    await nostr.unlockWithPin(pinValue);
    if (vault.hasEncryptedVault) {
      await vault.unlockWithPin(pinValue);
    }
    const redirect = (route.query.redirect as string) || "/wallet";
    router.replace(redirect);
  } catch (e: any) {
    errorMessage.value = e?.message || "Incorrect PIN";
  } finally {
    unlocking.value = false;
  }
}
</script>
