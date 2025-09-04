<template>
  <q-dialog v-model="show">
    <q-card class="q-pa-md" style="min-width: 350px">
      <q-card-section class="text-h6">Relay Scanner</q-card-section>
      <q-card-section>
        <div v-if="loading" class="text-center q-my-md">
          <q-spinner />
        </div>
        <div v-else>
          <div
            v-for="relay in relays"
            :key="relay.url"
            class="row items-center q-mb-sm"
          >
            <q-checkbox v-model="relay.checked" :disable="!relay.reachable" />
            <div class="q-ml-sm" style="word-break: break-all">{{ relay.url }}</div>
            <q-icon
              v-if="relay.reachable"
              name="check"
              color="positive"
              class="q-ml-auto"
            />
            <q-icon
              v-else
              name="close"
              color="negative"
              class="q-ml-auto"
            />
          </div>
        </div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat color="primary" label="Scan" @click="scan" />
        <q-btn flat color="primary" label="Use Selected" @click="emitSelected" />
        <q-btn flat color="grey" label="Close" v-close-popup />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

interface RelayItem {
  url: string;
  reachable: boolean;
  checked: boolean;
}

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits(["update:modelValue", "relays-selected"]);

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

const relays = ref<RelayItem[]>([]);
const loading = ref(false);

async function scan() {
  loading.value = true;
  relays.value = [];
  try {
    const res = await fetch("https://api.nostr.watch/v1/online");
    const urls: string[] = await res.json();
    relays.value = urls.map((u) => ({ url: u, reachable: false, checked: false }));
    await Promise.all(
      relays.value.map(async (r) => {
        try {
          await Promise.race([
            new Promise<void>((resolve, reject) => {
              const ws = new WebSocket(r.url);
              ws.onopen = () => {
                ws.close();
                resolve();
              };
              ws.onerror = () => reject(new Error("error"));
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000)),
          ]);
          r.reachable = true;
        } catch {
          r.reachable = false;
        }
      }),
    );
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

function emitSelected() {
  const selected = relays.value
    .filter((r) => r.checked && r.reachable)
    .map((r) => r.url);
  emit("relays-selected", selected);
  emit("update:modelValue", false);
}
</script>
