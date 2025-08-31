<template>
  <div>
    <div
      v-if="!virtualItems.length"
      class="q-pa-md text-caption text-grey-7"
    >
      No active conversations.
    </div>
    <q-virtual-scroll
      v-else
      :items="virtualItems"
      :virtual-scroll-sizes="virtualSizes"
      :virtual-scroll-item-size="ITEM_HEIGHT"
      class="full-width conversation-vscroll"
    >
      <template v-slot="{ item }">
        <ConversationListItem
          :key="item.key"
          :pubkey="item.pubkey"
          :lastMsg="item.lastMsg"
          :selected="item.pubkey === activePubkey"
          @click="emit('select', item.pubkey)"
          @pin="emit('pin', item.pubkey)"
          @delete="emit('delete', item.pubkey)"
        />
      </template>
    </q-virtual-scroll>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import ConversationListItem from './ConversationListItem.vue';
import type { NostrConversation } from 'src/stores/dm';

const props = defineProps<{
  conversations: NostrConversation[];
  activePubkey?: string;
}>();

const emit = defineEmits<{
  (e: 'select', pubkey: string): void;
  (e: 'pin', pubkey: string): void;
  (e: 'delete', pubkey: string): void;
}>();

const ITEM_HEIGHT = 72;

const virtualItems = computed(() =>
  props.conversations.map((c) => ({
    key: c.pubkey,
    pubkey: c.pubkey,
    lastMsg: c.messages[c.messages.length - 1],
  })),
);

const virtualSizes = computed(() => virtualItems.value.map(() => ITEM_HEIGHT));
</script>

<style scoped>
/* Ensure 100% width includes the 1px borders; prevents side overflow */
.conversation-vscroll {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
}
.conversation-vscroll :deep(.q-virtual-scroll__content) {
  box-sizing: border-box;
  max-width: 100%;
}
/* Safety if a flex wrapper is around */
:host {
  min-width: 0;
}
</style>
