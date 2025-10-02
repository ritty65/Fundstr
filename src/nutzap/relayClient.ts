import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getCurrentScope, onScopeDispose, readonly, ref, type Ref } from 'vue';
import { getNutzapNdk } from './ndkInstance';
import { NUTZAP_ALLOW_WSS_WRITES, NUTZAP_RELAY_WSS } from './relayConfig';
import { FUNDSTR_EVT_URL, HTTP_FALLBACK_TIMEOUT_MS, WS_FIRST_TIMEOUT_MS } from './relayEndpoints';

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

export type FundstrRelayPublishTemplate = {
  kind: number;
  tags: any[];
  content: string;
  created_at?: number;
};

export type FundstrRelayPublishAck = {
  id: string;
  accepted: boolean;
  message?: string;
  via: 'websocket' | 'http';
};

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: any[];
  content: string;
  sig: string;
};

export type FundstrRelayPublishResult = {
  ack: FundstrRelayPublishAck;
  event: NostrEvent;
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

export const FUNDSTR_RELAY_LOG_LIMIT = 200;
const MAX_RECONNECT_DELAY_MS = 30000;
const INITIAL_RECONNECT_DELAY_MS = 500;
const DEFAULT_HTTP_ACCEPT =
  'application/nostr+json, application/json;q=0.9, */*;q=0.1';

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const HEX_128_REGEX = /^[0-9a-f]{128}$/i;

class RelayPublishSendError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RelayPublishSendError';
  }
}

export class RelayPublishError extends Error {
  readonly ack: FundstrRelayPublishAck;
  readonly event: NostrEvent;

  constructor(message: string, result: { ack: FundstrRelayPublishAck; event: NostrEvent }) {
    super(message);
    this.name = 'RelayPublishError';
    this.ack = result.ack;
    this.event = result.event;
  }
}

type PendingPublish = {
  event: NostrEvent;
  socket: WebSocket;
  resolve: (ack: FundstrRelayPublishAck) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

type SocketWaiter = {
  socket: WebSocket;
  resolve: (socket: WebSocket) => void;
  reject: (error: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
};

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
  private readonly pendingPublishes = new Map<string, PendingPublish>();
  private readonly socketWaiters = new Set<SocketWaiter>();
  private allowWsWrites = NUTZAP_ALLOW_WSS_WRITES;
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

  async publish(eventTemplate: FundstrRelayPublishTemplate): Promise<FundstrRelayPublishResult> {
    const event = await this.signEvent(eventTemplate);

    if (!this.WSImpl || !this.allowWsWrites) {
      const ack = await this.publishViaHttp(event);
      return { ack, event };
    }

    try {
      const ack = await this.publishViaWebSocket(event);
      return { ack, event };
    } catch (err) {
      if (err instanceof RelayPublishError) {
        throw err;
      }
      this.pushLog('warn', 'WebSocket publish failed, using HTTP fallback', err);
      const ack = await this.publishViaHttp(event);
      return { ack, event };
    }
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
      if (feed.value.length > FUNDSTR_RELAY_LOG_LIMIT) {
        feed.value = feed.value.slice(-FUNDSTR_RELAY_LOG_LIMIT);
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
    this.allowWsWrites = NUTZAP_ALLOW_WSS_WRITES;
    for (const pending of this.pendingPublishes.values()) {
      if (pending.timer) {
        clearTimeout(pending.timer);
      }
    }
    this.pendingPublishes.clear();
    for (const waiter of this.socketWaiters.values()) {
      if (waiter.timer) {
        clearTimeout(waiter.timer);
      }
    }
    this.socketWaiters.clear();
    this.reconnectAttempts = 0;
    this.clearReconnectTimer();
    this.ndkStatus = 'connecting';
    this.ndkAttached = false;
    this.wsStatus = this.isSupported ? 'connecting' : 'disconnected';
    this.setStatus(this.computeStatus());
    this.logRef.value = [];
    this.logSequence = 0;
  }

  private async signEvent(template: FundstrRelayPublishTemplate): Promise<NostrEvent> {
    const created_at = template.created_at ?? Math.floor(Date.now() / 1000);
    let signed: unknown;

    const maybeWindow = typeof window !== 'undefined' ? (window as any) : (globalThis as any)?.window;
    const nostrSigner = maybeWindow?.nostr;

    if (nostrSigner?.signEvent) {
      signed = await nostrSigner.signEvent({ ...template, created_at });
    } else {
      const ndk = getNutzapNdk();
      const event = new NDKEvent(ndk, { ...template, created_at });
      await event.sign();
      signed = await event.toNostrEvent();
    }

    return this.assertNostrEvent(signed);
  }

  private async publishViaWebSocket(event: NostrEvent): Promise<FundstrRelayPublishAck> {
    const socket = await this.ensureSocketOpen();
    const normalizedId = this.normalizeEventId(event.id);
    if (!normalizedId) {
      const ack: FundstrRelayPublishAck = {
        id: event.id,
        accepted: false,
        message: 'Invalid event identifier',
        via: 'websocket',
      };
      throw new RelayPublishError(ack.message, { ack, event });
    }

    return await new Promise<FundstrRelayPublishAck>((resolve, reject) => {
      const cleanup = () => {
        const current = this.pendingPublishes.get(normalizedId);
        if (current && current === pending) {
          this.pendingPublishes.delete(normalizedId);
        }
        if (pending.timer) {
          clearTimeout(pending.timer);
          pending.timer = undefined;
        }
      };

      const pending: PendingPublish = {
        event,
        socket,
        resolve: ack => {
          cleanup();
          resolve(ack);
        },
        reject: error => {
          cleanup();
          reject(error);
        },
      };

      if (WS_FIRST_TIMEOUT_MS > 0) {
        pending.timer = setTimeout(() => {
          const ack: FundstrRelayPublishAck = {
            id: event.id,
            accepted: false,
            message: 'Timed out waiting for relay OK',
            via: 'websocket',
          };
          this.pushLog('warn', `Relay ack timeout for event ${event.id}`, ack);
          pending.reject(new RelayPublishError(ack.message!, { ack, event }));
        }, WS_FIRST_TIMEOUT_MS);
      }

      this.pendingPublishes.set(normalizedId, pending);

      try {
        socket.send(JSON.stringify(['EVENT', event]));
        this.pushLog('info', `Sent EVENT ${event.id} to relay`);
      } catch (err) {
        pending.reject(
          new RelayPublishSendError('Failed to send event over websocket', {
            cause: err instanceof Error ? err : undefined,
          }),
        );
      }
    });
  }

  private async ensureSocketOpen(): Promise<WebSocket> {
    if (!this.WSImpl) {
      throw new RelayPublishSendError('WebSocket unsupported');
    }

    this.connect();

    const socket = this.socket;
    if (!socket) {
      throw new RelayPublishSendError('Relay socket unavailable');
    }

    if (socket.readyState === this.WSImpl.OPEN) {
      return socket;
    }

    if (socket.readyState === this.WSImpl.CLOSING || socket.readyState === this.WSImpl.CLOSED) {
      throw new RelayPublishSendError('Relay socket unavailable');
    }

    return await new Promise<WebSocket>((resolve, reject) => {
      const waiter: SocketWaiter = {
        socket,
        resolve: openedSocket => {
          cleanup();
          resolve(openedSocket);
        },
        reject: error => {
          cleanup();
          reject(error);
        },
      };

      const cleanup = () => {
        if (waiter.timer) {
          clearTimeout(waiter.timer);
          waiter.timer = undefined;
        }
        this.socketWaiters.delete(waiter);
      };

      if (WS_FIRST_TIMEOUT_MS > 0) {
        waiter.timer = setTimeout(() => {
          waiter.reject(new RelayPublishSendError('Timed out waiting for relay socket'));
        }, WS_FIRST_TIMEOUT_MS);
      }

      this.socketWaiters.add(waiter);
    });
  }

  private async publishViaHttp(event: NostrEvent): Promise<FundstrRelayPublishAck> {
    const { controller, dispose } = this.createAbortController(HTTP_FALLBACK_TIMEOUT_MS);
    let response: Response | undefined;
    let bodyText = '';

    try {
      response = await fetch(FUNDSTR_EVT_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Accept: DEFAULT_HTTP_ACCEPT,
        },
        body: JSON.stringify(event),
        cache: 'no-store',
        signal: controller?.signal,
      });
      bodyText = await response.text();
    } catch (err) {
      dispose();
      if (this.isAbortError(err)) {
        throw new Error(`Publish request timed out after ${HTTP_FALLBACK_TIMEOUT_MS}ms`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    }

    dispose();

    if (!response) {
      throw new Error('Relay publish failed: no response received');
    }

    const normalizeSnippet = (input: string) => input.replace(/\s+/g, ' ').trim().slice(0, 200) || '[empty response body]';

    if (!response.ok) {
      const snippet = normalizeSnippet(bodyText);
      throw new Error(`Relay rejected with status ${response.status}: ${snippet}`);
    }

    let ackRaw: any = null;
    if (bodyText) {
      try {
        ackRaw = JSON.parse(bodyText);
      } catch (err) {
        throw new Error('Relay returned invalid JSON', { cause: err });
      }
    }

    const ack: FundstrRelayPublishAck = {
      id: typeof ackRaw?.id === 'string' && ackRaw.id ? ackRaw.id : event.id,
      accepted: ackRaw?.accepted === true,
      message: typeof ackRaw?.message === 'string' ? ackRaw.message : undefined,
      via: 'http',
    };

    if (!ack.accepted) {
      throw new RelayPublishError(ack.message ?? 'Relay rejected event', { ack, event });
    }

    this.pushLog('info', `HTTP publish accepted for event ${ack.id}`);
    return ack;
  }

  private handlePublishOk(eventId: unknown, okValue: unknown, message: unknown) {
    const normalizedId = this.normalizeEventId(eventId);
    if (!normalizedId) {
      this.pushLog('warn', 'Relay OK message missing event id', {
        eventId,
        okValue,
        message,
      });
      return;
    }

    const pending = this.pendingPublishes.get(normalizedId);
    if (!pending) {
      this.pushLog('info', `Relay OK for unknown event ${normalizedId}`, {
        ok: okValue,
        message,
      });
      return;
    }

    const accepted = okValue === true || okValue === 'true' || okValue === 1;
    const ack: FundstrRelayPublishAck = {
      id: pending.event.id,
      accepted,
      message: typeof message === 'string' && message ? message : undefined,
      via: 'websocket',
    };

    if (accepted) {
      this.pushLog(
        'info',
        ack.message
          ? `Relay accepted event ${ack.id} — ${ack.message}`
          : `Relay accepted event ${ack.id}`,
        ack,
      );
      pending.resolve(ack);
    } else {
      const errorMessage = ack.message ?? 'Relay rejected event';
      this.pushLog(
        'warn',
        ack.message
          ? `Relay rejected event ${ack.id} — ${ack.message}`
          : `Relay rejected event ${ack.id}`,
        ack,
      );
      pending.reject(new RelayPublishError(errorMessage, { ack, event: pending.event }));
    }
  }

  private handlePublishNotice(notice: unknown) {
    const message = typeof notice === 'string' ? notice : String(notice ?? '');
    const normalizedId = this.extractEventIdFromNotice(message);

    if (normalizedId) {
      const pending = this.pendingPublishes.get(normalizedId);
      if (pending) {
        const ack: FundstrRelayPublishAck = {
          id: pending.event.id,
          accepted: false,
          message: message || undefined,
          via: 'websocket',
        };
        this.pushLog(
          'warn',
          message ? `Relay NOTICE for event ${ack.id} — ${message}` : `Relay NOTICE for event ${ack.id}`,
          ack,
        );
        pending.reject(new RelayPublishError(ack.message ?? 'Relay NOTICE', { ack, event: pending.event }));
        return;
      }
    }

    this.pushLog('warn', 'Relay NOTICE', message);
  }

  private resolveSocketWaiters(socket: WebSocket) {
    for (const waiter of Array.from(this.socketWaiters)) {
      if (waiter.socket !== socket) continue;
      this.socketWaiters.delete(waiter);
      if (waiter.timer) {
        clearTimeout(waiter.timer);
        waiter.timer = undefined;
      }
      try {
        waiter.resolve(socket);
      } catch (err) {
        this.pushLog('warn', 'Socket waiter resolve failed', err);
      }
    }
  }

  private rejectSocketWaiters(socket: WebSocket, error: Error) {
    for (const waiter of Array.from(this.socketWaiters)) {
      if (waiter.socket !== socket) continue;
      this.socketWaiters.delete(waiter);
      if (waiter.timer) {
        clearTimeout(waiter.timer);
        waiter.timer = undefined;
      }
      try {
        waiter.reject(error);
      } catch (err) {
        this.pushLog('warn', 'Socket waiter reject failed', err);
      }
    }
  }

  private rejectPendingPublishesForSocket(socket: WebSocket, error: Error) {
    for (const [id, pending] of Array.from(this.pendingPublishes.entries())) {
      if (pending.socket !== socket) continue;
      this.pendingPublishes.delete(id);
      if (pending.timer) {
        clearTimeout(pending.timer);
        pending.timer = undefined;
      }
      pending.reject(error);
    }
  }

  private assertNostrEvent(input: unknown): NostrEvent {
    if (!this.isNostrEvent(input)) {
      throw new Error('Signing failed — invalid NIP-01 event');
    }
    return input;
  }

  private isNostrEvent(value: unknown): value is NostrEvent {
    if (!value || typeof value !== 'object') return false;
    const event = value as Partial<NostrEvent>;
    if (!HEX_64_REGEX.test(String(event.id ?? ''))) return false;
    if (!HEX_64_REGEX.test(String(event.pubkey ?? ''))) return false;
    if (typeof event.created_at !== 'number' || !Number.isFinite(event.created_at)) return false;
    if (typeof event.kind !== 'number' || !Number.isInteger(event.kind)) return false;
    if (!Array.isArray(event.tags)) return false;
    if (typeof event.content !== 'string') return false;
    if (!HEX_128_REGEX.test(String(event.sig ?? ''))) return false;
    return true;
  }

  private normalizeEventId(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    return HEX_64_REGEX.test(trimmed) ? trimmed : null;
  }

  private extractEventIdFromNotice(message: string): string | null {
    const match = message.match(/[0-9a-f]{64}/i);
    return match ? match[0].toLowerCase() : null;
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

    this.pushLog('info', 'HTTP fallback request', { url: requestUrl });

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
        throw new Error(
          `HTTP fallback timed out after ${timeoutMs}ms (url: ${requestUrl})`
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message} (url: ${requestUrl})`, {
        cause: err instanceof Error ? err : undefined,
      });
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
        `HTTP query failed with status ${response.status}: ${snippet} (url: ${requestUrl})`
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
      this.pushLog('warn', 'HTTP fallback returned non-JSON payload', {
        status: response.status,
        contentType: typeLabel,
        snippet,
        url: requestUrl,
      });
      return [];
    }

    let data: any = null;
    try {
      data = bodyText ? JSON.parse(bodyText) : null;
    } catch (err) {
      const snippet = normalizeSnippet(bodyText) || '[empty response body]';
      throw new Error(
        `HTTP ${response.status} returned invalid JSON: ${snippet} (url: ${requestUrl})`,
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

      this.resolveSocketWaiters(socket);
    };

    socket.onmessage = event => {
      try {
        const payload = JSON.parse(event.data);
        if (!Array.isArray(payload) || payload.length === 0) return;
        const [type, ...rest] = payload;

        if (type === 'EVENT' || type === 'EOSE') {
          const [subId, body] = rest;
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
          } else {
            try {
              handler.onEose?.();
            } catch (err) {
              this.pushLog('warn', 'Relay EOSE handler failed', err);
            }
          }
          return;
        }

        if (type === 'OK') {
          const [eventId, okValue, message] = rest;
          this.handlePublishOk(eventId, okValue, message);
          return;
        }

        if (type === 'NOTICE') {
          const [noticeMessage] = rest;
          this.handlePublishNotice(noticeMessage);
          return;
        }
      } catch (err) {
        this.pushLog('warn', 'Failed to parse relay message', err);
      }
    };

    socket.onerror = err => {
      this.pushLog('warn', 'Relay socket error', err);
      this.rejectSocketWaiters(socket, new RelayPublishSendError('Relay socket error', {
        cause: err instanceof Error ? err : undefined,
      }));
    };

    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = undefined;
      }
      this.pushLog('info', 'Relay connection closed');
      this.setWsStatus('disconnected');
      this.rejectSocketWaiters(
        socket,
        new RelayPublishSendError('Relay socket closed before acknowledgement'),
      );
      this.rejectPendingPublishesForSocket(
        socket,
        new RelayPublishSendError('Relay socket closed before acknowledgement'),
      );
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
    this.logRef.value = next.slice(-FUNDSTR_RELAY_LOG_LIMIT);
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

const DEFAULT_RELAY_URL = NUTZAP_RELAY_WSS;
const DEFAULT_RELAY_KEY = normalizeRelayUrl(DEFAULT_RELAY_URL) || '__fundstr-default-relay__';

const relayClientCache = new Map<string, FundstrRelayClient>();

const statusBridge = ref<FundstrRelayStatus>('connecting');
const logBridge = ref<FundstrRelayLogEntry[]>([]);

let stopStatusBridge: (() => void) | null = null;
let stopLogBridge: (() => void) | null = null;

function attachActiveClient(client: FundstrRelayClient) {
  if (stopStatusBridge) {
    stopStatusBridge();
    stopStatusBridge = null;
  }
  if (stopLogBridge) {
    stopLogBridge();
    stopLogBridge = null;
  }

  const entries: FundstrRelayLogEntry[] = [];
  logBridge.value = [];

  stopStatusBridge = client.onStatusChange(status => {
    statusBridge.value = status;
  });

  stopLogBridge = client.onLog(entry => {
    entries.push(entry);
    if (entries.length > FUNDSTR_RELAY_LOG_LIMIT) {
      entries.splice(0, entries.length - FUNDSTR_RELAY_LOG_LIMIT);
    }
    logBridge.value = entries.slice();
  });
}

function resolveRelayConfig(relayUrl?: string): { key: string; url: string } {
  const candidate = typeof relayUrl === 'string' && relayUrl.trim() ? relayUrl : DEFAULT_RELAY_URL;
  const normalized = normalizeRelayUrl(candidate);
  const key = normalized || DEFAULT_RELAY_KEY;
  return { key, url: candidate };
}

function getOrCreateClient(key: string, url: string): FundstrRelayClient {
  let client = relayClientCache.get(key);
  if (!client) {
    client = new FundstrRelayClient(url);
    relayClientCache.set(key, client);
  }
  return client;
}

const initialRelayClient = getOrCreateClient(DEFAULT_RELAY_KEY, DEFAULT_RELAY_URL);
attachActiveClient(initialRelayClient);

export let fundstrRelayClient = initialRelayClient;

export function setFundstrRelayUrl(relayUrl?: string): FundstrRelayClient {
  const { key, url } = resolveRelayConfig(relayUrl);
  const nextClient = getOrCreateClient(key, url);
  if (fundstrRelayClient !== nextClient) {
    fundstrRelayClient = nextClient;
    attachActiveClient(nextClient);
  }
  return fundstrRelayClient;
}

export function useFundstrRelayStatus(): Readonly<Ref<FundstrRelayStatus>> {
  return readonly(statusBridge);
}

export function useFundstrRelayLogFeed(): Readonly<Ref<FundstrRelayLogEntry[]>> {
  return readonly(logBridge);
}
