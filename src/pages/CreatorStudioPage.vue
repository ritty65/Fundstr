<template>
  <q-page class="creator-studio-page bg-surface-1 q-pa-lg">
    <div class="studio-header">
      <div class="studio-header__brand">
        <q-avatar size="40px" class="studio-header__avatar" color="accent" text-color="white">
          <q-icon name="bolt" />
        </q-avatar>
        <div class="studio-header__titles">
          <div class="studio-header__title text-1 text-weight-semibold">Nutzap Creator Studio</div>
          <div class="studio-header__subtitle text-2">Craft your kind 10019 profile &amp; 30019/30000 tiers.</div>
        </div>
      </div>
      <div class="studio-header__status" role="status" aria-live="polite">
        <div class="studio-connection" :class="relayStatusDotClass">
          <span class="studio-connection__dot" aria-hidden="true"></span>
          <span class="studio-connection__label text-caption text-weight-medium">{{ relayStatusLabel }}</span>
        </div>
        <q-chip
          v-for="chip in readinessChips"
          :key="chip.key"
          dense
          size="sm"
          outline
          :class="['studio-readiness', `is-${chip.state}`]"
          :icon="chip.icon"
        >
          {{ chip.label }}
          <q-tooltip v-if="chip.tooltip" class="bg-surface-2 text-1">{{ chip.tooltip }}</q-tooltip>
        </q-chip>
      </div>
    </div>

    <div class="studio-grid">
      <div class="studio-main">
        <q-card flat bordered class="studio-card">
          <div class="studio-card__header">
            <div>
              <div class="text-subtitle1 text-weight-medium text-1">Relay connection</div>
              <div class="text-caption text-2">Connect to relay.fundstr.me with automatic fallback.</div>
            </div>
            <q-btn flat dense icon="science" label="Data explorer" @click="requestExplorerOpen('toolbar')" />
          </div>
          <div class="studio-card__body column q-gutter-md">
            <q-input
              v-model="relayUrlInput"
              label="Relay URL (WS)"
              dense
              filled
              :hint="relayUrlInputState === 'warning' ? relayUrlInputMessage : ''"
              :hide-hint="relayUrlInputState !== 'warning'"
              :error="relayUrlInputState === 'error' || !relayUrlInputValid"
              :error-message="
                relayUrlInputState === 'error'
                  ? relayUrlInputMessage
                  : 'Enter a valid wss:// relay'
              "
            />
            <div class="row items-center justify-between wrap q-gutter-sm">
              <q-toggle v-model="relayAutoReconnect" label="Auto reconnect" />
              <div class="row q-gutter-sm">
                <q-btn
                  outline
                  color="negative"
                  label="Disconnect"
                  icon="link_off"
                  :disable="!relayIsConnected"
                  @click="handleRelayDisconnect"
                />
                <q-btn
                  color="primary"
                  label="Connect"
                  icon="bolt"
                  :loading="relayConnectionStatus === 'connecting'"
                  @click="handleRelayConnect"
                />
              </div>
            </div>
            <div class="studio-activity" v-if="activeRelayActivity">
              <div class="text-caption text-2">Last activity</div>
              <div class="text-body2 text-1">{{ activeRelayActivity?.message }}</div>
              <div class="text-caption text-2" v-if="activeRelayActivityTimeLabel">
                {{ activeRelayActivityTimeLabel }}
              </div>
            </div>
            <div class="studio-alert" v-if="activeRelayAlertLabel">
              <q-icon name="warning" size="16px" />
              <span>{{ activeRelayAlertLabel }}</span>
            </div>
          </div>
        </q-card>

        <q-card flat bordered class="studio-card">
          <div class="studio-card__header">
            <div>
              <div class="text-subtitle1 text-weight-medium text-1">Workspace snapshot</div>
              <div class="text-caption text-2">Share your supporter-facing link and review metadata.</div>
            </div>
            <div class="studio-card__header-actions row items-center q-gutter-sm">
              <q-btn
                outline
                color="primary"
                dense
                icon="send"
                label="Publish profile"
                :disable="publishDisabled"
                :loading="publishingAll"
                @click="publishAll"
              >
                <q-tooltip v-if="publishHasGuidance" class="bg-surface-2 text-1">
                  <div
                    v-if="publishGuidanceHeading"
                    class="text-caption text-weight-medium q-mb-xs"
                  >
                    {{ publishGuidanceHeading }}:
                  </div>
                  <ul class="publish-blockers__tooltip-list">
                    <li v-for="blocker in publishGuidanceItems" :key="blocker">{{ blocker }}</li>
                  </ul>
                </q-tooltip>
              </q-btn>
              <q-btn
                flat
                dense
                icon="content_copy"
                label="Copy link"
                :disable="!publicProfileUrl"
                @click="publicProfileUrl && copy(publicProfileUrl)"
              />
            </div>
          </div>
          <div class="studio-card__body column q-gutter-lg">
            <q-input v-model="authorInput" label="Creator author (npub or hex)" dense filled />
            <div class="snapshot-block">
              <div class="snapshot-label text-caption text-uppercase text-2">Public profile link</div>
              <div class="snapshot-value">{{ publicProfileUrl || 'Author not ready' }}</div>
              <div v-if="lastPublishInfo" class="snapshot-meta text-caption text-2">{{ lastPublishInfo }}</div>
            </div>
            <div class="snapshot-readiness chip-row">
              <q-chip
                v-for="chip in readinessChips"
                :key="chip.key"
                dense
                size="sm"
                outline
                :class="['studio-readiness', `is-${chip.state}`]"
                :icon="chip.icon"
              >
                {{ chip.label }}
                <q-tooltip v-if="chip.tooltip" class="bg-surface-2 text-1">{{ chip.tooltip }}</q-tooltip>
              </q-chip>
            </div>
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <div class="snapshot-block">
                  <div class="snapshot-label text-caption text-uppercase text-2">Display name</div>
                  <div class="snapshot-value">{{ summaryDisplayName }}</div>
                  <div v-if="summaryAuthorKey" class="snapshot-meta text-caption text-2">Signer: {{ summaryAuthorKey }}</div>
                </div>
              </div>
              <div class="col-12 col-md-6">
                <div class="snapshot-block">
                  <div class="snapshot-label text-caption text-uppercase text-2">Tier address</div>
                  <div class="snapshot-value">{{ tierAddressPreview }}</div>
                  <div class="snapshot-meta text-caption text-2">Publishing as {{ tierKindLabel }}</div>
                </div>
              </div>
            </div>
            <div class="snapshot-chips">
              <div>
                <div class="snapshot-label text-caption text-uppercase text-2">Trusted mints</div>
                <div class="chip-row">
                  <q-chip
                    v-for="mint in mintList"
                    :key="mint"
                    dense
                    outline
                    color="primary"
                    text-color="primary"
                  >
                    {{ mint }}
                  </q-chip>
                  <div v-if="!mintList.length" class="snapshot-meta text-caption text-2">No mints configured.</div>
                </div>
              </div>
              <div>
                <div class="snapshot-label text-caption text-uppercase text-2">Preferred relays</div>
                <div class="chip-row">
                  <q-chip v-for="relay in relayList" :key="relay" dense outline>{{ relay }}</q-chip>
                </div>
              </div>
            </div>
          </div>
        </q-card>

        <q-card flat bordered class="studio-card">
          <div class="studio-card__header">
            <div>
              <div class="text-subtitle1 text-weight-medium text-1">Profile identity</div>
              <div class="text-caption text-2">Update display metadata, trusted mints, relays, and P2PK keys.</div>
            </div>
          </div>
          <div class="studio-card__body column q-gutter-lg">
            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <q-input v-model="displayName" label="Display name" dense filled />
              </div>
              <div class="col-12 col-md-6">
                <q-input
                  v-model="pictureUrl"
                  label="Picture URL"
                  dense
                  filled
                  :error="!!pictureUrl && !isValidHttpUrl(pictureUrl)"
                  error-message="Use http(s) URLs"
                />
              </div>
            </div>

            <div class="row q-col-gutter-md">
              <div class="col-12 col-md-6">
                <div class="chip-input">
                  <div class="chip-input__label text-caption text-uppercase text-2">Trusted mints</div>
                  <div class="chip-input__chips">
                    <q-chip
                      v-for="(mint, index) in composerMints"
                      :key="mint"
                      dense
                      outline
                      color="primary"
                      text-color="primary"
                      removable
                      @remove="removeMint(index)"
                    >
                      {{ mint }}
                    </q-chip>
                    <q-input
                      v-model="mintDraft"
                      dense
                      filled
                      placeholder="Add mint & press enter"
                      @keyup.enter.stop="commitMint"
                      @blur="commitMint"
                    />
                  </div>
                  <div class="text-caption text-2">Supports http or https endpoints.</div>
                </div>
              </div>
              <div class="col-12 col-md-6">
                <div class="chip-input">
                  <div class="chip-input__label text-caption text-uppercase text-2">Preferred relays</div>
                  <div class="chip-input__chips">
                    <q-chip
                      v-for="(relay, index) in composerRelays"
                      :key="relay"
                      dense
                      outline
                      removable
                      @remove="removeRelay(index)"
                    >
                      {{ relay }}
                    </q-chip>
                    <q-input
                      v-model="relayDraft"
                      dense
                      filled
                      placeholder="wss://..."
                      @keyup.enter.stop="commitRelay"
                      @blur="commitRelay"
                    />
                  </div>
                  <div class="text-caption text-2">Automatically ensures relay.fundstr.me is included.</div>
                </div>
              </div>
            </div>

            <div class="studio-card__section">
              <div class="text-subtitle2 text-1">Cashu P2PK (required for publishing)</div>
              <div class="text-caption text-2 q-mt-xs">
                Publish your Cashu pointer so supporters can route zaps directly to you.
              </div>
              <div class="row q-col-gutter-md q-mt-sm">
                <div class="col-12 col-md-6">
                  <q-select
                    v-model="selectedP2pkPub"
                    :options="p2pkSelectOptions"
                    label="Saved P2PK keys"
                    dense
                    filled
                    emit-value
                    map-options
                    clearable
                    :disable="!p2pkSelectOptions.length"
                    :hint="
                      p2pkSelectOptions.length
                        ? 'Choose the key you already use for zaps.'
                        : 'Add a key to get started.'
                    "
                    @update:model-value="handleP2pkSelection"
                    placeholder="Select a saved key"
                  />
                </div>
                <div class="col-12 col-md-6 row items-center q-gutter-sm">
                  <q-btn
                    v-if="!addingNewP2pkKey"
                    outline
                    color="primary"
                    icon="add"
                    label="Add new key"
                    @click="startAddingNewP2pkKey"
                  />
                  <q-btn
                    v-else
                    outline
                    color="primary"
                    icon="undo"
                    label="Use saved key"
                    :disable="!p2pkSelectOptions.length"
                    @click="cancelAddingNewP2pkKey"
                  />
                </div>
                <div class="col-12 col-md-6" v-if="addingNewP2pkKey">
                  <q-input
                    v-model="p2pkPriv"
                    label="P2PK private key (hex)"
                    dense
                    filled
                    type="password"
                    autocomplete="off"
                    :error="!!p2pkPriv && !/^[0-9a-fA-F]{64}$/.test(p2pkPriv)"
                    error-message="64 hex characters"
                  />
                </div>
                <div class="col-12 col-md-6 row items-center q-gutter-sm" v-if="addingNewP2pkKey">
                  <q-btn outline color="primary" label="Derive public" @click="deriveP2pkPublicKey" />
                  <q-btn color="primary" label="Generate" @click="generateP2pkKeypair" />
                </div>
                <div class="col-12">
                  <div class="row q-col-gutter-sm items-start">
                    <div class="col">
                      <q-input
                        v-model="p2pkPub"
                        label="Publishing P2PK public"
                        dense
                        filled
                        readonly
                        :error="!!p2pkPubError"
                        :error-message="p2pkPubError"
                      />
                    </div>
                    <div class="col-auto self-start">
                      <q-btn
                        outline
                        color="primary"
                        icon="verified"
                        label="Verify pointer"
                        :loading="verifyingP2pkPointer"
                        :disable="!p2pkPointerReady || verifyingP2pkPointer"
                        @click="handleVerifyP2pkPointer"
                      />
                    </div>
                  </div>
                  <div
                    v-if="p2pkVerificationHelper"
                    class="text-caption q-mt-xs row items-center no-wrap"
                    :class="p2pkVerificationHelperClass"
                  >
                    <q-icon
                      v-if="p2pkVerificationHelperIcon"
                      :name="p2pkVerificationHelperIcon"
                      size="16px"
                      class="q-mr-xs"
                    />
                    <span>{{ p2pkVerificationHelper.message }}</span>
                  </div>
                </div>
              </div>
            </div>

            <q-banner
              dense
              rounded
              class="studio-signer-hint bg-surface-2 text-1"
            >
              <template #avatar>
                <q-icon name="vpn_key" color="primary" />
              </template>
              <div class="studio-signer-hint__content">
                <span>{{ signerStatusMessage }}</span>
                <span
                  v-if="usingStoreIdentity && activeIdentitySummary"
                  class="studio-signer-hint__summary text-caption text-2"
                >
                  Connected as {{ activeIdentitySummary }}
                </span>
              </div>
              <template v-if="!usingStoreIdentity" #action>
                <q-btn
                  flat
                  dense
                  color="primary"
                  label="Connect signer"
                  @click="openSharedSignerModal"
                />
              </template>
            </q-banner>
          </div>
        </q-card>

        <q-card flat bordered class="studio-card">
          <div class="studio-card__header">
            <div>
              <div class="text-subtitle1 text-weight-medium text-1">Tiers &amp; strategy</div>
              <div class="text-caption text-2">Compose your supporter offerings and publishing kind.</div>
            </div>
          </div>
          <div class="studio-card__body column q-gutter-lg">
            <div class="row items-center justify-between wrap q-gutter-sm">
              <q-btn-toggle
                v-model="tierKind"
                dense
                toggle-color="primary"
                :options="tierKindOptions"
              />
              <q-chip dense :color="tiersReady ? 'positive' : 'warning'" text-color="white">
                {{ tiersReady ? 'Tiers valid' : 'Needs review' }}
              </q-chip>
            </div>
            <TierComposer
              :tiers="tiers"
              :frequency-options="tierFrequencyOptions"
              :show-errors="showTierValidation"
              @update:tiers="handleTiersUpdate"
              @validation-changed="handleTierValidation"
            />
          </div>
        </q-card>

        <q-card flat bordered class="studio-card">
          <div class="studio-card__header">
            <div>
              <div class="text-subtitle1 text-weight-medium text-1">Publish workflow</div>
              <div class="text-caption text-2">Push profile and tiers to relay.fundstr.me.</div>
            </div>
          </div>
          <div class="studio-card__body column q-gutter-md">
            <div class="text-body2 text-2">
              Ready when signer, mints, P2PK, and tiers are configured. Relay diagnostics appear if publish fails.
            </div>
            <div class="row q-gutter-sm wrap items-start">
              <div class="column items-start q-gutter-xs">
                <q-btn
                  class="publish-button"
                  color="primary"
                  unelevated
                  :disable="publishDisabled"
                  :loading="publishingAll"
                  label="Publish profile &amp; tiers"
                  icon="send"
                  @click="publishAll"
                >
                  <q-tooltip v-if="publishHasGuidance" class="bg-surface-2 text-1">
                    <div
                      v-if="publishGuidanceHeading"
                      class="text-caption text-weight-medium q-mb-xs"
                    >
                      {{ publishGuidanceHeading }}:
                    </div>
                    <ul class="publish-blockers__tooltip-list">
                      <li v-for="blocker in publishGuidanceItems" :key="blocker">{{ blocker }}</li>
                    </ul>
                  </q-tooltip>
                </q-btn>
                <div v-if="publishHasGuidance" class="publish-blockers text-caption text-2">
                  <q-icon name="info" size="16px" class="q-mr-xs" />
                  <div>
                    <span class="text-weight-medium" v-if="publishGuidanceHeading">
                      {{ publishGuidanceHeading }}:
                    </span>
                    <ul class="publish-blockers__list">
                      <li v-for="blocker in publishGuidanceItems" :key="blocker">{{ blocker }}</li>
                    </ul>
                  </div>
                </div>
              </div>
              <q-btn flat color="primary" label="Copy public link" :disable="!publicProfileUrl" @click="publicProfileUrl && copy(publicProfileUrl)" />
              <q-btn flat color="primary" label="Open data explorer" @click="requestExplorerOpen('banner')" />
            </div>
            <q-banner v-if="activeDiagnostics" class="studio-banner" :class="`is-${activeDiagnostics?.level}`">
              <div class="studio-banner__title">{{ activeDiagnostics?.title }}</div>
              <div class="studio-banner__detail">{{ activeDiagnostics?.detail }}</div>
              <div class="row q-gutter-sm q-mt-sm">
                <q-btn flat dense color="primary" label="Inspect" @click="handleDiagnosticsAlertCta" />
                <q-btn flat dense color="primary" label="Dismiss" @click="dismissDiagnosticsAttention" />
              </div>
            </q-banner>
          </div>
        </q-card>
      </div>

      <aside class="studio-sidebar">
        <q-card flat bordered class="studio-preview">
          <div class="studio-preview__header">
            <div>
              <div class="text-subtitle1 text-weight-medium text-1">Preview &amp; payload</div>
              <div class="text-caption text-2">Live preview updates as you edit.</div>
            </div>
            <q-btn color="primary" dense icon="download" label="Download bundle" @click="downloadBundle" />
          </div>
          <q-tabs v-model="previewTab" dense class="studio-preview__tabs" indicator-color="primary" active-color="primary">
            <q-tab name="preview" label="Preview" />
            <q-tab name="profile">
              <template #default>
                <span>10019 JSON</span>
                <span v-if="profileModified" class="modified-dot" aria-hidden="true"></span>
              </template>
            </q-tab>
            <q-tab name="tiers">
              <template #default>
                <span>{{ tierKindLabel }} JSON</span>
                <span v-if="tiersModified" class="modified-dot" aria-hidden="true"></span>
              </template>
            </q-tab>
          </q-tabs>
          <q-tab-panels v-model="previewTab" animated class="studio-preview__panels">
            <q-tab-panel name="preview">
              <div class="preview-card">
                <div class="preview-card__header">
                  <div class="preview-avatar">
                    <q-avatar size="56px" color="accent" text-color="white">
                      {{ displayName ? displayName.charAt(0) : 'N' }}
                    </q-avatar>
                  </div>
                  <div>
                    <div class="text-body1 text-weight-medium text-1">{{ displayName || 'Creator name' }}</div>
                    <div class="text-caption text-2">{{ authorInput || 'npub…' }}</div>
                  </div>
                </div>
                <div class="preview-card__chips">
                  <q-chip dense outline>mints: {{ Array.isArray(mintList) ? mintList.length : 0 }}</q-chip>
                  <q-chip dense outline>relays: {{ Array.isArray(relayList) ? relayList.length : 0 }}</q-chip>
                  <q-chip dense outline>tiers: {{ Array.isArray(tiers) ? tiers.length : 0 }}</q-chip>
                </div>
              </div>
              <q-banner class="preview-banner" dense>
                Publish pushes both events to relay.fundstr.me. Copy JSON if your publisher requires manual input.
              </q-banner>
            </q-tab-panel>
            <q-tab-panel name="profile">
              <q-input :model-value="profileJsonPreview" type="textarea" rows="16" readonly filled />
              <q-btn
                class="q-mt-sm"
                outline
                color="primary"
                label="Copy 10019 JSON"
                icon="content_copy"
                @click="copy(profileJsonPreview)"
              />
            </q-tab-panel>
            <q-tab-panel name="tiers">
              <q-input :model-value="tiersJsonPreview" type="textarea" rows="16" readonly filled />
              <q-btn
                class="q-mt-sm"
                outline
                color="primary"
                :label="`Copy ${tierKindLabel} JSON`"
                icon="content_copy"
                @click="copy(tiersJsonPreview)"
              />
            </q-tab-panel>
          </q-tab-panels>
        </q-card>
      </aside>
    </div>

    <q-dialog
      v-model="dataExplorerDialogOpen"
      :position="explorerDialogPosition"
      :maximized="$q.screen.lt.md"
      :transition-show="explorerDialogTransitions.show"
      :transition-hide="explorerDialogTransitions.hide"
    >
      <q-card :class="['studio-explorer', $q.screen.lt.md ? 'is-mobile' : '']" class="bg-surface-2 text-1">
        <div class="studio-explorer__header">
          <div class="text-subtitle1 text-weight-medium">Data explorer</div>
          <q-btn flat dense round icon="close" v-close-popup aria-label="Close data explorer" />
        </div>
        <div class="studio-explorer__body">
          <NutzapExplorerPanel />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useEventBus, useLocalStorage, useNow } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { getPublicKey as getSecpPublicKey, utils as secpUtils } from '@noble/secp256k1';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import TierComposer from './nutzap-profile/TierComposer.vue';
import NutzapExplorerPanel from 'src/nutzap/onepage/NutzapExplorerPanel.vue';
import { notifyError, notifySuccess, notifyWarning } from 'src/js/notify';
import type { Tier } from 'src/nutzap/types';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';
import { nip19 } from 'nostr-tools';
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
import { useWalletStore } from 'src/stores/wallet';
import { useMintsStore } from 'src/stores/mints';
import { maybeRepublishNutzapProfile } from 'src/stores/creatorHub';
import { useNostrStore } from 'src/stores/nostr';
import { useUiStore } from 'src/stores/ui';
import { useP2pkDiagnostics } from 'src/composables/useP2pkDiagnostics';

type TierKind = 30019 | 30000;

const P2PK_VERIFICATION_STALE_MS = 1000 * 60 * 60 * 24 * 7;

const authorInput = ref('');
const displayName = ref('');
const pictureUrl = ref('');
const p2pkPub = ref('');
const p2pkPriv = ref('');
const p2pkDerivedPub = ref('');
const selectedP2pkPub = ref('');
const p2pkPubError = ref('');
const addingNewP2pkKey = ref(false);
const hasManuallyToggledP2pk = ref(false);
const verifyingP2pkPointer = ref(false);
let previousSelectedP2pkPub = '';
const cachedMintsText = useLocalStorage<string>('nutzap.profile.mintsDraft', '');
const mintsText = ref(cachedMintsText.value || '');
const relaysText = ref(FUNDSTR_WS_URL);
const tiers = ref<Tier[]>([]);
const handleTiersUpdate = (value: Tier[] | unknown) => {
  tiers.value = Array.isArray(value) ? value : [];
};
const tierKind = ref<TierKind>(30019);
const loading = ref(false);
const publishingAll = ref(false);
const lastPublishInfo = ref('');
const hasAutoLoaded = ref(false);
const previewTab = ref<'preview' | 'profile' | 'tiers'>('preview');
const mintDraft = ref('');
const relayDraft = ref('');
const now = useNow({ interval: 60_000 });
const lastExportProfile = ref('');
const lastExportTiers = ref('');

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
const walletStore = useWalletStore();
const { verifyPointer } = useP2pkDiagnostics();
const { firstKey, p2pkKeys } = storeToRefs(p2pkStore);

const p2pkSelectOptions = computed(() => {
  const entries = Array.isArray(p2pkKeys.value) ? p2pkKeys.value : [];
  return entries.map(entry => {
    const trimmed = entry && typeof entry.publicKey === 'string' ? entry.publicKey.trim() : '';
    const label =
      trimmed.length <= 16 ? trimmed : `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
    return {
      label,
      value: trimmed,
    };
  });
});

watch(
  () => (Array.isArray(p2pkKeys.value) ? p2pkKeys.value.length : 0),
  length => {
    if (length === 0) {
      addingNewP2pkKey.value = true;
      return;
    }

    if (!hasManuallyToggledP2pk.value) {
      addingNewP2pkKey.value = false;
    }
  },
  { immediate: true }
);

const mintsStore = useMintsStore();
const { activeMintUrl: storeActiveMintUrl, mints: storedMints } = storeToRefs(mintsStore);
const activeMintUrlTrimmed = computed(() => {
  const value = storeActiveMintUrl.value;
  return typeof value === 'string' ? value.trim() : '';
});

const nostrStore = useNostrStore();
const { npub: storeNpub } = storeToRefs(nostrStore);
const uiStore = useUiStore();

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

const route = useRoute();
const router = useRouter();
const { copy } = useClipboard();

function isValidHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

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

type ReadinessChipState = 'ready' | 'todo' | 'optional' | 'warning';
type ReadinessChipKey = 'relay' | 'authorKey' | 'identity' | 'mint' | 'p2pk' | 'tiers';

type ReadinessChip = {
  key: ReadinessChipKey;
  label: string;
  state: ReadinessChipState;
  icon: string;
  required: boolean;
  tooltip?: string;
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
const activeDiagnostics = computed(() => diagnosticsAttention.value);
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
  const title =
    source === 'relay'
      ? 'Relay connection issue detected'
      : level === 'warning'
        ? 'Publish fallback notice'
        : 'Publish attempt rejected';
  diagnosticsAttention.value = {
    id: ++diagnosticsAttentionSequence,
    source,
    title,
    detail,
    level,
  };
}

function maybeFlagHttpFallbackTimeout(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';
  if (!message) {
    return;
  }
  if (message.toLowerCase().includes('http fallback timed out')) {
    const detail = `${message}. Confirm ${FUNDSTR_REQ_URL} is reachable or adjust VITE_NUTZAP_PRIMARY_RELAY_HTTP.`;
    flagDiagnosticsAttention('relay', detail, 'warning');
  }
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
  relayUrlInputState,
  relayUrlInputMessage,
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
  logRelayActivity,
} = relayTelemetry;

const activeRelayActivity = computed(() => latestRelayActivity.value);
const activeRelayActivityTimeLabel = computed(() => {
  const timestamp = activeRelayActivity.value?.timestamp;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return '';
  }
  return formatActivityTime(timestamp);
});
const activeRelayAlertLabel = computed(() => latestRelayAlertLabel.value);

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

function setDerivedP2pk(pubHex: string) {
  const normalized = pubHex.trim().toLowerCase();
  p2pkDerivedPub.value = normalized;
  p2pkPub.value = normalized;
}

async function handleVerifyP2pkPointer() {
  if (verifyingP2pkPointer.value) {
    return;
  }
  const trimmed = p2pkPub.value.trim();
  if (!trimmed) {
    p2pkPubError.value = 'Add a P2PK public key before verifying.';
    notifyWarning('Add a P2PK public key before verifying.');
    return;
  }

  verifyingP2pkPointer.value = true;
  try {
    const result = await verifyPointer(trimmed);
    setDerivedP2pk(result.normalizedPubkey);
    p2pkPubError.value = '';
    p2pkStore.recordVerification(result.normalizedPubkey, {
      timestamp: result.timestamp,
      mint: result.mintUrl,
    });
    notifySuccess('Pointer verified with active mint.', result.mintUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p2pkPubError.value = message;
    notifyWarning('Pointer verification failed', message);
  } finally {
    verifyingP2pkPointer.value = false;
  }
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
    walletStore.setActiveP2pk(normalizedPub, normalizedPriv);
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

  walletStore.setActiveP2pk(normalizedPub, normalizedPriv);

  if (!signer.value) {
    notifyWarning(
      'Stored new P2PK key. Connect your Nostr signer and publish to update your Nutzap profile.',
    );
    return;
  }

  void maybeRepublishNutzapProfile()
    .then(() => {
      notifySuccess('Republished Nutzap profile with the active P2PK key.');
    })
    .catch(err => {
      console.error('Auto republish failed after storing composer key', err);
      notifyWarning(
        'Stored new P2PK key, but auto republish failed. Use the publish workflow to push updates.',
      );
    });
}

function ensureComposerKeyPersisted(pubHex: string, privHex: string) {
  if (!pubHex.trim() || !privHex.trim()) {
    return;
  }

  persistComposerKeyToStore(pubHex, privHex);
}

function applyValidatedP2pk(pubHex: string, privHex = '', persist = false): boolean {
  const trimmedPub = pubHex.trim();
  if (!trimmedPub) {
    p2pkPubError.value = '';
    setDerivedP2pk('');
    return false;
  }

  if (!p2pkStore.isValidPubkey(trimmedPub)) {
    p2pkPubError.value = 'Enter a valid Cashu P2PK public key.';
    setDerivedP2pk(trimmedPub);
    return false;
  }

  p2pkPubError.value = '';
  setDerivedP2pk(trimmedPub);

  const normalizedPriv = privHex.trim();
  walletStore.setActiveP2pk(trimmedPub, normalizedPriv);
  if (persist && normalizedPriv) {
    ensureComposerKeyPersisted(trimmedPub, normalizedPriv);
  }

  return true;
}

function handleP2pkSelection(value: string | null) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  selectedP2pkPub.value = trimmed;

  if (!trimmed) {
    p2pkPriv.value = '';
    p2pkPubError.value = '';
    previousSelectedP2pkPub = '';
    setDerivedP2pk('');
    return;
  }

  const entries = Array.isArray(p2pkKeys.value) ? p2pkKeys.value : [];
  const match = entries.find(entry =>
    entry && typeof entry.publicKey === 'string'
      ? entry.publicKey.trim().toLowerCase() === trimmed.toLowerCase()
      : false
  );

  if (match) {
    const priv = match.privateKey ? match.privateKey.trim().toLowerCase() : '';
    p2pkPriv.value = priv;
    if (applyValidatedP2pk(match.publicKey, priv, true)) {
      addingNewP2pkKey.value = false;
      hasManuallyToggledP2pk.value = false;
      previousSelectedP2pkPub = '';
    }
    return;
  }

  p2pkPriv.value = '';
  applyValidatedP2pk(trimmed);
}

function startAddingNewP2pkKey() {
  hasManuallyToggledP2pk.value = true;
  previousSelectedP2pkPub = selectedP2pkPub.value;
  addingNewP2pkKey.value = true;
  selectedP2pkPub.value = '';
  p2pkPriv.value = '';
  p2pkPubError.value = '';
  setDerivedP2pk('');
}

function cancelAddingNewP2pkKey() {
  hasManuallyToggledP2pk.value = false;
  addingNewP2pkKey.value = false;
  const restore = previousSelectedP2pkPub.trim();
  previousSelectedP2pkPub = '';
  if (restore) {
    handleP2pkSelection(restore);
  } else {
    maybeSeedComposerKeysFromStore();
  }
}

function maybeSeedComposerKeysFromStore() {
  const key = firstKey.value;
  if (!key) {
    return;
  }

  if (addingNewP2pkKey.value) {
    return;
  }

  const needsPriv = !p2pkPriv.value.trim();
  const needsPub = !p2pkPub.value.trim();

  if (!needsPriv && !needsPub) {
    return;
  }

  if (needsPriv && key.privateKey) {
    p2pkPriv.value = key.privateKey.trim().toLowerCase();
  }
  if (needsPub && key.publicKey) {
    handleP2pkSelection(key.publicKey);
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
    const normalizedPriv = trimmed.toLowerCase();
    p2pkPriv.value = normalizedPriv;
    if (applyValidatedP2pk(pubHex, normalizedPriv, true)) {
      selectedP2pkPub.value = pubHex;
      addingNewP2pkKey.value = false;
      hasManuallyToggledP2pk.value = false;
      previousSelectedP2pkPub = '';
      notifySuccess('Derived P2PK public key.');
    }
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
  const normalizedPriv = privHex.toLowerCase();
  const normalizedPub = pubHex.toLowerCase();
  p2pkPriv.value = normalizedPriv;
  if (applyValidatedP2pk(normalizedPub, normalizedPriv, true)) {
    selectedP2pkPub.value = normalizedPub;
    addingNewP2pkKey.value = false;
    hasManuallyToggledP2pk.value = false;
    previousSelectedP2pkPub = '';
    notifySuccess('Generated new P2PK keypair.');
  }
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
  [p2pkPub, p2pkPriv],
  ([pub, priv]) => {
    const trimmedPub = typeof pub === 'string' ? pub.trim() : '';
    const trimmedPriv = typeof priv === 'string' ? priv.trim() : '';
    if (!trimmedPub) {
      walletStore.setActiveP2pk('', '');
      return;
    }
    if (!p2pkStore.isValidPubkey(trimmedPub)) {
      return;
    }
    walletStore.setActiveP2pk(trimmedPub, trimmedPriv);
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
  fundstrOnlySigner: true,
});

const activeIdentitySummary = computed(() => connectedIdentitySummary.value);

const signerStatusMessage = computed(() => {
  if (usingStoreIdentity.value) {
    return 'Shared Fundstr signer connected for this workspace.';
  }
  return 'No shared signer is active. Use “Connect signer” to open the shared signer modal.';
});

function openSharedSignerModal() {
  uiStore.showMissingSignerModal = true;
  void ensureSharedSignerInitialized();
}

const routeAuthorQuery = computed(() => {
  const queryValue = route.query?.npub;
  return typeof queryValue === 'string' ? queryValue.trim() : '';
});

const storeAuthorNpub = computed(() => {
  const value = storeNpub.value;
  return typeof value === 'string' ? value.trim() : '';
});

const signerPubkeyTrimmed = computed(() => {
  const value = pubkey.value;
  return typeof value === 'string' ? value.trim() : '';
});

const hasAuthorIdentity = computed(
  () =>
    !!authorInput.value.trim() ||
    !!routeAuthorQuery.value ||
    !!storeAuthorNpub.value ||
    !!signerPubkeyTrimmed.value,
);

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

const advancedEncryptionComplete = computed(
  () => p2pkPub.value.trim().length > 0 && !p2pkPubError.value
);

const hasP2pkPointer = computed(() => p2pkPub.value.trim().length > 0);
const p2pkPointerReady = computed(() => hasP2pkPointer.value && !p2pkPubError.value);

const p2pkVerificationRecord = computed(() => {
  if (!p2pkPointerReady.value) {
    return null;
  }
  const trimmed = p2pkPub.value.trim();
  return p2pkStore.getVerificationRecord(trimmed);
});

const p2pkLastVerifiedLabel = computed(() => {
  const record = p2pkVerificationRecord.value;
  if (!record) {
    return '';
  }
  const formatted = new Date(record.timestamp).toLocaleString();
  if (record.mint) {
    return `Last verified ${formatted} — ${record.mint}`;
  }
  return `Last verified ${formatted}`;
});

const p2pkVerificationNeedsRefresh = computed(() => {
  if (!p2pkPointerReady.value) {
    return false;
  }
  const record = p2pkVerificationRecord.value;
  if (!record) {
    return true;
  }
  const nowMs = now.value.getTime();
  const age = nowMs - record.timestamp;
  const isStaleByAge = age > P2PK_VERIFICATION_STALE_MS;
  const recordMint = record.mint?.trim().toLowerCase();
  const activeMint = activeMintUrlTrimmed.value.toLowerCase();
  const mintMatchesActive = recordMint ? recordMint === activeMint : true;
  const mintMatchesList = recordMint
    ? mintList.value.some(mint => mint.toLowerCase() === recordMint)
    : true;
  const mintMismatch = recordMint ? !(mintMatchesActive || mintMatchesList) : false;
  return isStaleByAge || mintMismatch;
});

const p2pkVerificationHelper = computed(() => {
  if (!p2pkPointerReady.value) {
    return null;
  }
  const record = p2pkVerificationRecord.value;
  if (!record) {
    return {
      message: 'Verify the pointer with your active mint to confirm acceptance.',
      tone: 'warning' as const,
    };
  }
  const label = p2pkLastVerifiedLabel.value;
  if (p2pkVerificationNeedsRefresh.value) {
    return {
      message: `${label}. Re-verify to keep this pointer fresh.`,
      tone: 'warning' as const,
    };
  }
  return {
    message: label,
    tone: 'positive' as const,
  };
});

const p2pkVerificationHelperClass = computed(() => {
  const helper = p2pkVerificationHelper.value;
  if (!helper) {
    return 'text-2';
  }
  if (helper.tone === 'warning') {
    return 'text-warning';
  }
  if (helper.tone === 'positive') {
    return 'text-positive';
  }
  return 'text-2';
});

const p2pkVerificationHelperIcon = computed(() => {
  if (!p2pkPointerReady.value) {
    return '';
  }
  if (!p2pkVerificationRecord.value) {
    return 'help_outline';
  }
  return p2pkVerificationNeedsRefresh.value ? 'warning' : 'check_circle';
});

const relayList = computed(() => {
  const entries = relaysText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  const set = new Set(entries);
  set.add(FUNDSTR_WS_URL);
  return Array.from(set);
});

const composerMints = computed<string[]>({
  get: () =>
    mintsText.value
      .split('\n')
      .map(entry => entry.trim())
      .filter(Boolean),
  set: entries => {
    mintsText.value = entries.map(entry => entry.trim()).filter(Boolean).join('\n');
  },
});

const composerRelays = computed<string[]>({
  get: () =>
    relaysText.value
      .split('\n')
      .map(entry => entry.trim())
      .filter(Boolean),
  set: entries => {
    relaysText.value = entries.map(entry => entry.trim()).filter(Boolean).join('\n');
  },
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

const publishBlockers = computed<string[]>(() => {
  if (publishingAll.value) {
    return [];
  }

  const blockers: string[] = [];

  if (!signer.value) {
    blockers.push('Connect a signer');
  }

  if (!hasAuthorIdentity.value) {
    blockers.push('Provide a creator author (npub or hex)');
  }

  if (!p2pkPub.value.trim()) {
    blockers.push('Add a P2PK key');
  }

  if (p2pkPubError.value) {
    blockers.push('Resolve P2PK key error');
  }

  if (p2pkPointerReady.value && p2pkVerificationNeedsRefresh.value) {
    blockers.push(p2pkVerificationRecord.value ? 'Re-verify Cashu pointer' : 'Verify Cashu pointer');
  }

  if (mintList.value.length === 0) {
    blockers.push('Configure at least one trusted mint');
  }

  if (tiers.value.length === 0) {
    blockers.push('Create at least one tier');
  }

  if (tiersHaveErrors.value) {
    blockers.push('Resolve tier validation issues');
  }

  return blockers;
});

const publishDisabled = computed(
  () => publishingAll.value || publishBlockers.value.length > 0
);

const publishWarnings = computed<string[]>(() => {
  if (publishingAll.value) {
    return [];
  }

  const warnings: string[] = [];

  if (relayNeedsAttention.value) {
    warnings.push('Restore relay connection health');
  }

  return warnings;
});

const publishGuidanceHeading = computed(() => {
  if (publishBlockers.value.length > 0) {
    return 'Complete before publishing';
  }
  if (publishWarnings.value.length > 0) {
    return 'Review before publishing';
  }
  return '';
});

const publishGuidanceItems = computed(() => [
  ...publishBlockers.value,
  ...publishWarnings.value,
]);

const publishHasGuidance = computed(() => publishGuidanceItems.value.length > 0);

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

const authorKeyReady = computed(() => authorInput.value.trim().length > 0);

type ReadinessEntry = {
  key: ReadinessChipKey;
  ready: boolean;
  required: boolean;
  readyLabel: string;
  actionLabel: string;
  readyIcon: string;
  actionIcon: string;
  readyTooltip?: string;
  actionTooltip?: string;
  readyState?: ReadinessChipState;
  actionState?: Exclude<ReadinessChipState, 'ready'>;
};

const readinessChips = computed<ReadinessChip[]>(() => {
  const entries: ReadinessEntry[] = [
    {
      key: 'relay',
      ready: !relayNeedsAttention.value,
      required: true,
      readyLabel: 'Relay healthy',
      actionLabel: 'Relay degraded',
      readyIcon: 'podcasts',
      actionIcon: 'report_problem',
      readyTooltip: 'Realtime relay connection is healthy.',
      actionTooltip: 'Realtime relay degraded. Publishing will rely on HTTP fallback until it recovers.',
      actionState: 'warning',
    },
    {
      key: 'authorKey',
      ready: authorKeyReady.value,
      required: true,
      readyLabel: 'Signer ready',
      actionLabel: 'Link signer',
      readyIcon: 'task_alt',
      actionIcon: 'vpn_key_off',
    },
    {
      key: 'identity',
      ready: identityBasicsComplete.value,
      required: false,
      readyLabel: 'Identity noted',
      actionLabel: 'Identity optional',
      readyIcon: 'badge',
      actionIcon: 'tips_and_updates',
    },
    {
      key: 'mint',
      ready: optionalMetadataComplete.value,
      required: true,
      readyLabel: 'Mint configured',
      actionLabel: 'Add mint',
      readyIcon: 'payments',
      actionIcon: 'add_card',
    },
    {
      key: 'p2pk',
      ready: advancedEncryptionComplete.value,
      required: true,
      readyLabel: 'P2PK ready',
      actionLabel: 'Add P2PK pointer',
      readyIcon: 'key',
      actionIcon: 'key_off',
    },
    {
      key: 'tiers',
      ready: tiersReady.value,
      required: true,
      readyLabel: 'Tiers validated',
      actionLabel: 'Review tiers',
      readyIcon: 'task_alt',
      actionIcon: 'playlist_add',
    },
  ];

  return entries.map(entry =>
    entry.ready
      ? {
          key: entry.key,
          label: entry.readyLabel,
          state: entry.readyState ?? ('ready' as ReadinessChipState),
          icon: entry.readyIcon,
          required: entry.required,
          tooltip: entry.readyTooltip,
        }
      : {
          key: entry.key,
          label: entry.actionLabel,
          state:
            entry.actionState ?? (entry.required ? ('todo' as ReadinessChipState) : ('optional' as ReadinessChipState)),
          icon: entry.actionIcon,
          required: entry.required,
          tooltip: entry.actionTooltip,
        }
  );
});

const profileJsonPreview = computed(() => {
  let author = '<author>';
  try {
    author = normalizeAuthor(authorInput.value);
  } catch {
    // placeholder remains
  }

  const payload: Record<string, unknown> = {
    v: 1,
    mints: mintList.value,
    relays: relayList.value,
    tierAddr: `${tierKind.value}:${author}:tiers`,
  };

  const trimmed = p2pkPub.value.trim();
  if (trimmed) {
    payload.p2pk = trimmed;
  }

  return JSON.stringify(payload, null, 2);
});

const tiersJsonPreview = computed(() => JSON.stringify(buildTiersJsonPayload(tiers.value), null, 2));
const profileModified = computed(() => profileJsonPreview.value !== lastExportProfile.value);
const tiersModified = computed(() => tiersJsonPreview.value !== lastExportTiers.value);

function ensureComposerMintsSeeded() {
  if (!mintsText.value.trim() && mintList.value.length) {
    mintsText.value = mintList.value.join('\n');
  }
}

function commitMint() {
  const candidate = mintDraft.value.trim();
  if (!candidate) {
    mintDraft.value = '';
    return;
  }
  if (!isValidHttpUrl(candidate)) {
    notifyWarning('Mint URLs must begin with http:// or https://', candidate);
    return;
  }
  const existing = composerMints.value;
  const exists = existing.some(entry => entry.toLowerCase() === candidate.toLowerCase());
  if (!exists) {
    composerMints.value = [...existing, candidate];
  }
  mintDraft.value = '';
}

function removeMint(index: number) {
  ensureComposerMintsSeeded();
  const current = [...composerMints.value];
  if (index < 0 || index >= current.length) {
    return;
  }
  current.splice(index, 1);
  composerMints.value = current;
}

function commitRelay() {
  const candidate = relayDraft.value.trim();
  if (!candidate) {
    relayDraft.value = '';
    return;
  }
  const { sanitized, dropped } = buildRelayList([...composerRelays.value, candidate]);
  if (dropped.includes(candidate)) {
    notifyWarning('Discarded invalid relay URL', candidate);
    relayDraft.value = '';
    composerRelays.value = sanitized;
    return;
  }
  composerRelays.value = sanitized;
  relayDraft.value = '';
}

function removeRelay(index: number) {
  const current = [...composerRelays.value];
  if (index < 0 || index >= current.length) {
    return;
  }
  current.splice(index, 1);
  const { sanitized } = buildRelayList(current);
  composerRelays.value = sanitized;
}

function downloadBundle() {
  lastExportProfile.value = profileJsonPreview.value;
  lastExportTiers.value = tiersJsonPreview.value;
  const bundle = `// profile-10019.json\n${profileJsonPreview.value}\n\n// tiers-${tierKind.value}.json\n${tiersJsonPreview.value}\n`;
  const blob = new Blob([bundle], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'nutzap-export.txt';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notifySuccess('Exported Nutzap profile bundle.');
}

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
    selectedP2pkPub.value = '';
    p2pkPubError.value = '';
    previousSelectedP2pkPub = '';
    mintsText.value = '';
    relaysText.value = FUNDSTR_WS_URL;
    seedMintsFromStoreIfEmpty();
    return;
  }

  if (typeof latest.pubkey === 'string' && latest.pubkey) {
    const normalized = latest.pubkey.toLowerCase();
    const encoded = safeEncodeNpub(normalized);
    authorInput.value = encoded || normalized;
  }

  try {
    const parsed = latest.content ? JSON.parse(latest.content) : {};
    if (typeof parsed.p2pk === 'string') {
      const candidate = parsed.p2pk.trim();
      const entries = Array.isArray(p2pkKeys.value) ? p2pkKeys.value : [];
      const match = entries.find(entry =>
        entry && typeof entry.publicKey === 'string'
          ? entry.publicKey.trim().toLowerCase() === candidate.toLowerCase()
          : false
      );
      if (match) {
        handleP2pkSelection(match.publicKey);
      } else {
        selectedP2pkPub.value = '';
        p2pkPriv.value = '';
        applyValidatedP2pk(candidate);
      }
    } else {
      handleP2pkSelection(null);
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
      selectedP2pkPub.value = '';
      p2pkPriv.value = '';
      applyValidatedP2pk(pkTag[1]);
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
    maybeFlagHttpFallbackTimeout(err);
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
    maybeFlagHttpFallbackTimeout(err);
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

const SOCKET_UNAVAILABLE_PATTERNS = [
  'websocket unsupported',
  'relay socket unavailable',
  'relay connection closed',
  'relay disconnected',
  'timed out waiting for relay socket',
  'timed out waiting for relay ack',
  'failed to send event',
  'failed to open relay socket',
  'relay ack timeout',
  'relay disconnected before ack',
];

function matchesSocketUnavailable(message?: string | null) {
  if (!message) {
    return false;
  }
  const normalized = message.toLowerCase();
  return SOCKET_UNAVAILABLE_PATTERNS.some(pattern => normalized.includes(pattern));
}

function shouldUseHttpFallback(error: unknown): boolean {
  if (error instanceof RelayPublishError) {
    if (matchesSocketUnavailable(error.ack?.message)) {
      return true;
    }
    return matchesSocketUnavailable(error.message);
  }
  if (error instanceof Error) {
    if (matchesSocketUnavailable(error.message)) {
      return true;
    }
    const causeMessage =
      typeof (error as any)?.cause?.message === 'string' ? (error as any).cause.message : undefined;
    if (matchesSocketUnavailable(causeMessage)) {
      return true;
    }
  }
  if (typeof error === 'string') {
    return matchesSocketUnavailable(error);
  }
  return false;
}

function describeFallbackReason(error: unknown): string {
  if (error instanceof RelayPublishError) {
    return error.ack?.message || error.message || 'Relay publish failed';
  }
  if (error instanceof Error) {
    return error.message || 'Relay publish failed';
  }
  return typeof error === 'string' ? error : 'Relay publish failed';
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
  if (p2pkPubError.value) {
    notifyError('Resolve the P2PK key error before publishing.');
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
    const fallbackNotices: string[] = [];

    const tierOutcome = await (async () => {
      try {
        const result = await publishTiersToRelay(tiers.value, tierKind.value, {
          send: publishEventToRelay,
        });
        return { result, usedFallback: false as const };
      } catch (err) {
        if (!shouldUseHttpFallback(err)) {
          throw err;
        }
        const fallbackResult = await publishTiersToRelay(tiers.value, tierKind.value);
        const reason = describeFallbackReason(err);
        fallbackNotices.push(
          `Tiers publish used HTTP fallback${reason ? ` — ${reason}` : ''}.`
        );
        return { result: fallbackResult, usedFallback: true as const };
      }
    })();

    const tierResult = tierOutcome.result;
    const tierEventId = tierResult.ack?.id ?? tierResult.event?.id;
    const tierRelayMessage =
      typeof tierResult.ack?.message === 'string' && tierResult.ack.message
        ? ` — ${tierResult.ack.message}`
        : '';
    const tierFallbackNote =
      tierOutcome.usedFallback || tierResult.ack?.via === 'http' ? ' via HTTP fallback' : '';
    tierSummary = tierEventId
      ? `Tiers published${tierFallbackNote} (kind ${tierKind.value}) — id ${tierEventId}${tierRelayMessage}`
      : `Tiers published${tierFallbackNote} (kind ${tierKind.value})${tierRelayMessage}`;

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

    const profileTemplate = { kind: 10019, tags, content };

    const profileOutcome = await (async () => {
      try {
        const result = await publishNostrEvent(profileTemplate, { send: publishEventToRelay });
        return { result, usedFallback: false as const };
      } catch (err) {
        if (!shouldUseHttpFallback(err)) {
          throw err;
        }
        const fallbackClient = await ensureRelayClientInitialized();
        const fallbackResult = await fallbackClient.publish(profileTemplate);
        const reason = describeFallbackReason(err);
        fallbackNotices.push(
          `Profile publish used HTTP fallback${reason ? ` — ${reason}` : ''}.`
        );
        return { result: fallbackResult, usedFallback: true as const };
      }
    })();

    const profileResult = profileOutcome.result;
    const signerPubkey = profileResult.event?.pubkey || tierResult.event?.pubkey;
    const reloadKey = typeof signerPubkey === 'string' && signerPubkey ? signerPubkey : authorHex;
    if (typeof signerPubkey === 'string' && signerPubkey) {
      const normalizedSigner = signerPubkey.toLowerCase();
      const encodedSigner = safeEncodeNpub(normalizedSigner);
      let currentHex = '';
      try {
        currentHex = normalizeAuthor(authorInput.value);
      } catch {
        currentHex = '';
      }
      if (currentHex !== normalizedSigner || (encodedSigner && authorInput.value !== encodedSigner)) {
        authorInput.value = encodedSigner || normalizedSigner;
      }
    }

    const profileEventId = profileResult.ack?.id ?? profileResult.event?.id;
    const profileRelayMessage =
      typeof profileResult.ack?.message === 'string' && profileResult.ack.message
        ? ` — ${profileResult.ack.message}`
        : '';
    const profileFallbackNote =
      profileOutcome.usedFallback || profileResult.ack?.via === 'http' ? ' via HTTP fallback' : '';
    const profileSummary = profileEventId
      ? `Profile published${profileFallbackNote} — id ${profileEventId}${profileRelayMessage}`
      : `Profile published${profileFallbackNote} to relay.fundstr.me.${profileRelayMessage}`;

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

    if (fallbackNotices.length) {
      const detail = fallbackNotices.join(' ');
      logRelayActivity('warning', 'Publish used HTTP fallback', detail);
      flagDiagnosticsAttention('publish', detail, 'warning');
    }

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
  if (!authorInput.value.trim()) {
    if (routeAuthorQuery.value) {
      authorInput.value = routeAuthorQuery.value;
    } else if (storeAuthorNpub.value) {
      authorInput.value = storeAuthorNpub.value;
    } else {
      const normalizedSigner = typeof pubkey.value === 'string' ? pubkey.value.trim().toLowerCase() : '';
      if (normalizedSigner) {
        const encoded = safeEncodeNpub(normalizedSigner);
        authorInput.value = encoded || normalizedSigner;
      }
    }
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
.creator-studio-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.studio-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

.studio-header__brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.studio-header__avatar {
  border-radius: 12px;
}

.studio-header__titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.studio-header__status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.studio-connection {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid var(--surface-contrast-border);
}

.studio-connection__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background-color: currentColor;
}

.studio-readiness {
  --q-chip-padding: 2px 10px;
  font-weight: 600;
}

.studio-readiness.is-ready {
  background: var(--accent-500);
  color: var(--text-inverse);
  border-color: var(--accent-500);
}

.studio-readiness.is-todo {
  background: color-mix(in srgb, var(--accent-200) 35%, transparent);
  color: var(--accent-600);
  border-color: color-mix(in srgb, var(--accent-200) 55%, transparent);
}

.studio-readiness.is-warning {
  background: color-mix(in srgb, #f59e0b 25%, transparent);
  color: #b45309;
  border-color: color-mix(in srgb, #f59e0b 45%, transparent);
}

.studio-readiness.is-optional {
  background: color-mix(in srgb, var(--surface-2) 90%, transparent);
  color: var(--text-2);
  border-color: var(--surface-contrast-border);
}

.studio-grid {
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1fr);
}

@media (min-width: 1024px) {
  .studio-grid {
    grid-template-columns: minmax(0, 2fr) minmax(320px, 1fr);
    align-items: flex-start;
  }
}

.studio-main {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.studio-card {
  background: var(--surface-2);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.studio-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.studio-card__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.studio-card__section {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 16px;
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
}

.chip-input {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chip-input__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.snapshot-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.snapshot-label {
  letter-spacing: 0.08em;
}

.snapshot-value {
  font-weight: 600;
  color: var(--text-1);
  word-break: break-word;
}

.snapshot-meta {
  color: var(--text-2);
}

.snapshot-chips {
  display: grid;
  gap: 16px;
}

.snapshot-readiness {
  border-top: 1px solid var(--surface-contrast-border);
  padding-top: 12px;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.studio-activity,
.studio-alert {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 12px;
  background: color-mix(in srgb, var(--surface-2) 90%, transparent);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.studio-alert {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  color: var(--accent-600);
}

.studio-sidebar {
  position: relative;
}

.studio-preview {
  background: var(--surface-2);
  border-radius: 16px;
  padding: 20px;
  position: sticky;
  top: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.studio-preview__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.studio-preview__tabs {
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-2) 85%, transparent);
}

.studio-preview__panels {
  background: transparent;
}

.preview-card {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
}

.preview-card__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preview-card__chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.preview-banner {
  background: color-mix(in srgb, var(--accent-200) 25%, transparent);
  color: var(--accent-600);
  border-radius: 12px;
}

.studio-banner {
  border-radius: 12px;
  padding: 16px;
  background: color-mix(in srgb, var(--surface-2) 90%, transparent);
}

.studio-banner.is-error {
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #f87171;
}

.studio-banner.is-warning {
  border: 1px solid rgba(234, 179, 8, 0.4);
  color: #facc15;
}

.studio-banner__title {
  font-weight: 600;
}

.publish-button.q-btn--disabled {
  opacity: 1;
  background: var(--accent-500);
  color: white;
}

.publish-button.q-btn--disabled .q-icon,
.publish-button.q-btn--disabled .q-btn__content {
  color: inherit;
}

.publish-blockers {
  display: flex;
  gap: 8px;
  max-width: 320px;
}

.publish-blockers__list,
.publish-blockers__tooltip-list {
  margin: 4px 0 0;
  padding-left: 18px;
}

.publish-blockers__tooltip-list {
  margin: 0;
}

.studio-explorer {
  width: 420px;
  max-width: 100%;
}

.studio-explorer.is-mobile {
  width: 100%;
}

.studio-explorer__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--surface-contrast-border);
}

.studio-explorer__body {
  padding: 16px;
}

.modified-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  margin-left: 6px;
  background: #fca5a5;
  box-shadow: 0 0 0 6px rgba(252, 165, 165, 0.15);
}

.studio-signer-hint {
  margin-top: 8px;
}

.studio-signer-hint__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.studio-signer-hint__summary {
  display: inline-block;
}
</style>
