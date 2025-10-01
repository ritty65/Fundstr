import { computed, ref, watch, type Ref } from 'vue';
import { FUNDSTR_WS_URL } from './relayEndpoints';
import {
  useRelayConnection,
  type RelayActivityEntry,
  type RelayActivityLevel,
  type RelayConnectionStatus,
} from './onepage/useRelayConnection';

type RelayAlertHandler = (entry: RelayActivityEntry) => void;

type UseNutzapRelayTelemetryOptions = {
  onRelayAlert?: RelayAlertHandler;
};

export function useNutzapRelayTelemetry(options: UseNutzapRelayTelemetryOptions = {}) {
  const {
    relayUrl: relayConnectionUrl,
    status: relayConnectionStatus,
    autoReconnect: relayAutoReconnect,
    activityLog: relayActivity,
    reconnectAttempts: relayReconnectAttempts,
    connect: connectRelay,
    disconnect: disconnectRelay,
    publishEvent: publishEventToRelay,
    clearActivity: clearRelayActivity,
    logActivity: logRelayActivity,
    isSupported: relaySupported,
    isConnected: relayIsConnected,
  } = useRelayConnection();

  const relayUrlInput = ref(relayConnectionUrl.value);
  const relayUrlInputValid = computed(() => relayUrlInput.value.trim().length > 0);

  watch(relayConnectionUrl, value => {
    relayUrlInput.value = value;
  });

  const relayStatusLabel = computed(() => describeStatus(relayConnectionStatus));
  const relayStatusColor = computed(() => statusColor(relayConnectionStatus));
  const relayStatusDotClass = computed(() => statusDotClass(relayConnectionStatus));

  const latestRelayActivity = computed(() => {
    const entries = relayActivity.value;
    return entries.length ? entries[entries.length - 1] : null;
  });

  const latestRelayAlert = computed(() => {
    const entries = relayActivity.value;
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      if (entry.level === 'error' || entry.level === 'warning') {
        return entry;
      }
    }
    return null;
  });

  const latestRelayAlertLabel = computed(() => {
    const entry = latestRelayAlert.value;
    if (!entry) {
      return '';
    }
    if (entry.context && entry.context !== entry.message) {
      return `${entry.message} — ${entry.context}`;
    }
    return entry.message;
  });

  const relayNeedsAttention = computed(() => {
    const status = relayConnectionStatus.value;
    const attempts = relayReconnectAttempts.value;
    return status !== 'connected' && attempts >= 3;
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

  const lastAlertId = ref<number | null>(null);

  watch(
    relayActivity,
    entries => {
      if (!options.onRelayAlert) {
        return;
      }
      const latestError = [...entries].reverse().find(entry => entry.level === 'error');
      if (latestError && latestError.id !== lastAlertId.value) {
        lastAlertId.value = latestError.id;
        options.onRelayAlert(latestError);
      }
    },
    { deep: true }
  );

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

  function applyRelayUrlInput() {
    const trimmed = relayUrlInput.value.trim();
    relayConnectionUrl.value = trimmed || FUNDSTR_WS_URL;
    relayUrlInput.value = relayConnectionUrl.value;
  }

  return {
    relayConnectionUrl,
    relayConnectionStatus,
    relayAutoReconnect,
    relayActivity,
    connectRelay,
    disconnectRelay,
    publishEventToRelay,
    clearRelayActivity,
    logRelayActivity,
    relaySupported,
    relayIsConnected,
    relayUrlInput,
    relayUrlInputValid,
    relayStatusLabel,
    relayStatusColor,
    relayStatusDotClass,
    latestRelayActivity,
    latestRelayAlert,
    latestRelayAlertLabel,
    relayNeedsAttention,
    relayActivityTimeline,
    formatActivityTime,
    activityLevelColor,
    applyRelayUrlInput,
  };
}

function describeStatus(status: Ref<RelayConnectionStatus>) {
  switch (status.value) {
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
}

function statusColor(status: Ref<RelayConnectionStatus>) {
  switch (status.value) {
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
}

function statusDotClass(status: Ref<RelayConnectionStatus>) {
  switch (status.value) {
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
}
