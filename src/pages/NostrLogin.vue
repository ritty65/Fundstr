<template>
  <q-page class="bg-grey-10 q-pa-md flex flex-center">
    <q-card
      class="q-pa-md bg-grey-9 shadow-4"
      style="max-width: 400px; width: 100%"
    >
      <q-card-section class="text-h6">Nostr Identity</q-card-section>
      <q-card-section v-if="hasExistingKey">
        <q-banner dense class="bg-grey-3 q-mb-md">
          A private key is already present. Click "Use Key" to continue or
          replace it below.
        </q-banner>
      </q-card-section>
      <q-card-section>
        <q-input v-model="key" type="text" label="nsec or hex private key" />
      </q-card-section>
      <q-card-section v-if="statusMessage || statusError">
        <q-banner
          v-if="statusError"
          dense
          class="bg-red-2 text-red-10 q-mb-sm"
          rounded
        >
          {{ statusError }}
        </q-banner>
        <q-banner v-else dense class="bg-primary text-white" rounded>
          {{ statusMessage }}
        </q-banner>
        <q-linear-progress
          v-if="isBootstrapping"
          indeterminate
          color="primary"
          class="q-mt-sm"
        />
      </q-card-section>
      <q-card-actions vertical class="q-gutter-sm">
        <q-btn color="primary" :disable="isBootstrapping" @click="submitKey"
          >Use Key</q-btn
        >
        <q-btn color="primary" :disable="isBootstrapping" @click="useNip07"
          >Use NIP-07</q-btn
        >
        <q-btn
          flat
          color="primary"
          :disable="isBootstrapping"
          @click="createIdentity"
          >Create Identity</q-btn
        >
      </q-card-actions>
    </q-card>
  </q-page>
</template>

<script lang="ts">
import { defineComponent, ref, computed } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useNostrStore } from "stores/nostr";
import { generateSecretKey, nip19 } from "nostr-tools";
import { hexToBytes } from "@noble/hashes/utils";
import { useNostrAuth } from "src/composables/useNostrAuth";

export default defineComponent({
  name: "NostrLogin",
  setup() {
    const nostr = useNostrStore();
    const { loginWithExtension } = useNostrAuth();
    const key = ref(nostr.activePrivateKeyNsec || nostr.privKeyHex || "");
    const hasExistingKey = computed(() => !!key.value);
    const router = useRouter();
    const route = useRoute();
    const isBootstrapping = ref(false);
    const statusMessage = ref("" as string | null);
    const statusError = ref("" as string | null);
    const redirect =
      typeof route.query.redirect === "string"
        ? decodeURIComponent(route.query.redirect)
        : undefined;
    const tierId =
      typeof route.query.tierId === "string" ? route.query.tierId : undefined;

    const normalizeKey = (input: string): string => {
      const trimmed = input.trim();
      if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return nip19.nsecEncode(hexToBytes(trimmed));
      }
      return trimmed;
    };

    const handleRedirect = () => {
      if (redirect) {
        router.replace({ path: redirect, query: tierId ? { tierId } : undefined });
      } else {
        router.replace("/wallet");
      }
    };

    const bootstrapAndRedirect = async () => {
      statusError.value = null;
      statusMessage.value = "Starting identity bootstrap";
      isBootstrapping.value = true;
      try {
        await nostr.bootstrapIdentity((msg) => {
          statusMessage.value = msg;
        });
        handleRedirect();
      } catch (err) {
        console.error(err);
        statusError.value =
          (err as Error)?.message ?? "Failed to finish setting up your identity.";
      } finally {
        isBootstrapping.value = false;
      }
    };

    const completeLogin = async (fn: () => Promise<void>) => {
      statusError.value = null;
      await fn();
      if (!nostr.hasIdentity) return;
      await bootstrapAndRedirect();
    };

    const submitKey = async () => {
      if (!key.value.trim()) return;
      await completeLogin(() =>
        nostr.updateIdentity(normalizeKey(key.value)),
      );
    };

    const createIdentity = async () => {
      const sk = generateSecretKey();
      const nsec = nip19.nsecEncode(sk);
      await completeLogin(() => nostr.updateIdentity(nsec));
    };

    const useNip07 = async () => {
      const available = await nostr.checkNip07Signer(true);
      if (!available) return;
      try {
        await nostr.connectBrowserSigner();
        await completeLogin(() => loginWithExtension());
      } catch (e) {
        console.error(e);
        statusError.value = (e as Error)?.message ?? "NIP-07 login failed";
      }
    };

    return {
      key,
      hasExistingKey,
      submitKey,
      createIdentity,
      useNip07,
      isBootstrapping,
      statusMessage,
      statusError,
    };
  },
});
</script>
