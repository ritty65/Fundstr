<template>
  <q-page class="row">
    <ConversationList
      class="col-3"
      :conversations="conversations"
      :selectedPubkey="activeChatPubkey"
      @select="onSelectConversation"
    />
    <div class="col column">
      <ActiveChatHeader :pubkey="activeChatPubkey" :relays="[]" />
      <MessageList class="col" :messages="activeMessages" />
      <MessageInput @send="onSendMessage" />
    </div>
  </q-page>
</template>

<script lang="ts" setup>
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import ConversationList from "components/ConversationList.vue";
import MessageList from "components/MessageList.vue";
import ActiveChatHeader from "components/ActiveChatHeader.vue";
import MessageInput from "components/MessageInput.vue";
import { useDmStore } from "src/stores/dm";

const dmStore = useDmStore();
const route = useRoute();
const router = useRouter();

const activeChatPubkey = ref<string>((route.params.pubkey as string) || "");

watch(
  () => route.params.pubkey,
  (val) => {
    activeChatPubkey.value = (val as string) || "";
  },
);

watch(activeChatPubkey, (val) => {
  if ((route.params.pubkey as string) !== val) {
    router.replace({ params: { ...route.params, pubkey: val || undefined } });
  }
});

onMounted(async () => {
  if (!dmStore.isInitialized) {
    await dmStore.initialize();
  }
});

const conversations = computed(() => dmStore.sortedConversations);

const activeMessages = computed(() => {
  return (
    conversations.value.find((c) => c.pubkey === activeChatPubkey.value)
      ?.messages || []
  );
});

function onSelectConversation(pubkey: string) {
  activeChatPubkey.value = pubkey;
  dmStore.markConversationAsRead(pubkey);
}

async function onSendMessage(message: string) {
  if (!activeChatPubkey.value) return;
  await dmStore.sendMessage(activeChatPubkey.value, message);
}
</script>

<style scoped></style>

