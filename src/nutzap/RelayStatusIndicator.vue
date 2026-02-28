<template>
  <div class="relay-status" :class="statusClass" :title="`Relay: ${label}`">
    <span class="dot"></span><span class="lbl">{{ label }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFundstrRelayStatus } from './relayClient';

const status = useFundstrRelayStatus();

const label = computed(() => {
  switch (status.value) {
    case 'connected':
      return 'Connected';
    case 'disconnected':
      return 'Disconnected';
    case 'reconnecting':
      return 'Reconnecting…';
    default:
      return 'Connecting…';
  }
});

const statusClass = computed(() =>
  status.value === 'reconnecting' ? 'status-connecting' : `status-${status.value}`
);
</script>

<style scoped>
.relay-status {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.status-connected .dot {
  background: #4caf50;
}
.status-connecting .dot {
  background: #ffb300;
}
.status-disconnected .dot {
  background: #f44336;
}
.lbl {
  opacity: 0.9;
}
</style>
