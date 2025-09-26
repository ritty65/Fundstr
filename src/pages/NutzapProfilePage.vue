<template>
  <q-page class="nutzap-profile-page bg-surface-1 q-pa-lg">
    <div class="status-banner q-mb-md">
      <RelayStatusIndicator />
      <q-chip dense :color="relayStatusColor" text-color="white" class="status-chip">
        {{ relayStatusLabel }}
      </q-chip>
      <div class="text-caption text-2">Isolated relay: relay.fundstr.me (WS → HTTP fallback)</div>
    </div>

    <div class="profile-grid">
      <q-card class="grid-card relay-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Relay Connection</div>
          <div class="text-caption text-2">Control the live WebSocket session used for publishing events.</div>
        </q-card-section>
        <q-separator />
        <q-card-section class="column q-gutter-md">
          <q-input
            v-model="relayUrlInput"
            label="Relay URL"
            dense
            filled
            :disable="!relaySupported"
            autocomplete="off"
          />
          <div class="row items-center wrap q-gutter-sm">
            <q-btn
              color="primary"
              label="Connect"
              :disable="!relaySupported || !relayUrlInputValid"
              @click="handleRelayConnect"
            />
            <q-btn
              color="primary"
              outline
              label="Disconnect"
              :disable="!relaySupported || !relayIsConnected"
              @click="handleRelayDisconnect"
            />
            <q-toggle
              v-model="relayAutoReconnect"
              label="Auto reconnect"
              dense
              :disable="!relaySupported"
            />
          </div>
        </q-card-section>
      </q-card>

      <q-card class="grid-card keys-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Keys</div>
          <div class="text-caption text-2">Manage the publishing identity for Nutzap events.</div>
        </q-card-section>
        <q-separator />
        <q-card-section class="column q-gutter-md">
          <div class="column q-gutter-sm">
            <q-input
              v-model="keyImportValue"
              label="Secret key (nsec or 64-char hex)"
              dense
              filled
              autocomplete="off"
            />
            <div class="row q-gutter-sm">
              <q-btn color="primary" label="Generate" @click="generateNewSecret" />
              <q-btn color="primary" outline label="Import" @click="importSecretKey" />
            </div>
          </div>
          <div class="column q-gutter-sm">
            <q-input
              :model-value="keySecretHex"
              label="Secret key (hex)"
              type="textarea"
              dense
              filled
              readonly
              autogrow
            />
            <q-input
              :model-value="keyNsec"
              label="Secret key (nsec)"
              type="textarea"
              dense
              filled
              readonly
              autogrow
            />
            <q-input
              :model-value="keyPublicHex"
              label="Public key (hex)"
              type="textarea"
              dense
              filled
              readonly
              autogrow
            />
            <q-input
              :model-value="keyNpub"
              label="Public key (npub)"
              type="textarea"
              dense
              filled
              readonly
              autogrow
            />
          </div>
          <div class="row wrap q-gutter-sm">
            <q-btn
              color="primary"
              label="Save to Browser"
              :disable="!keySecretHex"
              @click="saveSecretToBrowser"
            />
            <q-btn
              color="primary"
              outline
              label="Load from Browser"
              :disable="!hasStoredSecret"
              @click="loadSecretFromBrowser"
            />
            <q-btn
              color="negative"
              outline
              label="Forget Stored Key"
              :disable="!hasStoredSecret"
              @click="forgetStoredSecret"
            />
          </div>
        </q-card-section>
      </q-card>

      <q-card class="grid-card explorer-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Explorer</div>
          <div class="text-caption text-2">Lookup an author and preview their Nutzap profile.</div>
        </q-card-section>
        <q-separator />
        <q-card-section class="column q-gutter-md">
          <q-input
            v-model="authorInput"
            label="Author (npub or hex pubkey)"
            dense
            filled
            autocomplete="off"
          />
          <div class="row items-center q-gutter-sm">
            <q-btn
              color="primary"
              label="Load Data"
              :disable="!authorInput.trim() || loading"
              :loading="loading"
              @click="loadAll"
            />
            <q-badge color="accent" align="middle" v-if="loading">Loading…</q-badge>
          </div>
          <div class="text-caption text-2">
            Tier address preview: <span class="text-1 text-weight-medium">{{ tierAddressPreview }}</span>
          </div>
        </q-card-section>
      </q-card>

      <q-card class="grid-card explorer-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Explorer v2</div>
          <div class="text-caption text-2">
            Query profiles, notes, or parameterized events across multiple relays.
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <NutzapExplorerSearch />
        </q-card-section>
      </q-card>

      <q-card class="grid-card publisher-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Publisher</div>
          <div class="text-caption text-2">Compose metadata and tiers before publishing to relay.fundstr.me.</div>
        </q-card-section>
        <q-separator />
        <q-card-section class="column q-gutter-md">
          <div class="text-subtitle2">Payment Profile (kind 10019)</div>
          <q-input v-model="displayName" label="Display Name" dense filled />
          <q-input v-model="pictureUrl" label="Picture URL" dense filled />
          <q-input
            v-model="p2pkPriv"
            label="P2PK Private Key (hex)"
            dense
            filled
            autocomplete="off"
          />
          <div class="row q-gutter-sm">
            <q-btn color="primary" label="Derive Public Key" @click="deriveP2pkPublicKey" />
            <q-btn color="primary" outline label="Generate Keypair" @click="generateP2pkKeypair" />
          </div>
          <q-input v-model="p2pkPub" label="P2PK Public Key" dense filled />
          <q-input
            :model-value="p2pkDerivedPub"
            label="Derived P2PK Public Key"
            type="textarea"
            dense
            filled
            readonly
            autogrow
          />
          <q-input
            v-model="mintsText"
            type="textarea"
            label="Trusted Mints (one per line)"
            dense
            filled
            autogrow
          />
          <q-input
            v-model="relaysText"
            type="textarea"
            label="Relay Hints (optional, one per line)"
            dense
            filled
            autogrow
          />
          <div class="row justify-end q-gutter-sm">
            <q-btn
              color="primary"
              label="Publish Profile"
              :disable="profilePublishDisabled"
              :loading="publishingProfile"
              @click="publishProfile"
            />
          </div>
          <div class="text-caption text-2" v-if="lastProfilePublishInfo">
            {{ lastProfilePublishInfo }}
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section class="column q-gutter-md">
          <div class="row items-center justify-between">
            <div>
              <div class="text-subtitle2">Tiers ({{ tiers.length }})</div>
              <div class="text-caption text-2">
                Publishing as {{ tierKindLabel }} — parameterized replaceable ["d", "tiers"].
              </div>
            </div>
            <div class="row items-center q-gutter-sm">
              <q-btn-toggle
                v-model="tierKind"
                :options="tierKindOptions"
                dense
                toggle-color="primary"
                unelevated
              />
              <q-btn dense color="primary" label="Add Tier" @click="openNewTier" />
            </div>
          </div>
          <q-input
            v-model="tiersJson"
            type="textarea"
            label="Tiers JSON"
            dense
            filled
            autogrow
            spellcheck="false"
            :error="!!tiersJsonError"
            :error-message="tiersJsonError || ''"
          />
          <q-list bordered separator v-if="tiers.length">
            <q-item v-for="tier in tiers" :key="tier.id">
              <q-item-section>
                <div class="text-body1">
                  {{ tier.title }} — {{ tier.price }} sats ({{ frequencyLabel(tier.frequency) }})
                </div>
                <div class="text-caption" v-if="tier.description">{{ tier.description }}</div>
                <div class="text-caption" v-if="tier.media?.length">
                  Media: {{ tier.media.map(m => m.url).join(', ') }}
                </div>
              </q-item-section>
              <q-item-section side class="row items-center q-gutter-xs">
                <q-btn dense flat icon="edit" @click="editTier(tier)" />
                <q-btn dense flat icon="delete" color="negative" @click="removeTier(tier.id)" />
              </q-item-section>
            </q-item>
          </q-list>
          <div v-else class="text-caption text-2">No tiers yet. Add at least one tier before publishing.</div>
          <div class="row justify-end q-gutter-sm">
            <q-btn
              color="primary"
              label="Publish Tiers"
              :disable="tiersPublishDisabled"
              :loading="publishingTiers"
              @click="publishTiers"
            />
          </div>
          <div class="text-caption text-2" v-if="lastTiersPublishInfo">
            {{ lastTiersPublishInfo }}
          </div>
        </q-card-section>
      </q-card>

      <q-card class="grid-card activity-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Activity Log</div>
          <div class="text-caption text-2">Monitor relay connection state and publish acknowledgements.</div>
        </q-card-section>
        <q-separator />
        <q-card-section class="q-pa-none">
          <q-list
            v-if="relayActivity.length"
            bordered
            separator
            dense
            class="activity-log-list"
          >
            <q-item v-for="entry in relayActivity" :key="entry.id">
              <q-item-section>
                <div class="row items-center no-wrap q-gutter-sm">
                  <span class="text-caption text-2">{{ formatActivityTime(entry.timestamp) }}</span>
                  <q-badge :color="activityLevelColor(entry.level)" outline size="sm">
                    {{ entry.level }}
                  </q-badge>
                  <span class="text-body2">{{ entry.message }}</span>
                </div>
                <div class="text-caption text-2" v-if="entry.context">{{ entry.context }}</div>
              </q-item-section>
            </q-item>
          </q-list>
          <div v-else class="q-pa-md text-caption text-2">No relay activity yet.</div>
        </q-card-section>
        <q-separator />
        <q-card-section class="row justify-end q-pa-sm">
          <q-btn flat label="Clear Log" size="sm" :disable="!relayActivity.length" @click="clearRelayActivity" />
        </q-card-section>
      </q-card>
    </div>

    <div class="diagnostic-tools column q-gutter-lg q-mt-xl">
      <q-card class="grid-card diagnostic-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Legacy Explorer</div>
          <div class="text-caption text-2">
            Issue single-relay REQ subscriptions and inspect EOSE vs timeout behaviour.
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <NutzapLegacyExplorer />
        </q-card-section>
      </q-card>

      <q-card class="grid-card diagnostic-card">
        <q-card-section class="q-gutter-xs">
          <div class="text-h6">Client Self-tests</div>
          <div class="text-caption text-2">
            Verify browser capabilities required for Nutzap authoring without hitting the network.
          </div>
        </q-card-section>
        <q-separator />
        <q-card-section>
          <NutzapSelfTests />
        </q-card-section>
      </q-card>
    </div>

    <q-dialog v-model="showTierDialog" @hide="resetTierForm">
      <q-card class="q-pa-md" style="min-width: 420px">
        <div class="text-subtitle1 q-mb-sm">{{ tierForm.id ? 'Edit Tier' : 'Add Tier' }}</div>
        <q-input v-model="tierForm.title" label="Title" dense filled class="q-mb-sm" />
        <q-input
          v-model.number="tierForm.price"
          type="number"
          label="Price (sats)"
          dense
          filled
          class="q-mb-sm"
        />
        <q-select
          v-model="tierForm.frequency"
          :options="tierFrequencyOptions"
          option-label="label"
          option-value="value"
          emit-value
          map-options
          label="Frequency"
          dense
          filled
          class="q-mb-sm"
        />
        <q-input
          v-model="tierForm.description"
          type="textarea"
          label="Description"
          dense
          filled
          autogrow
          class="q-mb-sm"
        />
        <q-input
          v-model="tierForm.mediaCsv"
          label="Media URLs (comma-separated)"
          dense
          filled
        />
        <div class="row justify-end q-gutter-sm q-mt-md">
          <q-btn flat label="Cancel" v-close-popup />
          <q-btn color="primary" label="Save" @click="saveTier" v-close-popup />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { getPublicKey as getSecpPublicKey, utils as secpUtils } from '@noble/secp256k1';
import { v4 as uuidv4 } from 'uuid';
import RelayStatusIndicator from 'src/nutzap/RelayStatusIndicator.vue';
import NutzapExplorerSearch from 'src/nutzap/onepage/NutzapExplorerSearch.vue';
import NutzapLegacyExplorer from 'src/nutzap/onepage/NutzapLegacyExplorer.vue';
import NutzapSelfTests from 'src/nutzap/onepage/NutzapSelfTests.vue';
import { notifyError, notifySuccess, notifyWarning } from 'src/js/notify';
import type { Tier } from 'src/nutzap/types';
import { useActiveNutzapSigner } from 'src/nutzap/signer';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';
import { generateSecretKey, getPublicKey as getNostrPublicKey, nip19 } from 'nostr-tools';
import {
  FUNDSTR_WS_URL,
  FUNDSTR_REQ_URL,
  WS_FIRST_TIMEOUT_MS,
  HTTP_FALLBACK_TIMEOUT_MS,
  normalizeAuthor,
  pickLatestParamReplaceable,
  pickLatestReplaceable,
  publishTiers as publishTiersToRelay,
  publishNostrEvent,
  parseTiersContent,
} from './nutzap-profile/nostrHelpers';
import { fundstrRelayClient, RelayPublishError } from 'src/nutzap/relayClient';
import { sanitizeRelayUrls } from 'src/utils/relay';
import {
  useRelayConnection,
  type RelayActivityLevel,
} from 'src/nutzap/onepage/useRelayConnection';

type TierKind = 30019 | 30000;

const tierFrequencies: Tier['frequency'][] = ['one_time', 'monthly', 'yearly'];

type TierFormState = {
  id: string;
  title: string;
  price: number;
  frequency: Tier['frequency'];
  description: string;
  mediaCsv: string;
};

const authorInput = ref('');
const displayName = ref('');
const pictureUrl = ref('');
const p2pkPub = ref('');
const p2pkPriv = ref('');
const p2pkDerivedPub = ref('');
const mintsText = ref('');
const relaysText = ref(FUNDSTR_WS_URL);
const tiers = ref<Tier[]>([]);
const tierKind = ref<TierKind>(30019);
const tierForm = ref<TierFormState>({
  id: '',
  title: '',
  price: 0,
  frequency: 'monthly',
  description: '',
  mediaCsv: '',
});
const showTierDialog = ref(false);
const loading = ref(false);
const publishingProfile = ref(false);
const publishingTiers = ref(false);
const lastProfilePublishInfo = ref('');
const lastTiersPublishInfo = ref('');
const hasAutoLoaded = ref(false);

const tiersJson = ref('');
const tiersJsonError = ref<string | null>(null);

const keyImportValue = ref('');
const keySecretHex = ref('');
const keyPublicHex = ref('');
const keyNpub = ref('');
const keyNsec = ref('');
const hasStoredSecret = ref(false);

const SECRET_STORAGE_KEY = 'nutzap.profile.secretHex';
const isBrowser = typeof window !== 'undefined';

let isUpdatingJsonFromTiers = false;
let isUpdatingTiersFromJson = false;
let tiersJsonEdited = false;
let lastTiersJsonErrorNotified: string | null = null;
const scheduleMicrotask =
  typeof queueMicrotask === 'function'
    ? queueMicrotask
    : (fn: () => void) => {
        Promise.resolve().then(fn);
      };

const {
  relayUrl: relayConnectionUrl,
  status: relayConnectionStatus,
  autoReconnect: relayAutoReconnect,
  activityLog: relayActivity,
  connect: connectRelay,
  disconnect: disconnectRelay,
  publishEvent: publishEventToRelay,
  clearActivity: clearRelayActivity,
  logActivity,
  isSupported: relaySupported,
  isConnected: relayIsConnected,
} = useRelayConnection();

const relayUrlInput = ref(relayConnectionUrl.value);
const relayUrlInputValid = computed(() => relayUrlInput.value.trim().length > 0);

watch(relayConnectionUrl, value => {
  relayUrlInput.value = value;
});

const relayStatusLabel = computed(() => {
  switch (relayConnectionStatus.value) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    case 'disconnected':
      return 'Disconnected';
    default:
      return 'Idle';
  }
});

const relayStatusColor = computed(() => {
  switch (relayConnectionStatus.value) {
    case 'connected':
      return 'positive';
    case 'connecting':
    case 'reconnecting':
      return 'warning';
    case 'disconnected':
      return 'negative';
    default:
      return 'grey-6';
  }
});

const activityTimeFormatter =
  typeof Intl !== 'undefined'
    ? new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;

function formatActivityTime(timestamp: number) {
  if (!activityTimeFormatter) {
    return new Date(timestamp).toISOString();
  }
  return activityTimeFormatter.format(new Date(timestamp));
}

function activityLevelColor(level: RelayActivityLevel) {
  switch (level) {
    case 'success':
      return 'positive';
    case 'warning':
      return 'warning';
    case 'error':
      return 'negative';
    default:
      return 'primary';
  }
}

function handleRelayConnect() {
  const trimmed = relayUrlInput.value.trim();
  relayConnectionUrl.value = trimmed || FUNDSTR_WS_URL;
  relayUrlInput.value = relayConnectionUrl.value;
  connectRelay();
}

function handleRelayDisconnect() {
  disconnectRelay();
}

function updateStoredSecretPresence() {
  if (!isBrowser) return;
  hasStoredSecret.value = !!localStorage.getItem(SECRET_STORAGE_KEY);
}

function applySecretBytes(sk: Uint8Array) {
  const secretHex = bytesToHex(sk);
  const publicHex = getNostrPublicKey(sk);
  keySecretHex.value = secretHex;
  keyPublicHex.value = publicHex;
  keyNpub.value = nip19.npubEncode(publicHex);
  keyNsec.value = nip19.nsecEncode(sk);
  keyImportValue.value = '';
  authorInput.value = publicHex;
}

function generateNewSecret() {
  const secret = generateSecretKey();
  applySecretBytes(secret);
  notifySuccess('Generated new secret key.');
}

function importSecretKey() {
  const trimmed = keyImportValue.value.trim();
  if (!trimmed) {
    notifyWarning('Enter a private key to import.');
    return;
  }

  try {
    if (/^nsec/i.test(trimmed)) {
      const decoded = nip19.decode(trimmed);
      if (decoded.type !== 'nsec' || !decoded.data) {
        throw new Error('Invalid nsec key.');
      }
      const data = decoded.data instanceof Uint8Array ? decoded.data : hexToBytes(String(decoded.data));
      applySecretBytes(data);
      notifySuccess('Secret key imported.');
      return;
    }

    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      applySecretBytes(hexToBytes(trimmed));
      notifySuccess('Secret key imported.');
      return;
    }

    throw new Error('Enter a valid nsec or 64-character hex secret key.');
  } catch (err) {
    notifyError(err instanceof Error ? err.message : 'Unable to import key.');
  }
}

function saveSecretToBrowser() {
  if (!keySecretHex.value) {
    notifyWarning('Generate or import a secret key first.');
    return;
  }
  if (!isBrowser) {
    notifyError('Browser storage is unavailable.');
    return;
  }

  localStorage.setItem(SECRET_STORAGE_KEY, keySecretHex.value);
  updateStoredSecretPresence();
  notifySuccess('Secret key saved to browser storage.');
}

function loadSecretFromBrowser() {
  if (!isBrowser) {
    notifyError('Browser storage is unavailable.');
    return;
  }

  const stored = localStorage.getItem(SECRET_STORAGE_KEY);
  if (!stored) {
    notifyWarning('No stored secret key found.');
    return;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(stored)) {
    notifyError('Stored secret key is invalid.');
    return;
  }

  applySecretBytes(hexToBytes(stored));
  updateStoredSecretPresence();
  notifySuccess('Secret key loaded from browser storage.');
}

function forgetStoredSecret() {
  if (!isBrowser) {
    notifyError('Browser storage is unavailable.');
    return;
  }
  if (!hasStoredSecret.value) {
    notifyWarning('No stored secret key to forget.');
    return;
  }

  localStorage.removeItem(SECRET_STORAGE_KEY);
  updateStoredSecretPresence();
  notifySuccess('Stored secret key removed.');
}

function setDerivedP2pk(pubHex: string) {
  const normalized = pubHex.trim().toLowerCase();
  p2pkDerivedPub.value = normalized;
  p2pkPub.value = normalized;
}

function deriveP2pkPublicKey() {
  const trimmed = p2pkPriv.value.trim();
  if (!trimmed) {
    notifyWarning('Enter a P2PK private key to derive.');
    return;
  }
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    notifyError('P2PK private key must be 64 hexadecimal characters.');
    return;
  }

  try {
    const privBytes = hexToBytes(trimmed);
    const pubBytes = getSecpPublicKey(privBytes, true);
    const pubHex = bytesToHex(pubBytes);
    p2pkPriv.value = trimmed.toLowerCase();
    setDerivedP2pk(pubHex);
    notifySuccess('Derived P2PK public key.');
  } catch (err) {
    console.error('[nutzap] failed to derive P2PK public key', err);
    notifyError('Unable to derive P2PK public key.');
  }
}

function generateP2pkKeypair() {
  const privBytes = secpUtils.randomPrivateKey();
  const pubBytes = getSecpPublicKey(privBytes, true);
  const privHex = bytesToHex(privBytes);
  const pubHex = bytesToHex(pubBytes);
  p2pkPriv.value = privHex;
  setDerivedP2pk(pubHex);
  notifySuccess('Generated new P2PK keypair.');
}

function applyTiersJsonError(message: string | null) {
  tiersJsonError.value = message;
  if (!message) {
    lastTiersJsonErrorNotified = null;
    return;
  }
  if (!tiersJsonEdited) {
    return;
  }
  if (lastTiersJsonErrorNotified === message) {
    return;
  }
  lastTiersJsonErrorNotified = message;
  logActivity('error', 'Tier JSON validation failed', message);
  notifyError(`Tier JSON invalid — ${message}`);
}

function buildTiersJsonPayload(entries: Tier[]) {
  return {
    v: 1,
    tiers: entries.map(tier => {
      const media = Array.isArray(tier.media)
        ? tier.media
            .map(entry => (typeof entry?.url === 'string' ? entry.url : ''))
            .filter(url => !!url)
        : undefined;
      const priceNumber = Number(tier.price);
      const price = Number.isFinite(priceNumber) ? Math.round(priceNumber) : 0;

      return {
        id: tier.id,
        title: tier.title,
        price,
        frequency: tier.frequency,
        ...(tier.description ? { description: tier.description } : {}),
        ...(media && media.length ? { media } : {}),
      };
    }),
  };
}

watch(
  tiers,
  newTiers => {
    if (isUpdatingTiersFromJson) {
      scheduleMicrotask(() => {
        isUpdatingTiersFromJson = false;
      });
      return;
    }
    const payload = buildTiersJsonPayload(newTiers);
    isUpdatingJsonFromTiers = true;
    tiersJson.value = JSON.stringify(payload, null, 2);
    scheduleMicrotask(() => {
      isUpdatingJsonFromTiers = false;
    });
    applyTiersJsonError(null);
  },
  { deep: true, immediate: true }
);

watch(tiersJson, value => {
  if (isUpdatingJsonFromTiers) {
    return;
  }
  tiersJsonEdited = true;
  const trimmed = value.trim();
  if (!trimmed) {
    applyTiersJsonError('Tier JSON is required.');
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    applyTiersJsonError(err instanceof Error ? err.message : 'Invalid JSON.');
    return;
  }
  const rawTiers = Array.isArray(parsed) ? parsed : (parsed as any)?.tiers;
  if (!Array.isArray(rawTiers)) {
    applyTiersJsonError('JSON must be an array or include a "tiers" array.');
    return;
  }
  const normalized = parseTiersContent(trimmed);
  if (rawTiers.length > 0 && normalized.length === 0) {
    applyTiersJsonError('No valid tiers found in JSON payload.');
    return;
  }
  applyTiersJsonError(null);
  isUpdatingTiersFromJson = true;
  tiers.value = normalized;
  scheduleMicrotask(() => {
    isUpdatingTiersFromJson = false;
  });
});

watch(
  p2pkPub,
  value => {
    p2pkDerivedPub.value = value.trim();
  },
  { immediate: true }
);

const { pubkey, signer } = useActiveNutzapSigner();

const relaySocket = fundstrRelayClient;
let profileSubId: string | null = null;
let tiersSubId: string | null = null;
let stopRelayStatusListener: (() => void) | null = null;
let hasRelayConnected = false;
let reloadAfterReconnect = false;
let activeAuthorHex: string | null = null;

const mintList = computed(() =>
  mintsText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
);

const relayList = computed(() => {
  const entries = relaysText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  const set = new Set(entries);
  set.add(FUNDSTR_WS_URL);
  return Array.from(set);
});

const tierKindOptions = [
  { label: 'Canonical (30019)', value: 30019 },
  { label: 'Legacy (30000)', value: 30000 },
] as const;

const tierKindLabel = computed(() =>
  tierKind.value === 30019 ? 'Canonical (30019)' : 'Legacy (30000)'
);

const tierAddressPreview = computed(() => {
  try {
    const authorHex = normalizeAuthor(authorInput.value);
    return `${tierKind.value}:${authorHex}:tiers`;
  } catch {
    return `${tierKind.value}:<author>:tiers`;
  }
});

const profilePublishDisabled = computed(
  () =>
    publishingProfile.value ||
    !authorInput.value.trim() ||
    !p2pkPub.value.trim() ||
    !!tiersJsonError.value ||
    mintList.value.length === 0 ||
    tiers.value.length === 0
);

const tiersPublishDisabled = computed(
  () =>
    publishingTiers.value ||
    !authorInput.value.trim() ||
    !!tiersJsonError.value ||
    tiers.value.length === 0
);

const tierFrequencyOptions = computed(() =>
  tierFrequencies.map(value => ({
    value,
    label:
      value === 'one_time'
        ? 'One-time'
        : value === 'monthly'
          ? 'Monthly'
          : 'Yearly',
  }))
);

function toMediaCsv(media?: { type: string; url: string }[]) {
  if (!media) return '';
  return media
    .map(m => m?.url)
    .filter((u): u is string => typeof u === 'string' && !!u)
    .join(', ');
}

function resetTierForm() {
  tierForm.value = {
    id: '',
    title: '',
    price: 0,
    frequency: 'monthly',
    description: '',
    mediaCsv: '',
  };
}

function openNewTier() {
  resetTierForm();
  showTierDialog.value = true;
}

function editTier(tier: Tier) {
  tierForm.value = {
    id: tier.id,
    title: tier.title,
    price: tier.price,
    frequency: tier.frequency,
    description: tier.description ?? '',
    mediaCsv: toMediaCsv(tier.media),
  };
  showTierDialog.value = true;
}

function removeTier(id: string) {
  tiers.value = tiers.value.filter(t => t.id !== id);
}

function saveTier() {
  const form = tierForm.value;
  const media = form.mediaCsv
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(url => ({ type: 'link', url }));
  const tier: Tier = {
    id: form.id || uuidv4(),
    title: form.title.trim(),
    price: Number(form.price) || 0,
    frequency: form.frequency,
    description: form.description ? form.description.trim() : undefined,
    media: media.length ? media : undefined,
  };

  if (form.id) {
    tiers.value = tiers.value.map(t => (t.id === form.id ? tier : t));
  } else {
    tiers.value = [...tiers.value, tier];
  }

  resetTierForm();
}

function applyTiersEvent(event: any | null, overrideKind?: TierKind | null) {
  if (!event) {
    tiers.value = [];
    return;
  }

  const eventKind =
    overrideKind && (overrideKind === 30019 || overrideKind === 30000)
      ? overrideKind
      : typeof event?.kind === 'number' && (event.kind === 30019 || event.kind === 30000)
        ? (event.kind as TierKind)
        : null;

  if (eventKind) {
    tierKind.value = eventKind;
  }

  const content = typeof event?.content === 'string' ? event.content : undefined;
  tiers.value = parseTiersContent(content);
}

function buildRelayList(rawRelays: string[]) {
  const sanitizedEntries: string[] = [];
  const droppedEntries: string[] = [];

  for (const relay of rawRelays) {
    const sanitized = sanitizeRelayUrls([relay], 1)[0];
    if (sanitized) {
      sanitizedEntries.push(sanitized);
    } else {
      droppedEntries.push(relay);
    }
  }

  const sanitizedSet = new Set<string>();
  for (const relay of sanitizedEntries) {
    sanitizedSet.add(relay);
  }
  if (!sanitizedSet.has(FUNDSTR_WS_URL)) {
    sanitizedSet.add(FUNDSTR_WS_URL);
  }

  return { sanitized: Array.from(sanitizedSet), dropped: droppedEntries };
}

function applyProfileEvent(latest: any | null) {
  if (!latest) {
    displayName.value = '';
    pictureUrl.value = '';
    p2pkPub.value = '';
    p2pkPriv.value = '';
    p2pkDerivedPub.value = '';
    mintsText.value = '';
    relaysText.value = FUNDSTR_WS_URL;
    return;
  }

  if (typeof latest.pubkey === 'string' && latest.pubkey) {
    authorInput.value = latest.pubkey.toLowerCase();
  }

  try {
    const parsed = latest.content ? JSON.parse(latest.content) : {};
    if (typeof parsed.p2pk === 'string') {
      setDerivedP2pk(parsed.p2pk);
    }
    if (Array.isArray(parsed.mints)) {
      mintsText.value = parsed.mints.join('\n');
    }
    if (Array.isArray(parsed.relays) && parsed.relays.length > 0) {
      const rawRelays = parsed.relays
        .map((entry: unknown) => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean);
      const { sanitized, dropped } = buildRelayList(rawRelays);
      if (dropped.length > 0) {
        notifyWarning(
          dropped.length === 1
            ? 'Discarded invalid relay URL'
            : 'Discarded invalid relay URLs',
          dropped.join(', ')
        );
      }
      relaysText.value = sanitized.join('\n');
    } else {
      relaysText.value = FUNDSTR_WS_URL;
    }
    if (typeof parsed.tierAddr === 'string') {
      const [kindPart, , dPart] = parsed.tierAddr.split(':');
      const maybeKind = Number(kindPart);
      if ((maybeKind === 30019 || maybeKind === 30000) && dPart === 'tiers') {
        tierKind.value = maybeKind as TierKind;
      }
    }
  } catch (err) {
    console.warn('[nutzap] failed to parse profile content', err);
  }

  const tags = Array.isArray(latest.tags) ? latest.tags : [];
  const nameTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'name' && t[1]);
  if (nameTag) {
    displayName.value = nameTag[1];
  }
  const pictureTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'picture' && t[1]);
  if (pictureTag) {
    pictureUrl.value = pictureTag[1];
  }
  const mintTags = tags.filter((t: any) => Array.isArray(t) && t[0] === 'mint' && t[1]);
  if (!mintsText.value && mintTags.length) {
    mintsText.value = mintTags.map((t: any) => t[1]).join('\n');
  }
  const relayTags = tags.filter((t: any) => Array.isArray(t) && t[0] === 'relay' && t[1]);
  if ((!relaysText.value || relaysText.value === FUNDSTR_WS_URL) && relayTags.length) {
    const rawRelays = relayTags
      .map((t: any) => (typeof t[1] === 'string' ? t[1].trim() : ''))
      .filter(Boolean);
    const { sanitized, dropped } = buildRelayList(rawRelays);
    if (dropped.length > 0) {
      notifyWarning(
        dropped.length === 1
          ? 'Discarded invalid relay URL'
          : 'Discarded invalid relay URLs',
        dropped.join(', ')
      );
    }
    relaysText.value = sanitized.join('\n');
  }
  if (!p2pkPub.value) {
    const pkTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'pubkey' && t[1]);
    if (pkTag) {
      p2pkPub.value = pkTag[1];
    }
  }
}

async function loadTiers(authorHex: string) {
  try {
    const normalized = authorHex.toLowerCase();
    const events = await relaySocket.requestOnce(
      [
        {
          kinds: [30019, 30000],
          authors: [normalized],
          '#d': ['tiers'],
          limit: 2,
        },
      ],
      {
        timeoutMs: WS_FIRST_TIMEOUT_MS,
        httpFallback: {
          url: FUNDSTR_REQ_URL,
          timeoutMs: HTTP_FALLBACK_TIMEOUT_MS,
        },
      }
    );

    const latest = pickLatestParamReplaceable(events);
    applyTiersEvent(latest);
  } catch (err) {
    console.error('[nutzap] failed to load tiers', err);
    const message = err instanceof Error ? err.message : String(err);
    notifyError(message);
    throw err instanceof Error ? err : new Error(message);
  }
}

async function loadProfile(authorHex: string) {
  try {
    const normalized = authorHex.toLowerCase();
    const events = await relaySocket.requestOnce(
      [{ kinds: [10019], authors: [normalized], limit: 1 }],
      {
        timeoutMs: WS_FIRST_TIMEOUT_MS,
        httpFallback: {
          url: FUNDSTR_REQ_URL,
          timeoutMs: HTTP_FALLBACK_TIMEOUT_MS,
        },
      }
    );

    const latest = pickLatestReplaceable(events);
    applyProfileEvent(latest);
  } catch (err) {
    console.error('[nutzap] failed to load profile', err);
    const message = err instanceof Error ? err.message : String(err);
    notifyError(message);
    throw err instanceof Error ? err : new Error(message);
  }
}

function cleanupSubscriptions() {
  if (profileSubId) {
    relaySocket.unsubscribe(profileSubId);
    profileSubId = null;
  }
  if (tiersSubId) {
    relaySocket.unsubscribe(tiersSubId);
    tiersSubId = null;
  }
}

function ensureRelayStatusListener() {
  if (!relaySocket.isSupported || stopRelayStatusListener) {
    return;
  }

  stopRelayStatusListener = relaySocket.onStatusChange(status => {
    if (status === 'connected') {
      if (hasRelayConnected && reloadAfterReconnect && activeAuthorHex) {
        reloadAfterReconnect = false;
        void loadAll();
      }
      hasRelayConnected = true;
    } else if (
      hasRelayConnected &&
      (status === 'reconnecting' || status === 'connecting' || status === 'disconnected')
    ) {
      if (activeAuthorHex) {
        reloadAfterReconnect = true;
      }
    }
  });
}

function setupSubscriptions(authorHex: string) {
  if (!relaySocket.isSupported) {
    return;
  }

  ensureRelayStatusListener();

  const normalized = authorHex.toLowerCase();

  let profileSeen = false;
  let profileLatestAt = 0;

  try {
    profileSubId = relaySocket.subscribe(
      [{ kinds: [10019], authors: [normalized], limit: 1 }],
      event => {
        if (!event || typeof event.kind !== 'number' || event.kind !== 10019) {
          return;
        }
        const eventAuthor = typeof event.pubkey === 'string' ? event.pubkey.toLowerCase() : '';
        if (eventAuthor !== normalized) {
          return;
        }
        const createdAt = typeof event.created_at === 'number' ? event.created_at : 0;
        if (!profileSeen || createdAt >= profileLatestAt) {
          profileSeen = true;
          profileLatestAt = createdAt;
          applyProfileEvent(event);
        }
      },
      () => {
        if (!profileSeen) {
          applyProfileEvent(null);
        }
      }
    );
  } catch (err) {
    console.warn('[nutzap] failed to subscribe to profile', err);
    profileSubId = null;
  }

  let tierSeen = false;
  let tierLatestAt = 0;

  try {
    tiersSubId = relaySocket.subscribe(
      [
        {
          kinds: [30019, 30000],
          authors: [normalized],
          '#d': ['tiers'],
          limit: 1,
        },
      ],
      event => {
        if (!event || typeof event.kind !== 'number') {
          return;
        }
        if (event.kind !== 30019 && event.kind !== 30000) {
          return;
        }
        const eventAuthor = typeof event.pubkey === 'string' ? event.pubkey.toLowerCase() : '';
        if (eventAuthor !== normalized) {
          return;
        }
        const createdAt = typeof event.created_at === 'number' ? event.created_at : 0;
        if (!tierSeen || createdAt >= tierLatestAt) {
          tierSeen = true;
          tierLatestAt = createdAt;
          applyTiersEvent(event);
        }
      },
      () => {
        if (!tierSeen) {
          applyTiersEvent(null);
        }
      }
    );
  } catch (err) {
    console.warn('[nutzap] failed to subscribe to tiers', err);
    tiersSubId = null;
  }
}

function refreshSubscriptions(force = false) {
  let nextHex: string | null = null;
  try {
    nextHex = normalizeAuthor(authorInput.value);
  } catch {
    nextHex = null;
  }

  if (!force && nextHex === activeAuthorHex) {
    return;
  }

  const previousHex = activeAuthorHex;
  activeAuthorHex = nextHex;

  cleanupSubscriptions();

  if (!nextHex) {
    reloadAfterReconnect = false;
    if (previousHex) {
      applyProfileEvent(null);
      applyTiersEvent(null);
    }
    return;
  }

  if (previousHex && previousHex !== nextHex) {
    applyProfileEvent(null);
    applyTiersEvent(null);
  }

  setupSubscriptions(nextHex);
}

async function loadAll() {
  let authorHex: string;
  try {
    authorHex = normalizeAuthor(authorInput.value);
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
    return;
  }

  loading.value = true;
  try {
    await Promise.all([loadTiers(authorHex), loadProfile(authorHex)]);
  } catch (err) {
    console.error('[nutzap] failed to load Nutzap profile', err);
    if (!(err instanceof Error)) {
      notifyError('Failed to load Nutzap profile.');
    }
  } finally {
    loading.value = false;
  }
}

async function publishTiers() {
  let authorHex: string;
  try {
    authorHex = normalizeAuthor(authorInput.value);
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
    return;
  }

  if (tiers.value.length === 0) {
    notifyError('Add at least one tier before publishing.');
    return;
  }
  if (tiersJsonError.value) {
    notifyError('Fix tier JSON before publishing tiers.');
    return;
  }

  publishingTiers.value = true;
  try {
    const { ack, event } = await publishTiersToRelay(tiers.value, tierKind.value, {
      send: publishEventToRelay,
    });
    const signerPubkey = event?.pubkey;
    const reloadKey = typeof signerPubkey === 'string' && signerPubkey ? signerPubkey : authorHex;
    if (signerPubkey && signerPubkey !== authorInput.value) {
      authorInput.value = signerPubkey;
    }
    const eventId = ack?.id ?? event?.id;
    const relayMessage = typeof ack?.message === 'string' && ack.message ? ` — ${ack.message}` : '';
    lastTiersPublishInfo.value = eventId
      ? `Tiers published (kind ${tierKind.value}) — id ${eventId}${relayMessage}`
      : `Tiers published (kind ${tierKind.value})${relayMessage}`;
    const successMessage =
      typeof ack?.message === 'string' && ack.message
        ? `Relay accepted tiers — ${ack.message}`
        : 'Subscription tiers published to relay.fundstr.me.';
    notifySuccess(successMessage);
    await loadTiers(reloadKey);
    refreshSubscriptions(true);
  } catch (err) {
    console.error('[nutzap] publish tiers failed', err);
    if (err instanceof RelayPublishError) {
      const message = err.ack.message ?? 'Relay rejected event.';
      lastTiersPublishInfo.value = `Tiers publish rejected — id ${err.ack.id}${
        err.ack.message ? ` — ${err.ack.message}` : ''
      }`;
      notifyError(message);
    } else {
      notifyError(err instanceof Error ? err.message : 'Unable to publish tiers.');
    }
  } finally {
    publishingTiers.value = false;
  }
}

async function publishProfile() {
  let authorHex: string;
  try {
    authorHex = normalizeAuthor(authorInput.value);
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!p2pkPub.value.trim()) {
    notifyError('P2PK public key is required.');
    return;
  }
  if (mintList.value.length === 0) {
    notifyError('Add at least one trusted mint URL.');
    return;
  }
  if (tiers.value.length === 0) {
    notifyError('Add at least one tier before publishing.');
    return;
  }
  if (tiersJsonError.value) {
    notifyError('Fix tier JSON before publishing the profile.');
    return;
  }

  publishingProfile.value = true;
  try {
    const relays = relayList.value;
    const p2pkHex = p2pkPub.value.trim();
    const tagPubkey = (p2pkDerivedPub.value || p2pkHex).trim();
    const content = JSON.stringify({
      v: 1,
      p2pk: p2pkHex,
      mints: mintList.value,
      relays,
      tierAddr: `${tierKind.value}:${authorHex}:tiers`,
    });

    const tags: string[][] = [
      ['t', 'nutzap-profile'],
      ['client', 'fundstr'],
      ...mintList.value.map(mint => ['mint', mint, 'sat']),
      ...relays.map(relay => ['relay', relay]),
    ];
    if (tagPubkey) {
      tags.push(['pubkey', tagPubkey]);
    }
    tags.push(['a', `${tierKind.value}:${authorHex}:tiers`]);
    if (displayName.value.trim()) {
      tags.push(['name', displayName.value.trim()]);
    }
    if (pictureUrl.value.trim()) {
      tags.push(['picture', pictureUrl.value.trim()]);
    }

    const { ack, event } = await publishNostrEvent(
      { kind: 10019, tags, content },
      { send: publishEventToRelay }
    );
    const signerPubkey = event?.pubkey;
    const reloadKey = typeof signerPubkey === 'string' && signerPubkey ? signerPubkey : authorHex;
    if (signerPubkey && signerPubkey !== authorInput.value) {
      authorInput.value = signerPubkey;
    }
    const eventId = ack?.id ?? event?.id;
    const relayMessage = typeof ack?.message === 'string' && ack.message ? ` — ${ack.message}` : '';
    lastProfilePublishInfo.value = eventId
      ? `Profile published — id ${eventId}${relayMessage}`
      : `Profile published to relay.fundstr.me.${relayMessage}`;
    const successMessage =
      typeof ack?.message === 'string' && ack.message
        ? `Relay accepted profile — ${ack.message}`
        : 'Nutzap profile published to relay.fundstr.me.';
    notifySuccess(successMessage);
    await loadProfile(reloadKey);
    refreshSubscriptions(true);
  } catch (err) {
    console.error('[nutzap] publish profile failed', err);
    if (err instanceof RelayPublishError) {
      const message = err.ack.message ?? 'Relay rejected event.';
      lastProfilePublishInfo.value = `Profile publish rejected — id ${err.ack.id}${
        err.ack.message ? ` — ${err.ack.message}` : ''
      }`;
      notifyError(message);
    } else {
      notifyError(err instanceof Error ? err.message : 'Unable to publish Nutzap profile.');
    }
  } finally {
    publishingProfile.value = false;
  }
}

function frequencyLabel(value: Tier['frequency']) {
  return value === 'one_time' ? 'one-time' : value;
}

watch(
  () => authorInput.value,
  () => {
    refreshSubscriptions();
  },
  { immediate: true }
);

watch(
  signer,
  newSigner => {
    const ndk = getNutzapNdk();
    ndk.signer = newSigner ?? undefined;
  },
  { immediate: true }
);

watch(pubkey, newPubkey => {
  if (newPubkey && !authorInput.value) {
    authorInput.value = newPubkey;
  }
  if (newPubkey && !hasAutoLoaded.value) {
    hasAutoLoaded.value = true;
    void loadAll();
  }
});

onMounted(() => {
  if (isBrowser) {
    updateStoredSecretPresence();
  }
  if (!relaysText.value) {
    relaysText.value = FUNDSTR_WS_URL;
  }
  if (pubkey.value && !authorInput.value) {
    authorInput.value = pubkey.value;
  }
  if (authorInput.value && !hasAutoLoaded.value) {
    hasAutoLoaded.value = true;
    void loadAll();
  }
  if (relaySupported) {
    connectRelay();
  }
  ensureRelayStatusListener();
});

onBeforeUnmount(() => {
  cleanupSubscriptions();
  if (stopRelayStatusListener) {
    stopRelayStatusListener();
    stopRelayStatusListener = null;
  }
  reloadAfterReconnect = false;
});
</script>

<style scoped>
.nutzap-profile-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.status-chip {
  text-transform: capitalize;
  font-weight: 600;
}

.profile-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
}

.grid-card {
  height: 100%;
}

.relay-card,
.activity-card {
  grid-column: span 2;
}

.publisher-card {
  grid-column: span 2;
}

@media (max-width: 1200px) {
  .relay-card,
  .activity-card,
  .publisher-card {
    grid-column: span 1;
  }
}

.activity-log-list {
  max-height: 260px;
  overflow-y: auto;
}
</style>
