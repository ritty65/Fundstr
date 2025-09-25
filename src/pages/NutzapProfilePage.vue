<template>
  <q-page class="bg-surface-1 q-pa-md column q-gutter-md">
    <div class="row items-center q-gutter-sm">
      <RelayStatusIndicator />
      <q-chip size="sm" color="primary" text-color="white" outline>
        Relay status: {{ toolkit.relayStatus }}
      </q-chip>
    </div>

    <div class="row q-col-gutter-md items-start">
      <div class="col-12 col-lg-4 column q-gutter-md">
        <q-card>
          <q-card-section>
            <div class="text-subtitle1">1) Keys</div>
            <div class="text-caption text-2 q-mb-sm">
              Generate or import an nsec. Keys are stored locally and applied to the isolated Fundstr relay signer.
            </div>
            <div class="row q-col-gutter-sm q-mb-sm">
              <div class="col-auto">
                <q-btn label="Generate" color="primary" @click="handleGenerate" />
              </div>
              <div class="col-auto">
                <q-btn label="Save" color="primary" flat @click="handleSave" />
              </div>
              <div class="col-auto">
                <q-btn label="Load" color="primary" flat @click="handleLoad" />
              </div>
              <div class="col-auto">
                <q-btn label="Forget" color="negative" flat @click="handleForget" />
              </div>
            </div>
            <q-input v-model="nsecInput" dense filled label="Import nsec / 64-hex" class="q-mb-sm" />
            <q-btn label="Load input" color="primary" flat class="q-mb-md" @click="handleLoadInput" />
            <q-input :model-value="toolkit.npub" dense filled readonly label="npub" class="q-mb-sm" />
            <q-input :model-value="toolkit.nsec" dense filled readonly label="nsec" />
          </q-card-section>
        </q-card>

        <q-card>
          <q-card-section class="q-gutter-md column">
            <div>
              <div class="text-subtitle1">2) Publisher</div>
              <div class="text-caption text-2">
                Publish test notes, Nutzap profiles (10019) or tiers (30000). Requires keys above.
              </div>
            </div>
            <q-input v-model="relayUrl" dense filled readonly label="Relay" />
            <div class="row q-col-gutter-sm">
              <div class="col-auto">
                <q-btn label="Connect" color="primary" @click="toolkit.connectRelay" />
              </div>
              <div class="col-auto">
                <q-btn label="Publish note" color="primary" flat @click="handlePublishNote" />
              </div>
              <div class="col-auto">
                <q-btn label="Publish profile" color="primary" flat @click="handlePublishProfile" />
              </div>
              <div class="col-auto">
                <q-btn label="Publish tiers" color="primary" flat @click="handlePublishTiers" />
              </div>
            </div>
            <q-input v-model="p2pkInput" dense filled label="P2PK public key (Cashu 33-byte hex)" />
            <div class="row q-col-gutter-sm">
              <div class="col">
                <q-input v-model="p2pkPrivInput" dense filled label="Derive from Cashu private key" />
              </div>
              <div class="col-auto column q-gutter-xs">
                <q-btn label="Derive" color="primary" flat @click="handleDeriveP2pk" />
                <q-btn label="Generate" color="warning" flat @click="handleGenerateP2pk" />
              </div>
            </div>
            <q-input v-model="mintsText" type="textarea" autogrow dense filled label="Mints (one per line)" />
            <q-input v-model="relaysText" type="textarea" autogrow dense filled label="Relays (one per line)" />
            <q-input v-model="tierAddress" dense filled label="Tier address" />
            <q-input v-model="tiersJson" type="textarea" autogrow dense filled label="Tiers JSON" />
          </q-card-section>
        </q-card>

        <q-card>
          <q-card-section class="column q-gutter-sm">
            <div class="row items-center justify-between">
              <div class="text-subtitle1">3) Activity</div>
              <q-btn label="Clear" flat dense @click="clearLog" />
            </div>
            <div class="log-window">
              <div
                v-for="entry in logEntries"
                :key="entry.id"
                :class="['text-caption mono', entry.toneClass]"
              >
                [{{ entry.timestamp }}] {{ entry.message }}
              </div>
            </div>
          </q-card-section>
        </q-card>

        <q-card>
          <q-card-section class="column q-gutter-sm">
            <div class="row items-center justify-between">
              <div class="text-subtitle1">6) Self-tests</div>
              <q-chip dense :color="testStatusColor" text-color="white">{{ testStatusLabel }}</q-chip>
            </div>
            <q-btn :loading="testRunning" color="warning" label="Run tests" @click="runTests" />
            <div class="log-window">
              <div
                v-for="item in testLog"
                :key="item.id"
                :class="['text-caption mono', item.ok ? 'text-positive' : 'text-negative']"
              >
                {{ item.ok ? '✔' : '✖' }} {{ item.message }}
              </div>
            </div>
          </q-card-section>
        </q-card>
      </div>

      <div class="col-12 col-lg-8 column q-gutter-md">
        <NutzapExplorerV2 />

        <q-card>
          <q-card-section class="column q-gutter-sm">
            <div class="row items-center q-gutter-sm">
              <div class="text-subtitle1">5) Legacy Explorer</div>
              <q-chip dense :color="legacyChipColor" text-color="white">{{ legacyChipLabel }}</q-chip>
              <div class="text-caption text-2">Timeout {{ legacyTimeoutMs }} ms</div>
            </div>
            <div class="row q-col-gutter-sm">
              <div class="col-12 col-md-3">
                <q-input v-model="legacyKinds" dense filled label="Kinds CSV" />
              </div>
              <div class="col-12 col-md-3">
                <q-input v-model="legacyAuthors" dense filled label="Authors CSV" />
              </div>
              <div class="col-12 col-md-3">
                <q-input v-model="legacyIds" dense filled label="Event IDs" />
              </div>
              <div class="col-6 col-md-3">
                <q-input v-model.number="legacyLimit" type="number" dense filled label="Limit" />
              </div>
            </div>
            <div class="row q-col-gutter-sm">
              <div class="col-auto">
                <q-btn label="Query" color="primary" :loading="legacyLoading" @click="runLegacyQuery" />
              </div>
              <div class="col-auto">
                <q-btn label="Clear" flat @click="legacyResults = []" />
              </div>
            </div>
            <div class="column q-gutter-sm">
              <q-card v-for="event in legacyResults" :key="event.id" class="bg-surface-2 q-pa-sm">
                <div class="text-caption text-2">{{ formatTimestamp(event.created_at) }} · kind {{ event.kind }}</div>
                <div class="text-caption text-2 mono">{{ event.id }}</div>
                <div class="text-body2" style="white-space: pre-wrap">{{ event.content }}</div>
              </q-card>
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import RelayStatusIndicator from 'src/nutzap/RelayStatusIndicator.vue';
import NutzapExplorerV2 from 'src/components/nutzap/NutzapExplorerV2.vue';
import { notifyError, notifySuccess } from 'src/js/notify';
import { useNutzapToolkit } from 'src/nutzap/useNutzapToolkit';
import { fundstrRelayClient } from 'src/nutzap/relayClient';
import { publishNostrEvent } from './nutzap-profile/nostrHelpers';
import { NUTZAP_RELAY_WSS } from 'src/nutzap/relayConfig';

const toolkit = useNutzapToolkit();

const relayUrl = ref(NUTZAP_RELAY_WSS);
const nsecInput = ref('');
const p2pkInput = ref('');
const p2pkPrivInput = ref('');
const mintsText = ref('https://mint.fundstr.network/cashu');
const relaysText = ref('wss://relay.fundstr.me\nwss://relay.damus.io');
const tierAddress = ref('');
const tiersJson = ref(`{
  "v": 1,
  "tiers": [
    { "id": "backstage-pass", "title": "Backstage Pass", "price": 2000, "frequency": "monthly", "description": "Behind the scenes" },
    { "id": "producer-circle", "title": "Producer Circle", "price": 15000, "frequency": "monthly", "description": "Strategy & credits" }
  ]
}`);

watch(
  () => toolkit.tierAddress.value,
  value => {
    if (!tierAddress.value) {
      tierAddress.value = value;
    }
  },
  { immediate: true }
);

watch(
  () => toolkit.cashuPub.value,
  value => {
    if (!p2pkInput.value && value) {
      p2pkInput.value = value;
    }
  },
  { immediate: true }
);

interface LogEntry {
  id: number;
  timestamp: string;
  tone: 'info' | 'success' | 'error';
  message: string;
  toneClass: string;
}

const logEntries = ref<LogEntry[]>([]);
let logSequence = 0;
let lastRelayLogId = 0;

function formatTs(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

function pushLog(message: string, tone: 'info' | 'success' | 'error' = 'info') {
  const entry = {
    id: ++logSequence,
    timestamp: formatTs(Date.now()),
    tone,
    message,
    toneClass: tone === 'success' ? 'text-positive' : tone === 'error' ? 'text-negative' : 'text-2',
  };
  logEntries.value = [entry, ...logEntries.value].slice(0, 200);
}

watch(
  () => toolkit.relayLogFeed.value,
  next => {
    for (const entry of next) {
      if (entry.id <= lastRelayLogId) continue;
      pushLog(`[relay] ${entry.message}`, entry.level === 'error' ? 'error' : entry.level === 'warn' ? 'info' : 'info');
      lastRelayLogId = Math.max(lastRelayLogId, entry.id);
    }
  },
  { immediate: true, deep: true }
);

function handleGenerate() {
  toolkit.generate();
  tierAddress.value = toolkit.tierAddress.value;
  pushLog('Generated new secret key', 'success');
}

function handleSave() {
  try {
    toolkit.saveToStorage();
    pushLog('Saved secret key to localStorage', 'success');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
  }
}

function handleLoad() {
  try {
    toolkit.loadFromStorage();
    tierAddress.value = toolkit.tierAddress.value;
    pushLog('Loaded secret key from localStorage', 'success');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
  }
}

function handleForget() {
  toolkit.clearStorage();
  pushLog('Cleared stored key');
}

function handleLoadInput() {
  try {
    toolkit.loadFromInput(nsecInput.value);
    tierAddress.value = toolkit.tierAddress.value;
    pushLog('Loaded keys from input', 'success');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
  }
}

function handleDeriveP2pk() {
  try {
    const pub = toolkit.deriveCashuFromPrivate(p2pkPrivInput.value);
    p2pkInput.value = pub;
    pushLog('Derived Cashu P2PK public key', 'success');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
  }
}

function handleGenerateP2pk() {
  try {
    const { pub, priv } = toolkit.generateCashuKeypair();
    p2pkInput.value = pub;
    p2pkPrivInput.value = priv;
    pushLog('Generated Cashu P2PK keypair', 'success');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
  }
}

function getLines(text: string) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

async function handlePublishNote() {
  try {
    const result = await publishNostrEvent({
      kind: 1,
      content: `Hello from Fundstr Nutzap toolkit at ${new Date().toISOString()}`,
      tags: [],
    });
    pushLog(`Published note ${result.event.id} (${result.ack.via})`, result.ack.accepted ? 'success' : 'error');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
  }
}

async function handlePublishProfile() {
  try {
    const p2pk = p2pkInput.value || toolkit.cashuPub.value;
    if (!p2pk || !/^(02|03)[0-9a-fA-F]{64}$/.test(p2pk)) {
      throw new Error('Provide a Cashu P2PK compressed public key.');
    }
    const profile = {
      v: 1,
      p2pk,
      mints: getLines(mintsText.value),
      relays: getLines(relaysText.value),
      tierAddr: tierAddress.value || toolkit.tierAddress.value,
    };
    const tags = [
      ['t', 'nutzap-profile'],
      ['client', 'fundstr'],
      ...profile.mints.map(mint => ['mint', mint, 'sat']),
      ...profile.relays.map(relay => ['relay', relay]),
    ];
    const result = await publishNostrEvent({
      kind: 10019,
      tags,
      content: JSON.stringify(profile),
    });
    pushLog(`Published Nutzap profile ${result.event.id}`, result.ack.accepted ? 'success' : 'error');
    notifySuccess('Nutzap profile published.');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
  }
}

async function handlePublishTiers() {
  try {
    const parsed = JSON.parse(tiersJson.value);
    const result = await publishNostrEvent({
      kind: 30000,
      tags: [
        ['d', 'tiers'],
        ['t', 'nutzap-tiers'],
        ['client', 'fundstr'],
      ],
      content: JSON.stringify(parsed),
    });
    pushLog(`Published tiers ${result.event.id}`, result.ack.accepted ? 'success' : 'error');
    notifySuccess('Tiers published.');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
  }
}

function clearLog() {
  logEntries.value = [];
}

interface TestLogEntry {
  id: number;
  message: string;
  ok: boolean;
}

const testLog = ref<TestLogEntry[]>([]);
const testRunning = ref(false);

const testStatusLabel = computed(() => {
  if (testRunning.value) return 'Running…';
  if (!testLog.value.length) return 'Idle';
  return testLog.value.every(entry => entry.ok) ? 'All passed' : 'Failed';
});

const testStatusColor = computed(() => {
  if (testRunning.value) return 'warning';
  if (!testLog.value.length) return 'primary';
  return testLog.value.every(entry => entry.ok) ? 'positive' : 'negative';
});

function pushTest(message: string, ok: boolean) {
  testLog.value = [...testLog.value, { id: testLog.value.length + 1, message, ok }];
}

async function runTests() {
  testRunning.value = true;
  testLog.value = [];
  try {
    const sk = generateSecretKey();
    pushTest('generateSecretKey returns 32 bytes', sk instanceof Uint8Array && sk.length === 32);
    const skHex = Array.from(sk)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    const pk = getPublicKey(sk);
    pushTest('getPublicKey produces 64 hex', typeof pk === 'string' && pk.length === 64);
    const npub = nip19.npubEncode(pk);
    pushTest('npub encode/decode roundtrip', nip19.decode(npub).data === pk);
    const nsec = nip19.nsecEncode(sk);
    const decoded = nip19.decode(nsec);
    const decodedBytes = decoded.data instanceof Uint8Array ? decoded.data : new Uint8Array(decoded.data as number[]);
    pushTest('nsec decode matches original', decodedBytes.length === sk.length);
  } catch (err) {
    pushTest(err instanceof Error ? err.message : String(err), false);
  } finally {
    testRunning.value = false;
  }
}

const legacyKinds = ref('1,10019,30000');
const legacyAuthors = ref('');
const legacyIds = ref('');
const legacyLimit = ref(10);
const legacyResults = ref<any[]>([]);
const legacyStatus = ref<'idle' | 'waiting' | 'done' | 'timeout'>('idle');
const legacyLoading = ref(false);
const legacyTimeoutMs = 5000;

const legacyChipLabel = computed(() => {
  if (legacyStatus.value === 'waiting') return 'Waiting…';
  if (legacyStatus.value === 'timeout') return 'Timeout';
  if (legacyStatus.value === 'done') return 'EOSE';
  return 'Idle';
});

const legacyChipColor = computed(() => {
  if (legacyStatus.value === 'waiting') return 'warning';
  if (legacyStatus.value === 'timeout') return 'negative';
  if (legacyStatus.value === 'done') return 'positive';
  return 'primary';
});

function formatTimestamp(sec: number) {
  return new Date(sec * 1000).toLocaleString();
}

function parseCsv(input: string) {
  return input
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

async function runLegacyQuery() {
  legacyLoading.value = true;
  legacyStatus.value = 'waiting';
  try {
    const kinds = parseCsv(legacyKinds.value)
      .map(Number)
      .filter(value => Number.isInteger(value));
    const authors = parseCsv(legacyAuthors.value);
    const ids = parseCsv(legacyIds.value);
    const filters = [
      {
        kinds,
        ...(authors.length ? { authors } : {}),
        ...(ids.length ? { ids } : {}),
        limit: Math.max(1, Math.min(legacyLimit.value || 10, 100)),
      },
    ];
    const events = await fundstrRelayClient.requestOnce(filters, { timeoutMs: legacyTimeoutMs });
    legacyResults.value = events;
    legacyStatus.value = 'done';
  } catch (err) {
    legacyStatus.value = 'timeout';
    notifyError(err instanceof Error ? err.message : String(err));
  } finally {
    legacyLoading.value = false;
  }
}

onMounted(() => {
  toolkit.connectRelay();
});
</script>

<style scoped>
.log-window {
  max-height: 200px;
  overflow-y: auto;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 8px;
  border: 1px solid var(--surface-contrast-border);
}
.mono {
  font-family: ui-monospace, SFMono-Regular, SFMono, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
}
</style>
