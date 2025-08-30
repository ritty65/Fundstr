<template>
  <div class="col column q-pa-md relative-position">
    <QVirtualScroll
      ref="vscroll"
      class="col"
      :items="virtualItems"
      :virtual-scroll-item-size="ITEM_HEIGHT"
      :virtual-scroll-sizes="virtualSizes"
      @scroll="onScroll"
    >
      <template #default="{ item, index }">
        <div
          v-if="item.type === 'header'"
          :key="item.id"
          class="text-caption text-center q-my-md divider-text"
        >
          {{ item.day }}
        </div>
        <ChatMessageBubble
          v-else
          :key="item.id"
          :message="item.msg"
          :delivery-status="item.msg.status"
          :prev-message="
            virtualItems[index - 1]?.type === 'msg'
              ? (virtualItems[index - 1] as MsgItem).msg
              : undefined
          "
        />
      </template>
    </QVirtualScroll>
    <q-btn
      v-if="showNew"
      label="New messages"
      size="sm"
      color="primary"
      class="new-msg-btn"
      @click="scrollToBottom"
    />
  </div>
</template>

<script lang="ts" setup>
import { nextTick, ref, watch, computed, onMounted } from "vue";
import type { MessengerMessage } from "src/stores/messenger";
import type { QVirtualScroll } from "quasar";
import ChatMessageBubble from "./ChatMessageBubble.vue";

const props = defineProps<{ messages: MessengerMessage[] }>();

function formatDay(ts: number) {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString();
}

interface HeaderItem {
  type: "header";
  id: string;
  day: string;
}

interface MsgItem {
  type: "msg";
  id: string;
  msg: MessengerMessage;
}

type VirtualItem = HeaderItem | MsgItem;

const virtualItems = computed<VirtualItem[]>(() => {
  const items: VirtualItem[] = [];
  let lastDay: string | null = null;
  for (const m of props.messages) {
    const dayKey = new Date(m.created_at * 1000).toDateString();
    if (dayKey !== lastDay) {
      items.push({
        type: "header",
        id: `day-${dayKey}`,
        day: formatDay(m.created_at),
      });
      lastDay = dayKey;
    }
    items.push({ type: "msg", id: String(m.id), msg: m });
  }
  return items;
});

const ITEM_HEIGHT = 72;
const HEADER_HEIGHT = 40;

const virtualSizes = computed(() =>
  virtualItems.value.map((i) =>
    i.type === "header" ? HEADER_HEIGHT : ITEM_HEIGHT,
  ),
);

const vscroll = ref<QVirtualScroll>();
const pinned = ref(true);
const showNew = ref(false);

function onScroll(e: Event) {
  const el = e.target as HTMLElement;
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  pinned.value = distance < 24;
  if (pinned.value) {
    showNew.value = false;
  }
}

function scrollToBottom() {
  nextTick(() => {
    vscroll.value?.scrollTo(virtualItems.value.length - 1, "end");
    showNew.value = false;
  });
}

watch(
  () => props.messages,
  () => {
    nextTick(() => {
      if (pinned.value) {
        scrollToBottom();
      } else {
        showNew.value = true;
      }
    });
  },
  { deep: true },
);

onMounted(() => {
  scrollToBottom();
});

const formatDate = (ts: number) => new Date(ts * 1000).toLocaleString();
</script>

<style scoped>
.new-msg-btn {
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
}
</style>
