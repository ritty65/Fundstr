<template>
  <q-virtual-scroll
    ref="vs"
    class="col column q-pa-md"
    :items="displayItems"
    :virtual-scroll-item-size="72"
    :virtual-scroll-item-key="(item) => item.id"
    v-slot="{ item }"
  >
    <div
      v-if="item.type === 'separator'"
      class="text-caption text-center q-my-md divider-text"
    >
      {{ formatDay(item.ts) }}
    </div>
    <ChatMessageBubble
      v-else
      :message="item.msg"
      :delivery-status="item.msg.status"
      :prev-message="messages[item.index - 1]"
    />
  </q-virtual-scroll>
</template>

<script lang="ts" setup>
import { nextTick, ref, watch, computed } from "vue";
import type { MessengerMessage } from "src/stores/messenger";
import ChatMessageBubble from "./ChatMessageBubble.vue";
import { QVirtualScroll } from "quasar";

const props = defineProps<{ messages: MessengerMessage[] }>();
const messages = computed(() => props.messages);
const vs = ref<InstanceType<typeof QVirtualScroll> | null>(null);

function formatDay(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString();
}

function showDateSeparator(idx: number) {
  if (idx === 0) return true;
  const prev = props.messages[idx - 1];
  const prevDay = new Date(prev.created_at * 1000).toDateString();
  const currDay = new Date(props.messages[idx].created_at * 1000).toDateString();
  return prevDay !== currDay;
}

const displayItems = computed(() => {
  const items: Array<
    | { type: "separator"; id: string; ts: number }
    | { type: "message"; id: string; msg: MessengerMessage; index: number }
  > = [];
  props.messages.forEach((msg, idx) => {
    if (showDateSeparator(idx)) {
      items.push({ type: "separator", id: `sep-${idx}`, ts: msg.created_at });
    }
    items.push({ type: "message", id: msg.id, msg, index: idx });
  });
  return items;
});

watch(
  () => props.messages,
  () => {
    nextTick(() => vs.value?.scrollTo(displayItems.value.length - 1));
  },
  { deep: true },
);

const formatDate = (ts: number) => new Date(ts * 1000).toLocaleString();

defineExpose({ formatDay, showDateSeparator });
</script>
