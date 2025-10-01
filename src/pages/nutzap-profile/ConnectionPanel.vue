<template>
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
          <span class="status-dot" :class="statusDotClass" aria-hidden="true"></span>
          <q-chip dense :color="statusColor" text-color="white" class="status-chip">
            {{ statusLabel }}
          </q-chip>
        </div>
        <div v-if="latestActivity" class="latest-activity text-caption">
          <span class="text-2">Latest update:</span>
          <span class="text-weight-medium text-1">{{ latestActivity.message }}</span>
          <span class="text-2">({{ formatActivityTime(latestActivity.timestamp) }})</span>
        </div>
        <div v-else class="latest-activity text-caption text-2">No relay activity yet.</div>
      </div>

      <div class="connection-controls column q-gutter-sm">
        <q-input
          :model-value="relayUrl"
          label="Relay URL"
          dense
          filled
          :disable="!relaySupported"
          autocomplete="off"
          @update:model-value="value => emit('update:relayUrl', value)"
        />
        <div class="row items-center wrap q-gutter-sm">
          <q-btn
            color="primary"
            label="Connect"
            :disable="!relaySupported || !relayUrlValid"
            @click="emit('connect')"
          />
          <q-btn
            color="primary"
            outline
            label="Disconnect"
            :disable="!relaySupported || !relayIsConnected"
            @click="emit('disconnect')"
          />
          <q-toggle
            :model-value="relayAutoReconnect"
            label="Auto reconnect"
            dense
            :disable="!relaySupported"
            @update:model-value="value => emit('update:autoReconnect', value)"
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
          :disable="!activityTimeline.length"
        >
          <template #header>
            <div class="timeline-header row items-center justify-between full-width">
              <div class="row items-center q-gutter-sm">
                <q-icon name="history" size="sm" />
                <div class="text-body2 text-weight-medium text-1">Activity timeline</div>
              </div>
              <q-chip dense :color="statusColor" text-color="white" class="status-chip">
                {{ statusLabel }}
              </q-chip>
            </div>
          </template>
          <div v-if="activityTimeline.length" class="activity-timeline column q-gutter-md q-mt-sm">
            <div
              v-for="entry in activityTimeline"
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
              <q-btn flat label="Clear log" size="sm" :disable="!activityTimeline.length" @click="emit('clear-activity')" />
            </div>
          </div>
          <div v-else class="section-empty text-caption text-2">No relay activity yet.</div>
        </q-expansion-item>
        <div v-if="!activityTimeline.length" class="text-caption text-2">
          Activity will appear once the relay connection initializes.
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { toRefs, type PropType } from 'vue';
import RelayStatusIndicator from 'src/nutzap/RelayStatusIndicator.vue';
import { type RelayActivityEntry, type RelayActivityLevel } from 'src/nutzap/onepage/useRelayConnection';

type Props = {
  statusLabel: string;
  statusColor: string;
  statusDotClass: string;
  latestActivity: RelayActivityEntry | null;
  activityTimeline: RelayActivityEntry[];
  relayUrl: string;
  relayUrlValid: boolean;
  relaySupported: boolean;
  relayIsConnected: boolean;
  relayAutoReconnect: boolean;
  formatActivityTime: (timestamp: number) => string;
  activityLevelColor: (level: RelayActivityLevel) => string;
};

const props = defineProps({
  statusLabel: { type: String, required: true },
  statusColor: { type: String, required: true },
  statusDotClass: { type: String, required: true },
  latestActivity: { type: Object as PropType<RelayActivityEntry | null>, default: null },
  activityTimeline: { type: Array as PropType<RelayActivityEntry[]>, default: () => [] },
  relayUrl: { type: String, required: true },
  relayUrlValid: { type: Boolean, required: true },
  relaySupported: { type: Boolean, required: true },
  relayIsConnected: { type: Boolean, required: true },
  relayAutoReconnect: { type: Boolean, required: true },
  formatActivityTime: { type: Function as PropType<(timestamp: number) => string>, required: true },
  activityLevelColor: {
    type: Function as PropType<(level: RelayActivityLevel) => string>,
    required: true,
  },
});

const emit = defineEmits<{
  (e: 'update:relayUrl', value: string): void;
  (e: 'update:autoReconnect', value: boolean): void;
  (e: 'connect'): void;
  (e: 'disconnect'): void;
  (e: 'clear-activity'): void;
}>();

const {
  statusLabel,
  statusColor,
  statusDotClass,
  latestActivity,
  activityTimeline,
  relayUrl,
  relayUrlValid,
  relaySupported,
  relayIsConnected,
  relayAutoReconnect,
  formatActivityTime,
  activityLevelColor,
} = toRefs(props as Props);
</script>

<style scoped>
.connection-module {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.connection-module .section-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.connection-status-indicator {
  width: 28px;
  height: 28px;
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

.status-chip {
  text-transform: capitalize;
  font-weight: 600;
}

.connection-activity {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.timeline-entry {
  gap: 12px;
}

.timeline-marker {
  width: 6px;
  border-radius: 999px;
  background: var(--surface-contrast-border);
}

.timeline-marker--success {
  background: #21ba45;
}

.timeline-marker--warning {
  background: #f2c037;
}

.timeline-marker--error {
  background: #c10015;
}

.timeline-marker--info {
  background: var(--accent-500);
}

.timeline-actions {
  margin-top: 4px;
}
</style>
