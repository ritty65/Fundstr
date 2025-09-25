import { SimplePool, type Event as NostrEvent, type Filter as NostrFilter } from 'nostr-tools';
import { sanitizeRelayUrls } from 'src/utils/relay';

type PointerLike = {
  relays?: unknown;
  data?: unknown;
};

type Closeable = {
  close(reason?: string): Promise<void> | void;
};

type PoolFactory = () => Pick<SimplePool, 'subscribeMany' | 'destroy'>;

type WebSocketCtor = new (url: string, protocols?: string | string[]) => WebSocket;

type ManualSocketFactory = () => WebSocketCtor | undefined;

export type MultiRelaySearchOptions = {
  filters: NostrFilter[];
  relays: string[];
  pointer?: PointerLike | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  onEvent?: (event: NostrEvent, relay?: string) => void;
  forceMode?: 'pool' | 'manual';
  poolFactory?: PoolFactory;
  websocketFactory?: ManualSocketFactory;
  additionalRelays?: string[];
};

export type MultiRelaySearchResult = {
  events: NostrEvent[];
  usedRelays: string[];
  timedOut: boolean;
};

const DEFAULT_TIMEOUT_MS = 7000;
const SUBSCRIPTION_PREFIX = 'multi-relay';

function normalizeRelay(url: string): string {
  return url.trim().replace(/\s+/g, '').replace(/\/+$/, '').toLowerCase();
}

function collectPointerRelays(pointer: unknown): string[] {
  if (!pointer || typeof pointer !== 'object') {
    return [];
  }

  const relays = (pointer as PointerLike).relays;
  if (Array.isArray(relays)) {
    return sanitizeRelayUrls(relays as string[]);
  }

  const nested = (pointer as PointerLike).data;
  if (nested && typeof nested === 'object') {
    return collectPointerRelays(nested);
  }

  return [];
}

export function mergeRelayHints(
  baseRelays: string[],
  pointer?: PointerLike | null,
  additional: string[] = [],
): string[] {
  const merged = new Set<string>();
  for (const url of sanitizeRelayUrls(baseRelays)) {
    merged.add(normalizeRelay(url));
  }
  for (const url of collectPointerRelays(pointer)) {
    merged.add(normalizeRelay(url));
  }
  for (const url of sanitizeRelayUrls(additional)) {
    merged.add(normalizeRelay(url));
  }
  return Array.from(merged);
}

function createSubId(): string {
  return `${SUBSCRIPTION_PREFIX}-${Math.random().toString(36).slice(2)}`;
}

function sortEvents(events: NostrEvent[]): NostrEvent[] {
  return [...events].sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
}

function isSimplePoolAvailable(): boolean {
  return typeof SimplePool === 'function';
}

async function searchWithPool(
  options: Required<Pick<MultiRelaySearchOptions, 'filters' | 'timeoutMs' | 'onEvent'>> & {
    relays: string[];
    signal?: AbortSignal;
    poolFactory?: PoolFactory;
  },
): Promise<MultiRelaySearchResult> {
  const { filters, relays, timeoutMs, signal, onEvent, poolFactory } = options;
  const pool = poolFactory ? poolFactory() : new SimplePool();
  let closer: Closeable | undefined;

  try {
    const seen = new Map<string, NostrEvent>();
    const ordered: NostrEvent[] = [];

    return await new Promise<MultiRelaySearchResult>(resolve => {
      let resolved = false;
      let timedOut = false;
      const finalize = (timeoutTriggered: boolean) => {
        if (resolved) {
          return;
        }
        resolved = true;
        timedOut = timeoutTriggered;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        if (closer) {
          Promise.resolve(closer.close('completed')).catch(() => undefined);
        }
        resolve({ events: sortEvents(ordered), usedRelays: relays, timedOut });
      };

      const timer = setTimeout(() => finalize(true), timeoutMs);

      const onAbort = () => finalize(false);
      if (signal) {
        if (signal.aborted) {
          finalize(false);
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        closer = pool.subscribeMany(relays, filters, {
          maxWait: timeoutMs,
          alreadyHaveEvent: id => seen.has(id),
          onevent: (event: NostrEvent, relay?: string) => {
            if (!event || typeof event.id !== 'string') {
              return;
            }
            if (seen.has(event.id)) {
              return;
            }
            seen.set(event.id, event);
            ordered.push(event);
            onEvent(event, relay);
          },
          oneose: () => finalize(false),
          onclose: () => finalize(false),
        });
      } catch (err) {
        finalize(false);
        throw err;
      }
    });
  } finally {
    if (typeof pool.destroy === 'function') {
      pool.destroy();
    }
  }
}

async function searchWithManual(
  options: Required<Pick<MultiRelaySearchOptions, 'filters' | 'timeoutMs' | 'onEvent'>> & {
    relays: string[];
    signal?: AbortSignal;
    websocketFactory?: ManualSocketFactory;
  },
): Promise<MultiRelaySearchResult> {
  const { filters, relays, timeoutMs, signal, onEvent, websocketFactory } = options;
  const resolveCtor: ManualSocketFactory = websocketFactory
    ? websocketFactory
    : () => {
        const ctor =
          typeof WebSocket !== 'undefined'
            ? WebSocket
            : (globalThis as unknown as { WebSocket?: WebSocketCtor }).WebSocket;
        return ctor as WebSocketCtor | undefined;
      };

  if (!relays.length) {
    return { events: [], usedRelays: [], timedOut: false };
  }

  const seen = new Map<string, NostrEvent>();
  const ordered: NostrEvent[] = [];
  const sockets: WebSocket[] = [];
  const eoseRelays = new Set<string>();
  const subId = createSubId();

  return new Promise(resolve => {
    let resolved = false;
    let timedOut = false;

    const finalize = (timeoutTriggered: boolean) => {
      if (resolved) {
        return;
      }
      resolved = true;
      timedOut = timeoutTriggered;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      for (const socket of sockets) {
        try {
          socket.close();
        } catch (err) {
          console.warn('Failed to close relay socket', err);
        }
      }
      resolve({ events: sortEvents(ordered), usedRelays: relays, timedOut });
    };

    const timer = setTimeout(() => finalize(true), timeoutMs);

    const onAbort = () => finalize(false);
    if (signal) {
      if (signal.aborted) {
        finalize(false);
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const payload = JSON.stringify(['REQ', subId, ...filters]);

    for (const relay of relays) {
      let socket: WebSocket | undefined;
      const Impl = resolveCtor();
      if (!Impl) {
        continue;
      }
      try {
        socket = new Impl(relay);
      } catch (err) {
        console.warn('Failed to create WebSocket for relay', relay, err);
        continue;
      }
      if (!socket) {
        continue;
      }
      sockets.push(socket);
      const relayUrl = relay;

      socket.onopen = () => {
        try {
          socket?.send(payload);
        } catch (err) {
          console.warn('Failed to send REQ to relay', relayUrl, err);
        }
      };

      socket.onerror = () => {
        eoseRelays.add(relayUrl);
        if (eoseRelays.size >= relays.length) {
          finalize(false);
        }
      };

      socket.onclose = () => {
        eoseRelays.add(relayUrl);
        if (eoseRelays.size >= relays.length) {
          finalize(false);
        }
      };

      socket.onmessage = evt => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String((evt as MessageEvent).data));
        } catch (err) {
          console.warn('Failed to parse relay message', err);
          return;
        }
        if (!Array.isArray(parsed)) {
          return;
        }
        const [type, ...rest] = parsed as [string, ...any[]];
        if (type === 'EVENT') {
          const [id, event] = rest;
          if (id !== subId || !event || typeof event.id !== 'string') {
            return;
          }
          if (seen.has(event.id)) {
            return;
          }
          seen.set(event.id, event);
          ordered.push(event);
          onEvent(event, relayUrl);
        } else if (type === 'EOSE') {
          const [id] = rest;
          if (id === subId) {
            eoseRelays.add(relayUrl);
            if (eoseRelays.size >= relays.length) {
              finalize(false);
            }
          }
        }
      };
    }

    if (!sockets.length) {
      finalize(false);
    }
  });
}

export async function multiRelaySearch(options: MultiRelaySearchOptions): Promise<MultiRelaySearchResult> {
  const {
    filters,
    relays,
    pointer,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal,
    onEvent = () => undefined,
    forceMode,
    poolFactory,
    websocketFactory,
    additionalRelays = [],
  } = options;

  const mergedRelays = mergeRelayHints(relays, pointer, additionalRelays);

  if (!filters.length || !mergedRelays.length) {
    return { events: [], usedRelays: mergedRelays, timedOut: false };
  }

  const poolAllowed = forceMode !== 'manual' && isSimplePoolAvailable();

  if (poolAllowed) {
    try {
      return await searchWithPool({ filters, relays: mergedRelays, timeoutMs, signal, onEvent, poolFactory });
    } catch (err) {
      if (forceMode === 'pool') {
        throw err;
      }
      console.warn('SimplePool search failed, falling back to manual sockets', err);
    }
  }

  return searchWithManual({
    filters,
    relays: mergedRelays,
    timeoutMs,
    signal,
    onEvent,
    websocketFactory,
  });
}

export type { NostrEvent, NostrFilter };

