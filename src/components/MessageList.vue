<template>
  <q-virtual-scroll
    ref="scroll"
    class="col column q-pa-md"
    :items="messages"
    :virtual-scroll-slice-size="30"
    v-slot="{ item: msg, index: idx }"
  >
    <div
      v-if="showDateSeparator(idx)"
      class="text-caption text-center q-my-md divider-text"
    >
      {{ formatDay(msg.created_at) }}
    </div>
    <ChatMessageBubble
      :message="msg"
      :delivery-status="msg.status"
      :prev-message="messages[idx - 1]"
    />
  </q-virtual-scroll>
</template>

<script lang="ts" setup>
import { nextTick, ref, watch } from "vue";
import type { MessengerMessage } from "src/stores/messenger";
import ChatMessageBubble from "./ChatMessageBubble.vue";

const props = defineProps<{ messages: MessengerMessage[] }>();
const scroll = ref<any>();

function formatDay(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString();
}

function showDateSeparator(idx: number) {
  if (idx === 0) return true;
  const prev = props.messages[idx - 1];
  const prevDay = new Date(prev.created_at * 1000).toDateString();
  const currDay = new Date(
    props.messages[idx].created_at * 1000,
  ).toDateString();
  return prevDay !== currDay;
}

watch(
  () => props.messages.length,
  () => {
    nextTick(() => scroll.value?.scrollTo(props.messages.length - 1, "end"));
  },
);

defineExpose({ formatDay, showDateSeparator });
</script>
