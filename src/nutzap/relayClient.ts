import { getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue';
import { getNutzapNdk } from './ndkInstance';
import { NUTZAP_RELAY_WSS } from './relayConfig';

export type FundstrRelayStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export type FundstrRelayLogLevel = 'info' | 'warn' | 'error';

export type FundstrRelayLogEntry = {
  id: number;
  timestamp: number;
  level: FundstrRelayLogLevel;
  message: string;
  details?: unknown;
};

export type NostrFilter = {
  kinds: number[];
  authors?: string[];
  '#d'?: string[];
  limit?: number;
  [key: `#${string}`]: unknown;
};

type SubscriptionHandlers = {
  onEvent: (event: any) => void;
  onEose?: () => void;
  receivedEvent: boolean;
};

type StatusListener = (status: FundstrRelayStatus) => void;

type RequestOnceHttpFallback = {
  url: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
};

export type RequestOnceOptions = {
  timeoutMs?: number;
  httpFallback?: RequestOnceHttpFallback;
};

function normalizeRelayUrl(url?: string): string {
  return (url ?? '').replace(/\s+/g, '').replace(/\/+$/, '').toLowerCase();
}

const MAX_LOG_ENTRIES = 200;
const MAX_RECONNECT_DELAY_MS = 30000;
const INITIAL_RECONNECT_DELAY_MS = 500;
const DEFAULT_HTTP_ACCEPT =
  'application/nostr+json, application/json;q=0.9, */*;q=0.1';

export class FundstrRelayClient {
  private readonly targetUrl = normalizeRelayUrl(this.relayUrl);
  private readonly WSImpl: typeof WebSocket | undefined;
  private socket?: WebSocket;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly subscriptions = new Map<string, NostrFilter[]>();
  private readonly handlers = new Map<string, SubscriptionHandlers>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly logListeners = new Set<(entry: FundstrRelayLogEntry) => void>();
  private ndkAttached = false;
  private ndkStatus: 'connecting' | 'connected' | 'disconnected' = 'connecting';
  private wsStatus: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' = 'connecting';
  private status: FundstrRelayStatus = 'connecting';
  private readonly statusRef = ref<FundstrRelayStatus>(this.status);
  private readonly logRef = ref<FundstrRelayLogEntry[]>([]);
  private logSequence = 0;

  constructor(private readonly relayUrl: string) {
    this.WSImpl = typeof WebSocket !== 'undefined' ? WebSocket : (globalThis as any)?.WebSocket;
    if (!this.WSImpl) {
      this.wsStatus = 'disconnected';
      this.status = 'disconnected';
      this.statusRef.value = this.status;
    }
  }

  get isSupported(): boolean {
    return !!this.WSImpl;
  }

  connect(): void {
    if (!this.WSImpl) {
      return;
    }

    this.ensureNdkListeners();

    if (
      this.socket &&
      (this.socket.readyState === this.WSImpl.OPEN || this.socket.readyState === this.WSImpl.CONNECTING)
    ) {
      return;
    }

    this.setWsStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    try {
      this.socket = new this.WSImpl(this.relayUrl);
    } catch (err) {
      this.pushLog('error', 'Failed to create relay socket', err);
      this.setWsStatus('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.pushLog('info', 'Opening relay connection');
    this.attachSocketHandlers(this.socket);
  }

  subscribe(
    filters: NostrFilter[],
    onEvent: SubscriptionHandlers['onEvent'],
    onEose?: SubscriptionHandlers['onEose']
  ): string {
    const subId = `fundstr-${Math.random().toString(36).slice(2)}`;
    this.subscriptions.set(subId, filters);
    this.handlers.set(subId, { onEvent, onEose, receivedEvent: false });

    if (!this.WSImpl) {
      this.pushLog('warn', 'WebSocket unsupported, resolving subscription immediately');
      this.queueMicrotask(() => {
        try {
          onEose?.();
        } catch (err) {
          this.pushLog('warn', 'Subscription EOSE handler failed', err);
        }
      });
      return subId;
    }

    this.connect();
    if (this.socket?.readyState === this.WSImpl.OPEN) {
      this.send(['REQ', subId, ...filters]);
    }

    return subId;
  }

  async requestOnce(
    filters: NostrFilter[],
    options: RequestOnceOptions = {}
  ): Promise<any[]> {
    const timeoutMs = options.timeoutMs ?? 0;
    let wsResult: { events: any[]; reason: 'eose' | 'timeout' } | null = null;
    let wsError: Error | null = null;

    try {
      wsResult = await this.requestOnceViaWs(filters, timeoutMs);
      if (wsResult.events.length > 0 || !options.httpFallback) {
        return wsResult.events;
      }
    } catch (err) {
      wsError = err instanceof Error ? err : new Error(String(err));
      if (!options.httpFallback) {
        throw wsError;
      }
    }

    if (options.httpFallback) {
      try {
        const fallbackEvents = await this.requestOnceViaHttp(filters, options.httpFallback);
        if (fallbackEvents.length > 0) {
          return fallbackEvents;
        }
        if (wsResult) {
          return wsResult.events;
        }
        if (wsError) {
          throw wsError;
        }
        return [];
      } catch (err) {
        throw err instanceof Error ? err : new Error(String(err));
      }
    }

    if (wsResult) {
      return wsResult.events;
    }
    if (wsError) {
      throw wsError;
    }
    return [];
  }

  unsubscribe(subId: string): void {
    const filters = this.subscriptions.get(subId);
    this.subscriptions.delete(subId);
    this.handlers.delete(subId);

    if (!this.WSImpl) {
      return;
    }

    if (filters && this.socket?.readyState === this.WSImpl.OPEN) {
      this.send(['CLOSE', subId]);
    }

    if (!this.subscriptions.size) {
      this.pushLog('info', 'No active subscriptions, tearing down relay connection');
      this.teardown();
    }
  }

  onStatusChange(listener: StatusListener): () => void {
    this.ensureNdkListeners();
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  useStatus(): Readonly<Ref<FundstrRelayStatus>> {
    this.ensureNdkListeners();
    const status = ref(this.statusRef.value);
    const stop = this.onStatusChange(next => {
      status.value = next;
    });

    if (getCurrentScope()) {
      onScopeDispose(() => {
        stop();
      });
    }

    return readonly(status);
  }

  onLog(listener: (entry: FundstrRelayLogEntry) => void): () => void {
    this.logListeners.add(listener);
    for (const entry of this.logRef.value) {
      listener(entry);
    }
    return () => {
      this.logListeners.delete(listener);
    };
  }

  useLogFeed(): Readonly<Ref<FundstrRelayLogEntry[]>> {
    this.ensureNdkListeners();
    const feed = ref(this.logRef.value.slice());
    const stop = this.onLog(entry => {
      feed.value = [...feed.value, entry];
      if (feed.value.length > MAX_LOG_ENTRIES) {
        feed.value = feed.value.slice(-MAX_LOG_ENTRIES);
      }
    });

    if (getCurrentScope()) {
      onScopeDispose(() => {
        stop();
      });
    }

    return readonly(feed);
  }

  /** Internal: used in tests to ensure timers/logs reset. */
  clearForTests() {
    this.teardown();
    this.subscriptions.clear();
    this.handlers.clear();
    this.statusListeners.clear();
    this.logListeners.clear();
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.ndkStatus = 'connecting';
    this.ndkAttached = false;
    this.wsStatus = this.isSupported ? 'connecting' : 'disconnected';
    this.setStatus(this.computeStatus());
    this.logRef.value = [];
    this.logSequence = 0;
  }

  private requestOnceViaWs(filters: NostrFilter[], timeoutMs: number) {
    return new Promise<{ events: any[]; reason: 'eose' | 'timeout' }>((resolve, reject) => {
      const collected: any[] = [];
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let subId: string | null = null;

      const finalize = (
        reason: 'eose' | 'timeout',
        error?: Error
      ) => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
          timer = undefined;
        }
        if (subId) {
          this.unsubscribe(subId);
          subId = null;
        }
        if (error) {
          reject(error);
        } else {
          resolve({ events: collected.slice(), reason });
        }
      };

      const onEvent = (event: any) => {
        collected.push(event);
      };

      const onEose = () => {
        finalize('eose');
      };

      try {
        subId = this.subscribe(filters, onEvent, onEose);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        finalize('eose', error);
        return;
      }

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          finalize('timeout');
        }, timeoutMs);
      }
    });
  }

  private async requestOnceViaHttp(
    filters: NostrFilter[],
    fallback: RequestOnceHttpFallback
  ): Promise<any[]> {
    const requestUrl = this.buildRequestUrl(fallback.url, filters);
    const timeoutMs = fallback.timeoutMs ?? 0;
    const { controller, dispose } = this.createAbortController(timeoutMs);
    let response: Response | undefined;
    let bodyText = '';

    try {
      response = await fetch(requestUrl, {
        method: 'GET',
        headers: {
          Accept: DEFAULT_HTTP_ACCEPT,
          ...(fallback.headers ?? {}),
        },
        cache: 'no-store',
        signal: controller?.signal,
      });
      bodyText = await response.text();
    } catch (err) {
      dispose();
      if (this.isAbortError(err)) {
        throw new Error(`HTTP fallback timed out after ${timeoutMs}ms`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    dispose();

    if (!response) {
      return [];
    }

    const normalizeSnippet = (input: string) =>
      input
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);

    if (!response.ok) {
      const snippet = normalizeSnippet(bodyText) || '[empty response body]';
      throw new Error(
        `HTTP query failed with status ${response.status}: ${snippet}`
      );
    }

    const contentType = response.headers.get('content-type') || '';
    const normalizedType = contentType.toLowerCase();
    const isJson =
      normalizedType.includes('application/json') ||
      normalizedType.includes('application/nostr+json');

    if (!isJson) {
      const snippet = normalizeSnippet(bodyText) || '[empty response body]';
      const typeLabel = contentType || 'unknown content-type';
      throw new Error(
        `Unexpected response (${response.status}, ${typeLabel}): ${snippet}`
      );
    }

    let data: any = null;
    try {
      data = bodyText ? JSON.parse(bodyText) : null;
    } catch (err) {
      const snippet = normalizeSnippet(bodyText) || '[empty response body]';
      throw new Error(
        `HTTP ${response.status} returned invalid JSON: ${snippet}`,
        { cause: err }
      );
    }

    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray((data as any).events)) {
      return (data as any).events as any[];
    }
    return [];
  }

  private buildRequestUrl(base: string, filters: NostrFilter[]): string {
    const serialized = JSON.stringify(filters);
    try {
      const url = new URL(base);
      url.searchParams.set('filters', serialized);
      return url.toString();
    } catch {
      const separator = base.includes('?') ? '&' : '?';
      return `${base}${separator}filters=${encodeURIComponent(serialized)}`;
    }
  }

  private createAbortController(timeoutMs: number): {
    controller: AbortController | null;
    dispose: () => void;
  } {
    if (typeof AbortController === 'undefined' || timeoutMs <= 0) {
      return { controller: null, dispose: () => {} };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    return {
      controller,
      dispose: () => {
        clearTimeout(timer);
      },
    };
  }

  private isAbortError(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }
    const name = (err as { name?: unknown }).name;
    return name === 'AbortError';
  }

  private attachSocketHandlers(socket: WebSocket) {
    socket.onopen = () => {
      this.pushLog('info', 'Relay connection opened');
      this.clearReconnectTimer();
      this.reconnectAttempts = 0;
      this.setWsStatus('connected');

      for (const [subId, filters] of this.subscriptions.entries()) {
        const handler = this.handlers.get(subId);
        if (handler) {
          handler.receivedEvent = false;
        }
        this.send(['REQ', subId, ...filters]);
      }
    };

    socket.onmessage = event => {
      try {
        const payload = JSON.parse(event.data);
        if (!Array.isArray(payload)) return;
        const [type, subId, body] = payload;
        if (typeof subId !== 'string') return;
        const handler = this.handlers.get(subId);
        if (!handler) return;

        if (type === 'EVENT') {
          handler.receivedEvent = true;
          try {
            handler.onEvent(body);
          } catch (err) {
            this.pushLog('warn', 'Relay event handler failed', err);
          }
        } else if (type === 'EOSE') {
          try {
            handler.onEose?.();
          } catch (err) {
            this.pushLog('warn', 'Relay EOSE handler failed', err);
          }
        }
      } catch (err) {
        this.pushLog('warn', 'Failed to parse relay message', err);
      }
    };

    socket.onerror = err => {
      this.pushLog('warn', 'Relay socket error', err);
    };

    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = undefined;
      }
      this.pushLog('info', 'Relay connection closed');
      this.setWsStatus('disconnected');
      if (this.subscriptions.size) {
        this.scheduleReconnect();
      }
    };
  }

  private scheduleReconnect() {
    if (!this.WSImpl || this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts = Math.max(this.reconnectAttempts, 1);
    const delay = Math.min(
      INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts - 1),
      MAX_RECONNECT_DELAY_MS
    );
    this.pushLog('info', `Scheduling relay reconnect in ${delay}ms`);
    this.setWsStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.reconnectAttempts += 1;
      this.connect();
    }, delay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private teardown() {
    this.clearReconnectTimer();
    if (this.socket && this.WSImpl) {
      try {
        if (
          this.socket.readyState === this.WSImpl.OPEN ||
          this.socket.readyState === this.WSImpl.CONNECTING
        ) {
          this.socket.close();
        }
      } catch {
        /* noop */
      }
    }
    this.socket = undefined;
    this.reconnectAttempts = 0;
    this.setWsStatus(this.isSupported ? 'disconnected' : 'disconnected');
  }

  private send(payload: any[]) {
    if (!this.socket || !this.WSImpl || this.socket.readyState !== this.WSImpl.OPEN) {
      return;
    }
    try {
      this.socket.send(JSON.stringify(payload));
    } catch (err) {
      this.pushLog('warn', 'Failed to send relay message', err);
    }
  }

  private setWsStatus(status: FundstrRelayStatus) {
    if (this.wsStatus === status) return;
    this.wsStatus = status;
    this.setStatus(this.computeStatus());
  }

  private setNdkStatus(status: 'connecting' | 'connected' | 'disconnected') {
    if (this.ndkStatus === status) return;
    this.ndkStatus = status;
    this.setStatus(this.computeStatus());
  }

  private computeStatus(): FundstrRelayStatus {
    if (this.wsStatus === 'connected') {
      return 'connected';
    }
    if (this.wsStatus === 'reconnecting') {
      return 'reconnecting';
    }
    if (this.wsStatus === 'connecting') {
      return 'connecting';
    }

    if (this.ndkStatus === 'connected') {
      return 'connected';
    }
    if (this.ndkStatus === 'connecting') {
      return 'connecting';
    }
    return 'disconnected';
  }

  private setStatus(next: FundstrRelayStatus) {
    if (this.status === next) return;
    this.status = next;
    this.statusRef.value = next;
    for (const listener of Array.from(this.statusListeners)) {
      try {
        listener(next);
      } catch (err) {
        this.pushLog('warn', 'Status listener failed', err);
      }
    }
  }

  private ensureNdkListeners() {
    if (this.ndkAttached) {
      return;
    }
    this.ndkAttached = true;

    try {
      const ndk = getNutzapNdk();
      const pool = ndk.pool as any;

      const handleConnect = (relay: any) => {
        if (!this.matchesRelay(relay)) return;
        this.setNdkStatus('connected');
      };

      const handleDisconnect = (relay: any) => {
        if (!this.matchesRelay(relay)) return;
        this.setNdkStatus('disconnected');
      };

      const handleHeartbeat = (relay: any) => {
        if (!this.matchesRelay(relay)) return;
        this.setNdkStatus('connected');
      };

      pool.on?.('relay:connect', handleConnect);
      pool.on?.('relay:disconnect', handleDisconnect);
      (pool as any).on?.('relay:stalled', handleDisconnect);
      (pool as any).on?.('relay:heartbeat', handleHeartbeat);

      this.refreshNdkStatus(pool);
    } catch (err) {
      this.pushLog('warn', 'Failed to attach NDK listeners', err);
    }
  }

  private refreshNdkStatus(pool: any) {
    try {
      const relays: any[] = Array.from(pool?.relays?.values?.() ?? []);
      const relay = relays.find((r: any) => this.matchesRelay(r));
      if (relay?.connected) {
        this.setNdkStatus('connected');
      } else {
        this.setNdkStatus('connecting');
      }
    } catch (err) {
      this.pushLog('warn', 'Failed to refresh NDK relay status', err);
    }
  }

  private matchesRelay(relay: any) {
    const url = typeof relay?.url === 'string' ? relay.url : undefined;
    return normalizeRelayUrl(url) === this.targetUrl;
  }

  private pushLog(level: FundstrRelayLogLevel, message: string, details?: unknown) {
    const entry: FundstrRelayLogEntry = {
      id: ++this.logSequence,
      timestamp: Date.now(),
      level,
      message,
      ...(details === undefined ? {} : { details }),
    };
    const next = [...this.logRef.value, entry];
    this.logRef.value = next.slice(-MAX_LOG_ENTRIES);
    for (const listener of this.logListeners) {
      try {
        listener(entry);
      } catch {
        /* noop */
      }
    }
  }

  private queueMicrotask(fn: () => void) {
    if (typeof queueMicrotask === 'function') {
      queueMicrotask(fn);
    } else {
      Promise.resolve().then(fn).catch(() => {
        /* noop */
      });
    }
  }
}

export const fundstrRelayClient = new FundstrRelayClient(NUTZAP_RELAY_WSS);

export function useFundstrRelayStatus(): Readonly<Ref<FundstrRelayStatus>> {
  return fundstrRelayClient.useStatus();
}

export function useFundstrRelayLogFeed(): Readonly<Ref<FundstrRelayLogEntry[]>> {
  return fundstrRelayClient.useLogFeed();
}
