<template>
  <div>
    <q-input
      v-model="relayText"
      type="textarea"
      label="Relay URLs (one per line)"
      class="q-mb-sm"
      dense
    />
    <div class="q-mb-sm" v-if="relayStatuses.length">
      <div class="text-subtitle2 q-mb-xs" aria-live="polite">
        {{ connectedCount }} / {{ relayStatuses.length }} connected
      </div>
      <q-expansion-item
        v-if="connectedRelays.length"
        dense
        expand-separator
        label="Connected"
        default-opened
      >
        <div
          v-for="s in connectedRelays"
          :key="s.url"
          class="row items-center q-my-xs"
        >
          <q-badge
            class="q-mr-sm"
            rounded
            :color="statusColor(s.status)"
            :label="statusLabel(s.status)"
          />
          <span class="text-caption">{{ s.url }}</span>
          <q-btn
            flat
            dense
            round
            icon="delete_outline"
            class="q-ml-xs"
            @click="removeRelay(s.url)"
            aria-label="Remove relay"
          />
        </div>
      </q-expansion-item>
      <q-expansion-item
        v-if="disconnectedRelays.length"
        dense
        expand-separator
        label="Disconnected"
      >
        <div
          v-for="s in disconnectedRelays"
          :key="s.url"
          class="row items-center q-my-xs"
        >
          <q-badge
            class="q-mr-sm"
            rounded
            :color="statusColor(s.status)"
            :label="statusLabel(s.status)"
          />
          <span class="text-caption">{{ s.url }}</span>
          <span
            class="text-caption q-ml-sm"
            v-if="s.nextReconnectAt"
          >
            reconnect in
            {{ Math.max(0, Math.ceil((s.nextReconnectAt - now) / 1000)) }}s
          </span>
          <q-btn
            flat
            dense
            round
            icon="delete_outline"
            class="q-ml-xs"
            @click="removeRelay(s.url)"
            aria-label="Remove relay"
          />
        </div>
      </q-expansion-item>
    </div>
    <div class="row q-gutter-sm">
      <q-btn label="Connect" color="primary" @click="connect" dense />
      <q-btn label="Disconnect" color="primary" @click="disconnect" dense />
      <q-btn
        label="Save to Profile"
        color="secondary"
        @click="saveToProfile"
        dense
      />
    </div>
    <div class="q-mt-sm">
      <q-btn
        label="Use fallback relays"
        color="primary"
        @click="relayText = DEFAULT_RELAYS.join('\n')"
        dense
      />
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, computed, onMounted, onUnmounted } from "vue";
import { useMessengerStore } from "src/stores/messenger";
import { notifySuccess, notifyError } from "src/js/notify";
import { useNdk } from "src/composables/useNdk";
import { DEFAULT_RELAYS } from "src/config/relays";
import type NDK from "@nostr-dev-kit/ndk";
import { NDKRelayStatus } from "@nostr-dev-kit/ndk";
import { useNostrStore } from "src/stores/nostr";

const messenger = useMessengerStore();
const nostr = useNostrStore();

const relayText = ref((messenger.relays ?? []).join("\n"));

const ndkRef = ref<NDK | null>(null);
onMounted(() => {
  useNdk({ requireSigner: false }).then((n) => (ndkRef.value = n));
});

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => (now.value = Date.now()), 1000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const relayStatuses = computed(() =>
  (messenger.relays ?? []).map((url) => {
    const relay = ndkRef.value?.pool.relays.get(url);
    const statusNum = relay?.status;
    const status =
      typeof statusNum === "number" ? NDKRelayStatus[statusNum] : "UNKNOWN";
    const nextReconnectAt = relay?.connectionStats.nextReconnectAt;
    return {
      url,
      connected: relay?.connected === true,
      status,
      nextReconnectAt,
    };
  }),
);

const connectedRelays = computed(() =>
  relayStatuses.value.filter((s) => s.connected),
);
const disconnectedRelays = computed(() =>
  relayStatuses.value.filter((s) => !s.connected),
);
const connectedCount = computed(() => connectedRelays.value.length);

const statusMap: Record<string, { label: string; color: string }> = {
  CONNECTED: { label: "Connected", color: "positive" },
  CONNECTING: { label: "Connecting", color: "warning" },
  RECONNECTING: { label: "Retrying…", color: "warning" },
  DISCONNECTED: { label: "Disconnected", color: "negative" },
  FAILED: { label: "Failed", color: "negative" },
  UNKNOWN: { label: "Unknown", color: "grey" },
};

function statusLabel(status: string) {
  return statusMap[status]?.label || status;
}

function statusColor(status: string) {
  return statusMap[status]?.color || "grey";
}

watch(
  () => messenger.relays,
  (r) => {
    relayText.value = (r ?? []).join("\n");
  },
);

const connect = async () => {
  const urls = (relayText.value || "")
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  const uniqueUrls = Array.from(new Set(urls));
  try {
    const ndk = await useNdk({ requireSigner: false });
    for (const url of uniqueUrls) {
      ndk.addExplicitRelay(url);
    }
    await messenger.connect(uniqueUrls);
    notifySuccess("Connected to relays");
  } catch (err: any) {
    notifyError(err?.message || "Failed to connect");
  }
};

const disconnect = async () => {
  try {
    await Promise.resolve(messenger.disconnect());
    notifySuccess("Disconnected from relays");
  } catch (err: any) {
    notifyError(err?.message || "Failed to disconnect");
  }
};

const removeRelay = (url: string) => {
  messenger.removeRelay(url);
};

async function saveToProfile() {
  const relays = relayText.value
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  await nostr.publishRelayList(relays);
}
</script>
