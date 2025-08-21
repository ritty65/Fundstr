<template>
  <div>
    <div
      v-if="filteredPinned.length + filteredRegular.length === 0"
      class="q-pa-md text-caption text-grey-7"
    >
      No active conversations.
    </div>
    <q-virtual-scroll
      v-else
      :items="virtualItems"
      :virtual-scroll-sizes="virtualSizes"
      :virtual-scroll-item-size="itemHeight"
      class="full-width conversation-vscroll"
    >
      <template v-slot="{ item }">
        <q-item-label
          v-if="item.type === 'header'"
          :key="item.key"
          header
          class="conversation-header q-px-md q-pt-sm q-pb-xs"
        >
          {{ item.label }}
        </q-item-label>
        <ConversationListItem
          v-else
          :key="item.key"
          :pubkey="item.pubkey"
          :lastMsg="item.lastMsg"
          :selected="item.pubkey === selectedPubkey"
          @click="select(item.pubkey)"
          @pin="togglePin(item.pubkey)"
          @delete="deleteConversation(item.pubkey)"
        />
      </template>
    </q-virtual-scroll>
  </div>
</template>

<script lang="ts" setup>
import { computed, watch, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { useMessengerStore } from "src/stores/messenger";
import { useNostrStore } from "src/stores/nostr";
import ConversationListItem from "./ConversationListItem.vue";

const props = defineProps<{
  selectedPubkey: string;
  search?: string;
  mini?: boolean;
}>();

const emit = defineEmits(["select"]);
const messenger = useMessengerStore();
const nostr = useNostrStore();
const { conversations } = storeToRefs(messenger);
const filterQuery = ref(props.search || "");
watch(
  () => props.search,
  (val) => {
    filterQuery.value = val || "";
  },
);

const uniqueConversations = computed(() => {
  return Object.entries(conversations.value)
    .map(([pubkey, msgs]) => ({
      pubkey,
      lastMsg: msgs[msgs.length - 1],
      timestamp: msgs[msgs.length - 1]?.created_at,
      pinned: messenger.pinned[pubkey] || false,
    }))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (b.pinned && !a.pinned) return 1;
      return b.timestamp - a.timestamp;
    });
});

const pinnedConversations = computed(() =>
  uniqueConversations.value.filter((c) => c.pinned),
);

const regularConversations = computed(() =>
  uniqueConversations.value.filter((c) => !c.pinned),
);

const applyFilter = (list: typeof uniqueConversations.value) => {
  const q = filterQuery.value.toLowerCase();
  if (!q) return list;
  return list.filter(({ pubkey }) => {
    const entry: any = (nostr.profiles as any)[pubkey];
    const profile = entry?.profile ?? entry ?? {};
    const name =
      profile.display_name || profile.name || profile.displayName || pubkey;
    return name.toLowerCase().includes(q) || pubkey.toLowerCase().includes(q);
  });
};

const filteredPinned = computed(() => applyFilter(pinnedConversations.value));
const filteredRegular = computed(() => applyFilter(regularConversations.value));

const itemHeight = computed(() => (messenger.drawerMini ? 60 : 72));
const HEADER_HEIGHT = 36;

interface VirtualHeader {
  type: "header";
  key: string;
  label: string;
}

interface VirtualItem {
  type: "item";
  key: string;
  pubkey: string;
  lastMsg: any;
}

type VirtualEntry = VirtualHeader | VirtualItem;

const virtualItems = computed<VirtualEntry[]>(() => {
  const items: VirtualEntry[] = [];
  if (filteredPinned.value.length) {
    if (!props.mini) {
      items.push({ type: "header", key: "header-pinned", label: "Pinned" });
    }
    filteredPinned.value.forEach((c) =>
      items.push({ type: "item", key: "pinned-" + c.pubkey, ...c }),
    );
  }
  if (!props.mini) {
    items.push({
      type: "header",
      key: "header-all",
      label: "All Conversations",
    });
  }
  filteredRegular.value.forEach((c) =>
    items.push({ type: "item", key: "reg-" + c.pubkey, ...c }),
  );
  return items;
});

const virtualSizes = computed(() =>
  virtualItems.value.map((i) =>
    i.type === "header" ? HEADER_HEIGHT : itemHeight.value,
  ),
);

const loadProfiles = async () => {
  for (const { pubkey } of uniqueConversations.value) {
    if (!(nostr.profiles as any)[pubkey]) {
      await nostr.getProfile(pubkey);
    }
  }
};

onMounted(loadProfiles);
watch(uniqueConversations, loadProfiles);

const select = (pubkey: string) => emit("select", nostr.resolvePubkey(pubkey));
const togglePin = (pubkey: string) => {
  messenger.togglePin(nostr.resolvePubkey(pubkey));
};

const deleteConversation = (pubkey: string) => {
  messenger.deleteConversation(nostr.resolvePubkey(pubkey));
};
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

.conversation-header {
  position: sticky;
  top: 0;
  z-index: 1;
  /* Inherit drawer bg – no bright fill */
  background: transparent;
  /* Quiet label aesthetics */
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-weight: 600;
  font-size: 0.72rem;
  opacity: 0.7;
  /* Subtle divider that adapts to theme */
  --sep: rgba(0, 0, 0, 0.12);
  border-bottom: 1px solid var(--sep);
}
@media (prefers-color-scheme: dark) {
  .conversation-header {
    --sep: rgba(255, 255, 255, 0.08);
  }
}
</style>
