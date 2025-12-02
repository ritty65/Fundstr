import { computed, onBeforeUnmount, readonly, ref, shallowRef, type Ref } from 'vue';
import { debug } from '@/js/logger';
import {
  FUNDSTR_REQ_URL,
  FUNDSTR_WS_URL,
  WS_FIRST_TIMEOUT_MS,
} from '../relayEndpoints';
import {
  RelayPublishError,
  type FundstrRelayPublishAck,
  type NostrEvent,
} from '../relayClient';

export type RelayConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type RelayActivityLevel = 'info' | 'success' | 'warning' | 'error';

export type RelayActivityEntry = {
  id: number;
  timestamp: number;
  level: RelayActivityLevel;
  message: string;
  context?: string;
};

type PendingAck = {
  event: NostrEvent;
  resolve: (ack: FundstrRelayPublishAck) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

type SocketWaiter = {
  resolve: (socket: WebSocket) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

const MAX_LOG_ENTRIES = 200;
const BASE_RECONNECT_DELAY = 500;
const MAX_RECONNECT_DELAY = 15000;
const ACK_TIMEOUT_FALLBACK_MS = 7000;
const SOCKET_WAIT_TIMEOUT_MS = Math.max(WS_FIRST_TIMEOUT_MS || 0, 4000);
const ACK_TIMEOUT_MS = Math.max(WS_FIRST_TIMEOUT_MS || 0, ACK_TIMEOUT_FALLBACK_MS);

const wsImpl: typeof WebSocket | undefined =
  typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any)?.WebSocket;

function extractHostname(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

let hasLoggedRelayEndpoints = false;

export function useRelayConnection() {
  const relayUrl = ref(FUNDSTR_WS_URL);
  const status = ref<RelayConnectionStatus>(wsImpl ? 'idle' : 'disconnected');
  const autoReconnect = ref(true);
  const activityLog = ref<RelayActivityEntry[]>([]);
  const socket = shallowRef<WebSocket | null>(null);
  const reconnectAttempts = ref(0);
  const pendingAcks = new Map<string, PendingAck>();
  const socketWaiters = new Set<SocketWaiter>();
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let manualDisconnect = false;
  let activitySequence = 0;

  if (!hasLoggedRelayEndpoints) {
    hasLoggedRelayEndpoints = true;
    const mode = import.meta.env.MODE;
    const wsUrl = relayUrl.value || '(empty)';
    const httpUrl = FUNDSTR_REQ_URL || '(empty)';
    const logMessage = `[Nutzap] Relay endpoints resolved (mode=${mode}): ws=${wsUrl}, http=${httpUrl}`;

    if (mode === 'production') {
      debug(logMessage);
      const expectedHost = extractHostname(FUNDSTR_WS_URL);
      const wsHost = wsUrl === '(empty)' ? null : extractHostname(wsUrl);
      const httpHost = httpUrl === '(empty)' ? null : extractHostname(httpUrl);
      if (expectedHost) {
        if (wsHost && wsHost !== expectedHost) {
          console.warn(
            `[Nutzap] Unexpected production relay WebSocket URL: ${wsUrl}`,
          );
        }
        if (httpHost && httpHost !== expectedHost) {
          console.warn(
            `[Nutzap] Unexpected production relay HTTP URL: ${httpUrl}`,
          );
        }
      }
    } else {
      debug(logMessage);
    }
  }

  const appendActivity = (level: RelayActivityLevel, message: string, context?: string) => {
    const entry: RelayActivityEntry = {
      id: ++activitySequence,
      timestamp: Date.now(),
      level,
      message,
      ...(context ? { context } : {}),
    };
    const next = [...activityLog.value, entry];
    activityLog.value = next.slice(-MAX_LOG_ENTRIES);
  };

  const setStatus = (next: RelayConnectionStatus) => {
    status.value = next;
  };

  const clearReconnectTimer = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const cleanupPendingAcks = (errorMessage: string) => {
    for (const [id, pending] of pendingAcks.entries()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
      pendingAcks.delete(id);
      const ack: FundstrRelayPublishAck = {
        id: pending.event.id,
        accepted: false,
        message: errorMessage,
        via: 'websocket',
      };
      pending.reject(new RelayPublishError(errorMessage, { ack, event: pending.event }));
    }
  };

  const resolveSocketWaiters = (socketInstance: WebSocket) => {
    for (const waiter of socketWaiters) {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }
      try {
        waiter.resolve(socketInstance);
      } catch {
        /* noop */
      }
    }
    socketWaiters.clear();
  };

  const rejectSocketWaiters = (error: Error) => {
    for (const waiter of socketWaiters) {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }
      try {
        waiter.reject(error);
      } catch {
        /* noop */
      }
    }
    socketWaiters.clear();
  };

const handleOpen = () => {
    setStatus('connected');
    reconnectAttempts.value = 0;
    appendActivity('success', 'Relay connection established');
    const current = socket.value;
    if (current) {
      resolveSocketWaiters(current);
    }
  };

  const scheduleReconnect = () => {
    if (manualDisconnect || !autoReconnect.value) {
      return;
    }
    const attempt = reconnectAttempts.value + 1;
    reconnectAttempts.value = attempt;
    const delay = Math.min(MAX_RECONNECT_DELAY, BASE_RECONNECT_DELAY * Math.pow(2, attempt - 1));
    appendActivity('warning', `Relay disconnected — retrying in ${Math.round(delay)}ms`);
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect(false);
    }, delay);
  };

  const handleClose = (event: CloseEvent) => {
    const reason = event.reason ? ` (${event.reason})` : '';
    appendActivity('warning', `Relay connection closed${reason}`);
    setStatus('disconnected');
    const err = new Error('Relay connection closed');
    cleanupPendingAcks('Relay connection closed before ACK');
    rejectSocketWaiters(err);
    socket.value = null;
    if (!manualDisconnect) {
      scheduleReconnect();
    }
  };

  const handleError = () => {
    appendActivity('error', 'Relay socket error');
  };

  const handleNotice = (payload: unknown[]) => {
    const message = typeof payload[1] === 'string' ? payload[1] : 'Relay NOTICE';
    appendActivity('warning', message);
  };

  const handleEose = (payload: unknown[]) => {
    const subId = typeof payload[1] === 'string' ? payload[1] : 'unknown';
    appendActivity('info', `Relay EOSE for ${subId}`);
  };

  const handleOk = (payload: unknown[]) => {
    const rawId = typeof payload[1] === 'string' ? payload[1] : '';
    const normalizedId = rawId.toLowerCase();
    const accepted = Boolean(payload[2]);
    const message = typeof payload[3] === 'string' ? payload[3] : undefined;
    const pending = pendingAcks.get(normalizedId);

    const ack: FundstrRelayPublishAck = {
      id: rawId,
      accepted,
      ...(message ? { message } : {}),
      via: 'websocket',
    };

    if (!pending) {
      appendActivity('warning', `Relay OK for unknown event ${normalizedId}`);
      return;
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    pendingAcks.delete(normalizedId);

    if (accepted) {
      appendActivity('success', `Relay accepted event ${normalizedId}`, message);
      pending.resolve(ack);
    } else {
      const errorMessage = message || 'Relay rejected event';
      appendActivity('error', `Relay rejected event ${normalizedId}`, message);
      pending.reject(new RelayPublishError(errorMessage, { ack, event: pending.event }));
    }
  };

  const handleMessage = (event: MessageEvent) => {
    const data = event.data;
    if (typeof data !== 'string') {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      appendActivity('warning', 'Failed to parse relay payload');
      return;
    }

    if (!Array.isArray(parsed) || typeof parsed[0] !== 'string') {
      return;
    }

    const type = parsed[0];
    switch (type) {
      case 'OK':
        handleOk(parsed);
        break;
      case 'NOTICE':
        handleNotice(parsed);
        break;
      case 'EOSE':
        handleEose(parsed);
        break;
      default:
        break;
    }
  };

  const attachSocketHandlers = (socketInstance: WebSocket) => {
    socketInstance.addEventListener('open', handleOpen);
    socketInstance.addEventListener('close', handleClose);
    socketInstance.addEventListener('error', handleError);
    socketInstance.addEventListener('message', handleMessage);
  };

  const detachSocketHandlers = (socketInstance: WebSocket) => {
    socketInstance.removeEventListener('open', handleOpen);
    socketInstance.removeEventListener('close', handleClose);
    socketInstance.removeEventListener('error', handleError);
    socketInstance.removeEventListener('message', handleMessage);
  };

  const teardownSocket = () => {
    const current = socket.value;
    if (!current) {
      return;
    }
    detachSocketHandlers(current);
    try {
      current.close();
    } catch {
      /* noop */
    }
    socket.value = null;
  };

  const connect = (resetManualDisconnect = true) => {
    if (!wsImpl) {
      appendActivity('error', 'WebSocket unsupported in this environment');
      setStatus('disconnected');
      return;
    }

    const url = relayUrl.value.trim();
    if (!url) {
      appendActivity('warning', 'Relay URL is required');
      return;
    }

    if (resetManualDisconnect) {
      manualDisconnect = false;
    }

    const existing = socket.value;
    if (existing) {
      const ready = existing.readyState;
      if (ready === wsImpl.OPEN) {
        appendActivity('info', 'Relay already connected');
        return;
      }
      if (ready === wsImpl.CONNECTING) {
        appendActivity('info', 'Relay is connecting');
        return;
      }
      teardownSocket();
    }

    clearReconnectTimer();
    const reconnecting = reconnectAttempts.value > 0;
    setStatus(reconnecting ? 'reconnecting' : 'connecting');
    appendActivity('info', reconnecting ? 'Reconnecting to relay' : 'Connecting to relay');

    try {
      const instance = new wsImpl(url);
      socket.value = instance;
      attachSocketHandlers(instance);
    } catch (err) {
      setStatus('disconnected');
      appendActivity(
        'error',
        'Failed to open relay socket',
        err instanceof Error ? err.message : undefined
      );
      scheduleReconnect();
    }
  };

  const disconnect = () => {
    manualDisconnect = true;
    clearReconnectTimer();
    appendActivity('info', 'Disconnecting from relay');
    setStatus('disconnected');
    teardownSocket();
    cleanupPendingAcks('Relay disconnected before ACK');
    rejectSocketWaiters(new Error('Relay disconnected'));
  };

  const ensureSocketOpen = async (): Promise<WebSocket> => {
    if (!wsImpl) {
      throw new Error('WebSocket unsupported');
    }

    connect(false);

    const current = socket.value;
    if (!current) {
      throw new Error('Relay socket unavailable');
    }

    if (current.readyState === wsImpl.OPEN) {
      return current;
    }

    if (current.readyState === wsImpl.CLOSING || current.readyState === wsImpl.CLOSED) {
      throw new Error('Relay socket unavailable');
    }

    return await new Promise<WebSocket>((resolve, reject) => {
      const waiter: SocketWaiter = {
        resolve: openedSocket => {
          socketWaiters.delete(waiter);
          if (waiter.timer) {
            clearTimeout(waiter.timer);
            waiter.timer = undefined;
          }
          resolve(openedSocket);
        },
        reject: error => {
          socketWaiters.delete(waiter);
          if (waiter.timer) {
            clearTimeout(waiter.timer);
            waiter.timer = undefined;
          }
          reject(error);
        },
      };

      if (SOCKET_WAIT_TIMEOUT_MS > 0) {
        waiter.timer = setTimeout(() => {
          socketWaiters.delete(waiter);
          reject(new Error('Timed out waiting for relay socket'));
        }, SOCKET_WAIT_TIMEOUT_MS);
      }

      socketWaiters.add(waiter);
    });
  };

  const publishEvent = async (event: NostrEvent): Promise<FundstrRelayPublishAck> => {
    const normalizedId = typeof event.id === 'string' ? event.id.toLowerCase() : '';
    if (!normalizedId) {
      throw new Error('Event id is required');
    }

    const socketInstance = await ensureSocketOpen();

    return await new Promise<FundstrRelayPublishAck>((resolve, reject) => {
      const pending: PendingAck = {
        event,
        resolve: ack => {
          if (pending.timer) {
            clearTimeout(pending.timer);
            pending.timer = undefined;
          }
          pendingAcks.delete(normalizedId);
          resolve(ack);
        },
        reject: error => {
          if (pending.timer) {
            clearTimeout(pending.timer);
            pending.timer = undefined;
          }
          pendingAcks.delete(normalizedId);
          reject(error);
        },
      };

      if (ACK_TIMEOUT_MS > 0) {
        pending.timer = setTimeout(() => {
          const ack: FundstrRelayPublishAck = {
            id: event.id,
            accepted: false,
            message: 'Timed out waiting for relay ACK',
            via: 'websocket',
          };
          appendActivity('warning', `Relay ACK timeout for ${normalizedId}`);
          pending.reject(new RelayPublishError(ack.message!, { ack, event }));
        }, ACK_TIMEOUT_MS);
      }

      pendingAcks.set(normalizedId, pending);

      try {
        socketInstance.send(JSON.stringify(['EVENT', event]));
        appendActivity('info', `Sent EVENT ${normalizedId} to relay`);
      } catch (err) {
        pendingAcks.delete(normalizedId);
        if (pending.timer) {
          clearTimeout(pending.timer);
          pending.timer = undefined;
        }
        const error = err instanceof Error ? err : new Error('Failed to send event over websocket');
        appendActivity('error', `Failed to send EVENT ${normalizedId}`);
        reject(error);
        return;
      }
    });
  };

  onBeforeUnmount(() => {
    disconnect();
  });

  return {
    relayUrl,
    status: readonly(status) as Readonly<Ref<RelayConnectionStatus>>,
    autoReconnect,
    activityLog: readonly(activityLog) as Readonly<Ref<RelayActivityEntry[]>>,
    reconnectAttempts: readonly(reconnectAttempts) as Readonly<Ref<number>>,
    connect,
    disconnect,
    publishEvent,
    clearActivity() {
      activityLog.value = [];
    },
    logActivity(level: RelayActivityLevel, message: string, context?: string) {
      appendActivity(level, message, context);
    },
    isSupported: !!wsImpl,
    isConnected: computed(() => status.value === 'connected'),
  };
}
