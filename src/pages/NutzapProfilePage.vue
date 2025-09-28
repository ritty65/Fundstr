<template>
  <q-page class="nutzap-profile-page bg-surface-1 q-pa-xl">
    <div class="profile-layout">
      <aside class="profile-rail">
        <div class="status-banner bg-surface-2 text-1">
          <div class="status-summary">
            <span class="status-dot" :class="relayStatusDotClass" aria-hidden="true"></span>
            <span class="status-label text-caption text-weight-medium">{{ relayStatusLabel }}</span>
          </div>
          <div class="status-meta text-body2 text-2">Isolated relay: relay.fundstr.me (WS → HTTP fallback)</div>
        </div>

        <section class="progress-overview bg-surface-2 text-1">
          <div class="progress-header text-subtitle1 text-weight-medium">Workflow</div>
          <ol class="progress-steps" role="list">
            <li
              v-for="(step, index) in workflowSteps"
              :key="step.name"
              :class="['progress-step-item', stepClasses(index)]"
            >
              <button
                type="button"
                class="progress-step-button"
                :aria-current="index === activeStepIndex ? 'step' : undefined"
                @click="activeProfileStep = step.name"
              >
                <span class="step-number">{{ index + 1 }}</span>
                <span class="step-copy">
                  <span class="step-label text-body1 text-weight-medium">{{ step.label }}</span>
                  <span class="step-description text-caption text-2">{{ step.description }}</span>
                </span>
              </button>
            </li>
          </ol>
        </section>
      </aside>

      <div class="profile-content">
        <q-tab-panels v-model="activeProfileStep" animated class="profile-panels">
          <q-tab-panel name="connect" class="profile-panel">
            <div class="panel-sections">
              <section class="section-card connection-module">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Connection</div>
                  <div class="section-subtitle text-body2 text-2">
                    Control the live WebSocket session used for publishing events and monitor relay activity.
                  </div>
                </div>
                <div class="section-body column q-gutter-lg">
                  <div class="connection-status column q-gutter-xs">
                    <div class="status-indicators row items-center wrap q-gutter-sm">
                      <RelayStatusIndicator class="connection-status-indicator" />
                      <q-chip dense :color="relayStatusColor" text-color="white" class="status-chip">
                        {{ relayStatusLabel }}
                      </q-chip>
                    </div>
                    <div v-if="latestRelayActivity" class="latest-activity text-caption">
                      <span class="text-2">Latest update:</span>
                      <span class="text-weight-medium text-1">{{ latestRelayActivity.message }}</span>
                      <span class="text-2">({{ formatActivityTime(latestRelayActivity.timestamp) }})</span>
                    </div>
                    <div v-else class="latest-activity text-caption text-2">No relay activity yet.</div>
                  </div>

                  <div class="connection-controls column q-gutter-sm">
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
                  </div>

                  <div class="connection-activity column q-gutter-xs">
                    <q-expansion-item
                      dense
                      expand-separator
                      icon="history"
                      label="Activity timeline"
                      header-class="activity-expansion-header"
                      :disable="!relayActivity.length"
                    >
                      <div v-if="relayActivityTimeline.length" class="activity-timeline column q-gutter-md q-mt-sm">
                        <div
                          v-for="entry in relayActivityTimeline"
                          :key="entry.id"
                          class="timeline-entry row no-wrap"
                        >
                          <div class="timeline-marker" :class="`timeline-marker--${entry.level}`"></div>
                          <div class="timeline-content column q-gutter-xs">
                            <div class="timeline-header row items-center q-gutter-sm">
                              <span class="text-caption text-2">{{ formatActivityTime(entry.timestamp) }}</span>
                              <q-badge :color="activityLevelColor(entry.level)" outline size="sm">
                                {{ entry.level }}
                              </q-badge>
                            </div>
                            <div class="timeline-message text-body2 text-1">{{ entry.message }}</div>
                            <div v-if="entry.context" class="timeline-context text-caption text-2">{{ entry.context }}</div>
                          </div>
                        </div>
                        <div class="timeline-actions row justify-end">
                          <q-btn
                            flat
                            label="Clear log"
                            size="sm"
                            :disable="!relayActivity.length"
                            @click="clearRelayActivity"
                          />
                        </div>
                      </div>
                      <div v-else class="section-empty text-caption text-2 q-mt-sm">No relay activity yet.</div>
                    </q-expansion-item>
                    <div v-if="!relayActivity.length" class="text-caption text-2">
                      Activity will appear once the relay connection initializes.
                    </div>
                  </div>
                </div>
              </section>

              <section class="section-card">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Key status</div>
                  <div class="section-subtitle text-body2 text-2">
                    Manage the publishing identity for Nutzap events.
                    <template v-if="usingStoreIdentity">
                      Active signer details are mirrored from your global Nostr identity.
                    </template>
                  </div>
                </div>
                <div class="section-body column q-gutter-md">
                  <div class="column q-gutter-xs">
                    <div class="text-body1 text-1">
                      <template v-if="usingStoreIdentity">
                        Connected as
                        <span class="text-weight-medium">{{ connectedIdentitySummary || 'Fundstr identity' }}</span>
                      </template>
                      <template v-else>Using a dedicated Nutzap key</template>
                    </div>
                    <div v-if="usingStoreIdentity" class="text-body2 text-2">
                      Your Fundstr signer is ready to publish Nutzap events. Stick with this shared identity unless you
                      need a separate persona or want to keep a secret key off the global store.
                    </div>
                    <div v-if="usingStoreIdentity" class="text-body2 text-2">
                      Choose a dedicated key when delegating publishing, testing against staging relays, or isolating
                      collectibles under a different author.
                    </div>
                    <div v-else class="text-body2 text-2">
                      This workspace is scoped to a standalone key, so Nutzap activity stays independent from your
                      Fundstr profile.
                    </div>
                    <q-banner
                      v-if="usingStoreIdentity && !storeHasPrivateKey"
                      dense
                      rounded
                      class="bg-surface-2 text-warning"
                    >
                      The shared Fundstr signer is missing a stored private key on this device. Open the dedicated key
                      tools to import or generate one before publishing.
                    </q-banner>
                  </div>
                  <div class="row items-center q-gutter-sm">
                    <q-btn
                      v-if="usingStoreIdentity"
                      color="primary"
                      outline
                      label="Need a dedicated key?"
                      @click="advancedKeyManagementOpen = true"
                    />
                    <q-btn
                      v-else
                      color="primary"
                      outline
                      label="Manage key tools"
                      @click="advancedKeyManagementOpen = true"
                    />
                  </div>
                  <q-dialog v-model="advancedKeyManagementOpen" position="right">
                    <q-card class="advanced-key-drawer bg-surface-1">
                      <q-card-section class="row items-center justify-between q-gutter-sm">
                        <div class="text-subtitle1 text-weight-medium text-1">Dedicated key tools</div>
                        <q-btn icon="close" flat round dense v-close-popup aria-label="Close key tools" />
                      </q-card-section>
                      <q-separator />
                      <q-card-section class="advanced-key-drawer__body column q-gutter-lg">
                        <div class="column q-gutter-sm">
                          <div class="text-body2 text-2">
                            Generate a fresh key for Nutzap-only publishing or paste an existing secret to reuse another
                            signer.
                          </div>
                          <div v-if="usingStoreIdentity" class="text-caption text-2">
                            Shared signer active — manual key import is disabled while using your Fundstr identity.
                          </div>
                        </div>
                        <div v-if="!usingStoreIdentity" class="column q-gutter-sm">
                          <q-input
                            v-model="keyImportValue"
                            label="Secret key (nsec or 64-char hex)"
                            dense
                            filled
                            autocomplete="off"
                            :disable="usingStoreSecret"
                          />
                          <div class="row q-gutter-sm">
                            <q-btn
                              color="primary"
                              label="Generate"
                              :disable="usingStoreSecret"
                              @click="generateNewSecret"
                            />
                            <q-btn
                              color="primary"
                              outline
                              label="Import"
                              :disable="usingStoreSecret"
                              @click="importSecretKey"
                            />
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
                        <q-banner dense rounded class="bg-surface-2 text-body2 text-2">
                          Save keys to this browser when you want the device to remember them, or clear the stored copy
                          when finished.
                        </q-banner>
                        <div v-if="!usingStoreIdentity" class="row wrap q-gutter-sm">
                          <q-btn
                            color="primary"
                            label="Save to Browser"
                            :disable="!keySecretHex || usingStoreSecret"
                            @click="saveSecretToBrowser"
                          />
                          <q-btn
                            color="primary"
                            outline
                            label="Load from Browser"
                            :disable="!hasStoredSecret || usingStoreSecret"
                            @click="loadSecretFromBrowser"
                          />
                          <q-btn
                            color="negative"
                            outline
                            label="Forget Stored Key"
                            :disable="!hasStoredSecret || usingStoreSecret"
                            @click="forgetStoredSecret"
                          />
                        </div>
                      </q-card-section>
                    </q-card>
                  </q-dialog>
                </div>
              </section>
            </div>
          </q-tab-panel>

          <q-tab-panel name="author" class="profile-panel">
            <div class="panel-sections">
              <section class="section-card">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Author metadata</div>
                  <div class="section-subtitle text-body2 text-2">
                    Compose profile details that will be published alongside your tiers.
                  </div>
                </div>
                <div class="section-body column q-gutter-md">
                  <div class="text-subtitle2 text-1">Payment Profile (kind 10019)</div>
                  <q-input v-model="displayName" label="Display Name" dense filled />
                  <q-input v-model="pictureUrl" label="Picture URL" dense filled />
                  <q-input v-model="mintsText" type="textarea" label="Trusted Mints (one per line)" dense filled autogrow />
                  <q-input
                    v-model="relaysText"
                    type="textarea"
                    label="Relay Hints (optional, one per line)"
                    dense
                    filled
                    autogrow
                  />
                </div>
              </section>

              <section class="section-card">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">P2PK keys</div>
                  <div class="section-subtitle text-body2 text-2">
                    Generate or derive the payment pointer used by your Nutzap profile.
                  </div>
                </div>
                <div class="section-body column q-gutter-md">
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
                </div>
              </section>

              <section class="section-card">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Publish profile</div>
                  <div class="section-subtitle text-body2 text-2">
                    Confirm details and push the latest payment profile to relay.fundstr.me.
                  </div>
                </div>
                <div class="section-body column q-gutter-md">
                  <div class="text-body2 text-2">
                    Publishing updates with tier address <span class="text-weight-medium text-1">{{ tierAddressPreview }}</span>.
                  </div>
                  <div class="row justify-end q-gutter-sm">
                    <q-btn
                      color="primary"
                      label="Publish Profile"
                      :disable="profilePublishDisabled"
                      :loading="publishingProfile"
                      @click="publishProfile"
                    />
                  </div>
                  <div class="text-body2 text-2" v-if="lastProfilePublishInfo">
                    {{ lastProfilePublishInfo }}
                  </div>
                </div>
              </section>
            </div>
          </q-tab-panel>

          <q-tab-panel name="tiers" class="profile-panel">
            <div class="panel-sections">
              <section class="section-card">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Tier strategy</div>
                  <div class="section-subtitle text-body2 text-2">
                    Publishing as {{ tierKindLabel }} — parameterized replaceable ["d", "tiers"].
                  </div>
                </div>
                <div class="section-body column q-gutter-md">
                  <div class="row items-center justify-between wrap q-gutter-sm">
                    <div class="text-subtitle2 text-1">Tier kind</div>
                    <q-btn-toggle
                      v-model="tierKind"
                      :options="tierKindOptions"
                      dense
                      toggle-color="primary"
                      unelevated
                    />
                  </div>
                </div>
              </section>

              <section class="section-card">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Compose tiers</div>
                  <div class="section-subtitle text-body2 text-2">
                    Draft pricing, benefits, and cadence before publishing downstream.
                  </div>
                </div>
                <div class="section-body column q-gutter-md">
                  <TierComposer
                    v-model:tiers="tiers"
                    :frequency-options="tierFrequencyOptions"
                    @validation-changed="handleTierValidation"
                  />
                </div>
              </section>

              <section class="section-card">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Review and publish</div>
                  <div class="section-subtitle text-body2 text-2">
                    Inspect the JSON payload before pushing updates to the relay.
                  </div>
                </div>
                <div class="section-body column q-gutter-md">
                  <q-input
                    :model-value="tiersJsonPreview"
                    type="textarea"
                    label="Tiers JSON preview"
                    dense
                    filled
                    autogrow
                    readonly
                    spellcheck="false"
                  />
                  <div class="row justify-end q-gutter-sm">
                    <q-btn
                      color="primary"
                      label="Publish Tiers"
                      :disable="tiersPublishDisabled"
                      :loading="publishingTiers"
                      @click="publishTiers"
                    />
                  </div>
                  <div class="text-body2 text-2" v-if="lastTiersPublishInfo">
                    {{ lastTiersPublishInfo }}
                  </div>
                </div>
              </section>
            </div>
          </q-tab-panel>

          <q-tab-panel name="explore" class="profile-panel">
            <div class="panel-sections">
              <section class="section-card">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Review workspace</div>
                  <div class="section-subtitle text-body2 text-2">
                    Quickly hydrate the composer with author data and inspect events across your relay set.
                  </div>
                </div>
                <div class="section-body">
                  <NutzapExplorerPanel
                    v-model="authorInput"
                    :loading-author="loading"
                    :tier-address-preview="tierAddressPreview"
                    @load-author="loadAll"
                  />
                </div>
              </section>
            </div>
          </q-tab-panel>
        </q-tab-panels>

        <section class="optional-tools bg-surface-2 text-1">
          <div class="optional-tools-header">
            <div class="text-subtitle1 text-weight-medium">Optional tools</div>
            <div class="text-body2 text-2">
              Need deeper troubleshooting? Jump into diagnostics when you want relay inspectors and self-tests.
            </div>
          </div>
          <q-btn color="primary" label="Open diagnostics workspace" to="/nutzap-tools" class="optional-tools-action" />
        </section>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { WatchStopHandle } from 'vue';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { getPublicKey as getSecpPublicKey, utils as secpUtils } from '@noble/secp256k1';
import RelayStatusIndicator from 'src/nutzap/RelayStatusIndicator.vue';
import NutzapExplorerPanel from 'src/nutzap/onepage/NutzapExplorerPanel.vue';
import TierComposer from './nutzap-profile/TierComposer.vue';
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
import { hasTierErrors, tierFrequencies, type TierFieldErrors } from './nutzap-profile/tierComposerUtils';
import { fundstrRelayClient, RelayPublishError } from 'src/nutzap/relayClient';
import { sanitizeRelayUrls } from 'src/utils/relay';
import {
  useRelayConnection,
  type RelayActivityLevel,
} from 'src/nutzap/onepage/useRelayConnection';
import { useNostrStore } from 'src/stores/nostr';

type TierKind = 30019 | 30000;

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
const loading = ref(false);
const publishingProfile = ref(false);
const publishingTiers = ref(false);
const lastProfilePublishInfo = ref('');
const lastTiersPublishInfo = ref('');
const hasAutoLoaded = ref(false);

const keyImportValue = ref('');
const keySecretHex = ref('');
const keyPublicHex = ref('');
const keyNpub = ref('');
const keyNsec = ref('');
const hasStoredSecret = ref(false);
const advancedKeyManagementOpen = ref(false);
const workflowSteps = [
  {
    name: 'connect',
    label: 'Connect',
    description: 'Establish relay access and signer status.',
  },
  {
    name: 'author',
    label: 'Author',
    description: 'Shape profile metadata before publishing.',
  },
  {
    name: 'tiers',
    label: 'Tiers',
    description: 'Compose benefits and cadence options.',
  },
  {
    name: 'explore',
    label: 'Review',
    description: 'Inspect stored events and author data.',
  },
] as const;

type ProfileStep = (typeof workflowSteps)[number]['name'];

const activeProfileStep = ref<ProfileStep>('connect');
const activeStepIndex = computed(() => workflowSteps.findIndex(step => step.name === activeProfileStep.value));
const stepClasses = (index: number) => ({
  'is-active': index === activeStepIndex.value,
  'is-complete': index < activeStepIndex.value,
});

const SECRET_STORAGE_KEY = 'nutzap.profile.secretHex';
const isBrowser = typeof window !== 'undefined';

const {
  relayUrl: relayConnectionUrl,
  status: relayConnectionStatus,
  autoReconnect: relayAutoReconnect,
  activityLog: relayActivity,
  connect: connectRelay,
  disconnect: disconnectRelay,
  publishEvent: publishEventToRelay,
  clearActivity: clearRelayActivity,
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

const relayStatusDotClass = computed(() => {
  switch (relayConnectionStatus.value) {
    case 'connected':
      return 'status-dot--positive';
    case 'connecting':
    case 'reconnecting':
      return 'status-dot--warning';
    case 'disconnected':
      return 'status-dot--negative';
    default:
      return 'status-dot--idle';
  }
});

const latestRelayActivity = computed(() => {
  const entries = relayActivity.value;
  return entries.length ? entries[entries.length - 1] : null;
});

const relayActivityTimeline = computed(() => relayActivity.value.slice().reverse());

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
  if (!advancedKeyManagementOpen.value) {
    return;
  }
  const secret = generateSecretKey();
  applySecretBytes(secret);
  notifySuccess('Generated new secret key.');
}

function importSecretKey() {
  if (!advancedKeyManagementOpen.value) {
    return;
  }
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
  if (!advancedKeyManagementOpen.value) {
    return;
  }
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
  if (!advancedKeyManagementOpen.value) {
    return;
  }
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
  if (!advancedKeyManagementOpen.value) {
    return;
  }
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
  p2pkPub,
  value => {
    p2pkDerivedPub.value = value.trim();
  },
  { immediate: true }
);

const { pubkey, signer } = useActiveNutzapSigner();
const nostrStore = useNostrStore();

const storeNpub = computed(() => nostrStore.npub || '');
const storePrivKeyHex = computed(() => nostrStore.privKeyHex || '');
const storeActiveNsec = computed(() => nostrStore.activePrivateKeyNsec || '');

const usingStoreIdentity = computed(() => !!pubkey.value);
const usingStoreSecret = computed(() => usingStoreIdentity.value && !!storePrivKeyHex.value);
const storeHasPrivateKey = computed(() => !!storePrivKeyHex.value || !!storeActiveNsec.value);
const connectedIdentitySummary = computed(() => {
  if (!usingStoreIdentity.value) {
    return '';
  }
  if (storeNpub.value) {
    return shortenKey(storeNpub.value);
  }
  const activePub = typeof pubkey.value === 'string' ? pubkey.value.trim() : '';
  if (!activePub) {
    return '';
  }
  return shortenKey(activePub);
});

function shortenKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 16) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

const lastSyncedPubkey = ref('');
const lastSyncedSecretHex = ref('');
const lastSyncedNsec = ref('');

let ensureSharedSignerPromise: Promise<void> | null = null;

async function ensureSharedSignerInitialized() {
  if (ensureSharedSignerPromise) {
    return ensureSharedSignerPromise;
  }

  ensureSharedSignerPromise = (async () => {
    try {
      await nostrStore.initSignerIfNotSet();
    } catch (err) {
      console.error('[nutzap] failed to initialize shared signer', err);
    } finally {
      const ndk = getNutzapNdk();
      ndk.signer = (nostrStore.signer as any) ?? undefined;
      ensureSharedSignerPromise = null;
    }
  })();

  return ensureSharedSignerPromise;
}

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

watch(
  usingStoreIdentity,
  value => {
    if (!value) {
      return;
    }
    void ensureSharedSignerInitialized();
  },
  { immediate: true }
);

watch(
  [pubkey, storeNpub],
  ([newPubkey, storeNpubValue]) => {
    const normalizedPubkey = typeof newPubkey === 'string' ? newPubkey.trim().toLowerCase() : '';
    const encodedNpub = normalizedPubkey
      ? storeNpubValue || safeEncodeNpub(normalizedPubkey)
      : '';

    if (normalizedPubkey) {
      keyPublicHex.value = normalizedPubkey;
      keyNpub.value = encodedNpub;
      if (!authorInput.value || authorInput.value === lastSyncedPubkey.value) {
        authorInput.value = normalizedPubkey;
      }
      lastSyncedPubkey.value = normalizedPubkey;

      if (!hasAutoLoaded.value) {
        hasAutoLoaded.value = true;
        void loadAll();
      }
    } else {
      if (keyPublicHex.value === lastSyncedPubkey.value) {
        keyPublicHex.value = '';
        keyNpub.value = '';
      }
      if (authorInput.value === lastSyncedPubkey.value) {
        authorInput.value = '';
      }
      lastSyncedPubkey.value = '';
    }
  },
  { immediate: true }
);

let stopStoreKeySync: WatchStopHandle | null = null;

function stopStoreKeySyncWatcher() {
  if (stopStoreKeySync) {
    stopStoreKeySync();
    stopStoreKeySync = null;
  }
}

function startStoreKeySyncWatcher() {
  if (stopStoreKeySync) {
    return;
  }
  stopStoreKeySync = watch(
    [storePrivKeyHex, storeActiveNsec],
    ([privHex, activeNsec]) => {
      const normalizedHex = typeof privHex === 'string' ? privHex.trim().toLowerCase() : '';
      const normalizedNsec = typeof activeNsec === 'string' ? activeNsec.trim() : '';

      if (normalizedHex) {
        keySecretHex.value = normalizedHex;
        lastSyncedSecretHex.value = normalizedHex;
      } else if (lastSyncedSecretHex.value && keySecretHex.value === lastSyncedSecretHex.value) {
        keySecretHex.value = '';
        lastSyncedSecretHex.value = '';
      }

      if (normalizedNsec) {
        keyNsec.value = normalizedNsec;
        lastSyncedNsec.value = normalizedNsec;
      } else if (normalizedHex) {
        const derived = safeEncodeNsec(normalizedHex);
        if (derived) {
          keyNsec.value = derived;
          lastSyncedNsec.value = derived;
        } else if (lastSyncedNsec.value && keyNsec.value === lastSyncedNsec.value) {
          keyNsec.value = '';
          lastSyncedNsec.value = '';
        }
      } else if (lastSyncedNsec.value && keyNsec.value === lastSyncedNsec.value) {
        keyNsec.value = '';
        lastSyncedNsec.value = '';
      }
    },
    { immediate: true }
  );
}

watch(
  advancedKeyManagementOpen,
  value => {
    if (value) {
      startStoreKeySyncWatcher();
    } else {
      stopStoreKeySyncWatcher();
    }
  },
  { immediate: true }
);

const tierAddressPreview = computed(() => {
  try {
    const authorHex = normalizeAuthor(authorInput.value);
    return `${tierKind.value}:${authorHex}:tiers`;
  } catch {
    return `${tierKind.value}:<author>:tiers`;
  }
});

function safeEncodeNpub(pubHex: string) {
  try {
    return nip19.npubEncode(pubHex);
  } catch {
    return '';
  }
}

function safeEncodeNsec(secretHex: string) {
  try {
    return nip19.nsecEncode(hexToBytes(secretHex));
  } catch {
    return '';
  }
}

const profilePublishDisabled = computed(
  () =>
    publishingProfile.value ||
    !authorInput.value.trim() ||
    !p2pkPub.value.trim() ||
    tiersHaveErrors.value ||
    mintList.value.length === 0 ||
    tiers.value.length === 0
);

const tiersPublishDisabled = computed(
  () =>
    publishingTiers.value ||
    !authorInput.value.trim() ||
    tiersHaveErrors.value ||
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

const tierValidationResults = ref<TierFieldErrors[]>([]);
const tiersHaveErrors = computed(() =>
  tierValidationResults.value.some(result => hasTierErrors(result))
);

const tiersJsonPreview = computed(() => JSON.stringify(buildTiersJsonPayload(tiers.value), null, 2));

function handleTierValidation(results: TierFieldErrors[]) {
  tierValidationResults.value = results;
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
  if (tiersHaveErrors.value) {
    notifyError('Fix tier validation errors before publishing tiers.');
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
  if (tiersHaveErrors.value) {
    notifyError('Fix tier validation errors before publishing the profile.');
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
  stopStoreKeySyncWatcher();
  if (stopRelayStatusListener) {
    stopRelayStatusListener();
    stopRelayStatusListener = null;
  }
  reloadAfterReconnect = false;
});
</script>

<style scoped>
.nutzap-profile-page {
  display: block;
}

.profile-layout {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 32px;
}

.profile-rail {
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: sticky;
  top: 32px;
  align-self: flex-start;
}

.profile-content {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.status-banner {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
}

.status-summary {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 9999px;
  background: var(--surface-contrast-border);
  transition: background-color 150ms ease;
}

.status-dot--positive {
  background: #21ba45;
}

.status-dot--warning {
  background: #f2c037;
}

.status-dot--negative {
  background: #c10015;
}

.status-dot--idle {
  background: var(--surface-contrast-border);
}

.status-label {
  text-transform: capitalize;
}

.status-chip {
  text-transform: capitalize;
  font-weight: 600;
}

.status-meta {
  font-size: 13px;
  line-height: 1.4;
  color: var(--text-2);
}

.connection-status-indicator {
  min-width: 160px;
}

.latest-activity {
  color: var(--text-2);
}

.activity-expansion-header {
  padding-left: 0;
  padding-right: 0;
}

.activity-timeline {
  position: relative;
  padding-left: 4px;
}

.timeline-entry {
  gap: 12px;
  align-items: flex-start;
}

.timeline-marker {
  position: relative;
  width: 12px;
  min-width: 12px;
  height: 12px;
  border-radius: 9999px;
  margin-top: 6px;
  background: var(--accent-500);
}

.timeline-marker::after {
  content: '';
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: 2px;
  height: calc(100% + 12px);
  background: var(--surface-contrast-border);
}

.timeline-entry:last-child .timeline-marker::after {
  display: none;
}

.timeline-marker--success {
  background: #21ba45;
}

.timeline-marker--info {
  background: var(--accent-500);
}

.timeline-marker--warning {
  background: #f2c037;
}

.timeline-marker--error {
  background: #c10015;
}

.timeline-content {
  flex: 1;
  min-width: 0;
}

.timeline-message {
  word-break: break-word;
}

.timeline-context {
  word-break: break-word;
}

.timeline-actions {
  padding-top: 8px;
}


.progress-overview {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
}

.progress-steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
}

.progress-step-item {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  transition: border-color 120ms ease, background-color 120ms ease;
}

.progress-step-item:hover {
  border-color: var(--accent-200);
}

.progress-step-item.is-active {
  border-color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-500) 18%, transparent);
}

.progress-step-item.is-complete {
  border-color: var(--accent-200);
}

.progress-step-item.is-active .step-number {
  background: var(--accent-600);
}

.progress-step-item.is-active .step-label {
  color: var(--accent-500);
}

.progress-step-button {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.progress-step-button:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--accent-500);
  color: var(--text-inverse);
  font-weight: 600;
}

.progress-step-item.is-complete .step-number {
  background: var(--accent-200);
  color: var(--text-1);
}

.step-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-panels {
  border-radius: 16px;
  background: transparent;
}

.profile-panel {
  padding: 0;
}

.panel-sections {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px;
}

.section-card {
  background: var(--surface-2);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-empty {
  padding: 12px 0;
  border: 1px dashed var(--surface-contrast-border);
  border-radius: 12px;
  text-align: center;
}

.optional-tools {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
  max-width: 640px;
  align-self: flex-start;
  margin-bottom: 48px;
}

.optional-tools-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.optional-tools-action {
  align-self: flex-start;
}

.advanced-key-drawer {
  width: 420px;
  max-width: 90vw;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.advanced-key-drawer__body {
  flex: 1;
  overflow-y: auto;
}

@media (max-width: 1100px) {
  .profile-layout {
    grid-template-columns: 1fr;
  }

  .profile-rail {
    position: static;
  }
}

@media (max-width: 768px) {
  .section-card {
    padding: 16px 18px;
  }

  .progress-overview,
  .status-banner {
    padding: 16px 18px;
  }
}
</style>
