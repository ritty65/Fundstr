<template>
  <div class="legacy-explorer column q-gutter-md">
    <div class="text-caption text-2">
      Run a single-relay REQ against relay.fundstr.me and watch for EOSE or timeout.
    </div>

    <q-input
      v-model="filtersInput"
      type="textarea"
      autogrow
      dense
      filled
      label="Nostr filters (JSON array)"
      hint="Passed directly to ['REQ', subId, ...filters]"
      :error="Boolean(filtersError)"
      :error-message="filtersError || ''"
    />

    <div class="row q-col-gutter-md items-end">
      <q-input
        v-model.number="timeoutMs"
        class="col-12 col-sm-4 col-md-3"
        type="number"
        dense
        filled
        label="Timeout (ms)"
        hint="0 disables the timeout"
        :min="0"
      />
      <div class="col-12 col-sm row q-gutter-sm">
        <q-btn
          color="primary"
          label="Send REQ"
          :loading="running"
          :disable="!canRun"
          @click="runQuery"
        />
        <q-btn
          color="negative"
          flat
          label="Cancel"
          :disable="!running"
          @click="cancelQuery"
        />
        <q-btn
          flat
          color="primary"
          label="Clear"
          :disable="running || (!events.length && !logs.length)"
          @click="clearState"
        />
      </div>
    </div>

    <q-banner v-if="status === 'error'" class="bg-negative text-white">
      {{ errorMessage }}
    </q-banner>
    <q-banner v-else-if="status === 'done' && completionReason === 'eose'" class="bg-positive text-white">
      Completed via EOSE{{ durationText }}.
    </q-banner>
    <q-banner v-else-if="status === 'done' && completionReason === 'timeout'" class="bg-warning text-dark">
      Timed out waiting for EOSE{{ durationText }}.
    </q-banner>
    <q-banner v-else-if="status === 'cancelled'" class="bg-grey-4 text-dark">
      Subscription cancelled.
    </q-banner>

    <div class="column q-gutter-sm">
      <div class="row items-center justify-between">
        <div class="text-subtitle2">Events ({{ events.length }})</div>
        <div class="text-caption text-2" v-if="status === 'running'">Listening for events…</div>
      </div>
      <div v-if="!events.length" class="text-caption text-2">
        No events captured.
      </div>
      <q-card v-for="(event, index) in events" :key="event.id || fallbackEventKey(index, event)" flat bordered>
        <q-card-section>
          <div class="text-caption text-2 q-mb-xs">
            {{ eventSummary(event) }}
          </div>
          <pre class="code-block">{{ formatEvent(event) }}</pre>
        </q-card-section>
      </q-card>
    </div>

    <div class="column q-gutter-sm">
      <div class="text-subtitle2">Log</div>
      <div v-if="!logs.length" class="text-caption text-2">No log entries yet.</div>
      <div
        v-for="entry in logs"
        :key="entry.id"
        class="log-entry row items-start q-gutter-sm"
      >
        <q-badge outline :color="logColor(entry.level)" class="q-mt-xs">{{ entry.level }}</q-badge>
        <div class="column">
          <div class="text-caption text-2">{{ formatTimestamp(entry.timestamp) }}</div>
          <div class="text-body2">{{ entry.message }}</div>
          <div class="text-caption text-2" v-if="entry.detail">{{ entry.detail }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Filter as NostrFilter, Event as NostrEvent } from 'nostr-tools';
import { fundstrRelayClient } from 'src/nutzap/relayClient';
import { WS_FIRST_TIMEOUT_MS } from 'src/nutzap/relayEndpoints';

type LogLevel = 'info' | 'success' | 'warning' | 'error';

type LogEntry = {
  id: number;
  level: LogLevel;
  timestamp: number;
  message: string;
  detail?: string;
};

type CompletionReason = 'eose' | 'timeout' | null;

type ParsedFilters = {
  filters: NostrFilter[] | null;
  error: string;
};

const filtersInput = ref('[{"kinds":[10019],"limit":1}]');
const timeoutMs = ref<number>(WS_FIRST_TIMEOUT_MS);
const status = ref<'idle' | 'running' | 'done' | 'cancelled' | 'error'>('idle');
const completionReason = ref<CompletionReason>(null);
const errorMessage = ref('');
const events = ref<NostrEvent[]>([]);
const logs = ref<LogEntry[]>([]);
const subscriptionId = ref<string | null>(null);
const timerHandle = ref<ReturnType<typeof setTimeout> | null>(null);
const startedAt = ref<number | null>(null);
const lastDurationMs = ref<number | null>(null);
let logSequence = 0;

const filtersState = computed<ParsedFilters>(() => {
  try {
    const parsed = JSON.parse(filtersInput.value || '');
    if (!Array.isArray(parsed)) {
      return { filters: null, error: 'Filters must be a JSON array' };
    }
    return { filters: parsed as NostrFilter[], error: '' };
  } catch (err) {
    return { filters: null, error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
});

const filtersError = computed(() => filtersState.value.error);

const running = computed(() => status.value === 'running');

const canRun = computed(() => !running.value && Boolean(filtersState.value.filters));

const durationText = computed(() => {
  if (lastDurationMs.value == null) return '';
  return ` after ${lastDurationMs.value}ms`;
});

function appendLog(level: LogLevel, message: string, detail?: string) {
  const entry: LogEntry = {
    id: ++logSequence,
    level,
    timestamp: Date.now(),
    message,
    ...(detail ? { detail } : {}),
  };
  logs.value = [...logs.value, entry];
}

function clearTimer() {
  if (timerHandle.value) {
    clearTimeout(timerHandle.value);
    timerHandle.value = null;
  }
}

function cleanupSubscription() {
  const subId = subscriptionId.value;
  if (subId) {
    try {
      fundstrRelayClient.unsubscribe(subId);
    } catch (err) {
      appendLog('warning', 'Failed to unsubscribe cleanly', err instanceof Error ? err.message : undefined);
    }
    subscriptionId.value = null;
  }
}

function finalize(nextStatus: typeof status.value, reason: CompletionReason = null, error?: Error) {
  if (status.value !== 'running') {
    if (nextStatus === 'done' || nextStatus === 'cancelled' || nextStatus === 'error') {
      completionReason.value = reason;
    }
    if (nextStatus === 'error' && error) {
      errorMessage.value = error.message;
    }
    return;
  }

  clearTimer();
  cleanupSubscription();
  completionReason.value = reason;
  status.value = nextStatus;
  const started = startedAt.value;
  lastDurationMs.value = started != null ? Date.now() - started : null;
  startedAt.value = null;

  if (error) {
    errorMessage.value = error.message;
  }
}

function runQuery() {
  const state = filtersState.value;
  if (!state.filters) {
    errorMessage.value = state.error || 'Enter a valid filter array';
    status.value = 'error';
    return;
  }

  clearState();
  status.value = 'running';
  startedAt.value = Date.now();
  appendLog('info', `Sending REQ with ${state.filters.length} filter(s)`);

  try {
    const subId = fundstrRelayClient.subscribe(
      state.filters,
      (event) => {
        events.value = [...events.value, event];
        appendLog('info', `EVENT kind ${event.kind}`, event.id);
      },
      () => {
        appendLog('success', 'EOSE received');
        finalize('done', 'eose');
      }
    );
    subscriptionId.value = subId;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    appendLog('error', 'Failed to send subscription', error.message);
    finalize('error', null, error);
    return;
  }

  const timeout = Number.isFinite(timeoutMs.value) && timeoutMs.value > 0 ? timeoutMs.value : 0;
  if (timeout > 0) {
    timerHandle.value = setTimeout(() => {
      appendLog('warning', `Timeout reached after ${timeout}ms`);
      finalize('done', 'timeout');
    }, timeout);
  }
}

function cancelQuery() {
  if (!running.value) return;
  appendLog('warning', 'Subscription cancelled by operator');
  finalize('cancelled');
}

function clearState() {
  clearTimer();
  cleanupSubscription();
  events.value = [];
  logs.value = [];
  completionReason.value = null;
  errorMessage.value = '';
  lastDurationMs.value = null;
  startedAt.value = null;
  status.value = 'idle';
}

function eventSummary(event: NostrEvent): string {
  return `kind ${event.kind} — ${event.id?.slice(0, 12) ?? 'unknown'}…`;
}

function formatEvent(event: NostrEvent): string {
  try {
    return JSON.stringify(event, null, 2);
  } catch {
    return String(event);
  }
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function logColor(level: LogLevel): string {
  switch (level) {
    case 'success':
      return 'positive';
    case 'warning':
      return 'warning';
    case 'error':
      return 'negative';
    default:
      return 'accent';
  }
}

function fallbackEventKey(index: number, event: NostrEvent): string {
  return `${index}:${event.kind}:${event.pubkey}:${event.created_at}`;
}

onBeforeUnmount(() => {
  clearTimer();
  cleanupSubscription();
});
</script>

<style scoped>
.legacy-explorer {
  max-width: 100%;
}

.code-block {
  font-family: var(--q-font-mono, 'JetBrains Mono', 'Fira Code', monospace);
  font-size: 12px;
  background: var(--surface-2, #f7f7f7);
  border-radius: 4px;
  padding: 12px;
  overflow-x: auto;
  margin: 0;
}

.log-entry + .log-entry {
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 8px;
}
</style>
