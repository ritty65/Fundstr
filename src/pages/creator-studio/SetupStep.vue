<template>
  <q-card flat bordered class="studio-card">
    <div class="studio-card__header">
      <div>
        <div class="text-subtitle1 text-weight-medium text-1">Relay &amp; author setup</div>
        <div class="text-caption text-2">
          Connect to relay.fundstr.me, confirm your signer, and enter the author you'll publish with before moving on.
        </div>
      </div>
      <q-btn
        flat
        dense
        icon="science"
        label="Data explorer"
        @click="requestExplorerOpen('toolbar')"
      />
    </div>

    <div class="studio-card__body column q-gutter-lg">
      <div class="text-body2 text-2">
        Follow these steps to prepare your workspace. “Next” unlocks once the relay is healthy and an author npub is saved.
      </div>
      <ol class="text-caption text-2 q-pl-md q-mt-none q-mb-none">
        <li>Verify or update the relay URL, then connect.</li>
        <li>Check that your signing key is ready.</li>
        <li>Enter the creator author (npub or hex) you will publish as.</li>
      </ol>

      <section class="studio-card__section column q-gutter-md">
        <div>
          <div class="text-subtitle2 text-1">Relay connection</div>
          <div class="text-caption text-2">
            Use the default Fundstr relay or swap in a custom endpoint. Auto reconnect keeps telemetry healthy.
          </div>
        </div>
        <q-input
          v-model="relayUrlModel"
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
          <q-toggle v-model="relayAutoReconnectModel" label="Auto reconnect" />
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
              :loading="isRelayBusy"
              @click="handleRelayConnect"
            />
          </div>
        </div>
        <div class="text-caption text-2">Relay status: <span class="text-weight-medium text-1">{{ relayStatusLabel }}</span></div>
        <div class="studio-activity" v-if="activeRelayActivity">
          <div class="text-caption text-2">Last activity</div>
          <div class="text-body2 text-1">{{ activeRelayActivity?.message }}</div>
          <div class="text-caption text-2" v-if="activeRelayActivityTimeLabel">
            {{ activeRelayActivityTimeLabel }}
          </div>
        </div>
        <div class="studio-alert" v-if="relayNeedsAttention">
          <q-icon name="warning" size="16px" />
          <span>Realtime relay needs attention. Review the status log or reconnect before continuing.</span>
        </div>
        <div class="studio-alert" v-if="activeRelayAlertLabel">
          <q-icon name="warning" size="16px" />
          <span>{{ activeRelayAlertLabel }}</span>
        </div>
      </section>

      <section class="studio-card__section column q-gutter-md">
        <div>
          <div class="text-subtitle2 text-1">Signer &amp; author</div>
          <div class="text-caption text-2">
            Make sure your signer can approve publishes, then share the npub or hex author for your creator profile.
          </div>
        </div>
        <q-banner dense rounded class="studio-signer-hint bg-surface-2 text-1">
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
        <q-input
          v-model="authorInputModel"
          label="Creator author (npub or hex)"
          dense
          filled
          placeholder="npub1..."
        />
        <div class="studio-alert" v-if="!authorKeyReady">
          <q-icon name="info" size="16px" />
          <span>Enter the npub or hex author to unlock the next step.</span>
        </div>
      </section>

      <q-chip
        v-if="setupReady"
        dense
        color="positive"
        text-color="white"
        icon="task_alt"
        class="self-start"
      >
        Relay and author ready
      </q-chip>
    </div>
  </q-card>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { RelayConnectionStatus } from 'src/nutzap/onepage/useRelayConnection';

type ExplorerOpenSource = 'toolbar' | 'banner' | 'diagnostics' | 'publish-error';

type RelayActivity = {
  message?: string;
  timestamp?: number;
} | null;

type RelayUrlState = 'warning' | 'error' | null;

type SetupStepProps = {
  relayUrlInput: string;
  relayUrlInputState: RelayUrlState;
  relayUrlInputMessage: string;
  relayUrlInputValid: boolean;
  relayAutoReconnect: boolean;
  relayConnectionStatus: RelayConnectionStatus;
  relayIsConnected: boolean;
  relayNeedsAttention: boolean;
  activeRelayActivity: RelayActivity;
  activeRelayActivityTimeLabel: string;
  activeRelayAlertLabel: string;
  signerStatusMessage: string;
  usingStoreIdentity: boolean;
  activeIdentitySummary: string | null;
  authorInput: string;
  authorKeyReady: boolean;
  setupReady: boolean;
  handleRelayConnect: () => void;
  handleRelayDisconnect: () => void;
  requestExplorerOpen: (source: ExplorerOpenSource) => void;
  openSharedSignerModal: () => void;
};

const props = defineProps<SetupStepProps>();

const emit = defineEmits<{
  (event: 'update:relayUrlInput', value: string): void;
  (event: 'update:relayAutoReconnect', value: boolean): void;
  (event: 'update:authorInput', value: string): void;
}>();

const relayUrlModel = computed({
  get: () => props.relayUrlInput,
  set: value => emit('update:relayUrlInput', value),
});

const relayAutoReconnectModel = computed({
  get: () => props.relayAutoReconnect,
  set: value => emit('update:relayAutoReconnect', value),
});

const authorInputModel = computed({
  get: () => props.authorInput,
  set: value => emit('update:authorInput', value),
});

const isRelayBusy = computed(
  () => props.relayConnectionStatus === 'connecting' || props.relayConnectionStatus === 'reconnecting'
);

const relayStatusLabel = computed(() => {
  switch (props.relayConnectionStatus) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting';
    case 'reconnecting':
      return 'Reconnecting';
    case 'disconnected':
      return 'Disconnected';
    default:
      return props.relayConnectionStatus;
  }
});

const {
  activeRelayActivity,
  activeRelayActivityTimeLabel,
  activeRelayAlertLabel,
  relayNeedsAttention,
  signerStatusMessage,
  usingStoreIdentity,
  activeIdentitySummary,
  authorKeyReady,
  setupReady,
  handleRelayConnect,
  handleRelayDisconnect,
  requestExplorerOpen,
  openSharedSignerModal,
  relayIsConnected,
  relayUrlInputState,
  relayUrlInputMessage,
  relayUrlInputValid,
} = props;
</script>
