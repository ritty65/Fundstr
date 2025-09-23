type Env = {
  RELAY_HTTP_TARGET?: string;
  RELAY_WS_TARGET?: string;
  UPSTREAM_RELAY_HTTP?: string;
  UPSTREAM_RELAY_WS?: string;
  PROXY_BASE_HTTP?: string;
  PROXY_BASE_WSS?: string;
  RELAY_REQ_TIMEOUT_MS?: string;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS,POST',
};

export default { fetch: handle };

async function handle(req: Request, env: Env, _ctx: unknown): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (url.pathname === '/event') {
    if (req.method !== 'POST') {
      return new Response('method not allowed', { status: 405, headers: CORS_HEADERS });
    }
    return handleEvent(req, url, env);
  }

  // WS bridge: browser -> (your domain) -> relay
  if (url.pathname === '/ws' && req.headers.get('Upgrade') === 'websocket') {
    const target = url.searchParams.get('target');
    if (!target || !target.startsWith('wss://')) {
      return new Response('bad target', { status: 400, headers: CORS_HEADERS });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    server.accept();

    // Dial upstream relay and accept
    const upstreamResp = await fetch(target, {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
    });
    const upstream = (upstreamResp as any).webSocket as WebSocket;
    if (!upstream) return new Response('upstream failed', { status: 502, headers: CORS_HEADERS });
    upstream.accept();

    // Pipe frames both ways
    server.addEventListener('message', (e: MessageEvent) => upstream.send(e.data));
    upstream.addEventListener('message', (e: MessageEvent) => server.send(e.data));
    server.addEventListener('close', () => upstream.close());
    upstream.addEventListener('close', () => server.close());

    // **Return 101 with the client end**
    return new Response(null, { status: 101, webSocket: client });
  }

  if (url.pathname === '/http') {
    const target = url.searchParams.get('target');
    if (!target || !/^https:\/\/[^?]+$/.test(target)) {
      return new Response('bad target', { status: 400, headers: CORS_HEADERS });
    }

    const resp = await fetch(target, {
      headers: {
        Accept: 'application/nostr+json',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': resp.headers.get('Content-Type') ?? 'application/json',
      },
    });
  }

  if (url.pathname === '/req' && req.method === 'GET') {
    return handleReq(url, env);
  }

  // Health check / default
  return new Response('ok', { headers: CORS_HEADERS });
}

async function handleReq(url: URL, env: Env): Promise<Response> {
  const parsed = parseFilters(url.searchParams.get('filters'));
  if ('error' in parsed) {
    return parsed.error;
  }

  const { filters, json } = parsed;
  const httpTarget = pickHttpTarget(url, env);
  if (httpTarget) {
    try {
      const upstreamUrl = buildReqUrl(httpTarget, json);
      const proxied = await proxyHttpReq(upstreamUrl);
      return proxied;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ ok: false, events: [], message }, 502);
    }
  }

  const wsTarget = pickWsTarget(url, env);
  if (!wsTarget) {
    return jsonResponse({ ok: false, events: [], message: 'no-upstream' }, 502);
  }

  const timeoutMs = parseTimeout(env.RELAY_REQ_TIMEOUT_MS) ?? 2500;
  try {
    const events = await queryViaWebSocket(wsTarget, filters, timeoutMs);
    return jsonResponse({ ok: true, events });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, events: [], message }, 502);
  }
}

function parseFilters(raw: string | null):
  | { filters: unknown[]; json: string }
  | { error: Response } {
  if (!raw || !raw.trim()) {
    return { filters: [], json: '[]' };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return { error: jsonResponse({ ok: false, events: [], message: 'filters must be an array' }, 400) };
    }
    return { filters: parsed, json: JSON.stringify(parsed) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'invalid filters';
    return { error: jsonResponse({ ok: false, events: [], message }, 400) };
  }
}

function pickHttpTarget(url: URL, env: Env): string | undefined {
  const candidates = [
    url.searchParams.get('httpTarget'),
    url.searchParams.get('target'),
    env.RELAY_HTTP_TARGET,
    env.UPSTREAM_RELAY_HTTP,
    env.PROXY_BASE_HTTP,
  ];

  for (const candidate of candidates) {
    if (candidate && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

function pickWsTarget(url: URL, env: Env): string | undefined {
  const candidates = [
    url.searchParams.get('wsTarget'),
    env.RELAY_WS_TARGET,
    env.UPSTREAM_RELAY_WS,
    env.PROXY_BASE_WSS,
  ];

  for (const candidate of candidates) {
    if (candidate && /^wss?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  const host = url.hostname;
  return host ? `wss://${host}` : undefined;
}

function buildReqUrl(target: string, filtersJson: string): URL {
  const upstream = new URL(target);
  if (!/\/req\/?$/i.test(upstream.pathname)) {
    const trimmed = upstream.pathname.replace(/\/?$/, '');
    upstream.pathname = `${trimmed}/req`;
  }
  upstream.searchParams.set('filters', filtersJson);
  return upstream;
}

function buildEventUrl(target: string): URL {
  const upstream = new URL(target);
  if (!/\/event\/?$/i.test(upstream.pathname)) {
    const trimmed = upstream.pathname.replace(/\/?$/, '');
    upstream.pathname = `${trimmed}/event`;
  }
  return upstream;
}

async function proxyHttpReq(upstreamUrl: URL): Promise<Response> {
  const resp = await fetch(upstreamUrl.toString(), {
    headers: {
      Accept: 'application/nostr+json, application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });
  const text = await resp.text();
  let parsed: unknown = [];

  if (text.trim().length) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid upstream response';
      return jsonResponse(
        { ok: false, events: [], message, upstream: text.slice(0, 256) },
        502,
      );
    }
  }

  if (!resp.ok) {
    const message =
      parsed && typeof parsed === 'object' && parsed !== null && 'message' in parsed && typeof (parsed as any).message === 'string'
        ? (parsed as any).message
        : text || `HTTP ${resp.status}`;
    return jsonResponse({ ok: false, events: [], message }, resp.status);
  }

  return jsonResponse(normalizeUpstreamPayload(parsed));
}

async function handleEvent(req: Request, url: URL, env: Env): Promise<Response> {
  const target = pickHttpTarget(url, env);
  if (!target) {
    return jsonResponse({ ok: false, message: 'no-upstream' }, 502);
  }

  const upstreamUrl = buildEventUrl(target);
  const body = await req.arrayBuffer();

  let upstreamResp: Response;
  try {
    upstreamResp = await fetch(upstreamUrl.toString(), {
      method: 'POST',
      body,
      headers: {
        Accept: 'application/json, application/nostr+json',
        'Content-Type': req.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, message }, 502);
  }

  const text = await upstreamResp.text();
  const headers = new Headers({
    ...CORS_HEADERS,
    'Cache-Control': 'no-store',
  });
  const contentType = upstreamResp.headers.get('Content-Type');
  if (contentType) {
    headers.set('Content-Type', contentType);
  } else {
    headers.set('Content-Type', 'application/json');
  }

  return new Response(text, {
    status: upstreamResp.status,
    headers,
  });
}

type NormalizedUpstream = {
  ok: boolean;
  events: unknown[];
  [key: string]: unknown;
};

function normalizeUpstreamPayload(payload: unknown): NormalizedUpstream {
  if (Array.isArray(payload)) {
    return { ok: true, events: payload };
  }

  if (payload && typeof payload === 'object') {
    const copy: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
    const events = Array.isArray(copy.events) ? copy.events : [];
    copy.events = events;
    copy.ok = typeof copy.ok === 'boolean' ? copy.ok : true;
    return copy as NormalizedUpstream;
  }

  return { ok: true, events: [] };
}

async function queryViaWebSocket(target: string, filters: unknown[], timeoutMs: number): Promise<unknown[]> {
  const response = await fetch(target, {
    headers: { Upgrade: 'websocket', Connection: 'Upgrade' },
  });
  const upstream = (response as any).webSocket as WebSocket | undefined;
  if (!upstream) {
    throw new Error('failed to establish upstream websocket');
  }

  upstream.accept();

  return await new Promise<unknown[]>((resolve, reject) => {
    const events: unknown[] = [];
    const randomUuid =
      (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID;
    const subId =
      typeof randomUuid === 'function' ? randomUuid() : Math.random().toString(36).slice(2);
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (error?: unknown) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      upstream.removeEventListener('message', onMessage as any);
      upstream.removeEventListener('close', onClose as any);
      upstream.removeEventListener('error', onError as any);
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      } else {
        resolve(events);
      }
    };

    const finalize = () => {
      try {
        upstream.send(JSON.stringify(['CLOSE', subId]));
      } catch {
        // ignore
      }
      try {
        upstream.close(1000, 'done');
      } catch {
        // ignore
      }
      cleanup();
    };

    const onMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : JSON.parse(String(event.data));
        if (!Array.isArray(data)) return;
        const [type, id, payload] = data;
        if (id !== subId) return;
        if (type === 'EVENT') {
          events.push(payload);
        } else if (type === 'EOSE') {
          finalize();
        }
      } catch {
        // ignore malformed frames
      }
    };

    const onClose = () => cleanup();
    const onError = (error: Event | ErrorEvent) => {
      const message =
        error instanceof ErrorEvent && error.message
          ? error.message
          : 'upstream websocket error';
      cleanup(new Error(message));
    };

    upstream.addEventListener('message', onMessage as any);
    upstream.addEventListener('close', onClose as any);
    upstream.addEventListener('error', onError as any);

    timer = setTimeout(() => {
      cleanup();
      try {
        upstream.close(1000, 'timeout');
      } catch {
        // ignore
      }
    }, Math.max(250, timeoutMs));

    try {
      upstream.send(JSON.stringify(['REQ', subId, ...filters]));
    } catch (err) {
      cleanup(err);
    }
  });
}

function parseTimeout(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
