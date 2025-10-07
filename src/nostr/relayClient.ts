import { nip19 } from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils";
import {
  FUNDSTR_PRIMARY_RELAY,
  FUNDSTR_PRIMARY_RELAY_HTTP,
} from "src/config/relays";
import type { NostrEvent } from "./eventUtils";
export type { NostrEvent } from "./eventUtils";

export type Filter = {
  ids?: string[];
  authors?: string[];
  kinds?: number[];
  since?: number;
  until?: number;
  limit?: number;
  [key: `#${string}`]: string[] | number[] | undefined;
};

export type QueryOptions = {
  preferFundstr?: boolean;
  fanout?: string[];
  wsTimeoutMs?: number;
  httpBase?: string;
  fundstrWsUrl?: string;
  /**
   * When `preferFundstr` is true, opt into querying the fan-out pool when
   * Fundstr returns no data or errors. Defaults to `false` so Nutzap flows stay
   * pinned to the first-party relay unless explicitly requested.
   */
  allowFanoutFallback?: boolean;
};

type RequiredQueryOptions = Required<
  Pick<
    QueryOptions,
    "wsTimeoutMs" | "httpBase" | "allowFanoutFallback" | "fundstrWsUrl"
  > & {
    fanout: string[];
    preferFundstr: boolean;
  }
>;

const FUNDSTR = {
  ws: FUNDSTR_PRIMARY_RELAY,
  http: FUNDSTR_PRIMARY_RELAY_HTTP,
};

const PUBLIC_POOL = [
  FUNDSTR_PRIMARY_RELAY,
  "wss://relay.snort.social",
  "wss://nos.lol",
  "wss://relay.damus.io",
];

const HEX_REGEX = /^[0-9a-fA-F]{64}$/;

export function toHex(pubOrNpub: string): string {
  const trimmed = pubOrNpub.trim();
  if (!trimmed) {
    throw new Error("Empty pubkey");
  }

  if (HEX_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  try {
    const decoded = nip19.decode(trimmed);
    const data = decoded.data;
    if (typeof data === "string" && HEX_REGEX.test(data)) {
      return data.toLowerCase();
    }
    if (
      typeof data === "object" &&
      data !== null &&
      "pubkey" in data &&
      typeof (data as { pubkey?: unknown }).pubkey === "string"
    ) {
      const pk = (data as { pubkey: string }).pubkey;
      if (HEX_REGEX.test(pk)) {
        return pk.toLowerCase();
      }
    }
    if (data instanceof Uint8Array) {
      const hex = bytesToHex(data);
      if (HEX_REGEX.test(hex)) {
        return hex.toLowerCase();
      }
    }
  } catch (err) {
    void err;
  }

  throw new Error("Invalid npub or hex pubkey");
}

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
  key: { kind: number | number[]; pubkey: string; d: string },
): NostrEvent | null {
  const kinds = Array.isArray(key.kind) ? key.kind : [key.kind];
  return (
    events
      .filter(
        (ev) =>
          kinds.includes(ev.kind) &&
          ev.pubkey === key.pubkey &&
          firstDTag(ev) === key.d,
      )
      .sort((a, b) => b.created_at - a.created_at || (b.id > a.id ? 1 : -1))[0] || null
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

function buildReqUrl(httpBase: string): string {
  const trimmed = (httpBase || "").trim();
  const normalized = trimmed.replace(/\/+$/, "");
  if (!normalized) {
    return "/req";
  }
  if (normalized.toLowerCase().endsWith("/req")) {
    return normalized;
  }
  return `${normalized}/req`;
}

function buildEventUrl(httpBase: string): string {
  const trimmed = (httpBase || "").trim();
  const normalized = trimmed.replace(/\/+$/, "");
  if (!normalized) {
    return "/event";
  }
  if (normalized.toLowerCase().endsWith("/event")) {
    return normalized;
  }
  return `${normalized}/event`;
}

async function httpReq(httpBase: string, filters: Filter[]): Promise<NostrEvent[]> {
  const reqUrl = buildReqUrl(httpBase);
  const url = `${reqUrl}?filters=${encodeURIComponent(JSON.stringify(filters))}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
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

type WsPoolOptions = {
  concurrency?: number;
  excludeUrl?: string;
};

async function queryWsPool(
  urls: string[],
  filters: Filter[],
  timeoutMs: number,
  { concurrency = 2, excludeUrl = FUNDSTR.ws }: WsPoolOptions = {},
): Promise<NostrEvent[]> {
  const unique = uniqueUrls(urls).filter((url) => !!url && url !== excludeUrl);
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
  const normalizedFilters = filters.map((filter) => {
    const copy: Filter = { ...filter };
    if (filter.authors) {
      const normalizedAuthors: string[] = [];
      for (const author of filter.authors) {
        if (!author) continue;
        try {
          normalizedAuthors.push(toHex(author));
        } catch (err) {
          if (HEX_REGEX.test(author)) {
            normalizedAuthors.push(author.toLowerCase());
          } else {
            throw err instanceof Error ? err : new Error(String(err));
          }
        }
      }
      if (normalizedAuthors.length) {
        copy.authors = normalizedAuthors;
      } else {
        delete copy.authors;
      }
    }
    return copy;
  });

  const options: RequiredQueryOptions = {
    preferFundstr: opts.preferFundstr ?? true,
    fanout: uniqueUrls(opts.fanout ?? []),
    wsTimeoutMs: opts.wsTimeoutMs ?? 1500, // 1.5s Fundstr-first deadline
    httpBase: opts.httpBase ?? FUNDSTR.http,
    fundstrWsUrl: opts.fundstrWsUrl ?? FUNDSTR.ws,
    allowFanoutFallback: opts.allowFanoutFallback ?? false,
  };

  const collected: NostrEvent[] = [];

  if (options.preferFundstr) {
    let fundstrEvents: NostrEvent[] = [];
    try {
      fundstrEvents = await tryWsFirstThenHttp(
        normalizedFilters,
        options.fundstrWsUrl,
        options.httpBase,
        options.wsTimeoutMs,
      );
      collected.push(...fundstrEvents);
      if (!fundstrEvents.length && options.allowFanoutFallback) {
        const more = await queryWsPool(
          [...options.fanout, ...PUBLIC_POOL],
          normalizedFilters,
          options.wsTimeoutMs,
          { excludeUrl: options.fundstrWsUrl },
        );
        collected.push(...more);
      }
    } catch (e) {
      if (!options.allowFanoutFallback) {
        throw e instanceof Error ? e : new Error(String(e));
      }
      const more = await queryWsPool(
        [...options.fanout, ...PUBLIC_POOL],
        normalizedFilters,
        options.wsTimeoutMs,
        { excludeUrl: options.fundstrWsUrl },
      );
      collected.push(...more);
    }
  } else {
    const pool = await queryWsPool(
      [...options.fanout, ...PUBLIC_POOL],
      normalizedFilters,
      options.wsTimeoutMs,
      { excludeUrl: options.fundstrWsUrl },
    );
    collected.push(...pool);
  }

  return normalizeEvents(collected);
}

type PublishOptions = {
  httpBase?: string;
  fundstrWsUrl?: string;
};

export async function publishNostr(
  evt: NostrEvent,
  opts: PublishOptions = {},
): Promise<{
  ok: boolean;
  id?: string;
  accepted?: boolean;
  message?: string;
}> {
  const valid =
    evt &&
    typeof evt.id === "string" &&
    typeof evt.pubkey === "string" &&
    typeof evt.created_at === "number" &&
    typeof evt.kind === "number" &&
    Array.isArray(evt.tags) &&
    typeof evt.content === "string" &&
    typeof evt.sig === "string";
  if (!valid) {
    return { ok: true, accepted: false, message: "client: bad event (missing fields)" };
  }
  const eventUrl = buildEventUrl(opts.httpBase ?? FUNDSTR.http);
  const res = await fetch(eventUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
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

type NutzapQueryOptions = {
  fanout?: string[];
  allowFanoutFallback?: boolean;
  httpBase?: string;
  fundstrWsUrl?: string;
  wsTimeoutMs?: number;
};

export async function queryNutzapProfile(
  pubkeyInput: string,
  opts: NutzapQueryOptions = {},
): Promise<NostrEvent | null> {
  const pubkey = toHex(pubkeyInput);
  const filters: Filter[] = [
    { kinds: [10019], authors: [pubkey], limit: 1 },
  ];
  const queryOptions: QueryOptions = {
    preferFundstr: true,
    fanout: opts.fanout,
  };
  if (opts.httpBase) {
    queryOptions.httpBase = opts.httpBase;
  }
  if (opts.fundstrWsUrl) {
    queryOptions.fundstrWsUrl = opts.fundstrWsUrl;
  }
  if (typeof opts.wsTimeoutMs === "number") {
    queryOptions.wsTimeoutMs = opts.wsTimeoutMs;
  }
  if (opts.allowFanoutFallback) {
    queryOptions.allowFanoutFallback = true;
  }
  const events = await queryNostr(filters, queryOptions);
  return pickLatestReplaceable(events, { kind: 10019, pubkey });
}

export async function queryNutzapTiers(
  pubkeyInput: string,
  opts: NutzapQueryOptions = {},
): Promise<NostrEvent | null> {
  const pubkey = toHex(pubkeyInput);
  const filters: Filter[] = [
    {
      kinds: [30019, 30000],
      authors: [pubkey],
      ["#d"]: ["tiers"],
      limit: 2,
    },
  ];
  const queryOptions: QueryOptions = {
    preferFundstr: true,
    fanout: opts.fanout,
  };
  if (opts.httpBase) {
    queryOptions.httpBase = opts.httpBase;
  }
  if (opts.fundstrWsUrl) {
    queryOptions.fundstrWsUrl = opts.fundstrWsUrl;
  }
  if (typeof opts.wsTimeoutMs === "number") {
    queryOptions.wsTimeoutMs = opts.wsTimeoutMs;
  }
  if (opts.allowFanoutFallback) {
    queryOptions.allowFanoutFallback = true;
  }
  const events = await queryNostr(filters, queryOptions);
  return pickLatestAddrReplaceable(events, {
    kind: [30019, 30000],
    pubkey,
    d: "tiers",
  });
}

export { FUNDSTR, PUBLIC_POOL };
