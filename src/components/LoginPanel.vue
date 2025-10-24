<template>
  <div class="flex flex-col space-y-4">
    <q-btn color="primary" class="w-full" @click="loginWithNip07"
      >Login with Browser Signer</q-btn
    >
    <q-input v-model="nsec" type="password" label="nsec" outlined dense />
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

const { loginWithExtension, loginWithSecret } = useNostrAuth();
const nsec = ref("");

async function loginWithNip07() {
  await loginWithExtension();
}

async function loginNsec() {
  if (!nsec.value) return;
  await loginWithSecret(nsec.value);
}
</script>
