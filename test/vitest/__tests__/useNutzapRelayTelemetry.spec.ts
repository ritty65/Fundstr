import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, nextTick, ref } from 'vue';

import { useNutzapRelayTelemetry } from '../../../src/nutzap/useNutzapRelayTelemetry';
import { FUNDSTR_WS_URL } from '../../../src/nutzap/relayEndpoints';

let relayConnectionUrl = ref(FUNDSTR_WS_URL);
let relayConnectionStatus = ref<'idle' | 'connected'>('idle');
let relayAutoReconnect = ref(false);
let relayActivity = ref([] as any[]);
let relayReconnectAttempts = ref(0);
let relayIsConnected = ref(false);
let connectRelayMock = vi.fn();
let disconnectRelayMock = vi.fn();
let publishEventMock = vi.fn();
let clearActivityMock = vi.fn();
let logActivityMock = vi.fn();

vi.mock('../../../src/nutzap/onepage/useRelayConnection', () => ({
  useRelayConnection: () => ({
    relayUrl: relayConnectionUrl,
    status: relayConnectionStatus,
    autoReconnect: relayAutoReconnect,
    activityLog: relayActivity,
    reconnectAttempts: relayReconnectAttempts,
    connect: connectRelayMock,
    disconnect: disconnectRelayMock,
    publishEvent: publishEventMock,
    clearActivity: clearActivityMock,
    logActivity: logActivityMock,
    isSupported: true,
    isConnected: computed(() => relayIsConnected.value),
  }),
}));

describe('useNutzapRelayTelemetry', () => {
  beforeEach(() => {
    relayConnectionUrl = ref(FUNDSTR_WS_URL);
    relayConnectionStatus = ref('idle');
    relayAutoReconnect = ref(false);
    relayActivity = ref([]);
    relayReconnectAttempts = ref(0);
    relayIsConnected = ref(false);
    connectRelayMock = vi.fn();
    disconnectRelayMock = vi.fn();
    publishEventMock = vi.fn();
    clearActivityMock = vi.fn();
    logActivityMock = vi.fn();
  });

  it('treats sanitized relay URLs as valid and surfaces normalization warnings', async () => {
    const telemetry = useNutzapRelayTelemetry();

    telemetry.relayUrlInput.value = 'http://relay.example.com/';

    expect(telemetry.relayUrlInputValid.value).toBe(true);

    telemetry.applyRelayUrlInput();
    await nextTick();

    expect(telemetry.relayConnectionUrl.value).toBe('wss://relay.example.com');
    expect(telemetry.relayUrlInput.value).toBe('wss://relay.example.com');
    expect(telemetry.relayUrlInputState.value).toBe('warning');
    expect(telemetry.relayUrlInputMessage.value).toContain('wss://relay.example.com');
  });

  it('falls back to the default relay when input is blank', async () => {
    const telemetry = useNutzapRelayTelemetry();

    telemetry.relayUrlInput.value = '   ';

    telemetry.applyRelayUrlInput();
    await nextTick();

    expect(telemetry.relayConnectionUrl.value).toBe(FUNDSTR_WS_URL);
    expect(telemetry.relayUrlInput.value).toBe(FUNDSTR_WS_URL);
    expect(telemetry.relayUrlInputState.value).toBe('warning');
    expect(telemetry.relayUrlInputMessage.value).toContain(FUNDSTR_WS_URL);
  });

  it('flags invalid relay URLs and restores the default endpoint', async () => {
    const telemetry = useNutzapRelayTelemetry();

    telemetry.relayUrlInput.value = '//';

    expect(telemetry.relayUrlInputValid.value).toBe(false);

    telemetry.applyRelayUrlInput();
    await nextTick();

    expect(telemetry.relayConnectionUrl.value).toBe(FUNDSTR_WS_URL);
    expect(telemetry.relayUrlInput.value).toBe(FUNDSTR_WS_URL);
    expect(telemetry.relayUrlInputState.value).toBe('error');
    expect(telemetry.relayUrlInputMessage.value).toContain(FUNDSTR_WS_URL);
  });
});
