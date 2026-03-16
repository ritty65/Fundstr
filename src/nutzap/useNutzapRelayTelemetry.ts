import { computed, ref, watch, type Ref } from 'vue';
import { sanitizeRelayUrls } from 'src/utils/relay';
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
  const relayUrlInputFeedback = ref<{ state: 'warning' | 'error' | null; message: string }>({
    state: null,
    message: '',
  });
  const relayUrlInputState = computed(() => relayUrlInputFeedback.value.state);
  const relayUrlInputMessage = computed(() => relayUrlInputFeedback.value.message);
  const relayUrlInputValid = computed(() => {
    const trimmed = relayUrlInput.value.trim();
    const candidate = trimmed || FUNDSTR_WS_URL;
    const sanitized = sanitizeRelayUrls([candidate], 1)[0];
    return !!sanitized && sanitized.startsWith('wss://');
  });

  watch(relayConnectionUrl, value => {
    relayUrlInput.value = value;
  });

  watch(relayUrlInput, value => {
    if (value !== relayConnectionUrl.value && relayUrlInputFeedback.value.state) {
      relayUrlInputFeedback.value = { state: null, message: '' };
    }
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

  function formatActivityTime(timestamp?: number | null) {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
      return 'Unknown time';
    }
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) {
      return 'Unknown time';
    }
    if (!activityTimeFormatter) {
      return date.toISOString();
    }
    try {
      return activityTimeFormatter.format(date);
    } catch {
      return date.toISOString();
    }
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
    const candidate = trimmed || FUNDSTR_WS_URL;
    const sanitized = sanitizeRelayUrls([candidate], 1)[0];
    if (!sanitized || !sanitized.startsWith('wss://')) {
      relayConnectionUrl.value = FUNDSTR_WS_URL;
      relayUrlInput.value = FUNDSTR_WS_URL;
      relayUrlInputFeedback.value = {
        state: 'error',
        message: `Invalid relay URL. Falling back to ${FUNDSTR_WS_URL}.`,
      };
      return;
    }

    relayConnectionUrl.value = sanitized;
    relayUrlInput.value = sanitized;

    if (!trimmed) {
      relayUrlInputFeedback.value = {
        state: 'warning',
        message: `Relay URL reset to default ${FUNDSTR_WS_URL}.`,
      };
    } else if (sanitized !== trimmed) {
      relayUrlInputFeedback.value = {
        state: 'warning',
        message: `Relay URL adjusted to ${sanitized}.`,
      };
    } else {
      relayUrlInputFeedback.value = { state: null, message: '' };
    }
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
    relayUrlInputState,
    relayUrlInputMessage,
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
