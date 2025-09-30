<template>
  <q-page class="nutzap-profile-page bg-surface-1 q-pa-xl">
    <div class="nutzap-profile-container">
      <q-card class="profile-card bg-surface-2 shadow-4 full-width">
        <div class="profile-card-header">
          <div class="status-banner text-1">
            <div class="status-summary">
              <span class="status-dot" :class="relayStatusDotClass" aria-hidden="true"></span>
              <span class="status-label text-caption text-weight-medium">{{ relayStatusLabel }}</span>
            </div>
            <div class="status-meta text-body2 text-2">
              Isolated relay: relay.fundstr.me (WS → HTTP fallback)
            </div>
          </div>
          <div class="profile-tabs-header">
            <q-tabs
              v-model="activeProfileStep"
              dense
              no-caps
              class="profile-tabs"
              active-color="primary"
              indicator-color="primary"
            >
              <q-tab
                v-for="tab in profileTabs"
                :key="tab.name"
                :name="tab.name"
                :label="tab.label"
                class="profile-tab"
              >
                <template #default>
                  <div class="profile-tab__content">
                    <div class="profile-tab__title-row">
                      <span class="profile-tab__label text-weight-medium">{{ tab.label }}</span>
                      <q-chip
                        v-if="tab.readiness"
                        dense
                        size="sm"
                        :icon="tab.readiness.icon"
                        :class="['profile-tab__chip', `is-${tab.readiness.state}`]"
                      >
                        {{ tab.readiness.label }}
                      </q-chip>
                    </div>
                    <div class="profile-tab__caption text-caption text-2">
                      {{ tab.caption }}
                    </div>
                  </div>
                </template>
              </q-tab>
            </q-tabs>
            <div class="profile-readiness-chips" role="status" aria-live="polite">
              <q-chip
                v-for="chip in readinessChips"
                :key="chip.key"
                dense
                size="sm"
                :icon="chip.icon"
                :class="['profile-readiness-chip', `is-${chip.state}`]"
              >
                {{ chip.label }}
              </q-chip>
            </div>
          </div>
        </div>
        <q-banner
          v-if="showContextHelpBanner"
          dense
          rounded
          inline-actions
          class="context-help-banner bg-surface-1 text-1"
        >
          <div class="context-help-banner__content">
            <div class="context-help-banner__header">
              <div class="text-subtitle1 text-weight-medium">Workspace help</div>
              <q-btn
                flat
                dense
                round
                icon="close"
                class="context-help-banner__dismiss"
                aria-label="Hide workspace help"
                @click="dismissHelpBanner"
              />
            </div>
            <div class="context-help-banner__body text-body2 text-2">
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
          </div>
          <template #action>
            <q-btn
              v-if="diagnosticsAttention"
              color="primary"
              flat
              class="context-help-banner__cta"
              label="Open data explorer"
              @click="handleDiagnosticsAlertCta"
            />
            <q-btn
              v-else
              color="primary"
              flat
              class="context-help-banner__cta"
              icon="science"
              label="Open data explorer"
              @click="openDataExplorer"
            />
          </template>
        </q-banner>
        <div class="profile-card-body">
          <div class="profile-content-toolbar">
            <q-btn
              outline
              dense
              :icon="dataExplorerToggleIcon"
              class="data-explorer-toggle"
              :label="dataExplorerToggleLabel"
              @click="toggleDataExplorer"
            />
          </div>
          <q-tab-panels v-model="activeProfileStep" animated class="profile-panels">
            <q-tab-panel name="connect" class="profile-panel">
              <div class="panel-sections">
                <ConnectionPanel
                  :status-label="relayStatusLabel"
                  :status-color="relayStatusColor"
                  :status-dot-class="relayStatusDotClass"
                  :latest-activity="latestRelayActivity"
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
                  </div>
                  <div v-if="!usingStoreIdentity" class="row items-center q-gutter-sm">
                    <q-btn
                      color="primary"
                      outline
                      label="Manage dedicated key"
                      @click="advancedKeyManagementOpen = true"
                    />
                  </div>
                  <div v-else class="text-caption text-2">
                    Dedicated key tools become available when no Fundstr signer is connected.
                  </div>
                  <q-dialog v-if="!usingStoreIdentity" v-model="advancedKeyManagementOpen" position="right">
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
                        </div>
                        <div class="column q-gutter-sm">
                          <q-input
                            v-model="keyImportValue"
                            label="Secret key (nsec or 64-char hex)"
                            dense
                            filled
                            autocomplete="off"
                          />
                          <div class="row q-gutter-sm">
                            <q-btn
                              color="primary"
                              label="Generate"
                              @click="generateNewSecret"
                            />
                            <q-btn
                              color="primary"
                              outline
                              label="Import"
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
                      </q-card-section>
                    </q-card>
                  </q-dialog>
                </div>
                </section>
              </div>
            </q-tab-panel>

            <q-tab-panel name="author" class="profile-panel">
              <div class="panel-sections">
              <AuthorMetadataPanel
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

              <section class="section-card">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Publish profile</div>
                  <div class="section-subtitle text-body2 text-2">
                    Confirm details and push the latest payment profile to relay.fundstr.me.
                  </div>
                </div>
                <div class="section-body column q-gutter-md">
                  <div class="publish-readiness-note text-body2 text-2">
                    Workflow tabs now surface signer, metadata, and tier readiness. Follow the highlighted chips above to
                    resolve outstanding requirements before publishing.
                  </div>
                  <div class="text-body2 text-2">
                    Publishing updates with tier address <span class="text-weight-medium text-1">{{ tierAddressPreview }}</span>.
                  </div>
                  <div class="text-body2 text-2">
                    Publishing happens from the Review &amp; Publish section once tiers and signer are ready.
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

              <TierComposerCard
                :tiers="tiers"
                :frequency-options="tierFrequencyOptions"
                :show-errors="showTierValidation"
                :tiers-ready="tiersReady"
                @update:tiers="value => (tiers.value = value)"
                @validation-changed="handleTierValidation"
              />

              <ReviewPublishCard
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
            </q-tab-panel>

            <q-tab-panel name="explore" class="profile-panel">
              <div class="panel-sections">
                <section class="section-card explore-summary-card" data-testid="explore-summary">
                <div class="section-header">
                  <div class="section-title text-subtitle1 text-weight-medium text-1">Review workspace</div>
                  <div class="section-subtitle text-body2 text-2">
                    High-level overview of the active author alongside tier readiness details.
                  </div>
                </div>
                <div class="section-body explore-summary-body">
                  <div class="explore-summary-grid">
                    <div class="explore-summary-overview column q-gutter-lg">
                      <div class="summary-block" data-testid="explore-summary-identity">
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
                      <div
                        v-if="publicProfileUrl"
                        class="summary-block"
                        data-testid="explore-summary-share"
                      >
                        <div class="summary-label text-caption text-2">Public profile link</div>
                        <q-input
                          :model-value="publicProfileUrl"
                          dense
                          filled
                          readonly
                          data-testid="public-profile-url"
                        >
                          <template #append>
                            <q-btn
                              flat
                              color="primary"
                              label="Copy link"
                              data-testid="copy-public-profile-url"
                              @click="copy(publicProfileUrl)"
                            />
                          </template>
                        </q-input>
                      </div>
                      <div class="summary-block" data-testid="explore-summary-mints">
                        <div class="summary-label text-caption text-2">Trusted mints</div>
                        <div v-if="mintList.length" class="summary-chips" data-testid="explore-mint-list">
                          <q-chip
                            v-for="mint in mintList"
                            :key="mint"
                            dense
                            outline
                            class="summary-chip"
                            data-testid="explore-mint-chip"
                          >
                            {{ mint }}
                          </q-chip>
                        </div>
                        <div v-else class="summary-empty text-caption text-2">No mints configured.</div>
                      </div>
                      <div class="summary-block" data-testid="explore-summary-relays">
                        <div class="summary-label text-caption text-2">Preferred relays</div>
                        <div class="summary-chips" data-testid="explore-relay-list">
                          <q-chip
                            v-for="relay in relayList"
                            :key="relay"
                            dense
                            outline
                            class="summary-chip"
                            data-testid="explore-relay-chip"
                          >
                            {{ relay }}
                          </q-chip>
                        </div>
                      </div>
                    </div>
                    <div class="explore-tier-overview" data-testid="explore-tier-overview">
                      <div class="summary-label text-caption text-2">Tier lineup</div>
                      <ol
                        v-if="tierSummaryList.length"
                        class="explore-tier-list"
                        data-testid="explore-tier-list"
                        role="list"
                      >
                        <li
                          v-for="(tier, index) in tierSummaryList"
                          :key="tier.id || index"
                          class="explore-tier-item"
                          data-testid="explore-tier-item"
                        >
                          <div class="tier-rank text-caption text-2">#{{ index + 1 }}</div>
                          <div class="tier-details">
                            <div class="tier-title text-body1 text-weight-medium text-1">{{ tier.title }}</div>
                            <div class="tier-meta text-caption text-2">
                              <span class="tier-price text-weight-medium text-1">{{ tier.priceLabel }}</span>
                              <q-chip dense size="sm" outline class="tier-frequency-chip">
                                {{ tier.frequencyLabel }}
                              </q-chip>
                            </div>
                            <div v-if="tier.description" class="tier-description text-caption text-2">
                              {{ tier.description }}
                            </div>
                          </div>
                        </li>
                      </ol>
                      <div v-else class="summary-empty text-caption text-2">
                        No tiers loaded yet — fetch data from an author to review.
                      </div>
                    </div>
                  </div>
                </div>
              </section>
              <section class="section-card explore-tools-card" data-testid="explore-inline-tools">
                <template v-if="isExplorerFloating">
                  <q-expansion-item
                    v-model="dataExplorerOpen"
                    switch-toggle-side
                    dense
                    expand-separator
                    icon="travel_explore"
                    class="explore-inline-expansion"
                  >
                    <template #header>
                      <div class="inline-explorer-header">
                        <div class="text-body1 text-weight-medium text-1">Explorer tools</div>
                        <div class="text-caption text-2">
                          Inspect stored events without leaving the summary.
                        </div>
                      </div>
                    </template>
                    <div class="inline-explorer-body">
                      <NutzapExplorerPanel
                        v-model="authorInput"
                        :loading-author="loading"
                        :tier-address-preview="tierAddressPreview"
                        :condensed="true"
                        @load-author="loadAll"
                      />
                    </div>
                  </q-expansion-item>
                </template>
                <template v-else>
                  <div class="explore-tools-desktop text-body2 text-2">
                    The data explorer is available from the side drawer. Use the toggle above to keep it beside this
                    summary.
                  </div>
                </template>
                </section>
              </div>
            </q-tab-panel>
          </q-tab-panels>
        </div>
      </q-card>
      <transition name="explorer-fade">
        <aside
          v-if="dataExplorerOpen && !isExplorerFloating"
          class="data-explorer-sidebar bg-surface-2 text-1"
          :class="{ 'is-floating': isExplorerFloating }"
        >
          <div class="data-explorer-header">
            <div class="text-subtitle1 text-weight-medium">Data explorer</div>
            <q-btn
              flat
              dense
              round
              icon="close"
              aria-label="Close data explorer"
              @click="closeDataExplorer"
            />
          </div>
          <div class="data-explorer-body">
            <NutzapExplorerPanel
              v-model="authorInput"
              :loading-author="loading"
              :tier-address-preview="tierAddressPreview"
              :condensed="true"
              @load-author="loadAll"
            />
          </div>
        </aside>
      </transition>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
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
import { useNutzapRelayTelemetry } from 'src/nutzap/useNutzapRelayTelemetry';
import { useNutzapSignerWorkspace } from 'src/nutzap/useNutzapSignerWorkspace';

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
const publishingAll = ref(false);
const lastPublishInfo = ref('');
const hasAutoLoaded = ref(false);

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

type ProfileStep = 'connect' | 'author' | 'tiers' | 'explore';

type ReadinessChipState = 'ready' | 'todo' | 'optional';
type ReadinessChipKey = 'authorKey' | 'identity' | 'mint' | 'p2pk' | 'tiers';

type ReadinessChip = {
  key: ReadinessChipKey;
  label: string;
  state: ReadinessChipState;
  icon: string;
  required: boolean;
};

type ProfileTabReadiness = {
  label: string;
  state: ReadinessChipState;
  icon: string;
};

type ProfileTab = {
  name: ProfileStep;
  label: string;
  caption: string;
  readiness: ProfileTabReadiness | null;
};

const activeProfileStep = ref<ProfileStep>('connect');

type DiagnosticsAttention = {
  id: number;
  source: 'relay' | 'publish';
  title: string;
  detail: string;
  level: 'error' | 'warning';
};

const $q = useQuasar();

const isExplorerFloating = computed(() => $q.screen.lt.lg);
const dataExplorerOpen = ref(!$q.screen.lt.lg);
const dataExplorerToggleLabel = computed(() =>
  dataExplorerOpen.value ? 'Hide data explorer' : 'Open data explorer'
);
const dataExplorerToggleIcon = computed(() =>
  dataExplorerOpen.value ? 'close_fullscreen' : 'travel_explore'
);

const diagnosticsAttention = ref<DiagnosticsAttention | null>(null);
let diagnosticsAttentionSequence = 0;
const helpBannerDismissed = ref(false);
const showContextHelpBanner = computed(
  () => !helpBannerDismissed.value || !!diagnosticsAttention.value
);
function toggleDataExplorer() {
  dataExplorerOpen.value = !dataExplorerOpen.value;
}

function closeDataExplorer() {
  dataExplorerOpen.value = false;
}

function openDataExplorer() {
  dataExplorerOpen.value = true;
}

function handleDiagnosticsAlertCta() {
  openDataExplorer();
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
  relayActivityTimeline,
  formatActivityTime,
  activityLevelColor,
  applyRelayUrlInput,
} = useNutzapRelayTelemetry({
  onRelayAlert: entry => {
    const detail = entry.context ? `${entry.message} — ${entry.context}` : entry.message;
    flagDiagnosticsAttention('relay', detail);
  },
});

watch(
  () => $q.screen.lt.lg,
  value => {
    dataExplorerOpen.value = value ? false : true;
  }
);

watch(activeProfileStep, step => {
  if (step === 'explore' && !dataExplorerOpen.value) {
    dataExplorerOpen.value = true;
  }
});

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

const identityBasicsComplete = computed(
  () => displayName.value.trim().length > 0 || pictureUrl.value.trim().length > 0
);

const optionalMetadataComplete = computed(() => mintList.value.length > 0);

const advancedEncryptionComplete = computed(() => p2pkPub.value.trim().length > 0);

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
    !signer.value
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

const authorKeyReady = computed(() => authorInput.value.trim().length > 0);

const readinessChips = computed<ReadinessChip[]>(() => {
  const entries = [
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
  ] as const;

  return entries.map(entry =>
    entry.ready
      ? {
          key: entry.key,
          label: entry.readyLabel,
          state: 'ready' as ReadinessChipState,
          icon: entry.readyIcon,
          required: entry.required,
        }
      : {
          key: entry.key,
          label: entry.actionLabel,
          state: entry.required ? ('todo' as ReadinessChipState) : ('optional' as ReadinessChipState),
          icon: entry.actionIcon,
          required: entry.required,
        }
  );
});

const profileTabs = computed<ProfileTab[]>(() => {
  const readinessMap = new Map<ReadinessChipKey, ReadinessChip>();
  for (const chip of readinessChips.value) {
    readinessMap.set(chip.key, chip);
  }

  const aggregate = (keys: ReadonlyArray<ReadinessChipKey>): ProfileTabReadiness | null => {
    if (!keys.length) {
      return null;
    }

    const entries = keys
      .map(key => readinessMap.get(key))
      .filter((entry): entry is ReadinessChip => !!entry);

    if (!entries.length) {
      return null;
    }

    const missingRequired = entries.filter(entry => entry.required && entry.state !== 'ready');
    if (missingRequired.length) {
      const first = missingRequired[0];
      return {
        label: first.label,
        state: first.state,
        icon: first.icon,
      };
    }

    const pendingOptional = entries.filter(entry => !entry.required && entry.state !== 'ready');
    if (pendingOptional.length) {
      const firstOptional = pendingOptional[0];
      return {
        label: firstOptional.label,
        state: firstOptional.state,
        icon: firstOptional.icon,
      };
    }

    return {
      label: 'Ready',
      state: 'ready',
      icon: 'task_alt',
    };
  };

  return [
    {
      name: 'connect',
      label: 'Connect',
      caption: 'Establish relay access and signer status.',
      readiness: aggregate(['authorKey'] as const),
    },
    {
      name: 'author',
      label: 'Author',
      caption: 'Shape profile metadata before publishing.',
      readiness: aggregate(['identity', 'mint', 'p2pk'] as const),
    },
    {
      name: 'tiers',
      label: 'Tiers',
      caption: 'Compose benefits and cadence options.',
      readiness: aggregate(['tiers'] as const),
    },
    {
      name: 'explore',
      label: 'Review',
      caption: 'Inspect stored events and author data.',
      readiness: null,
    },
  ];
});

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
    refreshSubscriptions(true);
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
    } else {
      const fallback = err instanceof Error ? err.message : 'Unable to publish Nutzap profile.';
      lastPublishInfo.value = tierSummary ? `${tierSummary} ${fallback}` : fallback;
      notifyError(fallback);
      flagDiagnosticsAttention('publish', fallback);
    }
  } finally {
    publishingAll.value = false;
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
  gap: 16px;
}

.profile-card-body {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.status-banner {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px 18px;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-2) 94%, transparent);
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

.profile-tabs-header {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.profile-tabs {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 4px;
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
}

.profile-tabs :deep(.q-tabs__content) {
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-start;
}

.profile-tabs :deep(.q-tabs__indicator) {
  display: none;
}

.profile-tab {
  flex: 1 1 220px;
  border-radius: 10px;
  padding: 4px;
  border: 1px solid transparent;
  transition: border-color 150ms ease, background-color 150ms ease;
}

.profile-tab:hover {
  border-color: var(--accent-200);
}

.profile-tab.q-tab--active {
  border-color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-500) 16%, transparent);
}

.profile-tab :deep(.q-focus-helper) {
  border-radius: 10px;
}

.profile-tab :deep(.q-tab__content) {
  align-items: flex-start;
  justify-content: flex-start;
  gap: 4px;
  text-align: left;
}

.profile-tab__content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.profile-tab__title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-tab__label {
  font-size: 0.95rem;
  color: var(--tab-inactive);
}

.profile-tab.q-tab--active .profile-tab__label {
  color: var(--tab-active);
}

.profile-tab__caption {
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--text-2);
}

.profile-tab.q-tab--active .profile-tab__caption {
  color: var(--text-1);
}

.profile-tab__chip,
.profile-readiness-chip {
  --q-chip-padding: 2px 10px;
  font-size: 0.75rem;
  border-radius: 999px;
  background-color: var(--chip-bg);
  color: var(--chip-text);
  border: 1px solid var(--surface-contrast-border);
  font-weight: 600;
  gap: 4px;
}

.profile-tab__chip :deep(.q-chip__icon),
.profile-readiness-chip :deep(.q-chip__icon) {
  font-size: 16px;
}

.profile-tab__chip.is-ready,
.profile-readiness-chip.is-ready {
  background-color: var(--accent-500);
  color: var(--text-inverse);
  border-color: var(--accent-500);
}

.profile-tab__chip.is-todo,
.profile-readiness-chip.is-todo {
  background-color: color-mix(in srgb, var(--accent-200) 35%, transparent);
  color: var(--accent-600);
  border-color: color-mix(in srgb, var(--accent-200) 55%, transparent);
}

.profile-tab__chip.is-optional,
.profile-readiness-chip.is-optional {
  background-color: color-mix(in srgb, var(--surface-2) 85%, transparent);
  color: var(--text-2);
  border-color: var(--surface-contrast-border);
}

.profile-readiness-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.publish-readiness-note {
  line-height: 1.5;
}

@media (min-width: 1100px) {
  .profile-tabs-header {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .profile-readiness-chips {
    justify-content: flex-end;
  }
}

.profile-content-toolbar {
  display: flex;
  justify-content: flex-end;
}

.data-explorer-toggle {
  align-self: flex-end;
}

.data-explorer-sidebar {
  flex-shrink: 0;
  width: 360px;
  max-width: 100%;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 16px;
  padding: 16px 18px 20px;
  box-shadow: 0 16px 40px rgba(10, 14, 35, 0.18);
  position: sticky;
  top: 32px;
  max-height: calc(100vh - 64px);
  overflow-y: auto;
}

.data-explorer-sidebar.is-floating {
  position: fixed;
  top: 32px;
  right: 32px;
  bottom: 32px;
  left: auto;
  max-height: calc(100vh - 64px);
  width: min(380px, 90vw);
  z-index: 11;
  box-shadow: 0 28px 48px rgba(12, 18, 36, 0.35);
}

.data-explorer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.data-explorer-body {
  overflow-y: auto;
  max-height: calc(100% - 64px);
}

.explore-summary-card .section-body {
  gap: 0;
}

.explore-summary-grid {
  display: grid;
  gap: 24px;
}

@media (min-width: 1024px) {
  .explore-summary-grid {
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  }
}

.explore-summary-overview {
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
}

.summary-meta {
  line-height: 1.4;
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
  padding: 8px 0;
}

.explore-tier-overview {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.explore-tier-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
}

.explore-tier-item {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-2) 96%, transparent);
}

.tier-rank {
  width: 32px;
  flex-shrink: 0;
  text-align: center;
  line-height: 1.4;
  color: var(--text-2);
}

.tier-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tier-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tier-frequency-chip {
  border-color: var(--surface-contrast-border);
  color: var(--text-2);
}

.tier-description {
  line-height: 1.4;
}

.explore-tools-card {
  gap: 12px;
}

.inline-explorer-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inline-explorer-body {
  margin-top: 12px;
}

.explore-inline-expansion .q-item {
  padding: 0;
}

.explore-inline-expansion .q-item__section {
  padding: 0;
}

.explore-tools-desktop {
  line-height: 1.5;
}

.explorer-fade-enter-active,
.explorer-fade-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.explorer-fade-enter-from,
.explorer-fade-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.context-help-banner {
  border: 1px solid var(--surface-contrast-border);
  gap: 12px;
}

.context-help-banner__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.context-help-banner__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.context-help-banner__body {
  line-height: 1.5;
}

.context-help-banner__cta {
  margin-left: 8px;
}

.context-help-alert {
  border-radius: 12px;
  padding: 12px 16px;
  border: 1px solid var(--surface-contrast-border);
  background: color-mix(in srgb, var(--surface-2) 94%, transparent);
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

.author-profile-card .section-body {
  gap: 0;
}

.nested-sections {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nested-section {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
  overflow: hidden;
}

.nested-section.is-disabled {
  opacity: 0.6;
}

.nested-section .q-item {
  padding: 12px 16px;
  min-height: auto;
}

.nested-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.nested-header__titles {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nested-subtitle {
  color: var(--text-2);
}

.nested-section-body {
  padding: 12px 16px 16px;
}

.nested-section .q-expansion-item__content {
  padding: 0;
}

.section-header--with-status {
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.section-header--with-status .section-header-primary {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.review-expansion {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
}

.review-expansion.is-disabled {
  opacity: 0.6;
}

.review-lock-message {
  margin-top: 12px;
}

.section-empty {
  padding: 12px 0;
  border: 1px dashed var(--surface-contrast-border);
  border-radius: 12px;
  text-align: center;
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
  .nutzap-profile-container {
    flex-direction: column;
  }

  .data-explorer-sidebar {
    position: static;
    top: auto;
    max-height: none;
    width: 100%;
  }
}

@media (max-width: 768px) {
  .profile-card {
    padding: 18px;
  }

  .status-banner {
    padding: 14px 16px;
  }

  .profile-tab {
    flex: 1 1 160px;
  }

  .section-card {
    padding: 16px 18px;
  }

  .data-explorer-sidebar.is-floating {
    top: 16px;
    right: 16px;
    left: 16px;
    bottom: 16px;
    width: auto;
  }
}
</style>
