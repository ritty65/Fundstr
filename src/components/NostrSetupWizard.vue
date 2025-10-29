<template>
  <q-dialog v-model="model" persistent>
    <q-card style="min-width: 400px">
      <q-card-section class="text-h6">Nostr Setup</q-card-section>
      <q-card-section>
        <q-stepper v-model="step" vertical color="primary" animated>
          <q-step :name="1" title="Identity" :done="step > 1">
            <q-option-group
              v-model="loginMethod"
              type="radio"
              :options="loginOptions"
            />
            <div v-if="loginMethod === 'private'">
              <q-input v-model="privKey" label="nsec or hex private key" />
              <div class="row justify-end q-mt-md">
                <q-btn color="primary" label="Next" @click="nextFromKey" />
              </div>
            </div>
            <div v-else>
              <div v-if="extError" class="text-negative q-mb-sm">
                {{ extError }}
              </div>
              <div class="row justify-end q-mt-md">
                <q-btn
                  color="primary"
                  label="Connect Extension"
                  @click="connectExtension"
                />
              </div>
            </div>
          </q-step>
          <q-step :name="2" title="Relays" :done="step > 2">
            <q-input
              v-model="relayInput"
              label="Add Relay"
              @keyup.enter="addRelay"
            />
            <q-banner
              v-if="relayError"
              class="q-mt-sm"
              dense
              rounded
              color="negative"
              text-color="white"
            >
              {{ relayError }}
            </q-banner>
            <q-list bordered class="q-mt-sm" v-if="relays.length">
              <q-item v-for="(r, idx) in relays" :key="idx">
                <q-item-section>{{ r }}</q-item-section>
                <q-item-section side>
                  <q-btn flat dense icon="delete" @click="removeRelay(idx)" />
                </q-item-section>
              </q-item>
            </q-list>
            <div class="row justify-between q-gutter-sm q-mt-md">
              <q-btn flat label="Back" @click="step = 1" />
              <q-btn
                color="primary"
                label="Next"
                :disable="relays.length === 0"
                @click="nextFromRelays"
              />
            </div>
          </q-step>
          <q-step :name="3" title="Connect">
            <div v-if="connecting" class="row items-center q-gutter-sm">
              <q-spinner size="sm" />
              <span>Connecting...</span>
            </div>
            <div v-else-if="connected" class="text-positive">Connected!</div>
            <div v-else-if="connectError" class="text-negative">
              {{ connectError }}
            </div>
            <div
              class="row justify-between q-gutter-sm q-mt-md"
              v-if="!connected"
            >
              <q-btn flat label="Back" @click="step = 2" />
              <q-btn
                color="primary"
                label="Connect"
                :disable="connecting"
                @click="connect"
              />
            </div>
            <div class="row justify-end q-mt-md" v-else>
              <q-btn color="primary" label="Finish" @click="finish" />
            </div>
          </q-step>
        </q-stepper>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<script lang="ts" setup>
import { ref, computed } from "vue";
import { useNostrStore } from "src/stores/nostr";
import { useMessengerStore } from "src/stores/messenger";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits(["update:modelValue", "complete"]);

const nostr = useNostrStore();
const messenger = useMessengerStore();

const model = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit("update:modelValue", v),
});

function normalizeRelayUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let withProtocol = trimmed;
  if (/^https?:\/\//i.test(withProtocol)) {
    withProtocol = withProtocol.replace(/^http/i, "ws");
  } else if (!/^wss?:\/\//i.test(withProtocol)) {
    withProtocol = `wss://${withProtocol}`;
  }

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch (e) {
    return null;
  }

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    return null;
  }

  url.hostname = url.hostname.toLowerCase();

  return url.toString().replace(/\/$/, "");
}

const step = ref(1);
const privKey = ref(nostr.activePrivateKeyNsec || "");
const relayInput = ref("");
const relayError = ref("");
const initialRelays = Array.from(
  new Set(
    messenger.relays
      .map((relay) => normalizeRelayUrl(relay) || "")
      .filter((relay): relay is string => Boolean(relay)),
  ),
);
const relays = ref<string[]>(initialRelays);
if (initialRelays.length !== messenger.relays.length) {
  messenger.relays = [...initialRelays];
}
const connecting = ref(false);
const connected = ref(false);
const connectError = ref("");
const loginMethod = ref<"private" | "extension">("private");
const loginOptions = [
  { label: "Private Key", value: "private" },
  { label: "Extension", value: "extension" },
];
const extError = ref("");

function addRelay() {
  relayError.value = "";
  const normalized = normalizeRelayUrl(relayInput.value);
  if (!normalized) {
    relayError.value = "Please enter a valid relay URL.";
    return;
  }

  if (relays.value.includes(normalized)) {
    relayError.value = "Relay already added.";
    return;
  }

  relays.value.push(normalized);
  messenger.relays = [...relays.value];
  relayInput.value = "";
}
function removeRelay(idx: number) {
  relays.value.splice(idx, 1);
  messenger.relays = [...relays.value];
}

async function nextFromKey() {
  if (!privKey.value.trim()) return;
  await nostr.initPrivateKeySigner(privKey.value.trim());
  step.value = 2;
}

async function connectExtension() {
  extError.value = "";
  const available = await nostr.checkNip07Signer(true);
  if (!available) {
    extError.value = "No NIP-07 extension detected";
    return;
  }
  try {
    await nostr.connectBrowserSigner();
    step.value = 2;
  } catch (e: any) {
    extError.value = e?.message || "Failed to connect";
  }
}

function nextFromRelays() {
  if (relays.value.length === 0) return;
  step.value = 3;
}

async function connect() {
  connecting.value = true;
  connectError.value = "";
  try {
    await messenger.connect(relays.value);
    connected.value = messenger.connected;
  } catch (e: any) {
    connectError.value = e?.message || "Failed to connect";
    connected.value = false;
  } finally {
    connecting.value = false;
  }
}

function finish() {
  emit("complete");
  emit("update:modelValue", false);
}
</script>
