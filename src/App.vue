<template>
  <router-view />
</template>

<script setup>
import { watch } from "vue";
import { useUiStore } from "src/stores/ui";
import { useNostrStore } from "src/stores/nostr";
import { useDmStore } from "src/stores/dm";

const ui = useUiStore();
ui.initNetworkWatcher();

const nostrStore = useNostrStore();
const dmStore = useDmStore();

watch(
  () => nostrStore.currentUser,
  (user) => {
    if (user) {
      dmStore.initialize();
    }
  },
  { immediate: true },
);
</script>
