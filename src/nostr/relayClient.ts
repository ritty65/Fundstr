export type Filter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [key: `#${string}`]: string[] | number[] | undefined;
};

export type NostrEvent = {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
};

type QueryOptions = {
  preferFundstr?: boolean;
  fanout?: string[];
  wsTimeoutMs?: number;
  httpBase?: string;
};

type RequiredQueryOptions = Required<
  Pick<QueryOptions, "wsTimeoutMs" | "httpBase"> & {
    fanout: string[];
    preferFundstr: boolean;
  }
>;

const FUNDSTR = {
  ws: "wss://relay.fundstr.me",
  http: "https://relay.fundstr.me",
};

const PUBLIC_POOL = [
  "wss://relay.primal.net",
  "wss://relay.f7z.io",
  "wss://nos.lol",
  "wss://relay.damus.io",
];

function isReplaceableKind(kind: number) {
  return kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000);
}

function isParameterizedReplaceable(kind: number) {
  return kind >= 30000 && kind < 40000;
}

function firstDTag(event: NostrEvent): string | undefined {
  for (const tag of event.tags || []) {
    if (tag[0] === "d" && typeof tag[1] === "string") {
      return tag[1];
    }
  }
  return undefined;
}

export function dedup(events: readonly NostrEvent[]): NostrEvent[] {
  const seen = new Set<string>();
  const out: NostrEvent[] = [];
  for (const ev of events) {
    if (!seen.has(ev.id)) {
      seen.add(ev.id);
      out.push(ev);
    }
  }
  return out;
}

export function pickLatestReplaceable(
  events: readonly NostrEvent[],
  key: { kind: number; pubkey: string },
): NostrEvent | null {
  return (
    events
      .filter((ev) => ev.kind === key.kind && ev.pubkey === key.pubkey)
      .sort((a, b) => b.created_at - a.created_at)[0] || null
  );
}

export function pickLatestAddrReplaceable(
  events: readonly NostrEvent[],
  key: { kind: number; pubkey: string; d: string },
): NostrEvent | null {
  return (
    events
      .filter(
        (ev) =>
          ev.kind === key.kind &&
          ev.pubkey === key.pubkey &&
          firstDTag(ev) === key.d,
      )
      .sort((a, b) => b.created_at - a.created_at)[0] || null
  );
}

export function normalizeEvents(events: readonly NostrEvent[]): NostrEvent[] {
  const deduped = dedup(events);
  const replaceable = new Map<string, NostrEvent>();
  const parameterized = new Map<string, NostrEvent>();
  const others: NostrEvent[] = [];

  for (const ev of deduped) {
    if (isParameterizedReplaceable(ev.kind)) {
      const d = firstDTag(ev) ?? ev.id;
      const key = `${ev.kind}:${ev.pubkey}:${d}`;
      const prev = parameterized.get(key);
      if (!prev || ev.created_at >= prev.created_at) {
        parameterized.set(key, ev);
      }
      continue;
    }
    if (isReplaceableKind(ev.kind)) {
      const key = `${ev.kind}:${ev.pubkey}`;
      const prev = replaceable.get(key);
      if (!prev || ev.created_at >= prev.created_at) {
        replaceable.set(key, ev);
      }
      continue;
    }
    others.push(ev);
  }

  const merged = [
    ...others,
    ...Array.from(replaceable.values()),
    ...Array.from(parameterized.values()),
  ];
  return merged.sort((a, b) => b.created_at - a.created_at || (b.id > a.id ? 1 : -1));
}

function uniqueUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (!raw) continue;
    const trimmed = raw.replace(/\s+/g, "").replace(/\/+$/, "");
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

async function wsQuery(
  wsUrl: string,
  filters: Filter[],
  timeoutMs: number,
): Promise<NostrEvent[]> {
  const WS = (globalThis as any).WebSocket as typeof WebSocket | undefined;
  if (!WS) {
    throw new Error("websocket-unavailable");
  }

  return new Promise<NostrEvent[]>((resolve, reject) => {
    let settled = false;
    const events: NostrEvent[] = [];
    const subId = `fundstr-${Math.random().toString(36).slice(2, 14)}`;
    let ws: WebSocket | null = null;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (ws && (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING)) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(events);
    };

    const timer = setTimeout(() => {
      done(new Error("ws-timeout"));
    }, timeoutMs);

    try {
      ws = new WS(wsUrl);
    } catch (e) {
      done(e instanceof Error ? e : new Error(String(e)));
      return;
    }

    ws.onopen = () => {
      try {
        ws?.send(JSON.stringify(["REQ", subId, ...filters]));
      } catch (e) {
        done(e instanceof Error ? e : new Error(String(e)));
      }
    };

    ws.onmessage = (evt: MessageEvent) => {
      if (settled) return;
      const data = typeof evt.data === "string" ? evt.data : null;
      if (!data) return;
      let payload: any;
      try {
        payload = JSON.parse(data);
      } catch {
        return;
      }
      if (!Array.isArray(payload) || payload.length === 0) return;
      const [type, sub, rest] = payload;
      if (typeof sub === "string" && sub !== subId) return;
      if (type === "EVENT" && rest && typeof rest === "object") {
        events.push(rest as NostrEvent);
      } else if (type === "EOSE") {
        done();
      }
    };

    ws.onerror = () => {
      done(new Error("ws-error"));
    };

    ws.onclose = () => {
      done();
    };
  });
}

async function httpReq(httpBase: string, filters: Filter[]): Promise<NostrEvent[]> {
  const url = `${httpBase}/req?filters=${encodeURIComponent(JSON.stringify(filters))}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP /req failed: ${res.status}`);
  }
  const body = await res.json().catch(() => null);
  if (Array.isArray(body)) {
    return body as NostrEvent[];
  }
  if (body && Array.isArray((body as any).events)) {
    return (body as any).events as NostrEvent[];
  }
  return [];
}

async function tryWsFirstThenHttp(
  filters: Filter[],
  wsUrl: string,
  httpBase: string,
  timeoutMs: number,
): Promise<NostrEvent[]> {
  try {
    const wsEvents = await wsQuery(wsUrl, filters, timeoutMs);
    if (wsEvents.length) return wsEvents;
  } catch (e) {
    // swallow and try HTTP
    void e;
  }
  try {
    return await httpReq(httpBase, filters);
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e));
  }
}

async function queryWsPool(
  urls: string[],
  filters: Filter[],
  timeoutMs: number,
  concurrency = 2,
): Promise<NostrEvent[]> {
  const unique = uniqueUrls(urls).filter((url) => !!url && url !== FUNDSTR.ws);
  if (!unique.length) return [];

  const results: NostrEvent[] = [];
  let index = 0;

  const worker = async () => {
    while (index < unique.length) {
      const current = index++;
      const url = unique[current];
      try {
        const events = await wsQuery(url, filters, timeoutMs);
        results.push(...events);
      } catch {
        // ignore relay failure
      }
    }
  };

  const tasks: Promise<void>[] = [];
  const workerCount = Math.min(concurrency, unique.length);
  for (let i = 0; i < workerCount; i += 1) {
    tasks.push(worker());
  }
  await Promise.all(tasks);
  return results;
}

export async function queryNostr(
  filters: Filter[],
  opts: QueryOptions = {},
): Promise<NostrEvent[]> {
  const options: RequiredQueryOptions = {
    preferFundstr: opts.preferFundstr ?? false,
    fanout: uniqueUrls(opts.fanout ?? []),
    wsTimeoutMs: opts.wsTimeoutMs ?? 8000,
    httpBase: opts.httpBase ?? FUNDSTR.http,
  };

  const collected: NostrEvent[] = [];

  if (options.preferFundstr) {
    try {
      const fundstrEvents = await tryWsFirstThenHttp(
        filters,
        FUNDSTR.ws,
        FUNDSTR.http,
        options.wsTimeoutMs,
      );
      collected.push(...fundstrEvents);
      if (!fundstrEvents.length) {
        const more = await queryWsPool(
          [...options.fanout, ...PUBLIC_POOL],
          filters,
          options.wsTimeoutMs,
        );
        collected.push(...more);
      }
    } catch (e) {
      const more = await queryWsPool(
        [...options.fanout, ...PUBLIC_POOL],
        filters,
        options.wsTimeoutMs,
      );
      collected.push(...more);
    }
  } else {
    const pool = await queryWsPool(
      [...options.fanout, ...PUBLIC_POOL],
      filters,
      options.wsTimeoutMs,
    );
    collected.push(...pool);
    if (!collected.length) {
      try {
        const fallback = await tryWsFirstThenHttp(
          filters,
          FUNDSTR.ws,
          options.httpBase,
          options.wsTimeoutMs,
        );
        collected.push(...fallback);
      } catch {
        // ignore final failure
      }
    }
  }

  return normalizeEvents(collected);
}

export async function publishNostr(
  evt: NostrEvent,
): Promise<{
  ok: boolean;
  id?: string;
  accepted?: boolean;
  message?: string;
}> {
  const res = await fetch(`${FUNDSTR.http}/event`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      pragma: "no-cache",
    },
    cache: "no-store",
    body: JSON.stringify(evt),
  });

  const json = await res.json().catch(async () => {
    const text = await res.text().catch(() => "");
    return { ok: res.ok, message: text || `HTTP ${res.status}` };
  });

  if (!res.ok) {
    return {
      ok: false,
      message:
        (json && typeof json.message === "string")
          ? json.message
          : `HTTP ${res.status}`,
    };
  }

  return json;
}

export async function queryNutzapProfile(
  pubkey: string,
  opts: { fanout?: string[] } = {},
): Promise<NostrEvent | null> {
  const filters: Filter[] = [
    { kinds: [10019], authors: [pubkey], limit: 1 },
  ];
  const events = await queryNostr(filters, {
    preferFundstr: true,
    fanout: opts.fanout,
  });
  return pickLatestReplaceable(events, { kind: 10019, pubkey });
}

export async function queryNutzapTiers(
  pubkey: string,
  opts: { fanout?: string[] } = {},
): Promise<NostrEvent | null> {
  const filters: Filter[] = [
    { kinds: [30019], authors: [pubkey], ["#d"]: ["tiers"], limit: 1 },
  ];
  const events = await queryNostr(filters, {
    preferFundstr: true,
    fanout: opts.fanout,
  });
  return pickLatestAddrReplaceable(events, {
    kind: 30019,
    pubkey,
    d: "tiers",
  });
}

export { FUNDSTR, PUBLIC_POOL };
