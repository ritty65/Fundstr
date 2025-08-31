<template>
  <q-banner v-if="nostr.connectionFailed" dense class="bg-red-2 q-mb-sm">
    <div class="row items-center no-wrap">
      <span>Unable to reach Nostr relays – retry</span>
      <q-space />
      <q-btn flat dense label="Reconnect" @click="nostr.connect()" />
    </div>
  </q-banner>
</template>

<script lang="ts" setup>
import { useNostrStore } from "src/stores/nostr";

const nostr = useNostrStore();
</script>
