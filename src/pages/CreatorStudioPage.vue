<template>
  <q-page class="creator-studio-page bg-surface-1 q-pa-lg">
    <header class="studio-header">
      <h1 class="studio-header__title text-1 text-weight-semibold">Nutzap Creator Studio</h1>
    </header>

    <div class="studio-layout">
      <nav class="studio-navigation" aria-label="Creator studio progress">
        <ol class="studio-stepper" role="list">
          <li v-for="step in steps" :key="step.name" class="studio-stepper__item">
            <button
              class="studio-stepper__button"
              type="button"
              :class="[
                { 'is-active': activeStep === step.name, 'is-complete': step.status === 'ready' },
                `is-${step.status}`
              ]"
              @click="goToStep(step.name)"
              :aria-current="activeStep === step.name ? 'step' : undefined"
              :aria-describedby="`step-${step.name}-description step-${step.name}-status`"
              :aria-label="`${step.label} – ${step.statusLabel}`"
            >
              <span class="studio-stepper__indicator" aria-hidden="true">
                {{ step.indicator }}
              </span>
              <span class="studio-stepper__copy">
                <span class="studio-stepper__label text-body1 text-weight-medium text-1">
                  {{ step.label }}
                </span>
                <span class="studio-stepper__status text-caption text-2" :id="`step-${step.name}-status`">
                  {{ step.statusLabel }}
                </span>
              </span>
            </button>
            <p class="studio-stepper__description text-caption text-2" :id="`step-${step.name}-description`">
              {{ step.description }}
            </p>
          </li>
        </ol>
      </nav>

      <main
        class="studio-stage"
        role="region"
        aria-live="polite"
        aria-labelledby="active-step-title"
      >
        <div class="studio-stage__header">
          <q-btn
            class="studio-stage__nav"
            flat
            dense
            icon="arrow_back"
            label="Back"
            :disable="!canGoBack || loading"
            @click="goToPreviousStep"
          />
          <div class="studio-stage__details">
            <div class="studio-stage__meta text-caption text-2">
              Step {{ currentStepNumber }} of {{ steps.length }}
            </div>
            <div
              class="studio-stage__title text-h6 text-weight-semibold text-1"
              id="active-step-title"
            >
              {{ currentStep.label }}
            </div>
            <div class="studio-stage__subtitle text-caption text-2">
              {{ currentStep.description }}
            </div>
          </div>
          <q-btn
            class="studio-stage__nav"
            flat
            dense
            icon-right="arrow_forward"
            label="Next"
            :disable="!canGoNext || loading"
            @click="goToNextStep"
          />
        </div>

        <div class="studio-stage__body" style="position: relative">
          <q-inner-loading :showing="loading" color="primary" />
          <template v-if="activeStep === 'setup'">
            <SetupStep
              v-model:relay-url-input="relayUrlInput"
              v-model:relay-auto-reconnect="relayAutoReconnect"
              v-model:author-input="authorInput"
              :relay-url-input-state="relayUrlInputState"
              :relay-url-input-message="relayUrlInputMessage"
              :relay-url-input-valid="relayUrlInputValid"
              :relay-connection-status="relayConnectionStatus"
              :relay-is-connected="relayIsConnected"
              :relay-needs-attention="relayNeedsAttention"
              :active-relay-activity="activeRelayActivity"
              :active-relay-activity-time-label="activeRelayActivityTimeLabel"
              :active-relay-alert-label="activeRelayAlertLabel"
              :signer-status-message="signerStatusMessage"
              :using-store-identity="usingStoreIdentity"
              :active-identity-summary="activeIdentitySummary"
              :author-key-ready="authorKeyReady"
              :author-input-locked="authorInputLocked"
              :author-input-lock-hint="authorInputLockHint"
              :setup-ready="setupStepReady"
              :handle-relay-connect="handleRelayConnect"
              :handle-relay-disconnect="handleRelayDisconnect"
              :request-explorer-open="requestExplorerOpen"
              :open-shared-signer-modal="openSharedSignerModal"
            />
          </template>
          <template v-else-if="activeStep === 'profile'">
            <ProfileStep
              v-model:display-name="displayName"
              v-model:picture-url="pictureUrl"
              v-model:composer-mints="composerMints"
              v-model:composer-relays="composerRelays"
              v-model:p2pk-priv="p2pkPriv"
              :p2pk-pub="p2pkPub"
              :p2pk-pub-error="p2pkPubError"
              :p2pk-select-options="p2pkSelectOptions"
              :selected-p2pk-pub="selectedP2pkPub"
              :adding-new-p2pk-key="addingNewP2pkKey"
              :p2pk-pointer-ready="p2pkPointerReady"
              :verifying-p2pk-pointer="verifyingP2pkPointer"
              :p2pk-verification-helper="p2pkVerificationHelper"
              :p2pk-verification-needs-refresh="p2pkVerificationNeedsRefresh"
              :optional-metadata-complete="optionalMetadataComplete"
              :advanced-encryption-complete="advancedEncryptionComplete"
              :signer-status-message="signerStatusMessage"
              :using-store-identity="usingStoreIdentity"
              :active-identity-summary="activeIdentitySummary"
              :primary-relay-url="CREATOR_STUDIO_RELAY_WS_URL"
              :handle-p2pk-selection="handleP2pkSelection"
              :start-adding-new-p2pk-key="startAddingNewP2pkKey"
              :cancel-adding-new-p2pk-key="cancelAddingNewP2pkKey"
              :derive-p2pk-public-key="deriveP2pkPublicKey"
              :generate-p2pk-keypair="generateP2pkKeypair"
              :handle-verify-p2pk-pointer="handleVerifyP2pkPointer"
              :open-shared-signer-modal="openSharedSignerModal"
            />
          </template>
          <template v-else-if="activeStep === 'tiers'">
            <StepTemplate
              class="studio-tier-step"
              title="Tiers &amp; strategy"
              subtitle="Compose your supporter offerings and preview tier formats."
            >
              <template #toolbar>
                <q-btn-toggle
                  v-model="tierPreviewKind"
                  dense
                  toggle-color="primary"
                  :disable="loading"
                  :options="tierPreviewOptions"
                />
                <q-chip dense :color="tiersReady ? 'positive' : 'warning'" text-color="white">
                  {{ tiersReady ? 'Tiers valid' : 'Needs review' }}
                </q-chip>
              </template>

              <q-banner
                v-if="tierStepGuidance"
                class="studio-tier-step__guidance"
                dense
              >
                <q-icon name="info" size="16px" class="q-mr-sm" />
                <div>{{ tierStepGuidance }}</div>
              </q-banner>

              <div class="studio-tier-step__composer">
                <TierComposer
                  :tiers="tiers"
                  :frequency-options="tierFrequencyOptions"
                  :show-errors="showTierValidation"
                  :disabled="loading"
                  @update:tiers="handleTiersUpdate"
                  @validation-changed="handleTierValidation"
                />
              </div>
            </StepTemplate>
          </template>
          <template v-else>
            <StepTemplate
              class="studio-publish-step"
              title="Review &amp; publish"
              subtitle="Review readiness and publish to relay.fundstr.me."
            >
              <template #toolbar>
                <q-btn
                  flat
                  dense
                  icon="travel_explore"
                  label="Open data explorer"
                  @click="requestExplorerOpen('banner')"
                />
              </template>

              <div class="publish-step__form">
                <q-input
                  v-model="authorInput"
                  label="Creator author (npub or hex)"
                  dense
                  filled
                  :readonly="authorInputLocked"
                  :disable="authorInputLocked"
                  :hide-hint="!authorInputLocked"
                >
                  <template v-if="authorInputLocked" #hint>
                    {{ authorInputLockHint }}
                  </template>
                </q-input>
              </div>

              <section
                class="publish-share-panel"
                role="region"
                aria-labelledby="publish-share-heading"
              >
                <div class="publish-share-panel__icon" aria-hidden="true">
                  <q-icon name="campaign" size="28px" />
                </div>
                <div class="publish-share-panel__content">
                  <div
                    id="publish-share-heading"
                    class="publish-share-panel__title text-subtitle1 text-weight-medium text-1"
                  >
                    Share your creator page
                  </div>
                  <p
                    id="publish-share-helper"
                    class="publish-share-panel__message text-body2 text-2"
                  >
                    {{ shareHelperMessage }}
                  </p>
                  <div
                    id="publish-share-status"
                    class="publish-share-panel__status text-caption"
                    role="status"
                    aria-live="polite"
                  >
                    <span class="publish-share-panel__status-label">
                      {{ shareStatusLabel }}
                    </span>
                  </div>
                  <div class="publish-share-panel__actions">
                    <q-btn
                      class="publish-share-panel__copy"
                      color="primary"
                      outline
                      icon="content_copy"
                      label="Copy public link"
                      type="button"
                      :aria-disabled="!shareLinkReady"
                      :class="{ 'is-disabled': !shareLinkReady }"
                      :tabindex="0"
                      :aria-describedby="'publish-share-helper publish-share-status'"
                      @click="shareLinkReady && copy(publicProfileUrl)"
                    >
                      <q-tooltip v-if="shareLinkReady" class="bg-surface-2 text-1">
                        Share this link so supporters can view your profile and tiers.
                      </q-tooltip>
                    </q-btn>
                  </div>
                </div>
              </section>

              <q-expansion-item
                v-model="summaryExpanded"
                class="publish-summary"
                expand-icon="expand_more"
                switch-toggle-side
                dense
                expand-separator
                label="Creator setup summary"
                :caption="summaryCaption"
                toggle-aria-label="Toggle creator setup summary section"
              >
                <div class="publish-summary__content">
                  <div class="publish-summary-grid">
                    <div class="publish-summary-tile" :class="{ 'is-active': activeStep === 'profile' }">
                      <div class="publish-summary-tile__label text-caption text-uppercase text-2">Display name</div>
                      <div class="publish-summary-tile__value text-body1 text-weight-medium text-1">
                        {{ summaryDisplayName }}
                      </div>
                      <div v-if="summaryAuthorKey" class="publish-summary-tile__meta text-caption text-2">
                        Signer: {{ summaryAuthorKey }}
                      </div>
                      <div class="publish-summary-tile__meta text-caption text-2">
                        Share: {{ shareStatusLabel }}
                      </div>
                      <div class="publish-summary-tile__meta text-caption text-2">
                        {{ shareHelperMessage }}
                      </div>
                      <div v-if="lastPublishInfo" class="publish-summary-tile__meta text-caption text-2">
                        {{ lastPublishInfo }}
                      </div>
                      <div class="publish-summary-tile__cta">
                        <q-btn
                          flat
                          dense
                          color="primary"
                          icon="edit"
                          label="Edit profile"
                          :disable="activeStep === 'profile'"
                          @click="goToStep('profile')"
                        />
                      </div>
                    </div>
                    <div class="publish-summary-tile" :class="{ 'is-active': activeStep === 'tiers' }">
                      <div class="publish-summary-tile__label text-caption text-uppercase text-2">Tier address</div>
                      <div class="publish-summary-tile__value text-body1 text-weight-medium text-1">
                        {{ tierAddressPreview }}
                      </div>
                      <div class="publish-summary-tile__meta text-caption text-2">
                        Publishing as {{ tierPublishSummaryLabel }}
                      </div>
                      <div class="publish-summary-tile__cta">
                        <q-btn
                          flat
                          dense
                          color="primary"
                          icon="tune"
                          label="Edit tiers"
                          :disable="activeStep === 'tiers'"
                          @click="goToStep('tiers')"
                        />
                      </div>
                    </div>
                    <div class="publish-summary-tile" :class="{ 'is-active': activeStep === 'profile' }">
                      <div class="publish-summary-tile__label text-caption text-uppercase text-2">Trusted mints</div>
                      <div class="publish-summary-tile__value text-body1 text-weight-medium text-1">
                        {{ mintList.length }} configured
                      </div>
                      <div class="publish-summary-tile__stack" v-if="mintList.length">
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
                      </div>
                      <div v-else class="publish-summary-tile__meta text-caption text-2">No mints configured.</div>
                      <div class="publish-summary-tile__cta">
                        <q-btn
                          flat
                          dense
                          color="primary"
                          icon="inventory_2"
                          label="Manage mints"
                          :disable="activeStep === 'profile'"
                          @click="goToStep('profile')"
                        />
                      </div>
                    </div>
                    <div class="publish-summary-tile" :class="{ 'is-active': activeStep === 'setup' }">
                      <div class="publish-summary-tile__label text-caption text-uppercase text-2">Preferred relays</div>
                      <div class="publish-summary-tile__value text-body1 text-weight-medium text-1">
                        {{ relayList.length }} selected
                      </div>
                      <div class="publish-summary-tile__stack" v-if="relayList.length">
                        <q-chip v-for="relay in relayList" :key="relay" dense outline>{{ relay }}</q-chip>
                      </div>
                      <div v-else class="publish-summary-tile__meta text-caption text-2">Relay selection pending.</div>
                      <div class="publish-summary-tile__cta">
                        <q-btn
                          flat
                          dense
                          color="primary"
                          icon="lan"
                          label="Edit relay setup"
                          :disable="activeStep === 'setup'"
                          @click="goToStep('setup')"
                        />
                      </div>
                    </div>
                    <div class="publish-summary-tile" :class="{ 'is-active': activeStep === 'tiers' }">
                      <div class="publish-summary-tile__label text-caption text-uppercase text-2">Supporter tiers</div>
                      <div class="publish-summary-tile__value text-body1 text-weight-medium text-1">
                        {{ tiers.length }} total
                      </div>
                      <ul v-if="tiers.length" class="publish-summary-tile__list text-caption text-2">
                        <li v-for="(tier, index) in tiers.slice(0, 4)" :key="tier.id || tier.title || `tier-${index}`">
                          {{ tier.title || 'Untitled tier' }}
                        </li>
                        <li v-if="tiers.length > 4">+ {{ tiers.length - 4 }} more</li>
                      </ul>
                      <div v-else class="publish-summary-tile__meta text-caption text-2">No tiers configured yet.</div>
                      <div class="publish-summary-tile__cta">
                        <q-btn
                          flat
                          dense
                          color="primary"
                          icon="workspace_premium"
                          label="Edit tiers"
                          :disable="activeStep === 'tiers'"
                          @click="goToStep('tiers')"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </q-expansion-item>

              <div class="publish-readiness">
              <div class="publish-readiness__title text-subtitle2 text-weight-medium text-1">
                Readiness checklist
              </div>
              <div class="publish-readiness__groups" v-if="!loading">
                <div
                  v-for="group in readinessChecklist"
                  :key="group.id"
                  class="publish-readiness__group"
                >
                  <div class="publish-readiness__group-label text-caption text-uppercase text-2">
                    {{ group.label }}
                  </div>
                  <div class="publish-readiness__entries">
                    <button
                      v-for="item in group.items"
                      :key="item.key"
                      type="button"
                      class="publish-readiness__entry"
                      :class="[`is-${item.state}`, { 'is-clickable': !!item.step } ]"
                      @click="handleReadinessNavigation(item)"
                    >
                      <div class="publish-readiness__entry-icon">
                        <q-icon :name="item.icon" size="18px" />
                      </div>
                      <div class="publish-readiness__entry-content">
                        <div class="publish-readiness__entry-label text-body2 text-1">
                          {{ item.label }}
                        </div>
                        <div
                          v-if="item.stepLabel"
                          class="publish-readiness__entry-meta text-caption text-2"
                        >
                          {{ item.stepLabel }} step
                        </div>
                      </div>
                      <div class="publish-readiness__entry-state text-caption">
                        {{ item.stateLabel }}
                      </div>
                      <q-tooltip v-if="item.tooltip" class="bg-surface-2 text-1">
                        {{ item.tooltip }}
                      </q-tooltip>
                    </button>
                  </div>
                </div>
              </div>
              <div class="publish-readiness__groups" v-else>
                <div v-for="index in 2" :key="`readiness-skeleton-${index}`" class="publish-readiness__group">
                  <div class="publish-readiness__group-label text-caption text-uppercase text-2">
                    <q-skeleton type="text" width="120px" />
                  </div>
                  <div class="publish-readiness__entries">
                    <div
                      v-for="entryIndex in 3"
                      :key="`readiness-skeleton-${index}-${entryIndex}`"
                      class="publish-readiness__entry is-loading"
                    >
                      <div class="publish-readiness__entry-icon">
                        <q-skeleton type="QAvatar" size="24px" />
                      </div>
                      <div class="publish-readiness__entry-content">
                        <q-skeleton type="text" width="160px" class="q-mb-xs" />
                        <q-skeleton type="text" width="100px" />
                      </div>
                      <div class="publish-readiness__entry-state text-caption">
                        <q-skeleton type="text" width="60px" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

              <div class="publish-step__actions">
                <div class="publish-step__cta">
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
                </div>
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

              <q-banner
                v-if="activeDiagnostics"
                class="studio-banner"
                :class="`is-${activeDiagnostics?.level}`"
              >
                <div class="studio-banner__title">{{ activeDiagnostics?.title }}</div>
                <div class="studio-banner__detail">{{ activeDiagnostics?.detail }}</div>
                <div class="row q-gutter-sm q-mt-sm">
                  <q-btn flat dense color="primary" label="Inspect" @click="handleDiagnosticsAlertCta" />
                  <q-btn flat dense color="primary" label="Dismiss" @click="dismissDiagnosticsAttention" />
                </div>
              </q-banner>
              <div v-if="relayTimelinePreview.length" class="studio-timeline">
                <div class="studio-timeline__header text-caption text-2">Recent relay activity</div>
                <ul class="studio-timeline__list">
                  <li
                    v-for="entry in relayTimelinePreview"
                    :key="entry.id"
                    class="studio-timeline__item"
                    :class="`is-${entry.level}`"
                  >
                    <div class="studio-timeline__message text-body2 text-1">{{ entry.message }}</div>
                    <div class="studio-timeline__meta text-caption text-2">
                      {{ formatActivityTime(entry.timestamp) }} · {{ entry.level }}
                    </div>
                    <div v-if="entry.context" class="studio-timeline__context text-caption text-2">
                      {{ entry.context }}
                    </div>
                  </li>
                </ul>
              </div>
            </StepTemplate>
          </template>
        </div>
      </main>

      <aside class="studio-sidebar">
        <q-card flat bordered class="studio-preview" :data-active-step="activeStep" style="position: relative">
          <q-inner-loading :showing="loading" color="primary" />
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
                <span>{{ tierPreviewLabel }} JSON</span>
                <span v-if="tiersModified" class="modified-dot" aria-hidden="true"></span>
              </template>
            </q-tab>
          </q-tabs>
          <q-tab-panels v-model="previewTab" animated class="studio-preview__panels">
            <q-tab-panel name="preview">
              <div v-if="loading" class="preview-skeleton">
                <div class="preview-skeleton__hero">
                  <q-skeleton type="QAvatar" size="68px" />
                  <div class="column q-gutter-xs">
                    <q-skeleton type="text" width="160px" />
                    <q-skeleton type="text" width="120px" />
                  </div>
                </div>
                <div class="preview-skeleton__chips row q-gutter-xs">
                  <q-skeleton
                    v-for="chipIndex in 3"
                    :key="`preview-chip-${chipIndex}`"
                    type="QChip"
                    width="110px"
                  />
                </div>
                <q-skeleton type="rect" height="96px" class="preview-skeleton__section" />
                <q-skeleton type="rect" height="180px" class="preview-skeleton__section" />
                <q-skeleton type="rect" height="140px" class="preview-skeleton__section" />
              </div>
              <template v-else>
                <CreatorStudioPreviewCard
                  :display-name="displayName"
                  :author-input="authorInput"
                  :mint-list="mintList"
                  :relay-list="relayList"
                  :tiers="tiers"
                  :active-step="activeStep"
                />
                <q-banner class="preview-banner" dense>
                  Publish pushes both events to relay.fundstr.me. Copy JSON if your publisher requires manual input.
                </q-banner>
              </template>
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
                :label="`Copy ${tierPreviewLabel} JSON`"
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
<script lang="ts">
export function normalizeMintUrl(value: string | null | undefined) {
  if (typeof value !== 'string') {
    return '';
  }

  const lowered = value.trim().toLowerCase();
  if (!lowered) {
    return '';
  }

  return lowered.replace(/\/+$/u, '');
}
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from 'vue';
import { useEventBus, useLocalStorage, useNow } from '@vueuse/core';
import { storeToRefs } from 'pinia';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';
import { getPublicKey as getSecpPublicKey, utils as secpUtils } from '@noble/secp256k1';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import SetupStep from './creator-studio/SetupStep.vue';
import ProfileStep from './creator-studio/ProfileStep.vue';
import StepTemplate from './creator-studio/StepTemplate.vue';
import CreatorStudioPreviewCard from './creator-studio/CreatorStudioPreviewCard.vue';
import TierComposer from './creator-studio/TierComposer.vue';
import NutzapExplorerPanel from 'src/nutzap/onepage/NutzapExplorerPanel.vue';
import { notifyError, notifySuccess, notifyWarning } from 'src/js/notify';
import type { Tier } from 'src/nutzap/types';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';
import { nip19 } from 'nostr-tools';
import { useClipboard } from 'src/composables/useClipboard';
import { buildProfileUrl } from 'src/utils/profileUrl';
import {
  WS_FIRST_TIMEOUT_MS,
  HTTP_FALLBACK_TIMEOUT_MS,
  publishTiers as publishTiersToRelay,
  publishNostrEvent,
  ensureFundstrRelayClient,
  CANONICAL_TIER_KIND,
  LEGACY_TIER_KIND,
  buildTierPayloadForKind,
  type TierKind,
} from 'src/nutzap/relayPublishing';
import type { NostrFilter } from 'src/nutzap/relayPublishing';
import {
  normalizeAuthor,
  pickLatestReplaceable,
  pickLatestParamReplaceable,
  parseTiersContent,
} from 'src/nutzap/profileShared';
import { hasTierErrors, tierFrequencies, type TierFieldErrors } from './creator-studio/tierComposerUtils';
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

const P2PK_VERIFICATION_STALE_MS = 1000 * 60 * 60 * 24 * 7;
const CREATOR_STUDIO_WS_TIMEOUT_MS = Math.min(WS_FIRST_TIMEOUT_MS, 1200);
const HTTP_DEFAULT_ACCEPT =
  'application/nostr+json, application/json;q=0.9, */*;q=0.1';

const CREATOR_STUDIO_RELAY_WS_URL = 'wss://relay.fundstr.me';
const CREATOR_STUDIO_RELAY_HTTP_URL = 'https://relay.fundstr.me/req';

const authorInput = ref('');
type AuthorLockSource = 'signer' | 'store' | 'profile';
const authorLockSources = ref<AuthorLockSource[]>([]);
const loadedProfileAuthorHex = ref<string | null>(null);

function addAuthorLock(source: AuthorLockSource) {
  if (!authorLockSources.value.includes(source)) {
    authorLockSources.value = [...authorLockSources.value, source];
  }
}

function removeAuthorLock(source: AuthorLockSource) {
  if (authorLockSources.value.includes(source)) {
    authorLockSources.value = authorLockSources.value.filter(entry => entry !== source);
  }
}

const authorInputLocked = computed(() => authorLockSources.value.length > 0);
const authorInputLockHint = computed(() => {
  if (authorLockSources.value.includes('signer')) {
    return 'Author comes from the connected Fundstr signer. Disconnect to change it.';
  }
  if (authorLockSources.value.includes('store')) {
    return 'Author is synced from your saved Fundstr identity. Clear it to change the value.';
  }
  if (authorLockSources.value.includes('profile')) {
    return 'Author was loaded from the published creator profile. Reset the workspace before changing it.';
  }
  return '';
});
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
const lastSeededMintDraft = ref('');
const userModifiedMints = ref(false);
const relaysText = ref(CREATOR_STUDIO_RELAY_WS_URL);
const tiers = ref<Tier[]>([]);
const handleTiersUpdate = (value: Tier[] | unknown) => {
  tiers.value = Array.isArray(value) ? value : [];
};
const tierPreviewKind = ref<TierKind>(CANONICAL_TIER_KIND);
const loading = ref(false);
const publishingAll = ref(false);
const lastPublishInfo = ref('');
const profilePublished = ref(false);
const hasAutoLoaded = ref(false);
const previewTab = ref<'preview' | 'profile' | 'tiers'>('preview');
const now = useNow({ interval: 60_000 });
const lastExportProfile = ref('');
const lastExportTiers = ref({ canonical: '', legacy: '' });

const relayClientRef = shallowRef<FundstrRelayClient | null>(null);
let relayClientPromise: Promise<FundstrRelayClient> | null = null;
let relayClientInitSequence = 0;
let activeRelayUrl = CREATOR_STUDIO_RELAY_WS_URL;
let resolvedRelayUrl: string | null = null;

function setResolvedRelayClient(
  client: FundstrRelayClient,
  sequence: number,
  url: string
): FundstrRelayClient {
  if (sequence === relayClientInitSequence) {
    relayClientRef.value = client;
    resolvedRelayUrl = url;
  }
  return client;
}

function ensureRelayClientInitialized(targetUrl = activeRelayUrl): Promise<FundstrRelayClient> {
  const sanitized = typeof targetUrl === 'string' && targetUrl.trim() ? targetUrl : CREATOR_STUDIO_RELAY_WS_URL;

  if (relayClientRef.value && resolvedRelayUrl === sanitized) {
    activeRelayUrl = sanitized;
    return Promise.resolve(relayClientRef.value);
  }

  if (relayClientPromise && sanitized === activeRelayUrl) {
    return relayClientPromise;
  }

  activeRelayUrl = sanitized;
  const sequence = ++relayClientInitSequence;
  const promise = ensureFundstrRelayClient(sanitized)
    .then(client => setResolvedRelayClient(client, sequence, sanitized))
    .catch(err => {
      if (relayClientPromise === promise) {
        relayClientPromise = null;
      }
      throw err;
    });
  relayClientPromise = promise;
  return promise;
}

async function getRelayClient(): Promise<FundstrRelayClient> {
  if (relayClientRef.value && resolvedRelayUrl === activeRelayUrl) {
    return relayClientRef.value;
  }
  return await ensureRelayClientInitialized(activeRelayUrl);
}

function getRelayClientIfReady(): FundstrRelayClient | null {
  return relayClientRef.value && resolvedRelayUrl === activeRelayUrl
    ? relayClientRef.value
    : null;
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
  const trimmed = value.trim();
  if (!trimmed) {
    userModifiedMints.value = false;
    return;
  }

  userModifiedMints.value = trimmed !== lastSeededMintDraft.value;
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

function syncComposerMintsWithWallet(mintUrls: string[]) {
  const normalized = mintUrls.map(entry => entry.trim()).filter(Boolean);
  if (!normalized.length) {
    return;
  }

  const joined = normalized.join('\n');
  const trimmedDraft = mintsText.value.trim();

  if (trimmedDraft === joined) {
    lastSeededMintDraft.value = joined;
    userModifiedMints.value = false;
    return;
  }

  if (userModifiedMints.value) {
    return;
  }

  mintsText.value = joined;
  lastSeededMintDraft.value = joined;
}

function seedMintsFromStoreIfEmpty() {
  syncComposerMintsWithWallet(storeMintUrls.value);
}

watch(
  () => storeMintUrls.value,
  mintUrls => {
    syncComposerMintsWithWallet(mintUrls);
  },
  { immediate: true, deep: true }
);

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

const shareLinkReady = computed(
  () => profilePublished.value && !!publicProfileUrl.value && !relayNeedsAttention.value
);

const shareStatusLabel = computed(() => {
  if (shareLinkReady.value) {
    return publicProfileUrl.value;
  }
  if (!profilePublished.value) {
    return 'Publish to unlock';
  }
  if (relayNeedsAttention.value) {
    return 'Relay unhealthy';
  }
  if (!authorNpubForShare.value) {
    return 'Waiting on author npub';
  }
  return 'Link unavailable';
});

const shareHelperMessage = computed(() => {
  if (shareLinkReady.value) {
    return 'Share this link so supporters can view your profile and tiers.';
  }
  if (!profilePublished.value) {
    return 'Publish your profile to generate a link supporters can view.';
  }
  if (relayNeedsAttention.value) {
    return 'Restore relay health before sharing your public link.';
  }
  if (!authorNpubForShare.value) {
    return 'Enter a valid author npub to generate the public link.';
  }
  return 'Public link unavailable.';
});


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

type ReadinessChecklistItem = ReadinessChip & {
  step?: CreatorStudioStep;
  stepLabel?: string;
  stateLabel: string;
};

type StepStatus = 'ready' | 'pending' | 'attention' | 'optional';
const stepOrder = ['setup', 'profile', 'tiers', 'publish'] as const;
const tierStepIndex = stepOrder.indexOf('tiers');
type CreatorStudioStep = (typeof stepOrder)[number];

type StepDefinition = {
  name: CreatorStudioStep;
  label: string;
  description: string;
  readinessKeys: ReadinessChipKey[];
  indicator: string;
};

type StepEntry = StepDefinition & {
  status: StepStatus;
  statusLabel: string;
};

const stepDefinitions: StepDefinition[] = [
  {
    name: 'setup',
    label: 'Relay & signer',
    description: 'Connect to the relay, confirm your signer, and enter your author npub.',
    readinessKeys: ['relay', 'authorKey'],
    indicator: '1',
  },
  {
    name: 'profile',
    label: 'Profile basics',
    description: 'Establish your creator identity and payout details.',
    readinessKeys: ['identity', 'mint', 'p2pk'],
    indicator: '2',
  },
  {
    name: 'tiers',
    label: 'Supporter tiers',
    description: 'Compose your supporter offerings and pricing tiers.',
    readinessKeys: ['tiers'],
    indicator: '3',
  },
  {
    name: 'publish',
    label: 'Review & publish',
    description: 'Review readiness and publish to relay.fundstr.me.',
    readinessKeys: ['relay', 'authorKey', 'mint', 'p2pk', 'tiers'],
    indicator: '4',
  },
];

const activeStep = ref<CreatorStudioStep>('setup');

watch(
  () => activeStep.value,
  step => {
    if (step === 'profile') {
      syncComposerMintsWithWallet(storeMintUrls.value);
    }
  },
  { immediate: true }
);

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
    const detail = `${message}. Confirm ${CREATOR_STUDIO_RELAY_HTTP_URL} is reachable or adjust VITE_NUTZAP_PRIMARY_RELAY_HTTP.`;
    flagDiagnosticsAttention('relay', detail, 'warning');
  }
}

type QuerySource = 'ws' | 'http';

type SettledQueryResult =
  | { source: QuerySource; status: 'fulfilled'; events: any[] }
  | { source: QuerySource; status: 'rejected'; error: unknown };

function buildHttpRequestUrl(base: string, filters: NostrFilter[]): string {
  const serialized = JSON.stringify(filters);
  try {
    const url = new URL(base);
    url.searchParams.set('filters', serialized);
    return url.toString();
  } catch {
    const separator = base.includes('?') ? '&' : '?';
    return `${base}${separator}filters=${encodeURIComponent(serialized)}`;
  }
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  return (err as { name?: unknown }).name === 'AbortError';
}

function createHttpFallbackRequest(filters: NostrFilter[]) {
  const requestUrl = buildHttpRequestUrl(CREATOR_STUDIO_RELAY_HTTP_URL, filters);
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  if (controller && HTTP_FALLBACK_TIMEOUT_MS > 0) {
    timer = setTimeout(() => {
      controller.abort();
    }, HTTP_FALLBACK_TIMEOUT_MS);
  }

  const promise: Promise<any[]> = (async () => {
    let response: Response | null = null;
    let bodyText = '';
    try {
      response = await fetch(requestUrl, {
        method: 'GET',
        headers: { Accept: HTTP_DEFAULT_ACCEPT },
        cache: 'no-store',
        signal: controller?.signal ?? undefined,
      });
      bodyText = await response.text();
    } catch (err) {
      if (isAbortError(err)) {
        throw new Error(
          `HTTP fallback timed out after ${HTTP_FALLBACK_TIMEOUT_MS}ms (url: ${requestUrl})`
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message} (url: ${requestUrl})`, {
        cause: err instanceof Error ? err : undefined,
      });
    } finally {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
    }

    if (!response) {
      return [];
    }

    const normalizeSnippet = (input: string) =>
      input
        .replace(/\s+/gu, ' ')
        .trim()
        .slice(0, 200);

    if (!response.ok) {
      const snippet = normalizeSnippet(bodyText) || '[empty response body]';
      throw new Error(
        `HTTP query failed with status ${response.status}: ${snippet} (url: ${requestUrl})`
      );
    }

    const contentType = response.headers.get('content-type') || '';
    const normalizedType = contentType.toLowerCase();
    const isJson =
      normalizedType.includes('application/json') ||
      normalizedType.includes('application/nostr+json');

    if (!isJson) {
      return [];
    }

    if (!bodyText) {
      return [];
    }

    let data: unknown = null;
    try {
      data = JSON.parse(bodyText);
    } catch (err) {
      const snippet = normalizeSnippet(bodyText) || '[empty response body]';
      throw new Error(
        `HTTP ${response.status} returned invalid JSON: ${snippet} (url: ${requestUrl})`,
        { cause: err instanceof Error ? err : undefined }
      );
    }

    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray((data as { events?: any[] }).events)) {
      return (data as { events: any[] }).events;
    }
    return [];
  })();

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
  };

  return { promise, cancel };
}

function settleQueryPromise(
  source: QuerySource,
  promise: Promise<any[]>
): Promise<SettledQueryResult> {
  return promise
    .then(events => ({ source, status: 'fulfilled', events }) as const)
    .catch(error => ({ source, status: 'rejected', error }) as const);
}

async function requestCreatorStudioEvents(filters: NostrFilter[]): Promise<any[]> {
  const relaySocket = await getRelayClient();
  const httpHandle = createHttpFallbackRequest(filters);
  const wsSettled = settleQueryPromise(
    'ws',
    relaySocket.requestOnce(filters, {
      timeoutMs: CREATOR_STUDIO_WS_TIMEOUT_MS,
    })
  );
  const httpSettled = settleQueryPromise('http', httpHandle.promise);

  try {
    const first = await Promise.race([wsSettled, httpSettled]);

    if (first.source === 'http' && first.status === 'rejected') {
      maybeFlagHttpFallbackTimeout(first.error);
    }

    if (first.status === 'fulfilled' && first.events.length > 0) {
      if (first.source === 'ws') {
        httpHandle.cancel();
      }
      return first.events;
    }

    const second =
      first.source === 'ws' ? await httpSettled : await wsSettled;

    if (second.source === 'http' && second.status === 'rejected') {
      maybeFlagHttpFallbackTimeout(second.error);
    }

    if (first.status === 'fulfilled') {
      if (second.status === 'fulfilled' && second.events.length > 0) {
        if (second.source === 'http') {
          httpHandle.cancel();
        }
        return second.events;
      }
      return first.events;
    }

    if (second.status === 'fulfilled') {
      if (second.source === 'http') {
        httpHandle.cancel();
      }
      return second.events;
    }

    const error = (second.error ?? first.error) as unknown;
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    httpHandle.cancel();
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

activeRelayUrl = relayConnectionUrl.value || CREATOR_STUDIO_RELAY_WS_URL;

const activeRelayActivity = computed(() => latestRelayActivity.value);
const activeRelayActivityTimeLabel = computed(() => {
  const timestamp = activeRelayActivity.value?.timestamp;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return '';
  }
  return formatActivityTime(timestamp);
});
const activeRelayAlertLabel = computed(() => latestRelayAlertLabel.value);
const relayTimelinePreview = computed(() => relayActivityTimeline.value.slice(0, 4));

relayNeedsAttentionRef = relayNeedsAttention;

watch(
  () => relayNeedsAttention.value,
  needsAttention => {
    if (!needsAttention && diagnosticsAttention.value?.source === 'relay') {
      dismissDiagnosticsAttention();
    }
  }
);

watch(
  relayConnectionUrl,
  nextUrl => {
    const sanitized = typeof nextUrl === 'string' && nextUrl.trim() ? nextUrl : CREATOR_STUDIO_RELAY_WS_URL;

    if (resolvedRelayUrl === sanitized && relayClientRef.value) {
      activeRelayUrl = sanitized;
      return;
    }

    if (relayClientRef.value && resolvedRelayUrl) {
      cleanupSubscriptions();
    }

    if (stopRelayStatusListener) {
      stopRelayStatusListener();
      stopRelayStatusListener = null;
    }

    hasRelayConnected = false;
    reloadAfterReconnect = false;
    relayClientRef.value = null;
    resolvedRelayUrl = null;
    relayClientPromise = null;
    activeRelayUrl = sanitized;

    const sequence = ++relayReconfigureSequence;

    ensureRelayClientInitialized(sanitized)
      .then(async client => {
        if (sequence !== relayReconfigureSequence) {
          return;
        }
        attachRelayStatusListener(client);
        if (activeAuthorHex) {
          try {
            await setupSubscriptions(activeAuthorHex);
          } catch (err) {
            console.warn('[nutzap] failed to refresh subscriptions after relay change', err);
          }
        }
      })
      .catch(err => {
        console.warn('[nutzap] failed to reinitialize relay client', err);
      });
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
    let addedMintUrl: string | null = null;
    const normalizedMintCandidate = normalizeMintUrl(result.mintUrl);
    if (normalizedMintCandidate && isValidHttpUrl(normalizedMintCandidate)) {
      ensureComposerMintsSeeded();
      const existingEntries = composerMints.value;
      const normalizedExisting = existingEntries
        .map(entry => normalizeMintUrl(entry))
        .filter((entry): entry is string => Boolean(entry));
      if (!normalizedExisting.includes(normalizedMintCandidate)) {
        composerMints.value = [...existingEntries, normalizedMintCandidate];
        addedMintUrl = normalizedMintCandidate;

        const storedMintEntries = Array.isArray(storedMints.value) ? storedMints.value : [];
        const normalizedStored = storedMintEntries
          .map(entry => (entry && typeof entry.url === 'string' ? normalizeMintUrl(entry.url) : ''))
          .filter((entry): entry is string => Boolean(entry));
        const mintExistsInStore = normalizedStored.includes(normalizedMintCandidate);

        if (mintExistsInStore && typeof mintsStore.activateMintUrl === 'function') {
          try {
            await mintsStore.activateMintUrl(normalizedMintCandidate, false, true);
          } catch (err) {
            console.warn('[nutzap] failed to activate composer mint via store action', err);
            mintsStore.activeMintUrl = normalizedMintCandidate;
            storeActiveMintUrl.value = normalizedMintCandidate;
          }
        } else {
          mintsStore.activeMintUrl = normalizedMintCandidate;
          storeActiveMintUrl.value = normalizedMintCandidate;
        }
      }
    }

    if (addedMintUrl) {
      notifySuccess(`Pointer verified. Added ${addedMintUrl} to trusted mints.`);
    } else {
      notifySuccess(`Pointer verified with active mint: ${result.mintUrl}`);
    }
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

watch(
  signerPubkeyTrimmed,
  value => {
    if (value) {
      addAuthorLock('signer');
      if (loadedProfileAuthorHex.value) {
        addAuthorLock('profile');
      }
    } else {
      removeAuthorLock('signer');
    }
  },
  { immediate: true }
);

watch(
  storeAuthorNpub,
  value => {
    if (value) {
      addAuthorLock('store');
      if (loadedProfileAuthorHex.value) {
        addAuthorLock('profile');
      }
    } else {
      removeAuthorLock('store');
      if (!signerPubkeyTrimmed.value) {
        removeAuthorLock('profile');
      }
    }
  },
  { immediate: true }
);

watch(
  () => [signerPubkeyTrimmed.value, storeAuthorNpub.value] as const,
  ([signerValue, storeValue]) => {
    if (!signerValue && !storeValue) {
      removeAuthorLock('profile');
    }
    if (loadedProfileAuthorHex.value && (signerValue || storeValue)) {
      addAuthorLock('profile');
    }
  },
  { immediate: true }
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
let relayReconfigureSequence = 0;

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
  const recordMint = normalizeMintUrl(record.mint);
  const activeMint = normalizeMintUrl(activeMintUrlTrimmed.value);
  const mintMatchesActive = recordMint ? recordMint === activeMint : true;
  const normalizedMintList = mintList.value
    .map(mint => normalizeMintUrl(mint))
    .filter((mint): mint is string => Boolean(mint));
  const mintMatchesList = recordMint ? normalizedMintList.includes(recordMint) : true;
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

const relayList = computed(() => {
  const entries = relaysText.value
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);
  const set = new Set(entries);
  set.add(CREATOR_STUDIO_RELAY_WS_URL);
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

const tierPreviewOptions = [
  { label: 'Preview 30019 JSON', value: CANONICAL_TIER_KIND },
  { label: 'Preview 30000 JSON', value: LEGACY_TIER_KIND },
] as const;

const tierPreviewLabel = computed(() =>
  tierPreviewKind.value === CANONICAL_TIER_KIND ? 'Canonical (30019)' : 'Legacy (30000)'
);

const tierPublishSummaryLabel = computed(() => 'Canonical (30019) + Legacy (30000)');

const tierValidationResults = ref<TierFieldErrors[]>([]);
const showTierValidation = ref(false);
const tiersHaveErrors = computed(() =>
  tierValidationResults.value.some(result => hasTierErrors(result))
);

const tiersReady = computed(() => tiers.value.length > 0 && !tiersHaveErrors.value);

const tierStepGuidance = computed(() => {
  if (tiersReady.value) {
    return '';
  }

  if (tiers.value.length === 0) {
    return 'Add at least one tier to continue.';
  }

  if (tiersHaveErrors.value) {
    return showTierValidation.value
      ? 'Resolve the highlighted validation issues before continuing.'
      : 'Review tier validation before continuing.';
  }

  return 'Review your tier details before continuing.';
});

watch(
  tiersHaveErrors,
  hasErrors => {
    if (!hasErrors) {
      showTierValidation.value = false;
    }
  },
  { immediate: true }
);

watch(
  () => [activeStep.value, tiersHaveErrors.value] as const,
  ([step, hasErrors]) => {
    if (step === 'tiers' && hasErrors) {
      showTierValidation.value = true;
    }
  }
);

const tierAddressPreview = computed(() => {
  try {
    const authorHex = normalizeAuthor(authorInput.value);
    return `${CANONICAL_TIER_KIND}:${authorHex}:tiers`;
  } catch {
    return `${CANONICAL_TIER_KIND}:<author>:tiers`;
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
const setupStepReady = computed(() => !relayNeedsAttention.value && authorKeyReady.value);

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
      readyLabel: p2pkVerificationNeedsRefresh.value
        ? 'Refresh P2PK verification'
        : 'P2PK ready',
      actionLabel: 'Add P2PK pointer',
      readyIcon: p2pkVerificationNeedsRefresh.value ? 'warning' : 'key',
      actionIcon: 'key_off',
      readyTooltip: p2pkVerificationNeedsRefresh.value
        ? 'Pointer verified previously but needs a fresh check with your active mint.'
        : 'Pointer verification is up to date.',
      readyState: p2pkVerificationNeedsRefresh.value ? ('warning' as ReadinessChipState) : undefined,
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

const readinessStateLabels: Record<ReadinessChipState, string> = {
  ready: 'Ready',
  todo: 'Action needed',
  optional: 'Optional',
  warning: 'Needs attention',
};

const readinessStepMap = computed(() => {
  const map = new Map<ReadinessChipKey, CreatorStudioStep>();
  for (const definition of stepDefinitions) {
    for (const key of definition.readinessKeys) {
      if (!map.has(key)) {
        map.set(key, definition.name);
      }
    }
  }
  return map;
});

const readinessChecklist = computed(() => {
  const groups: { id: 'required' | 'optional'; label: string; items: ReadinessChecklistItem[] }[] = [
    { id: 'required', label: 'Required to publish', items: [] },
    { id: 'optional', label: 'Optional enhancements', items: [] },
  ];

  const stepLabelLookup = new Map<CreatorStudioStep, string>(
    stepDefinitions.map(definition => [definition.name, definition.label] as const)
  );

  for (const chip of readinessChips.value) {
    const step = readinessStepMap.value.get(chip.key);
    const item: ReadinessChecklistItem = {
      ...chip,
      step,
      stepLabel: step ? stepLabelLookup.get(step) : undefined,
      stateLabel: readinessStateLabels[chip.state],
    };
    const targetGroup = chip.required ? groups[0] : groups[1];
    targetGroup.items.push(item);
  }

  return groups.filter(group => group.items.length > 0);
});

const requiredReadinessReady = computed(() =>
  readinessChips.value
    .filter(chip => chip.required)
    .every(chip => chip.state === 'ready' || chip.state === 'warning')
);

const publishWarnings = computed<string[]>(() => {
  if (publishingAll.value) {
    return [];
  }

  const warnings: string[] = [];

  if (relayNeedsAttention.value) {
    warnings.push('Restore relay connection health');
  }

  if (p2pkPointerReady.value && p2pkVerificationNeedsRefresh.value) {
    warnings.push(
      p2pkVerificationRecord.value
        ? 'Refresh Cashu pointer verification to keep it trusted'
        : 'Verify your Cashu pointer with an active mint',
    );
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

const summaryExpanded = ref(publishBlockers.value.length > 0);

watch(
  () => publishBlockers.value.length,
  length => {
    if (length > 0 && !summaryExpanded.value) {
      summaryExpanded.value = true;
    }
  }
);

const summaryCaption = computed(() => {
  if (publishBlockers.value.length > 0) {
    return 'Resolve blockers before publishing.';
  }
  if (publishWarnings.value.length > 0) {
    return 'Review warnings before publishing.';
  }
  return 'Review creator details before publishing.';
});

const publishDisabled = computed(
  () => publishingAll.value || publishBlockers.value.length > 0 || !requiredReadinessReady.value
);

const steps = computed<StepEntry[]>(() => {
  const readinessMap = new Map(readinessChips.value.map(chip => [chip.key, chip] as const));

  return stepDefinitions.map(definition => {
    const chips = definition.readinessKeys
      .map(key => readinessMap.get(key))
      .filter((chip): chip is ReadinessChip => Boolean(chip));

    let status: StepStatus = 'ready';

    if (chips.length === 0) {
      status = 'ready';
    } else {
      const hasAttention = chips.some(chip => chip.state === 'warning');
      const hasTodo = chips.some(chip => chip.state === 'todo');
      const allOptional = chips.every(chip => chip.state === 'optional');
      const allReady = chips.every(chip => chip.state === 'ready' || chip.state === 'optional');

      if (hasAttention) {
        status = 'attention';
      } else if (hasTodo) {
        status = 'pending';
      } else if (allOptional) {
        status = 'optional';
      } else if (allReady) {
        status = 'ready';
      } else {
        status = 'pending';
      }
    }

    const statusLabel =
      status === 'ready'
        ? 'Ready'
        : status === 'attention'
          ? 'Needs attention'
          : status === 'pending'
            ? 'In progress'
            : 'Optional';

    return {
      ...definition,
      status,
      statusLabel,
    };
  });
});

const currentStep = computed(() => steps.value.find(step => step.name === activeStep.value) ?? steps.value[0]!);
const stepIndex = computed(() => stepOrder.indexOf(activeStep.value));
const currentStepNumber = computed(() => (stepIndex.value >= 0 ? stepIndex.value + 1 : 1));
const canGoBack = computed(() => stepIndex.value > 0);
const canGoNext = computed(() => {
  if (stepIndex.value >= stepOrder.length - 1) {
    return false;
  }

  if (activeStep.value === 'setup') {
    return setupStepReady.value;
  }

  if (activeStep.value === 'tiers') {
    return tiersReady.value;
  }

  return true;
});

function goToStep(step: CreatorStudioStep) {
  if (step === activeStep.value) {
    return;
  }

  const targetIndex = stepOrder.indexOf(step);

  if (targetIndex === -1) {
    return;
  }

  if (targetIndex > stepIndex.value && activeStep.value === 'tiers' && !tiersReady.value) {
    showTierValidation.value = true;
    return;
  }

  if (targetIndex > tierStepIndex && !tiersReady.value) {
    showTierValidation.value = true;
    activeStep.value = 'tiers';
    return;
  }

  activeStep.value = step;
}

function handleReadinessNavigation(item: ReadinessChecklistItem) {
  if (!item.step) {
    return;
  }

  goToStep(item.step);
}

function goToPreviousStep() {
  if (stepIndex.value > 0) {
    activeStep.value = stepOrder[stepIndex.value - 1];
  }
}

function goToNextStep() {
  if (activeStep.value === 'tiers' && !tiersReady.value) {
    showTierValidation.value = true;
    return;
  }

  if (!canGoNext.value) {
    return;
  }
  activeStep.value = stepOrder[stepIndex.value + 1];
}

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
    tierAddr: `${CANONICAL_TIER_KIND}:${author}:tiers`,
    legacyTierAddr: `${LEGACY_TIER_KIND}:${author}:tiers`,
  };

  const trimmed = p2pkPub.value.trim();
  if (trimmed) {
    payload.p2pk = trimmed;
  }

  return JSON.stringify(payload, null, 2);
});

const canonicalTiersJsonPreview = computed(() =>
  JSON.stringify(buildTierPayloadForKind(tiers.value, CANONICAL_TIER_KIND), null, 2)
);
const legacyTiersJsonPreview = computed(() =>
  JSON.stringify(buildTierPayloadForKind(tiers.value, LEGACY_TIER_KIND), null, 2)
);
const tiersJsonPreview = computed(() =>
  tierPreviewKind.value === CANONICAL_TIER_KIND
    ? canonicalTiersJsonPreview.value
    : legacyTiersJsonPreview.value
);
const profileModified = computed(() => profileJsonPreview.value !== lastExportProfile.value);
const tiersModified = computed(
  () =>
    canonicalTiersJsonPreview.value !== lastExportTiers.value.canonical ||
    legacyTiersJsonPreview.value !== lastExportTiers.value.legacy
);

function ensureComposerMintsSeeded() {
  if (!mintsText.value.trim() && mintList.value.length) {
    mintsText.value = mintList.value.join('\n');
  }
}

function downloadBundle() {
  lastExportProfile.value = profileJsonPreview.value;
  lastExportTiers.value = {
    canonical: canonicalTiersJsonPreview.value,
    legacy: legacyTiersJsonPreview.value,
  };
  const bundle = `// profile-10019.json\n${profileJsonPreview.value}\n\n// tiers-${CANONICAL_TIER_KIND}.json\n${canonicalTiersJsonPreview.value}\n\n// tiers-${LEGACY_TIER_KIND}.json\n${legacyTiersJsonPreview.value}\n`;
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
    overrideKind && (overrideKind === CANONICAL_TIER_KIND || overrideKind === LEGACY_TIER_KIND)
      ? overrideKind
      : typeof event?.kind === 'number' &&
          (event.kind === CANONICAL_TIER_KIND || event.kind === LEGACY_TIER_KIND)
        ? (event.kind as TierKind)
        : null;

  if (eventKind) {
    tierPreviewKind.value = eventKind;
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
  if (!sanitizedSet.has(CREATOR_STUDIO_RELAY_WS_URL)) {
    sanitizedSet.add(CREATOR_STUDIO_RELAY_WS_URL);
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
    relaysText.value = CREATOR_STUDIO_RELAY_WS_URL;
    seedMintsFromStoreIfEmpty();
    loadedProfileAuthorHex.value = null;
    removeAuthorLock('profile');
    profilePublished.value = false;
    return;
  }

  if (typeof latest.pubkey === 'string' && latest.pubkey) {
    const normalized = latest.pubkey.toLowerCase();
    const encoded = safeEncodeNpub(normalized);
    authorInput.value = encoded || normalized;
    loadedProfileAuthorHex.value = normalized;
    if (signerPubkeyTrimmed.value || storeAuthorNpub.value) {
      addAuthorLock('profile');
    }
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
      relaysText.value = CREATOR_STUDIO_RELAY_WS_URL;
    }
    if (typeof parsed.tierAddr === 'string') {
      const [kindPart, , dPart] = parsed.tierAddr.split(':');
      const maybeKind = Number(kindPart);
      if (
        (maybeKind === CANONICAL_TIER_KIND || maybeKind === LEGACY_TIER_KIND) &&
        dPart === 'tiers'
      ) {
        tierPreviewKind.value = maybeKind as TierKind;
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
  if ((!relaysText.value || relaysText.value === CREATOR_STUDIO_RELAY_WS_URL) && relayTags.length) {
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
  profilePublished.value = true;
}

async function loadTiers(authorHex: string) {
  try {
    const normalized = authorHex.toLowerCase();
    const events = await requestCreatorStudioEvents([
      {
        kinds: [30019, 30000],
        authors: [normalized],
        '#d': ['tiers'],
        limit: 2,
      },
    ]);

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
    const events = await requestCreatorStudioEvents([
      { kinds: [10019], authors: [normalized], limit: 1 },
    ]);

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

  const targetUrl = relayConnectionUrl.value || CREATOR_STUDIO_RELAY_WS_URL;
  void ensureRelayClientInitialized(targetUrl)
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
    const relayUrl = relayConnectionUrl.value || CREATOR_STUDIO_RELAY_WS_URL;

    const publishTierWithFallback = async (kind: TierKind) => {
      try {
        const result = await publishTiersToRelay(tiers.value, kind, {
          send: publishEventToRelay,
          relayUrl,
        });
        return { result, usedFallback: false as const };
      } catch (err) {
        if (!shouldUseHttpFallback(err)) {
          throw err;
        }
        const fallbackResult = await publishTiersToRelay(tiers.value, kind, {
          relayUrl,
        });
        const reason = describeFallbackReason(err);
        fallbackNotices.push(
          `Tiers (kind ${kind}) publish used HTTP fallback${reason ? ` — ${reason}` : ''}.`
        );
        return { result: fallbackResult, usedFallback: true as const };
      }
    };

    const legacyOutcome = await publishTierWithFallback(LEGACY_TIER_KIND);
    const canonicalOutcome = await publishTierWithFallback(CANONICAL_TIER_KIND);

    const canonicalResult = canonicalOutcome.result;
    const legacyResult = legacyOutcome.result;

    const canonicalEventId = canonicalResult.ack?.id ?? canonicalResult.event?.id;
    const legacyEventId = legacyResult.ack?.id ?? legacyResult.event?.id;

    const canonicalRelayMessage =
      typeof canonicalResult.ack?.message === 'string' && canonicalResult.ack.message
        ? ` — ${canonicalResult.ack.message}`
        : '';
    const legacyRelayMessage =
      typeof legacyResult.ack?.message === 'string' && legacyResult.ack.message
        ? ` — ${legacyResult.ack.message}`
        : '';

    const canonicalFallbackNote =
      canonicalOutcome.usedFallback || canonicalResult.ack?.via === 'http' ? ' via HTTP fallback' : '';
    const legacyFallbackNote =
      legacyOutcome.usedFallback || legacyResult.ack?.via === 'http' ? ' via HTTP fallback' : '';

    const canonicalSummary = canonicalEventId
      ? `Canonical tiers published${canonicalFallbackNote} (kind ${CANONICAL_TIER_KIND}) — id ${canonicalEventId}${canonicalRelayMessage}`
      : `Canonical tiers published${canonicalFallbackNote} (kind ${CANONICAL_TIER_KIND})${canonicalRelayMessage}`;
    const legacySummary = legacyEventId
      ? `Legacy tiers published${legacyFallbackNote} (kind ${LEGACY_TIER_KIND}) — id ${legacyEventId}${legacyRelayMessage}`
      : `Legacy tiers published${legacyFallbackNote} (kind ${LEGACY_TIER_KIND})${legacyRelayMessage}`;

    tierSummary = `${canonicalSummary} ${legacySummary}`.trim();

    const relays = relayList.value;
    const p2pkHex = p2pkPub.value.trim();
    const tagPubkey = (p2pkDerivedPub.value || p2pkHex).trim();
    const canonicalTierPointer = `${CANONICAL_TIER_KIND}:${authorHex}:tiers`;
    const legacyTierPointer = `${LEGACY_TIER_KIND}:${authorHex}:tiers`;
    const content = JSON.stringify({
      v: 1,
      p2pk: p2pkHex,
      mints: mintList.value,
      relays,
      tierAddr: canonicalTierPointer,
      legacyTierAddr: legacyTierPointer,
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
    if (!tags.some(tag => tag[0] === 'a' && tag[1] === canonicalTierPointer)) {
      tags.push(['a', canonicalTierPointer]);
    }
    if (!tags.some(tag => tag[0] === 'a' && tag[1] === legacyTierPointer)) {
      tags.push(['a', legacyTierPointer]);
    }
    if (displayName.value.trim()) {
      tags.push(['name', displayName.value.trim()]);
    }
    if (pictureUrl.value.trim()) {
      tags.push(['picture', pictureUrl.value.trim()]);
    }

    const profileTemplate = { kind: 10019, tags, content };

    const profileOutcome = await (async () => {
      try {
        const result = await publishNostrEvent(profileTemplate, {
          send: publishEventToRelay,
          relayUrl: relayConnectionUrl.value || CREATOR_STUDIO_RELAY_WS_URL,
        });
        return { result, usedFallback: false as const };
      } catch (err) {
        if (!shouldUseHttpFallback(err)) {
          throw err;
        }
        const fallbackClient = await ensureRelayClientInitialized(
          relayConnectionUrl.value || CREATOR_STUDIO_RELAY_WS_URL
        );
        const fallbackResult = await fallbackClient.publish(profileTemplate);
        const reason = describeFallbackReason(err);
        fallbackNotices.push(
          `Profile publish used HTTP fallback${reason ? ` — ${reason}` : ''}.`
        );
        return { result: fallbackResult, usedFallback: true as const };
      }
    })();

    const profileResult = profileOutcome.result;
    const signerPubkey =
      profileResult.event?.pubkey ||
      canonicalResult.event?.pubkey ||
      legacyResult.event?.pubkey;
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

    const canonicalAckLabel =
      typeof canonicalResult.ack?.message === 'string' && canonicalResult.ack.message
        ? canonicalResult.ack.message
        : 'accepted';
    const legacyAckLabel =
      typeof legacyResult.ack?.message === 'string' && legacyResult.ack.message
        ? legacyResult.ack.message
        : 'accepted';
    const profileAckLabel =
      typeof profileResult.ack?.message === 'string' && profileResult.ack.message
        ? profileResult.ack.message
        : 'accepted';
    notifySuccess(
      `Nutzap profile published (profile ${profileAckLabel}, canonical tiers ${canonicalAckLabel}, legacy tiers ${legacyAckLabel}).`
    );

    const canonicalFallbackUsed =
      canonicalOutcome.usedFallback || canonicalResult.ack?.via === 'http' || (canonicalResult as any)?.via === 'http';
    const legacyFallbackUsed =
      legacyOutcome.usedFallback || legacyResult.ack?.via === 'http' || (legacyResult as any)?.via === 'http';
    const profileFallbackUsed =
      profileOutcome.usedFallback || profileResult.ack?.via === 'http' || profileResult.via === 'http';
    const canonicalIdLabel = canonicalEventId ?? 'unknown';
    const legacyIdLabel = legacyEventId ?? 'unknown';
    const profileIdLabel = profileEventId ?? 'unknown';
    const successContext = `HTTP fallback used — profile: ${
      profileFallbackUsed ? 'yes' : 'no'
    }, canonical tiers: ${canonicalFallbackUsed ? 'yes' : 'no'}, legacy tiers: ${
      legacyFallbackUsed ? 'yes' : 'no'
    }`;
    logRelayActivity(
      'success',
      `Publish succeeded (profile ${profileIdLabel}, canonical ${canonicalIdLabel}, legacy ${legacyIdLabel})`,
      successContext,
    );

    if (fallbackNotices.length) {
      const detail = fallbackNotices.join(' ');
      logRelayActivity('warning', 'Publish used HTTP fallback', detail);
      flagDiagnosticsAttention('publish', detail, 'warning');
    }

    profilePublished.value = true;
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
    relaysText.value = CREATOR_STUDIO_RELAY_WS_URL;
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
    const initialRelayUrl = relayConnectionUrl.value || CREATOR_STUDIO_RELAY_WS_URL;
    void ensureRelayClientInitialized(initialRelayUrl)
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
  padding-bottom: 12px;
  border-bottom: 1px solid var(--surface-contrast-border);
}

.studio-header__title {
  margin: 0;
}

.studio-layout {
  display: grid;
  gap: 24px;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas:
    'nav'
    'stage'
    'sidebar';
}

@media (min-width: 768px) {
  .studio-layout {
    grid-template-columns: minmax(0, 1.5fr) minmax(320px, 1fr);
    grid-template-areas:
      'nav nav'
      'stage sidebar';
  }
}

@media (min-width: 1280px) {
  .studio-layout {
    grid-template-columns: minmax(220px, 260px) minmax(0, 2fr) minmax(320px, 1fr);
    grid-template-areas: 'nav stage sidebar';
    align-items: flex-start;
  }
}

.studio-navigation {
  grid-area: nav;
  position: relative;
}

.studio-stepper {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.studio-stepper__item {
  position: relative;
}

.studio-stepper__button {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 12px 20px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  position: relative;
}

.studio-stepper__button:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

.studio-stepper__button:hover {
  background: color-mix(in srgb, var(--surface-2) 85%, transparent);
}

.studio-stepper__item:not(:last-child) .studio-stepper__button::after {
  content: '';
  position: absolute;
  left: 36px;
  top: 44px;
  bottom: -24px;
  width: 2px;
  background: var(--surface-contrast-border);
}

.studio-stepper__indicator {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 2px solid var(--surface-contrast-border);
  background: color-mix(in srgb, var(--surface-2) 70%, transparent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  color: var(--text-2);
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
  flex: 0 0 auto;
}

.studio-stepper__copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.studio-stepper__label {
  display: block;
}

.studio-stepper__status {
  color: var(--text-2);
}

.studio-stepper__description {
  margin: 6px 0 0 52px;
  max-width: 260px;
}

@media (max-width: 1279.98px) {
  .studio-navigation {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--surface-1);
    padding: 8px 0;
  }

  .studio-stepper {
    flex-direction: row;
    gap: 12px;
    overflow-x: auto;
    padding-bottom: 4px;
    margin: 0 -8px;
    padding-left: 8px;
    padding-right: 8px;
  }

  .studio-stepper__item {
    flex: 0 0 auto;
    min-width: 200px;
  }

  .studio-stepper__button {
    padding: 12px 16px;
  }

  .studio-stepper__item:not(:last-child) .studio-stepper__button::after {
    display: none;
  }

  .studio-stepper__description {
    display: none;
  }
}

.studio-stepper__button.is-active {
  border-color: color-mix(in srgb, var(--accent-200) 60%, transparent);
  background: color-mix(in srgb, var(--accent-200) 22%, transparent);
}

.studio-stepper__button.is-active .studio-stepper__indicator {
  border-color: var(--accent-500);
  background: var(--accent-500);
  color: var(--text-inverse);
}

.studio-stepper__button.is-ready .studio-stepper__indicator {
  border-color: var(--accent-500);
  background: color-mix(in srgb, var(--accent-500) 12%, transparent);
  color: var(--accent-600);
}

.studio-stepper__button.is-ready .studio-stepper__status {
  color: var(--accent-600);
}

.studio-stepper__button.is-attention {
  border-color: rgba(250, 204, 21, 0.45);
  background: color-mix(in srgb, rgba(250, 204, 21, 0.25) 40%, transparent);
}

.studio-stepper__button.is-attention .studio-stepper__indicator {
  border-color: rgba(250, 204, 21, 0.8);
  background: color-mix(in srgb, rgba(250, 204, 21, 0.2) 40%, transparent);
  color: rgba(180, 83, 9, 0.95);
}

.studio-stepper__button.is-attention .studio-stepper__status {
  color: rgba(180, 83, 9, 0.9);
}

.studio-stepper__button.is-pending .studio-stepper__indicator {
  border-color: var(--accent-200);
  background: color-mix(in srgb, var(--surface-2) 80%, transparent);
}

.studio-stepper__button.is-optional .studio-stepper__indicator {
  border-color: var(--surface-contrast-border);
  background: color-mix(in srgb, var(--surface-2) 75%, transparent);
  color: var(--text-2);
}

.studio-stage__meta {
  margin-bottom: 4px;
}

.studio-stage {
  grid-area: stage;
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 0;
}

.studio-stage__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.studio-stage__details {
  flex: 1;
  min-width: 0;
}

.studio-stage__title {
  margin: 0;
}

.studio-stage__subtitle {
  margin-top: 4px;
}

.studio-stage__nav {
  min-width: 0;
}

.studio-stage__body {
  display: flex;
  flex-direction: column;
  gap: 24px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
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

.studio-tier-step {
  flex: 1;
  min-height: 0;
}

.studio-tier-step__guidance {
  display: flex;
  align-items: center;
  gap: 8px;
  background: color-mix(in srgb, var(--surface-2) 90%, transparent);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 12px 16px;
}

.studio-tier-step__composer {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.studio-publish-step {
  flex: 1;
  min-height: 0;
}

.publish-step__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.publish-share-panel {
  margin-top: 12px;
  padding: 18px 20px;
  border: 1px solid color-mix(in srgb, var(--accent-200) 65%, transparent);
  border-left: 4px solid var(--accent-500);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-2) 88%, var(--accent-200) 12%);
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.publish-share-panel__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--accent-600);
  background: color-mix(in srgb, var(--accent-200) 35%, transparent);
  border-radius: 50%;
  width: 44px;
  height: 44px;
}

.publish-share-panel__content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.publish-share-panel__message {
  margin: 0;
}

.publish-share-panel__status {
  color: var(--text-2);
  word-break: break-word;
}

.publish-share-panel__status-label {
  font-weight: 600;
  color: var(--text-1);
}

.publish-share-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.publish-share-panel__copy.is-disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.publish-share-panel__copy.is-disabled:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

.publish-summary {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface-2) 96%, transparent);
  overflow: hidden;
}

.publish-summary :deep(.q-expansion-item__header) {
  padding: 14px 16px;
  min-height: 0;
}

.publish-summary :deep(.q-item__label) {
  color: var(--text-1);
  font-weight: 600;
}

.publish-summary :deep(.q-item__label--caption) {
  color: var(--text-2);
}

.publish-summary :deep(.q-expansion-item__toggle-icon) {
  color: var(--text-2);
}

.publish-summary__content {
  padding: 0 16px 16px;
}

.publish-summary-grid {
  margin-top: 8px;
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.publish-summary-tile {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 12px;
  padding: 16px;
  background: color-mix(in srgb, var(--surface-2) 94%, transparent);
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s ease, background-color 0.2s ease, box-shadow 0.2s ease;
}

.publish-summary-tile.is-active {
  border-color: color-mix(in srgb, var(--accent-200) 65%, transparent);
  background: color-mix(in srgb, var(--accent-200) 18%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-200) 45%, transparent);
}

.publish-summary-tile__value {
  font-weight: 600;
  color: var(--text-1);
  word-break: break-word;
}

.publish-summary-tile__meta {
  color: var(--text-2);
  word-break: break-word;
}

.publish-summary-tile__cta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.publish-summary-tile__stack {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.publish-summary-tile__list {
  margin: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.publish-readiness {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.publish-readiness__groups {
  display: grid;
  gap: 12px;
}

.publish-readiness__group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.publish-readiness__entries {
  display: grid;
  gap: 8px;
}

.publish-readiness__entry {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 10px;
  padding: 12px 14px;
  background: color-mix(in srgb, var(--surface-2) 94%, transparent);
  display: flex;
  align-items: center;
  gap: 12px;
  color: inherit;
  font: inherit;
  width: 100%;
  text-align: left;
  cursor: default;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  appearance: none;
}

.publish-readiness__entry.is-clickable {
  cursor: pointer;
}

.publish-readiness__entry.is-clickable:hover {
  background: color-mix(in srgb, var(--surface-2) 90%, transparent);
}

.publish-readiness__entry:focus-visible {
  outline: 2px solid var(--accent-500);
  outline-offset: 2px;
}

.publish-readiness__entry-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-2);
}

.publish-readiness__entry-label {
  font-weight: 600;
}

.publish-readiness__entry-meta {
  color: var(--text-2);
}

.publish-readiness__entry-state {
  margin-left: auto;
  font-weight: 600;
  color: var(--text-2);
}

.publish-readiness__entry.is-ready {
  border-color: rgba(33, 186, 69, 0.35);
}

.publish-readiness__entry.is-ready .publish-readiness__entry-state {
  color: rgba(33, 186, 69, 0.9);
}

.publish-readiness__entry.is-warning {
  border-color: rgba(245, 158, 11, 0.4);
}

.publish-readiness__entry.is-warning .publish-readiness__entry-state {
  color: #b45309;
}

.publish-readiness__entry.is-todo {
  border-color: color-mix(in srgb, var(--accent-200) 65%, transparent);
}

.publish-readiness__entry.is-todo .publish-readiness__entry-state {
  color: var(--accent-600);
}

.publish-readiness__entry.is-optional {
  border-color: color-mix(in srgb, var(--surface-contrast-border) 80%, transparent);
}

.publish-readiness__entry.is-optional .publish-readiness__entry-state {
  color: var(--text-2);
}

.publish-step__actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.publish-step__cta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
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
  grid-area: sidebar;
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

@media (max-width: 1279.98px) {
  .studio-preview {
    position: static;
    top: auto;
  }
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

.preview-skeleton {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  border-radius: 1.5rem;
  padding: 1.25rem;
  background: color-mix(in srgb, var(--surface-2) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--surface-contrast-border) 65%, transparent);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08);
}

.preview-skeleton__hero {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.preview-skeleton__chips {
  padding-left: 0.25rem;
}

.preview-skeleton__section {
  border-radius: 1.25rem;
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

.studio-timeline {
  border-top: 1px solid var(--surface-contrast-border);
  margin-top: 12px;
  padding-top: 12px;
}

.studio-timeline__header {
  font-weight: 500;
  margin-bottom: 8px;
}

.studio-timeline__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.studio-timeline__item {
  border: 1px solid var(--surface-contrast-border);
  border-radius: 10px;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--surface-2) 85%, transparent);
}

.studio-timeline__item.is-success {
  border-color: rgba(33, 186, 69, 0.35);
}

.studio-timeline__item.is-warning {
  border-color: rgba(250, 204, 21, 0.35);
}

.studio-timeline__item.is-error {
  border-color: rgba(239, 68, 68, 0.4);
}

.studio-timeline__message {
  font-weight: 500;
}

.studio-timeline__meta {
  display: flex;
  gap: 6px;
  align-items: center;
}

.studio-timeline__context {
  margin-top: 4px;
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
