<template>
  <q-page class="row">
    <ConversationList
      class="col-3"
      :selectedPubkey="selectedPubkey"
      @select="handleSelect"
    />
    <div class="col column">
      <ActiveChatHeader :pubkey="selectedPubkey" :relays="[]" />
      <MessageList :messages="messages" class="col" />
      <MessageInput @send="handleSend" />
    </div>
  </q-page>
</template>

<script lang="ts" setup>
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import ConversationList from "components/ConversationList.vue";
import MessageList from "components/MessageList.vue";
import MessageInput from "components/MessageInput.vue";
import ActiveChatHeader from "components/ActiveChatHeader.vue";
import { useDmStore } from "src/stores/dm";

const dmStore = useDmStore();
const route = useRoute();
const router = useRouter();

const selectedPubkey = computed(() => (route.params.pubkey as string) || "");
const messages = computed(
  () => dmStore.conversations.get(selectedPubkey.value)?.messages || [],
);

onMounted(() => {
  if (!dmStore.isInitialized) {
    dmStore.initialize();
  }
});

function handleSend(payload: string | { text: string; attachment?: { dataUrl: string; name: string; type: string } }) {
  if (!selectedPubkey.value) return;
  if (typeof payload === "string") {
    dmStore.sendMessage(selectedPubkey.value, payload);
    return;
  }
  const { text, attachment } = payload;
  if (text) dmStore.sendMessage(selectedPubkey.value, text);
  if (attachment) {
    dmStore.sendMessage(selectedPubkey.value, attachment.dataUrl);
  }
}

function handleSelect(pubkey: string) {
  dmStore.markConversationAsRead(pubkey);
  router.push(`/messenger/${pubkey}`);
}
</script>

<style scoped>
</style>

