<template>
  <q-page class="nutzap-profile-page bg-surface-1 q-pa-xl">
    <div class="nutzap-profile-container">
      <q-card class="profile-card bg-surface-2 shadow-4 full-width">
        <div class="profile-card-header">
          <div class="profile-hero">
            <div class="profile-hero__intro">
              <div class="profile-hero__eyebrow text-caption text-2">Creator Nutzap workspace</div>
              <h1 class="profile-hero__title text-h5 text-weight-bold text-1">Connect → configure → publish</h1>
              <p class="profile-hero__description text-body1 text-2">
                Move through the checklist to link your signer, configure payout details, and publish tiers without guesswork.
              </p>
              <div class="profile-hero__status text-caption">
                <span class="status-dot" :class="relayStatusDotClass" aria-hidden="true"></span>
                <span class="text-weight-medium text-1">{{ relayStatusLabel }}</span>
                <span class="text-2">· Isolated relay: relay.fundstr.me (WS → HTTP fallback)</span>
              </div>
            </div>
            <div class="profile-hero__actions">
              <q-btn
                class="profile-primary-cta"
                color="primary"
                unelevated
                :loading="primaryCtaLoading"
                :disable="primaryCtaDisabled"
                :label="primaryCtaLabel"
                @click="handlePrimaryCta"
              />
              <div class="profile-hero__next-step text-caption">
                <template v-if="nextBlockingTask">
                  <span class="text-2">Next step:</span>
                  <span class="text-weight-medium text-1">{{ nextBlockingTask.label }}</span>
                </template>
                <template v-else>
                  <span class="text-positive text-weight-medium">All systems ready — publish when you're set.</span>
                </template>
              </div>
              <q-btn
                outline
                dense
                icon="travel_explore"
                class="profile-hero__explorer"
                label="Open data explorer"
                @click="requestExplorerOpen('toolbar')"
              />
            </div>
          </div>
          <div class="readiness-checklist" role="status" aria-live="polite">
            <div class="readiness-header">
              <div class="readiness-title text-subtitle2 text-weight-medium text-1">Workspace readiness</div>
              <div class="readiness-subtitle text-body2 text-2">Track blockers across connect, configure, and publish.</div>
            </div>
            <div class="readiness-body column q-gutter-lg">
              <div v-for="(section, index) in readinessSections" :key="section.key" class="readiness-section">
                <div class="readiness-section__header">
                  <div class="readiness-section__index text-caption text-weight-medium">{{ index + 1 }}</div>
                  <div>
                    <div class="readiness-section__title text-body1 text-weight-medium text-1">{{ section.title }}</div>
                    <div class="readiness-section__summary text-caption text-2">{{ section.summary }}</div>
                  </div>
                </div>
                <q-list padding class="readiness-section__list">
                  <q-item
                    v-for="task in section.tasks"
                    :key="task.key"
                    dense
                    class="readiness-task"
                    :class="`is-${task.state}`"
                  >
                    <q-item-section avatar>
                      <q-icon
                        :name="task.icon"
                        :color="task.state === 'ready' ? 'positive' : task.state === 'blocked' ? 'warning' : 'grey-6'"
                      />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label class="text-body2 text-1">{{ task.label }}</q-item-label>
                      <q-item-label v-if="task.detail" class="text-caption text-2">{{ task.detail }}</q-item-label>
                    </q-item-section>
                    <q-item-section v-if="task.state === 'blocked'" side>
                      <q-btn
                        flat
                        size="sm"
                        color="primary"
                        :label="task.actionLabel"
                        @click="handleReadinessTaskClick(section.key, task.key)"
                      />
                    </q-item-section>
                  </q-item>
                </q-list>
              </div>
            </div>
          </div>
        </div>
        <div class="profile-card-body">
          <div class="profile-main-grid">
            <section ref="connectStageRef" class="profile-stage">
              <header class="profile-stage__header">
                <div class="profile-stage__eyebrow text-caption text-2">Step 1</div>
                <div class="profile-stage__title text-subtitle1 text-weight-medium text-1">Connect</div>
                <div class="profile-stage__summary text-body2 text-2">
                  Link your signer and stabilize the Fundstr relay before configuring payouts.
                </div>
              </header>
              <div class="profile-stage__content column q-gutter-lg">
                <ConnectionPanel
                  class="profile-grid-item profile-grid-item--connection"
              :status-label="relayStatusLabel"
              :status-color="relayStatusColor"
              :status-dot-class="relayStatusDotClass"
              :latest-activity="latestRelayActivity"
              :latest-alert-label="latestRelayAlertLabel"
              :relay-needs-attention="relayNeedsAttention"
              :activity-timeline="relayActivityTimeline"
              :relay-url="relayUrlInput"
              :relay-url-valid="relayUrlInputValid"
              :relay-supported="relaySupported"
              :relay-is-connected="relayIsConnected"
              :relay-auto-reconnect="relayAutoReconnect"
              :format-activity-time="formatActivityTime"
              :activity-level-color="activityLevelColor"
              @update:relay-url="value => (relayUrlInput.value = value)"
              @update:auto-reconnect="value => (relayAutoReconnect.value = value)"
              @connect="handleRelayConnect"
              @disconnect="handleRelayDisconnect"
              @clear-activity="clearRelayActivity"
            />

            <section ref="configureStageRef" class="profile-stage">
              <header class="profile-stage__header">
                <div class="profile-stage__eyebrow text-caption text-2">Step 2</div>
                <div class="profile-stage__title text-subtitle1 text-weight-medium text-1">Configure</div>
                <div class="profile-stage__summary text-body2 text-2">
                  Capture trusted payout details and craft the supporter experience before publishing.
                </div>
              </header>
              <div class="profile-stage__content column q-gutter-lg">
                <AuthorMetadataPanel
                  class="profile-grid-item profile-grid-item--author"
                  :display-name="displayName"
                  :picture-url="pictureUrl"
                  :mints-text="mintsText"
                  :relays-text="relaysText"
                  :p2pk-priv="p2pkPriv"
                  :p2pk-pub="p2pkPub"
                  :p2pk-derived-pub="p2pkDerivedPub"
                  :key-secret-hex="keySecretHex"
                  :key-nsec="keyNsec"
                  :key-public-hex="keyPublicHex"
                  :key-npub="keyNpub"
                  :key-import-value="keyImportValue"
                  :using-store-identity="usingStoreIdentity"
                  :connected-identity-summary="connectedIdentitySummary"
                  :identity-basics-complete="identityBasicsComplete"
                  :optional-metadata-complete="optionalMetadataComplete"
                  :advanced-encryption-complete="advancedEncryptionComplete"
                  :advanced-key-management-open="advancedKeyManagementOpen"
                  @update:display-name="value => (displayName.value = value)"
                  @update:picture-url="value => (pictureUrl.value = value)"
                  @update:mints-text="value => (mintsText.value = value)"
                  @update:relays-text="value => (relaysText.value = value)"
                  @update:p2pk-priv="value => (p2pkPriv.value = value)"
                  @update:p2pk-pub="value => (p2pkPub.value = value)"
                  @update:key-import-value="value => (keyImportValue.value = value)"
                  @update:advanced-key-management-open="value => (advancedKeyManagementOpen.value = value)"
                  @request-derive-p2pk="deriveP2pkPublicKey"
                  @request-generate-p2pk="generateP2pkKeypair"
                  @request-generate-secret="generateNewSecret"
                  @request-import-secret="importSecretKey"
                />

                <TierComposerCard
                  class="profile-grid-item profile-grid-item--tiers"
                  :tiers="tiers"
                  :frequency-options="tierFrequencyOptions"
                  :show-errors="showTierValidation"
                  :tiers-ready="tiersReady"
                  @update:tiers="value => (tiers.value = value)"
                  @validation-changed="handleTierValidation"
                />
              </div>
            </section>

            <section ref="publishStageRef" class="profile-stage">
              <header class="profile-stage__header">
                <div class="profile-stage__eyebrow text-caption text-2">Step 3</div>
                <div class="profile-stage__title text-subtitle1 text-weight-medium text-1">Publish</div>
                <div class="profile-stage__summary text-body2 text-2">
                  Review the public snapshot and push your tiers live when everything looks right.
                </div>
              </header>
              <div class="profile-stage__content column q-gutter-lg">
                <section class="section-card share-summary-card profile-grid-item profile-grid-item--share">
                  <div class="section-header">
                    <div class="section-title text-subtitle1 text-weight-medium text-1">Share &amp; snapshot</div>
                    <div class="section-subtitle text-body2 text-2">
                      Copy your supporter-facing link and confirm key profile details.
                    </div>
              </div>
              <div class="section-body column q-gutter-lg">
                <div class="share-link-block" data-testid="profile-share-block">
                  <div class="share-link-label text-caption text-2">Public profile link</div>
                  <q-input
                    :model-value="publicProfileUrl"
                    dense
                    filled
                    readonly
                    :disable="!publicProfileUrl"
                    data-testid="public-profile-url"
                  >
                    <template #append>
                      <q-btn
                        flat
                        color="primary"
                        label="Copy link"
                        :disable="!publicProfileUrl"
                        data-testid="copy-public-profile-url"
                        @click="publicProfileUrl && copy(publicProfileUrl)"
                      />
                    </template>
                  </q-input>
                  <div v-if="lastPublishInfo" class="share-meta text-caption text-2">{{ lastPublishInfo }}</div>
                </div>
                <div class="share-summary-grid">
                  <div class="share-summary-column column q-gutter-md">
                    <div class="summary-block" data-testid="summary-identity">
                      <div class="summary-label text-caption text-2">Profile identity</div>
                      <div class="summary-value text-body1 text-weight-medium text-1">
                        {{ summaryDisplayName }}
                      </div>
                      <div v-if="summaryAuthorKey" class="summary-meta text-caption text-2">
                        Author:
                        <span class="text-weight-medium text-1">{{ summaryAuthorKey }}</span>
                      </div>
                      <div v-if="summaryP2pkPointer" class="summary-meta text-caption text-2">
                        P2PK pointer:
                        <span class="text-weight-medium text-1">{{ summaryP2pkPointer }}</span>
                      </div>
                    </div>
                    <div class="summary-block" data-testid="summary-tiers">
                      <div class="summary-label text-caption text-2">Tier address</div>
                      <div class="summary-value text-body2 text-1">{{ tierAddressPreview }}</div>
                      <div class="summary-meta text-caption text-2">
                        Publishing as {{ tierKindLabel }} — parameterized replaceable ["d", "tiers"].
                      </div>
                    </div>
                  </div>
                  <div class="share-summary-column column q-gutter-md">
                    <div class="summary-block" data-testid="summary-mints">
                      <div class="summary-label text-caption text-2">Trusted mints</div>
                      <div v-if="mintList.length" class="summary-chips" data-testid="summary-mints-list">
                        <q-chip
                          v-for="mint in mintList"
                          :key="mint"
                          dense
                          outline
                          class="summary-chip"
                        >
                          {{ mint }}
                        </q-chip>
                      </div>
                      <div v-else class="summary-empty text-caption text-2">No mints configured.</div>
                    </div>
                    <div class="summary-block" data-testid="summary-relays">
                      <div class="summary-label text-caption text-2">Preferred relays</div>
                      <div class="summary-chips" data-testid="summary-relay-list">
                        <q-chip
                          v-for="relay in relayList"
                          :key="relay"
                          dense
                          outline
                          class="summary-chip"
                        >
                          {{ relay }}
                        </q-chip>
                      </div>
                    </div>
                  </div>
                </div>
                <div
                  v-if="showContextHelpBanner"
                  class="context-help-inline bg-surface-1 text-1"
                >
                  <div class="context-help-inline__header">
                    <div class="text-subtitle1 text-weight-medium">Workspace help</div>
                    <q-btn
                      flat
                      dense
                      round
                      icon="close"
                      class="context-help-inline__dismiss"
                      aria-label="Hide workspace help"
                      @click="dismissHelpBanner"
                    />
                  </div>
                  <div class="context-help-inline__body text-body2 text-2">
                    Pull relay history without leaving the composer and jump into diagnostics when deeper inspection is
                    needed.
                  </div>
                  <div
                    v-if="diagnosticsAttention"
                    class="context-help-alert"
                    :class="`context-help-alert--${diagnosticsAttention.level}`"
                  >
                    <div class="context-help-alert-title text-body1 text-weight-medium text-1">
                      {{ diagnosticsAttention.title }}
                    </div>
                    <div class="context-help-alert-detail text-caption text-2">
                      {{ diagnosticsAttention.detail }}
                    </div>
                  </div>
                  <div class="context-help-inline__actions">
                    <q-btn
                      v-if="diagnosticsAttention"
                      color="primary"
                      flat
                      class="context-help-inline__cta"
                      label="Open data explorer"
                      @click="handleDiagnosticsAlertCta"
                    />
                    <q-btn
                      v-else
                      color="primary"
                      flat
                      class="context-help-inline__cta"
                      icon="science"
                      label="Open data explorer"
                      @click="requestExplorerOpen('banner')"
                    />
                  </div>
                </div>
              </div>
            </section>

                <section class="section-card tier-kind-card profile-grid-item profile-grid-item--tier-kind">
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

                <ReviewPublishCard
                  class="profile-grid-item profile-grid-item--publish"
                  v-model:open="reviewPublishSectionOpen"
                  :tiers-ready="tiersReady"
                  :tiers-json-preview="tiersJsonPreview"
                  :publish-disabled="publishDisabled"
                  :publishing="publishingAll"
                  :public-profile-url="publicProfileUrl"
                  :last-publish-info="lastPublishInfo"
                  @publish="publishAll"
                  @copy-link="copy(publicProfileUrl)"
                />
              </div>
            </section>
          </div>
        </div>
      </q-card>
      <q-dialog
        v-model="dataExplorerDialogOpen"
        :position="explorerDialogPosition"
        :maximized="$q.screen.lt.md"
        :transition-show="explorerDialogTransitions.show"
        :transition-hide="explorerDialogTransitions.hide"
      >
        <q-card :class="['data-explorer-drawer', $q.screen.lt.md ? 'is-mobile' : '']" class="bg-surface-2 text-1">
          <div class="data-explorer-drawer__header">
            <div class="text-subtitle1 text-weight-medium">Data explorer</div>
            <q-btn
              flat
              dense
              round
              icon="close"
              aria-label="Close data explorer"
              v-close-popup
            />
          </div>
          <div class="data-explorer-drawer__body">
            <RelayExplorer />
          </div>
        </q-card>
      </q-dialog>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useEventBus, useLocalStorage } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { getPublicKey as getSecpPublicKey, utils as secpUtils } from '@noble/secp256k1';
import ConnectionPanel from './nutzap-profile/ConnectionPanel.vue';
import AuthorMetadataPanel from './nutzap-profile/AuthorMetadataPanel.vue';
import TierComposerCard from './nutzap-profile/TierComposerCard.vue';
import ReviewPublishCard from './nutzap-profile/ReviewPublishCard.vue';
import NutzapExplorerPanel from 'src/nutzap/onepage/NutzapExplorerPanel.vue';
import { notifyError, notifySuccess, notifyWarning } from 'src/js/notify';
import type { Tier } from 'src/nutzap/types';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';
import { generateSecretKey, getPublicKey as getNostrPublicKey, nip19 } from 'nostr-tools';
import { useClipboard } from 'src/composables/useClipboard';
import { buildProfileUrl } from 'src/utils/profileUrl';
import {
  FUNDSTR_WS_URL,
  FUNDSTR_REQ_URL,
  WS_FIRST_TIMEOUT_MS,
  HTTP_FALLBACK_TIMEOUT_MS,
  publishTiers as publishTiersToRelay,
  publishNostrEvent,
  ensureFundstrRelayClient,
} from './nutzap-profile/nostrHelpers';
import {
  normalizeAuthor,
  pickLatestReplaceable,
  pickLatestParamReplaceable,
  parseTiersContent,
} from 'src/nutzap/profileShared';
import { hasTierErrors, tierFrequencies, type TierFieldErrors } from './nutzap-profile/tierComposerUtils';
import { RelayPublishError, type FundstrRelayClient } from 'src/nutzap/relayClient';
import { sanitizeRelayUrls } from 'src/utils/relay';
import { useNutzapRelayTelemetry } from 'src/nutzap/useNutzapRelayTelemetry';
import { useNutzapSignerWorkspace } from 'src/nutzap/useNutzapSignerWorkspace';
import { useP2PKStore } from 'src/stores/p2pk';
import { useMintsStore } from 'src/stores/mints';

type TierKind = 30019 | 30000;

const authorInput = ref('');
const displayName = ref('');
const pictureUrl = ref('');
const p2pkPub = ref('');
const p2pkPriv = ref('');
const p2pkDerivedPub = ref('');
const cachedMintsText = useLocalStorage<string>('nutzap.profile.mintsDraft', '');
const mintsText = ref(cachedMintsText.value || '');
const relaysText = ref(FUNDSTR_WS_URL);
const tiers = ref<Tier[]>([]);
const tierKind = ref<TierKind>(30019);
const loading = ref(false);
const publishingAll = ref(false);
const lastPublishInfo = ref('');
const hasAutoLoaded = ref(false);

const relayClientRef = shallowRef<FundstrRelayClient | null>(null);
let relayClientPromise: Promise<FundstrRelayClient> | null = null;

function setResolvedRelayClient(client: FundstrRelayClient): FundstrRelayClient {
  relayClientRef.value = client;
  return client;
}

function ensureRelayClientInitialized(): Promise<FundstrRelayClient> {
  if (!relayClientPromise) {
    relayClientPromise = ensureFundstrRelayClient().then(setResolvedRelayClient);
  }
  return relayClientPromise;
}

async function getRelayClient(): Promise<FundstrRelayClient> {
  const existing = relayClientRef.value;
  if (existing) {
    return existing;
  }
  return await ensureRelayClientInitialized();
}

function getRelayClientIfReady(): FundstrRelayClient | null {
  return relayClientRef.value;
}

const p2pkStore = useP2PKStore();
const { firstKey, p2pkKeys } = storeToRefs(p2pkStore);

const mintsStore = useMintsStore();
const { activeMintUrl: storeActiveMintUrl, mints: storedMints } = storeToRefs(mintsStore);

watch(mintsText, value => {
  cachedMintsText.value = value;
});

const storeMintUrls = computed(() => {
  const urls: string[] = [];
  const seen = new Set<string>();

  const activeUrl = typeof storeActiveMintUrl.value === 'string' ? storeActiveMintUrl.value.trim() : '';
  if (activeUrl && !seen.has(activeUrl)) {
    seen.add(activeUrl);
    urls.push(activeUrl);
  }

  const mintEntries = Array.isArray(storedMints.value) ? storedMints.value : [];
  for (const entry of mintEntries) {
    const candidate = entry && typeof entry.url === 'string' ? entry.url.trim() : '';
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      urls.push(candidate);
    }
  }

  return urls;
});

function seedMintsFromStoreIfEmpty() {
  if (mintsText.value.trim()) {
    return;
  }

  if (storeMintUrls.value.length > 0) {
    mintsText.value = storeMintUrls.value.join('\n');
  }
}

watch([storeActiveMintUrl, storedMints], () => {
  seedMintsFromStoreIfEmpty();
}, { immediate: true, deep: true });

const router = useRouter();
const { copy } = useClipboard();

const authorHexForShare = computed(() => {
  const input = authorInput.value;
  if (!input.trim()) {
    return '';
  }

  try {
    return normalizeAuthor(input);
  } catch {
    return '';
  }
});

const authorNpubForShare = computed(() => {
  if (!authorHexForShare.value) {
    return '';
  }

  return safeEncodeNpub(authorHexForShare.value);
});

const publicProfileUrl = computed(() => {
  if (!authorNpubForShare.value) {
    return '';
  }

  if (!router || typeof window === 'undefined' || !window.location) {
    return '';
  }

  return buildProfileUrl(authorNpubForShare.value, router);
});

const reviewPublishSectionOpen = ref(false);
const connectStageRef = ref<HTMLElement | null>(null);
const configureStageRef = ref<HTMLElement | null>(null);
const publishStageRef = ref<HTMLElement | null>(null);

type ReadinessTaskState = 'ready' | 'blocked' | 'info';
type ReadinessSectionKey = 'connect' | 'configure' | 'publish';

type ReadinessTask = {
  key: string;
  label: string;
  detail?: string;
  state: ReadinessTaskState;
  icon: string;
  actionLabel: string;
  blocker: boolean;
};

type ReadinessSection = {
  key: ReadinessSectionKey;
  title: string;
  summary: string;
  tasks: ReadinessTask[];
};

type DiagnosticsAttention = {
  id: number;
  source: 'relay' | 'publish';
  title: string;
  detail: string;
  level: 'error' | 'warning';
};

const $q = useQuasar();

type ExplorerOpenSource = 'toolbar' | 'banner' | 'diagnostics' | 'publish-error';
type ExplorerEvent = { type: 'open'; source: ExplorerOpenSource };

const explorerBus = useEventBus<ExplorerEvent>('nutzap:explorer');
const dataExplorerDialogOpen = ref(false);
const explorerDialogPosition = computed(() => ($q.screen.lt.md ? 'bottom' : 'right'));
const explorerDialogTransitions = computed(() =>
  $q.screen.lt.md
    ? { show: 'slide-up', hide: 'slide-down' }
    : { show: 'slide-right', hide: 'slide-right' }
);

const stopExplorerBus = explorerBus.on(event => {
  if (event.type === 'open') {
    dataExplorerDialogOpen.value = true;
  }
});

function requestExplorerOpen(source: ExplorerOpenSource) {
  explorerBus.emit({ type: 'open', source });
}

const diagnosticsAttention = ref<DiagnosticsAttention | null>(null);
let diagnosticsAttentionSequence = 0;
const helpBannerDismissed = ref(false);
const showContextHelpBanner = computed(
  () => !helpBannerDismissed.value || !!diagnosticsAttention.value
);
function handleDiagnosticsAlertCta() {
  requestExplorerOpen('diagnostics');
  dismissDiagnosticsAttention();
}

function dismissDiagnosticsAttention() {
  diagnosticsAttention.value = null;
}

function dismissHelpBanner() {
  helpBannerDismissed.value = true;
  if (diagnosticsAttention.value) {
    dismissDiagnosticsAttention();
  }
}

function flagDiagnosticsAttention(
  source: 'relay' | 'publish',
  detail: string,
  level: 'error' | 'warning' = 'error'
) {
  diagnosticsAttention.value = {
    id: ++diagnosticsAttentionSequence,
    source,
    title: source === 'relay' ? 'Relay connection issue detected' : 'Publish attempt rejected',
    detail,
    level,
  };
}

watch(diagnosticsAttention, value => {
  if (value) {
    helpBannerDismissed.value = false;
  }
});

let relayNeedsAttentionRef: Ref<boolean> | null = null;

const relayTelemetry = useNutzapRelayTelemetry({
  onRelayAlert: entry => {
    const baseDetail = entry.context ? `${entry.message} — ${entry.context}` : entry.message;
    const needsAttention = relayNeedsAttentionRef?.value === true;
    const detail = needsAttention
      ? `${baseDetail} Verify the workspace key or try the HTTP fallback.`
      : baseDetail;
    const level: 'error' | 'warning' = needsAttention || entry.level === 'warning' ? 'warning' : 'error';
    flagDiagnosticsAttention('relay', detail, level);
  },
});

const {
  relayConnectionUrl,
  relayConnectionStatus,
  relayAutoReconnect,
  relayActivity,
  connectRelay,
  disconnectRelay,
  publishEventToRelay,
  clearRelayActivity,
  relaySupported,
  relayIsConnected,
  relayUrlInput,
  relayUrlInputValid,
  relayStatusLabel,
  relayStatusColor,
  relayStatusDotClass,
  latestRelayActivity,
  latestRelayAlertLabel,
  relayNeedsAttention,
  relayActivityTimeline,
  formatActivityTime,
  activityLevelColor,
  applyRelayUrlInput,
} = relayTelemetry;

relayNeedsAttentionRef = relayNeedsAttention;

watch(
  () => relayNeedsAttention.value,
  needsAttention => {
    if (!needsAttention && diagnosticsAttention.value?.source === 'relay') {
      dismissDiagnosticsAttention();
    }
  }
);

function handleRelayConnect() {
  applyRelayUrlInput();
  connectRelay();
}

function handleRelayDisconnect() {
  disconnectRelay();
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

function setDerivedP2pk(pubHex: string) {
  const normalized = pubHex.trim().toLowerCase();
  p2pkDerivedPub.value = normalized;
  p2pkPub.value = normalized;
}

function persistComposerKeyToStore(pubHex: string, privHex: string) {
  const normalizedPub = pubHex.trim();
  const normalizedPriv = privHex.trim();
  if (!normalizedPub || !normalizedPriv) {
    return;
  }

  const normalizedPubLower = normalizedPub.toLowerCase();
  const normalizedPrivLower = normalizedPriv.toLowerCase();
  const entries = Array.isArray(p2pkKeys.value) ? p2pkKeys.value : [];
  const alreadyTracked = entries.some(entry => {
    return (
      entry.publicKey.toLowerCase() === normalizedPubLower ||
      entry.privateKey.toLowerCase() === normalizedPrivLower
    );
  });

  if (alreadyTracked) {
    return;
  }

  const existingKeys = Array.isArray(p2pkStore.p2pkKeys) ? p2pkStore.p2pkKeys : [];
  p2pkStore.p2pkKeys = [
    {
      publicKey: normalizedPub,
      privateKey: normalizedPriv,
      used: false,
      usedCount: 0,
    },
    ...existingKeys,
  ];
}

function maybeSeedComposerKeysFromStore() {
  const key = firstKey.value;
  if (!key) {
    return;
  }

  const needsPriv = !p2pkPriv.value.trim();
  const needsPub = !p2pkPub.value.trim();

  if (!needsPriv && !needsPub) {
    return;
  }

  if (needsPriv && key.privateKey) {
    p2pkPriv.value = key.privateKey.trim();
  }
  if (needsPub && key.publicKey) {
    setDerivedP2pk(key.publicKey);
  }
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
  persistComposerKeyToStore(pubHex, privHex);
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

watch(
  [firstKey, p2pkKeys],
  () => {
    maybeSeedComposerKeysFromStore();
  },
  { immediate: true }
);

onMounted(() => {
  maybeSeedComposerKeysFromStore();
});

const {
  pubkey,
  signer,
  keySecretHex,
  keyNsec,
  keyPublicHex,
  keyNpub,
  keyImportValue,
  advancedKeyManagementOpen,
  usingStoreIdentity,
  connectedIdentitySummary,
  ensureSharedSignerInitialized,
} = useNutzapSignerWorkspace(authorInput, {
  onSignerActivated: () => {
    if (!hasAutoLoaded.value) {
      hasAutoLoaded.value = true;
      void loadAll();
    }
  },
});

function shortenKey(value: string) {
  const trimmed = value.trim();
  if (trimmed.length <= 16) {
    return trimmed;
  }
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

let profileSubId: string | null = null;
let tiersSubId: string | null = null;
let stopRelayStatusListener: (() => void) | null = null;
let hasRelayConnected = false;
let reloadAfterReconnect = false;
let activeAuthorHex: string | null = null;

const mintList = computed(() => {
  const composerEntries = mintsText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  if (composerEntries.length > 0) {
    return composerEntries;
  }

  return storeMintUrls.value;
});

const identityBasicsComplete = computed(
  () => displayName.value.trim().length > 0 || pictureUrl.value.trim().length > 0
);

const optionalMetadataComplete = computed(() => mintList.value.length > 0);

const advancedEncryptionComplete = computed(() => p2pkPub.value.trim().length > 0);

const signerReady = computed(() => Boolean(signer.value));

const relayHealthy = computed(() => relayIsConnected.value && !relayNeedsAttention.value);

const relayList = computed(() => {
  const entries = relaysText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  const set = new Set(entries);
  set.add(FUNDSTR_WS_URL);
  return Array.from(set);
});

const summaryDisplayName = computed(() => {
  const trimmedName = displayName.value.trim();
  if (trimmedName) {
    return trimmedName;
  }
  if (usingStoreIdentity.value) {
    return 'Fundstr identity';
  }
  if (authorInput.value.trim()) {
    return 'Nutzap author';
  }
  return 'Author not loaded';
});

const summaryAuthorKey = computed(() => {
  if (connectedIdentitySummary.value) {
    return connectedIdentitySummary.value;
  }
  const trimmed = authorInput.value.trim();
  return trimmed ? shortenKey(trimmed) : '';
});

const summaryP2pkPointer = computed(() => {
  const trimmed = p2pkPub.value.trim();
  return trimmed ? shortenKey(trimmed) : '';
});

const tierFrequencyLabelMap: Record<Tier['frequency'], string> = {
  one_time: 'One-time',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

const tierSummaryList = computed(() =>
  tiers.value.map(tier => {
    const title = tier.title?.trim() || 'Untitled tier';
    const price = Number.isFinite(tier.price) ? tier.price : 0;
    const description = typeof tier.description === 'string' ? tier.description.trim() : '';
    const frequency = tier.frequency && tierFrequencyLabelMap[tier.frequency] ? tier.frequency : 'monthly';

    return {
      id: tier.id,
      title,
      priceLabel: `${price.toLocaleString()} sats`,
      frequencyLabel: tierFrequencyLabelMap[frequency],
      ...(description ? { description } : {}),
    };
  })
);

const tierKindOptions = [
  { label: 'Canonical (30019)', value: 30019 },
  { label: 'Legacy (30000)', value: 30000 },
] as const;

const tierKindLabel = computed(() =>
  tierKind.value === 30019 ? 'Canonical (30019)' : 'Legacy (30000)'
);

const tierValidationResults = ref<TierFieldErrors[]>([]);
const showTierValidation = ref(false);
const tiersHaveErrors = computed(() =>
  tierValidationResults.value.some(result => hasTierErrors(result))
);

const tiersReady = computed(() => tiers.value.length > 0 && !tiersHaveErrors.value);

watch(
  tiersHaveErrors,
  hasErrors => {
    if (!hasErrors) {
      showTierValidation.value = false;
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

const publishDisabled = computed(
  () =>
    publishingAll.value ||
    !authorInput.value.trim() ||
    !p2pkPub.value.trim() ||
    mintList.value.length === 0 ||
    tiers.value.length === 0 ||
    tiersHaveErrors.value ||
    !signer.value ||
    relayNeedsAttention.value
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

const readinessSections = computed<ReadinessSection[]>(() => {
  const connectTasks: ReadinessTask[] = [
    {
      key: 'signer',
      label: signerReady.value ? 'Signer linked' : 'Link your signer',
      detail: signerReady.value
        ? connectedIdentitySummary.value || 'Fundstr signer connected.'
        : 'Connect a signer to fetch profile data and publish updates.',
      state: signerReady.value ? 'ready' : 'blocked',
      icon: signerReady.value ? 'task_alt' : 'vpn_key_off',
      actionLabel: signerReady.value ? 'Review signer' : 'Link signer',
      blocker: true,
    },
    {
      key: 'relay',
      label: relayHealthy.value ? 'Relay responding' : relayStatusLabel.value,
      detail: relayHealthy.value
        ? latestRelayActivity.value?.message
          ? `Latest: ${latestRelayActivity.value.message}`
          : 'Fundstr relay is ready.'
        : relayNeedsAttention.value
          ? 'Verify the workspace key or try the HTTP fallback.'
          : 'Initialize the workspace relay before publishing.',
      state: relayHealthy.value ? 'ready' : 'blocked',
      icon: relayHealthy.value ? 'wifi' : 'wifi_off',
      actionLabel: relayHealthy.value ? 'Review relay' : 'Reconnect',
      blocker: true,
    },
  ];

  const configureTasks: ReadinessTask[] = [
    {
      key: 'mint',
      label: optionalMetadataComplete.value ? 'Trusted mints added' : 'Add at least one trusted mint',
      detail: optionalMetadataComplete.value
        ? `${mintList.value.length} trusted mint${mintList.value.length === 1 ? '' : 's'} configured.`
        : 'Trusted mints are required so supporters know where to zap.',
      state: optionalMetadataComplete.value ? 'ready' : 'blocked',
      icon: optionalMetadataComplete.value ? 'payments' : 'add_card',
      actionLabel: optionalMetadataComplete.value ? 'Review mints' : 'Add mint',
      blocker: true,
    },
    {
      key: 'p2pk',
      label: advancedEncryptionComplete.value ? 'P2PK pointer ready' : 'Add a P2PK pointer',
      detail: advancedEncryptionComplete.value
        ? 'Encrypted payouts can be decrypted by your signer.'
        : 'A P2PK pointer is required so supporters can deliver Nutzaps.',
      state: advancedEncryptionComplete.value ? 'ready' : 'blocked',
      icon: advancedEncryptionComplete.value ? 'key' : 'key_off',
      actionLabel: advancedEncryptionComplete.value ? 'Review pointer' : 'Add pointer',
      blocker: true,
    },
    {
      key: 'tiers',
      label: tiersReady.value ? 'Tiers validated' : 'Draft at least one tier',
      detail: tiersReady.value
        ? `${tiers.value.length} tier${tiers.value.length === 1 ? '' : 's'} ready to publish.`
        : 'Each published profile needs at least one valid tier.',
      state: tiersReady.value ? 'ready' : 'blocked',
      icon: tiersReady.value ? 'playlist_add_check' : 'playlist_add',
      actionLabel: tiersReady.value ? 'Review tiers' : 'Add tier',
      blocker: true,
    },
    {
      key: 'identity',
      label: identityBasicsComplete.value
        ? 'Identity details added'
        : 'Optional: personalize with a display name or avatar',
      detail: identityBasicsComplete.value
        ? 'Supporters will see your display name and picture.'
        : 'Skip for now or personalize your profile later.',
      state: identityBasicsComplete.value ? 'ready' : 'info',
      icon: identityBasicsComplete.value ? 'badge' : 'tips_and_updates',
      actionLabel: identityBasicsComplete.value ? 'Edit identity' : 'Add identity',
      blocker: false,
    },
  ];

  const publishReady = !publishDisabled.value;
  const publishTasks: ReadinessTask[] = [
    {
      key: 'review',
      label: publishReady ? 'Ready to publish' : 'Complete checklist before publishing',
      detail: publishReady
        ? lastPublishInfo.value || 'Review JSON preview before sending to the relay.'
        : 'Resolve outstanding blockers to enable publishing.',
      state: publishReady ? 'ready' : 'blocked',
      icon: publishReady ? 'rocket_launch' : 'hourglass_bottom',
      actionLabel: publishReady ? 'Open review' : 'See blockers',
      blocker: !publishReady,
    },
    {
      key: 'share',
      label: publicProfileUrl.value ? 'Shareable link available' : 'Link appears after first publish',
      detail: publicProfileUrl.value
        ? publicProfileUrl.value
        : 'Publish once to generate your public link.',
      state: publicProfileUrl.value ? 'info' : 'info',
      icon: publicProfileUrl.value ? 'link' : 'visibility_off',
      actionLabel: publicProfileUrl.value ? 'Copy link' : 'Learn more',
      blocker: false,
    },
  ];

  return [
    {
      key: 'connect',
      title: 'Connect',
      summary: 'Link your signer and confirm the relay is responding.',
      tasks: connectTasks,
    },
    {
      key: 'configure',
      title: 'Configure',
      summary: 'Set up trusted payout details and supporter tiers.',
      tasks: configureTasks,
    },
    {
      key: 'publish',
      title: 'Publish',
      summary: 'Review the output and share your profile with supporters.',
      tasks: publishTasks,
    },
  ];
});

type BlockingTask = {
  sectionKey: ReadinessSectionKey;
  key: string;
  label: string;
  actionLabel: string;
};

const nextBlockingTask = computed<BlockingTask | null>(() => {
  for (const section of readinessSections.value) {
    for (const task of section.tasks) {
      if (task.blocker && task.state !== 'ready') {
        return {
          sectionKey: section.key,
          key: task.key,
          label: task.label,
          actionLabel: task.actionLabel,
        };
      }
    }
  }
  return null;
});

const primaryCtaLabel = computed(() => {
  if (!publishDisabled.value) {
    return 'Publish to Fundstr relay';
  }
  return nextBlockingTask.value?.actionLabel || 'Review checklist';
});

const primaryCtaLoading = computed(() => publishingAll.value);

const primaryCtaDisabled = computed(() => publishingAll.value);

function scrollToStage(section: ReadinessSectionKey) {
  const target =
    section === 'connect'
      ? connectStageRef.value
      : section === 'configure'
        ? configureStageRef.value
        : publishStageRef.value;
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function handleReadinessTaskClick(sectionKey: ReadinessSectionKey, taskKey: string) {
  scrollToStage(sectionKey);

  if (sectionKey === 'connect') {
    if (taskKey === 'signer') {
      ensureSharedSignerInitialized();
    } else if (taskKey === 'relay') {
      handleRelayConnect();
    }
  } else if (sectionKey === 'configure') {
    if (taskKey === 'tiers') {
      showTierValidation.value = true;
    }
  } else if (sectionKey === 'publish') {
    reviewPublishSectionOpen.value = true;
  }
}

function handlePrimaryCta() {
  if (!publishDisabled.value) {
    reviewPublishSectionOpen.value = true;
    void nextTick(() => scrollToStage('publish'));
    return;
  }

  if (nextBlockingTask.value) {
    handleReadinessTaskClick(nextBlockingTask.value.sectionKey, nextBlockingTask.value.key);
    return;
  }

  scrollToStage('publish');
}

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
    seedMintsFromStoreIfEmpty();
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

  seedMintsFromStoreIfEmpty();
}

async function loadTiers(authorHex: string) {
  try {
    const normalized = authorHex.toLowerCase();
    const relaySocket = await getRelayClient();
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
    const relaySocket = await getRelayClient();
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
  const relaySocket = getRelayClientIfReady();
  if (!relaySocket) {
    profileSubId = null;
    tiersSubId = null;
    return;
  }

  if (profileSubId) {
    relaySocket.unsubscribe(profileSubId);
    profileSubId = null;
  }
  if (tiersSubId) {
    relaySocket.unsubscribe(tiersSubId);
    tiersSubId = null;
  }
}

function attachRelayStatusListener(relaySocket: FundstrRelayClient) {
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

function ensureRelayStatusListenerOnce() {
  if (stopRelayStatusListener) {
    return;
  }

  const existingClient = getRelayClientIfReady();
  if (existingClient) {
    attachRelayStatusListener(existingClient);
    return;
  }

  void ensureRelayClientInitialized()
    .then(client => {
      attachRelayStatusListener(client);
    })
    .catch(err => {
      console.warn('[nutzap] failed to attach relay status listener', err);
    });
}

async function setupSubscriptions(authorHex: string) {
  const relaySocket = await getRelayClient();
  if (!relaySocket.isSupported) {
    return;
  }

  attachRelayStatusListener(relaySocket);

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

async function refreshSubscriptions(force = false) {
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

  try {
    await setupSubscriptions(nextHex);
  } catch (err) {
    console.warn('[nutzap] failed to refresh subscriptions', err);
  }
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

async function publishAll() {
  let authorHex: string;
  try {
    authorHex = normalizeAuthor(authorInput.value);
  } catch (err) {
    notifyError(err instanceof Error ? err.message : String(err));
    return;
  }

  if (!signer.value) {
    notifyError('Connect a Nostr signer to publish.');
    return;
  }

  showTierValidation.value = true;
  if (tiers.value.length === 0) {
    notifyError('Add at least one tier before publishing.');
    return;
  }
  if (tiersHaveErrors.value) {
    notifyError('Fix tier validation errors before publishing.');
    return;
  }

  showTierValidation.value = false;

  if (!p2pkPub.value.trim()) {
    notifyError('P2PK public key is required.');
    return;
  }
  if (mintList.value.length === 0) {
    notifyError('Add at least one trusted mint URL.');
    return;
  }

  publishingAll.value = true;
  lastPublishInfo.value = '';

  let tierSummary = '';

  try {
    const tierResult = await publishTiersToRelay(tiers.value, tierKind.value, {
      send: publishEventToRelay,
    });

    const tierEventId = tierResult.ack?.id ?? tierResult.event?.id;
    const tierRelayMessage =
      typeof tierResult.ack?.message === 'string' && tierResult.ack.message
        ? ` — ${tierResult.ack.message}`
        : '';
    tierSummary = tierEventId
      ? `Tiers published (kind ${tierKind.value}) — id ${tierEventId}${tierRelayMessage}`
      : `Tiers published (kind ${tierKind.value})${tierRelayMessage}`;

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

    const profileResult = await publishNostrEvent(
      { kind: 10019, tags, content },
      { send: publishEventToRelay }
    );

    const signerPubkey = profileResult.event?.pubkey || tierResult.event?.pubkey;
    const reloadKey = typeof signerPubkey === 'string' && signerPubkey ? signerPubkey : authorHex;
    if (signerPubkey && signerPubkey !== authorInput.value) {
      authorInput.value = signerPubkey;
    }

    const profileEventId = profileResult.ack?.id ?? profileResult.event?.id;
    const profileRelayMessage =
      typeof profileResult.ack?.message === 'string' && profileResult.ack.message
        ? ` — ${profileResult.ack.message}`
        : '';
    const profileSummary = profileEventId
      ? `Profile published — id ${profileEventId}${profileRelayMessage}`
      : `Profile published to relay.fundstr.me.${profileRelayMessage}`;

    lastPublishInfo.value = `${tierSummary} ${profileSummary}`.trim();

    const tierAckLabel =
      typeof tierResult.ack?.message === 'string' && tierResult.ack.message
        ? tierResult.ack.message
        : 'accepted';
    const profileAckLabel =
      typeof profileResult.ack?.message === 'string' && profileResult.ack.message
        ? profileResult.ack.message
        : 'accepted';
    notifySuccess(
      `Nutzap profile published (profile ${profileAckLabel}, tiers ${tierAckLabel}).`
    );

    await Promise.all([loadTiers(reloadKey), loadProfile(reloadKey)]);
    await refreshSubscriptions(true);
  } catch (err) {
    console.error('[nutzap] publish profile workflow failed', err);
    const ack = (err as any)?.ack as { id?: string; message?: string } | undefined;
    const isRelayError = err instanceof RelayPublishError || (ack && typeof ack.id === 'string');
    if (isRelayError) {
      const message = ack?.message ?? 'Relay rejected event.';
      const ackId = ack?.id ?? 'unknown';
      const rejectionDetail = `Publish rejected — id ${ackId}${
        ack?.message ? ` — ${ack?.message}` : ''
      }`;
      lastPublishInfo.value = tierSummary
        ? `${tierSummary} ${rejectionDetail}`
        : rejectionDetail;
      notifyError(message);
      flagDiagnosticsAttention('publish', message);
      requestExplorerOpen('publish-error');
    } else {
      const fallback = err instanceof Error ? err.message : 'Unable to publish Nutzap profile.';
      lastPublishInfo.value = tierSummary ? `${tierSummary} ${fallback}` : fallback;
      notifyError(fallback);
      flagDiagnosticsAttention('publish', fallback);
      requestExplorerOpen('publish-error');
    }
  } finally {
    publishingAll.value = false;
  }
}

watch(
  () => authorInput.value,
  () => {
    void refreshSubscriptions();
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
  void ensureSharedSignerInitialized();
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
    void ensureRelayClientInitialized()
      .then(() => {
        connectRelay();
      })
      .catch(err => {
        console.warn('[nutzap] skipped auto-connect due to relay init failure', err);
        if (!relayNeedsAttention.value) {
          const detail = 'Relay client failed to initialize. Verify the workspace key or try the HTTP fallback.';
          flagDiagnosticsAttention('relay', detail, 'warning');
        }
      });
  }
  ensureRelayStatusListenerOnce();
});

onBeforeUnmount(() => {
  stopExplorerBus();
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
  display: block;
}

.nutzap-profile-container {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  align-items: flex-start;
}

.profile-card {
  flex: 1 1 0%;
  width: 100%;
  padding: 24px 28px;
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.profile-card-header {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.profile-hero {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 24px;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-2) 94%, transparent);
}

.profile-hero__intro {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 620px;
}

.profile-hero__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-2);
}

.profile-hero__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-2);
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

.profile-hero__actions {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
}

.profile-primary-cta {
  min-width: 220px;
}

.profile-hero__next-step {
  color: var(--text-2);
}

.profile-hero__explorer {
  align-self: flex-start;
}

.readiness-checklist {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 24px;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-2) 94%, transparent);
}

.readiness-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.readiness-title {
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.readiness-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.readiness-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.readiness-section__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.readiness-section__index {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--surface-2) 82%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
}

.readiness-section__list {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-1) 98%, transparent);
}

.readiness-task {
  border-bottom: 1px solid color-mix(in srgb, var(--surface-contrast-border) 55%, transparent);
}

.readiness-task:last-child {
  border-bottom: none;
}

.readiness-task.is-ready {
  background: color-mix(in srgb, var(--surface-2) 90%, transparent);
}

.readiness-task.is-blocked {
  background: color-mix(in srgb, var(--accent-200) 20%, transparent);
}

.readiness-task.is-info {
  background: transparent;
}

.profile-card-body {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.profile-main-grid {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.profile-stage {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-stage__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--surface-contrast-border);
}

.profile-stage__eyebrow {
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-2);
}

.profile-stage__summary {
  color: var(--text-2);
  line-height: 1.5;
}

.profile-stage__content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.profile-grid-item {
  min-width: 0;
}

.share-link-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.share-link-label {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--text-2);
}

.share-meta {
  color: var(--text-2);
}

.share-summary-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.share-summary-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.summary-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-2) 96%, transparent);
}

.summary-label {
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.04em;
  color: var(--text-2);
}

.summary-value {
  font-size: 1rem;
  line-height: 1.4;
}

.summary-meta {
  line-height: 1.4;
  color: var(--text-2);
}

.summary-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.summary-chip {
  border-color: var(--surface-contrast-border);
}

.summary-empty {
  padding: 4px 0;
  color: var(--text-2);
}

.context-help-inline {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.context-help-inline__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.context-help-inline__dismiss {
  color: var(--text-2);
}

.context-help-inline__body {
  line-height: 1.5;
}

.context-help-inline__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.context-help-inline__cta {
  padding-left: 0;
  padding-right: 0;
}

.context-help-alert {
  border-left: 3px solid var(--accent-500);
  padding-left: 12px;
  margin-left: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.context-help-alert--error {
  border-color: #c10015;
}

.context-help-alert--warning {
  border-color: #f2c037;
}

.context-help-alert-title {
  margin-bottom: 4px;
}

.context-help-alert-detail {
  line-height: 1.4;
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
  gap: 4px;
}

.section-title {
  font-size: 1.05rem;
}

.section-subtitle {
  color: var(--text-2);
  line-height: 1.5;
}

.section-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tier-kind-card .section-body {
  gap: 12px;
}

.data-explorer-drawer {
  width: 420px;
  max-width: 90vw;
  max-height: 100vh;
  border-radius: 16px;
  border: 1px solid var(--surface-contrast-border);
  box-shadow: 0 20px 44px rgba(10, 14, 35, 0.22);
  display: flex;
  flex-direction: column;
}

.data-explorer-drawer.is-mobile {
  width: 100vw;
  max-width: 100vw;
  height: 100vh;
  border-radius: 0;
}

.data-explorer-drawer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px 12px;
}

.data-explorer-drawer__body {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}

@media (min-width: 768px) {
  .profile-card-header {
    flex-direction: row;
    align-items: stretch;
    gap: 24px;
  }

  .profile-hero {
    flex-direction: row;
    justify-content: space-between;
    align-items: flex-start;
    flex: 1 1 0%;
  }

  .profile-hero__actions {
    align-items: flex-end;
    text-align: right;
  }

  .profile-hero__explorer {
    align-self: flex-end;
  }

  .readiness-checklist {
    flex-direction: row;
    align-items: flex-start;
    gap: 24px;
    flex: 1 1 0%;
  }

  .readiness-body {
    flex: 1 1 0%;
  }

  .readiness-section__list {
    background: color-mix(in srgb, var(--surface-1) 96%, transparent);
  }

  .share-summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
}

@media (min-width: 1200px) {
  .profile-main-grid {
    gap: 40px;
  }

  .profile-stage__content {
    gap: 32px;
  }
}
</style>

