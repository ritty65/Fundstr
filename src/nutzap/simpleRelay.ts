import type { Filter, NostrEvent as RelayEvent } from '@/nostr/relayClient';
import { FUNDSTR_WS_URL } from './relayEndpoints';

export type SimpleRelayQueryOptions = {
  url?: string;
  timeoutMs?: number;
};

export class SimpleRelayError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SimpleRelayError';
  }
}

const DEFAULT_TIMEOUT = 8000;

function createSubId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function getWebSocketImpl(): typeof WebSocket {
  const ws = typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any)?.WebSocket;
  if (!ws) {
    throw new SimpleRelayError('WebSocket unavailable in this environment');
  }
  return ws;
}

export async function simpleRelayQuery(
  filters: Filter[],
  options: SimpleRelayQueryOptions = {},
): Promise<RelayEvent[]> {
  const url = options.url?.trim() || FUNDSTR_WS_URL;
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT;
  const WS = getWebSocketImpl();

  return await new Promise<RelayEvent[]>((resolve, reject) => {
    let socket: WebSocket | null = null;
    const subId = createSubId();
    const events: RelayEvent[] = [];
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (socket) {
        try {
          socket.close();
        } catch {
          /* noop */
        }
        socket = null;
      }
      if (error) reject(error);
      else resolve(events);
    };

    try {
      socket = new WS(url);
    } catch (err) {
      cleanup(new SimpleRelayError('Failed to open relay websocket', { cause: err as any }));
      return;
    }

    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        cleanup(new SimpleRelayError('Timed out waiting for relay response'));
      }, timeoutMs);
    }

    socket.onopen = () => {
      try {
        socket?.send(JSON.stringify(['REQ', subId, ...filters]));
      } catch (err) {
        cleanup(new SimpleRelayError('Failed to send REQ to relay', { cause: err as any }));
      }
    };

    socket.onmessage = (evt) => {
      if (settled || typeof evt.data !== 'string') return;
      let payload: any;
      try {
        payload = JSON.parse(evt.data);
      } catch {
        return;
      }
      if (!Array.isArray(payload) || payload.length < 2) return;
      const [type, receivedSubId, content] = payload;
      if (receivedSubId !== subId) return;
      if (type === 'EVENT' && content && typeof content === 'object') {
        events.push(content as RelayEvent);
      } else if (type === 'EOSE') {
        cleanup();
      }
    };

    socket.onerror = () => {
      cleanup(new SimpleRelayError('Relay websocket error'));
    };

    socket.onclose = () => {
      cleanup();
    };
  });
}
