<template>
  <div>
    <div v-if="isLoading" class="row justify-center q-my-md">
      <q-spinner />
    </div>
    <template v-else>
      <div
        v-if="conversations.length === 0"
        class="q-pa-md text-caption text-grey-7"
      >
        No active conversations.
      </div>
      <div v-else>
        <ConversationListItem
          v-for="c in conversations"
          :key="c.pubkey"
          :pubkey="c.pubkey"
          :lastMsg="c.lastMsg"
          :selected="c.pubkey === selectedPubkey"
          @click="onSelect(c.pubkey)"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import ConversationListItem from "./ConversationListItem.vue";

interface Conversation {
  pubkey: string;
  lastMsg: unknown;
}

const props = defineProps<{
  conversations: Conversation[];
  selectedPubkey?: string;
  isLoading?: boolean;
}>();

const emit = defineEmits<{ (e: "select", pubkey: string): void }>();

function onSelect(pubkey: string) {
  emit("select", pubkey);
}
</script>

<style scoped>
</style>
