import { nip19 } from 'nostr-tools';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';

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

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const HEX_128_REGEX = /^[0-9a-f]{128}$/i;

export function normalizeAuthor(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Author must be a string.');
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Author is required.');
  }
  if (HEX_64_REGEX.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  if (/^npub[0-9a-z]+$/i.test(trimmed)) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== 'npub' || typeof decoded.data !== 'string') {
      throw new Error('Invalid npub.');
    }
    if (!HEX_64_REGEX.test(decoded.data)) {
      throw new Error('npub does not decode to 64-hex.');
    }
    return decoded.data.toLowerCase();
  }
  throw new Error('Author must be npub or 64-hex.');
}

export function isNostrEvent(e: any): e is NostrEvent {
  if (!e || typeof e !== 'object') return false;
  if (typeof e.id !== 'string' || !HEX_64_REGEX.test(e.id)) return false;
  if (typeof e.pubkey !== 'string' || !HEX_64_REGEX.test(e.pubkey)) return false;
  if (typeof e.created_at !== 'number' || !Number.isInteger(e.created_at)) return false;
  if (typeof e.kind !== 'number' || !Number.isInteger(e.kind)) return false;
  if (!Array.isArray(e.tags)) return false;
  if (typeof e.content !== 'string') return false;
  if (typeof e.sig !== 'string' || !HEX_128_REGEX.test(e.sig)) return false;
  return true;
}

function extractDTag(event: any): string | undefined {
  if (!event || !Array.isArray(event.tags)) return undefined;
  for (const tag of event.tags) {
    if (Array.isArray(tag) && tag[0] === 'd' && typeof tag[1] === 'string') {
      return tag[1];
    }
  }
  return undefined;
}

export function pickLatestReplaceable(events: any[]): any | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  const latestByKey = new Map<string, any>();
  for (const event of events) {
    if (!event || typeof event.kind !== 'number' || typeof event.pubkey !== 'string') continue;
    const key = `${event.kind}:${event.pubkey}`;
    const current = latestByKey.get(key);
    if (!current || (event.created_at ?? 0) > (current.created_at ?? 0)) {
      latestByKey.set(key, event);
    }
  }
  const candidates = Array.from(latestByKey.values());
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  return candidates[0] ?? null;
}

export function pickLatestParamReplaceable(events: any[]): any | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  const latestByKey = new Map<string, any>();
  for (const event of events) {
    if (!event || typeof event.kind !== 'number' || typeof event.pubkey !== 'string') continue;
    const d = extractDTag(event);
    if (!d) continue;
    const key = `${event.kind}:${event.pubkey}:${d}`;
    const current = latestByKey.get(key);
    if (!current || (event.created_at ?? 0) > (current.created_at ?? 0)) {
      latestByKey.set(key, event);
    }
  }
  const candidates = Array.from(latestByKey.values());
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
  return candidates[0] ?? null;
}

export async function fundstrFirstQuery(filters: NostrFilter[], wsTimeoutMs = 1500): Promise<any[]> {
  const wsEvents = await queryViaWebSocket(filters, wsTimeoutMs);
  if (wsEvents.length > 0) {
    return wsEvents;
  }
  return queryViaHttp(filters);
}

async function queryViaWebSocket(filters: NostrFilter[], wsTimeoutMs: number): Promise<any[]> {
  if (typeof WebSocket === 'undefined') {
    return [];
  }
  return new Promise(resolve => {
    const events: any[] = [];
    let settled = false;
    const subId = `fundstr-${Math.random().toString(36).slice(2, 10)}`;
    const ws = new WebSocket('wss://relay.fundstr.me');
    const finalize = () => {
      if (settled) return;
      settled = true;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      } catch (e) {
        console.warn('[fundstrFirstQuery] failed to close websocket', e);
      }
      resolve(events);
    };
    const timer = setTimeout(finalize, wsTimeoutMs);

    ws.onopen = () => {
      try {
        ws.send(JSON.stringify(['REQ', subId, ...filters]));
      } catch (e) {
        console.warn('[fundstrFirstQuery] failed to send ws request', e);
        finalize();
      }
    };

    ws.onmessage = raw => {
      try {
        const msg = JSON.parse(raw.data);
        if (!Array.isArray(msg)) return;
        const [type, incomingSubId, payload] = msg;
        if (type === 'EVENT' && incomingSubId === subId && payload) {
          events.push(payload);
        }
        if (type === 'EOSE' && incomingSubId === subId) {
          clearTimeout(timer);
          finalize();
        }
      } catch (e) {
        console.warn('[fundstrFirstQuery] failed to parse ws message', e);
      }
    };

    ws.onerror = () => {
      clearTimeout(timer);
      finalize();
    };

    ws.onclose = () => {
      clearTimeout(timer);
      finalize();
    };
  });
}

async function queryViaHttp(filters: NostrFilter[]): Promise<any[]> {
  try {
    const encoded = encodeURIComponent(JSON.stringify(filters));
    const response = await fetch(`https://relay.fundstr.me/req?filters=${encoded}`);
    if (!response.ok) {
      console.warn('[fundstrFirstQuery] HTTP query failed', response.status, response.statusText);
      return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('[fundstrFirstQuery] HTTP query error', e);
    return [];
  }
}

export async function publishNostrEvent(template: {
  kind: number;
  tags: any[];
  content: string;
  created_at?: number;
}): Promise<{ ok?: boolean; accepted?: boolean; id?: string; message?: string }> {
  const created_at = template.created_at ?? Math.floor(Date.now() / 1000);
  const payload = { ...template, created_at };
  let signed: any;
  const nostr = (globalThis as any)?.nostr;
  if (nostr?.signEvent) {
    signed = await nostr.signEvent(payload);
  } else {
    const ndk = getNutzapNdk();
    const ev = new NDKEvent(ndk, payload);
    await ev.sign();
    signed = await ev.toNostrEvent();
  }

  if (!isNostrEvent(signed)) {
    throw new Error('Not a signed NIP-01 event');
  }

  const response = await fetch('https://relay.fundstr.me/event', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(signed),
  });
  let ack: any = null;
  try {
    ack = await response.json();
  } catch (e) {
    console.warn('[publishNostrEvent] failed to parse relay response', e);
  }
  if (!ack?.accepted) {
    throw new Error(ack?.message || 'Relay rejected');
  }
  return ack;
}
