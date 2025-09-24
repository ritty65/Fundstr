import { nip19 } from 'nostr-tools';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';
import { fundstrRelayClient } from 'src/nutzap/relayClient';
import type { Tier } from 'src/nutzap/types';
import {
  NUTZAP_RELAY_WSS,
  NUTZAP_RELAY_HTTP,
  NUTZAP_WS_TIMEOUT_MS,
  NUTZAP_HTTP_TIMEOUT_MS,
} from 'src/nutzap/relayConfig';

const DEFAULT_WS_TIMEOUT_MS = 3000;
const DEFAULT_HTTP_TIMEOUT_MS = 5000;

function stripTrailingSlashes(input: string): string {
  return input.replace(/\/+$/, '');
}

function joinRelayPath(base: string, path: string): string {
  const normalizedBase = stripTrailingSlashes(base || '');
  const normalizedPath = path.replace(/^\/+/, '');
  if (!normalizedBase) {
    return `/${normalizedPath}`;
  }
  return `${normalizedBase}/${normalizedPath}`;
}

function toPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const parsed = typeof value === 'string' ? Number(value) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}

export const FUNDSTR_WS_URL = NUTZAP_RELAY_WSS;
const FUNDSTR_HTTP_BASE = stripTrailingSlashes(NUTZAP_RELAY_HTTP);
export const FUNDSTR_REQ_URL = joinRelayPath(FUNDSTR_HTTP_BASE, 'req');
export const FUNDSTR_EVT_URL = joinRelayPath(FUNDSTR_HTTP_BASE, 'event');
export const WS_FIRST_TIMEOUT_MS = toPositiveNumber(
  NUTZAP_WS_TIMEOUT_MS,
  DEFAULT_WS_TIMEOUT_MS,
);
const HTTP_FALLBACK_TIMEOUT_MS = toPositiveNumber(
  NUTZAP_HTTP_TIMEOUT_MS,
  DEFAULT_HTTP_TIMEOUT_MS,
);

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const HEX_128_REGEX = /^[0-9a-f]{128}$/i;

function createAbortSignal(timeoutMs: number): {
  signal: AbortSignal | undefined;
  dispose: () => void;
} {
  if (typeof AbortController === 'undefined' || timeoutMs <= 0) {
    return { signal: undefined, dispose: () => {} };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
    },
  };
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    return false;
  }
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError';
}

type RawTier = {
  id?: string;
  title?: string;
  price?: number | string;
  price_sats?: number | string;
  frequency?: Tier['frequency'];
  description?: string;
  media?: Array<string | { type?: string; url?: string }>;
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

export type NostrFilter = {
  kinds: number[];
  authors: string[];
  '#d'?: string[];
  limit?: number;
};

export function normalizeAuthor(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Author is required.');
  }

  if (HEX_64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (trimmed.toLowerCase().startsWith('npub')) {
    try {
      const decoded = nip19.decode(trimmed);
      if (decoded.type !== 'npub') {
        throw new Error('Only npub identifiers are supported.');
      }
      const data = decoded.data;
      let hex: string;
      if (typeof data === 'string') {
        hex = data;
      } else if (data instanceof Uint8Array) {
        hex = Array.from(data)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      } else {
        throw new Error('Invalid npub payload.');
      }
      if (!HEX_64_REGEX.test(hex)) {
        throw new Error('Invalid npub payload.');
      }
      return hex.toLowerCase();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Invalid npub');
    }
  }

  throw new Error('Author must be a 64-character hex pubkey or npub.');
}

export function isNostrEvent(e: any): e is NostrEvent {
  if (!e || typeof e !== 'object') return false;
  const { id, pubkey, created_at, kind, tags, content, sig } = e as Partial<NostrEvent>;
  if (!HEX_64_REGEX.test(id ?? '')) return false;
  if (!HEX_64_REGEX.test(pubkey ?? '')) return false;
  if (typeof created_at !== 'number' || !Number.isFinite(created_at)) return false;
  if (typeof kind !== 'number' || !Number.isInteger(kind)) return false;
  if (!Array.isArray(tags)) return false;
  if (typeof content !== 'string') return false;
  if (!HEX_128_REGEX.test(sig ?? '')) return false;
  return true;
}

function selectLatestByKey(events: any[], keyFn: (event: any) => string): any | null {
  const map = new Map<string, any>();
  for (const event of events ?? []) {
    if (!event || typeof event !== 'object') continue;
    const kind = (event as any).kind;
    const pubkey = (event as any).pubkey;
    if (typeof kind !== 'number' || typeof pubkey !== 'string') continue;
    const key = keyFn(event);
    if (!key) continue;
    const current = map.get(key);
    if (!current || ((event as any).created_at ?? 0) > ((current as any).created_at ?? 0)) {
      map.set(key, event);
    }
  }

  const latest = Array.from(map.values()).sort(
    (a, b) => ((b as any).created_at ?? 0) - ((a as any).created_at ?? 0)
  );
  return latest[0] ?? null;
}

export function pickLatestReplaceable(events: any[]): any {
  return selectLatestByKey(events, event => {
    const kind = (event as any).kind;
    const pubkey = String((event as any).pubkey ?? '').toLowerCase();
    return typeof kind === 'number' && pubkey ? `${kind}:${pubkey}` : '';
  });
}

export function pickLatestParamReplaceable(events: any[]): any {
  return selectLatestByKey(events, event => {
    const kind = (event as any).kind;
    const pubkey = String((event as any).pubkey ?? '').toLowerCase();
    const tags = Array.isArray((event as any).tags) ? (event as any).tags : [];
    const dTag = tags.find(tag => Array.isArray(tag) && tag[0] === 'd');
    const dValue = typeof dTag?.[1] === 'string' ? dTag[1] : '';
    return typeof kind === 'number' && pubkey ? `${kind}:${pubkey}:${dValue}` : '';
  });
}

function serializeMinimal(tiers: Tier[]) {
  return tiers.map(tier => {
    const media = Array.isArray(tier.media)
      ? tier.media
          .map(entry => (typeof entry?.url === 'string' ? entry.url : ''))
          .filter(url => !!url)
      : undefined;

    const numericPrice = Number(tier.price);
    const price = Number.isFinite(numericPrice) ? Math.round(numericPrice) : 0;

    return {
      id: tier.id,
      title: tier.title,
      price,
      frequency: tier.frequency,
      ...(tier.description ? { description: tier.description } : {}),
      ...(media && media.length ? { media } : {}),
    };
  });
}

function normalizeRawTier(raw: RawTier): Tier | null {
  if (!raw) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '';
  const title = typeof raw.title === 'string' ? raw.title : '';
  const priceSource = raw.price ?? raw.price_sats ?? 0;
  const price = Number(priceSource);
  const frequency: Tier['frequency'] = ['one_time', 'monthly', 'yearly'].includes(
    raw.frequency as Tier['frequency']
  )
    ? (raw.frequency as Tier['frequency'])
    : 'monthly';
  const description = typeof raw.description === 'string' && raw.description ? raw.description : undefined;
  let media: Tier['media'];
  if (Array.isArray(raw.media)) {
    const normalized = raw.media
      .map(entry => {
        if (!entry) return null;
        if (typeof entry === 'string') {
          return { type: 'link', url: entry };
        }
        const url = typeof entry.url === 'string' ? entry.url : '';
        if (!url) return null;
        const type = typeof entry.type === 'string' ? entry.type : 'link';
        return { type, url };
      })
      .filter((item): item is { type: string; url: string } => !!item && !!item.url);
    media = normalized.length ? normalized : undefined;
  }

  const globalCrypto = (globalThis as any)?.crypto;
  return {
    id: id || globalCrypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    title,
    price: Number.isFinite(price) ? price : 0,
    frequency,
    description,
    media,
  };
}

export async function fundstrFirstQuery(
  filters: NostrFilter[],
  wsTimeoutMs = WS_FIRST_TIMEOUT_MS
): Promise<any[]> {
  const results: any[] = [];
  const relay = fundstrRelayClient;

  if (relay.isSupported) {
    try {
      const eventsFromWs = await new Promise<any[]>((resolve, reject) => {
        const collected: any[] = [];
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let subId: string | undefined;

        const finalize = (value: any[], error?: unknown) => {
          if (settled) return;
          settled = true;
          if (timer) {
            clearTimeout(timer);
            timer = undefined;
          }
          if (subId) {
            relay.unsubscribe(subId);
          }
          if (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } else {
            resolve(value);
          }
        };

        const onEvent = (event: any) => {
          collected.push(event);
        };
        const onEose = () => finalize(collected);
        try {
          subId = relay.subscribe(filters, onEvent, onEose);
        } catch (err) {
          finalize([], err);
          return;
        }
        timer = setTimeout(() => finalize(collected), wsTimeoutMs);
      });

      if (Array.isArray(eventsFromWs) && eventsFromWs.length) {
        results.push(...eventsFromWs);
      }
    } catch (err) {
      console.warn('[nutzap] WS query failed', err);
    }
  }

  if (!results.length) {
    const url = new URL(FUNDSTR_REQ_URL);
    url.searchParams.set('filters', JSON.stringify(filters));
    const { signal, dispose } = createAbortSignal(HTTP_FALLBACK_TIMEOUT_MS);
    let bodyText = '';
    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/nostr+json, application/json;q=0.9, */*;q=0.1',
        },
        cache: 'no-store',
        signal,
      });
      bodyText = await response.text();
      const normalizeSnippet = (input: string) =>
        input
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200);

      if (!response.ok) {
        const snippet = normalizeSnippet(bodyText) || '[empty response body]';
        const baseMessage = `HTTP query failed with status ${response.status}`;
        throw new Error(`${baseMessage}: ${snippet}`);
      }

      const contentType = response.headers.get('content-type') || '';
      const normalizedType = contentType.toLowerCase();
      const isJson =
        normalizedType.includes('application/json') ||
        normalizedType.includes('application/nostr+json');
      if (!isJson) {
        const snippet = normalizeSnippet(bodyText) || '[empty response body]';
        const typeLabel = contentType || 'unknown content-type';
        throw new Error(`Unexpected response (${response.status}, ${typeLabel}): ${snippet}`);
      }

      let data: any;
      try {
        data = JSON.parse(bodyText);
      } catch (err) {
        const snippet = normalizeSnippet(bodyText) || '[empty response body]';
        const message = `HTTP ${response.status} returned invalid JSON: ${snippet}`;
        throw new Error(message, { cause: err });
      }
      if (Array.isArray(data)) {
        results.push(...data);
      } else if (Array.isArray(data?.events)) {
        results.push(...data.events);
      }
    } catch (err) {
      if (isAbortError(err)) {
        throw new Error(`HTTP fallback timed out after ${HTTP_FALLBACK_TIMEOUT_MS}ms`);
      }
      throw err instanceof Error ? err : new Error(String(err));
    } finally {
      dispose();
    }
  }

  return results;
}

export async function publishNostrEvent(template: {
  kind: number;
  tags: any[];
  content: string;
  created_at?: number;
}) {
  const created_at = template.created_at ?? Math.floor(Date.now() / 1000);
  let signed: unknown;

  if (typeof window !== 'undefined' && window.nostr?.signEvent) {
    signed = await window.nostr.signEvent({ ...template, created_at });
  } else {
    const ndk = getNutzapNdk();
    const event = new NDKEvent(ndk, { ...template, created_at });
    await event.sign();
    signed = await event.toNostrEvent();
  }

  if (!isNostrEvent(signed)) {
    throw new Error('Signing failed — invalid NIP-01 event');
  }

  const { signal, dispose } = createAbortSignal(HTTP_FALLBACK_TIMEOUT_MS);
  let ack: any = null;
  let response: Response | undefined;
  let bodyText = '';
  try {
    response = await fetch(FUNDSTR_EVT_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        Accept: 'application/json, application/nostr+json;q=0.9, */*;q=0.1',
      },
      body: JSON.stringify(signed),
      cache: 'no-store',
      signal,
    });
    bodyText = await response.text();
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(`Publish request timed out after ${HTTP_FALLBACK_TIMEOUT_MS}ms`);
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    dispose();
  }

  if (!response) {
    throw new Error('Relay publish failed: no response received');
  }

  if (!response.ok) {
    const snippet = bodyText.replace(/\s+/g, ' ').trim().slice(0, 200) || '[empty response body]';
    throw new Error(`Relay rejected with status ${response.status}: ${snippet}`);
  }

  if (bodyText) {
    try {
      ack = JSON.parse(bodyText);
    } catch (err) {
      throw new Error('Relay returned invalid JSON', { cause: err });
    }
  }

  if (!ack || ack.accepted !== true) {
    const message = typeof ack?.message === 'string' ? ack.message : 'Relay rejected event';
    throw new Error(message);
  }

  return { ack, event: signed };
}

export async function publishTiers(tiers: Tier[], kind: 30019 | 30000) {
  const tags = [
    ['d', 'tiers'],
    ['t', 'nutzap-tiers'],
    ['client', 'fundstr'],
  ];
  const content = JSON.stringify({ v: 1, tiers: serializeMinimal(tiers) });
  return publishNostrEvent({ kind, tags, content });
}

export function parseTiersContent(content: string | undefined): Tier[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { tiers?: RawTier[] } | RawTier[];
    const rawTiers = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.tiers)
        ? parsed.tiers
        : [];
    return rawTiers
      .map(normalizeRawTier)
      .filter((tier): tier is Tier => !!tier && !!tier.title);
  } catch (err) {
    console.warn('[nutzap] failed to parse tiers content', err);
    return [];
  }
}
