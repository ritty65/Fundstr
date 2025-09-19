import { nip19 } from 'nostr-tools';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';

const FUNDSTR_RELAY_WSS = 'wss://relay.fundstr.me';
const FUNDSTR_HTTP_REQ = 'https://relay.fundstr.me/req';
const FUNDSTR_HTTP_EVENT = 'https://relay.fundstr.me/event';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function normalizeAuthor(input: string): string {
  const value = input.trim();
  if (!value) {
    throw new Error('Author is required.');
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return value.toLowerCase();
  }
  if (value.toLowerCase().startsWith('npub')) {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'npub') {
      throw new Error('Invalid npub identifier.');
    }
    const data = decoded.data;
    if (typeof data === 'string') {
      if (!/^[0-9a-fA-F]{64}$/.test(data)) {
        throw new Error('Invalid decoded npub value.');
      }
      return data.toLowerCase();
    }
    if (data instanceof Uint8Array) {
      return bytesToHex(data);
    }
  }
  throw new Error('Author must be a hex pubkey or npub.');
}

export function isNostrEvent(
  e: any
): e is {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: any[];
  content: string;
  sig: string;
} {
  if (!e || typeof e !== 'object') return false;
  const hex64 = /^[0-9a-f]{64}$/;
  const hexSig = /^[0-9a-f]{128}$/;
  return (
    typeof e.id === 'string' &&
    hex64.test(e.id) &&
    typeof e.pubkey === 'string' &&
    hex64.test(e.pubkey) &&
    Number.isInteger(e.created_at) &&
    typeof e.kind === 'number' &&
    Array.isArray(e.tags) &&
    typeof e.content === 'string' &&
    typeof e.sig === 'string' &&
    hexSig.test(e.sig)
  );
}

export function pickLatestReplaceable<T extends { kind?: number; pubkey?: string; created_at?: number }>(
  events: T[]
): T | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  const map = new Map<string, T>();
  for (const ev of events) {
    if (!ev || typeof ev.kind !== 'number' || typeof ev.pubkey !== 'string') continue;
    const key = `${ev.kind}:${ev.pubkey}`;
    const existing = map.get(key);
    if (!existing || (ev.created_at ?? 0) > (existing.created_at ?? 0)) {
      map.set(key, ev);
    }
  }
  if (map.size === 0) return null;
  let latest: T | null = null;
  for (const item of map.values()) {
    if (!latest || (item.created_at ?? 0) > (latest.created_at ?? 0)) {
      latest = item;
    }
  }
  return latest;
}

function getDTag(ev: any): string | undefined {
  if (!ev || !Array.isArray(ev.tags)) return undefined;
  const tag = ev.tags.find((t: any) => Array.isArray(t) && t[0] === 'd' && typeof t[1] === 'string');
  return tag?.[1];
}

export function pickLatestParamReplaceable<T extends { kind?: number; pubkey?: string; created_at?: number; tags?: any[] }>(
  events: T[]
): T | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  const map = new Map<string, T>();
  for (const ev of events) {
    if (!ev || typeof ev.kind !== 'number' || typeof ev.pubkey !== 'string') continue;
    const d = getDTag(ev);
    if (typeof d !== 'string') continue;
    const key = `${ev.kind}:${ev.pubkey}:${d}`;
    const existing = map.get(key);
    if (!existing || (ev.created_at ?? 0) > (existing.created_at ?? 0)) {
      map.set(key, ev);
    }
  }
  if (map.size === 0) return null;
  let latest: T | null = null;
  for (const item of map.values()) {
    if (!latest || (item.created_at ?? 0) > (latest.created_at ?? 0)) {
      latest = item;
    }
  }
  return latest;
}

export type NostrFilter = { kinds: number[]; authors: string[]; '#d'?: string[]; limit?: number };

export async function fundstrFirstQuery(filters: NostrFilter[], wsTimeoutMs = 1500): Promise<any[]> {
  const events: any[] = [];
  const useWebSocket = typeof WebSocket !== 'undefined';

  if (useWebSocket) {
    const subId = `fundstr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const wsEvents = await new Promise<any[]>(resolve => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const ws = new WebSocket(FUNDSTR_RELAY_WSS);

      const finalize = () => {
        if (settled) return;
        settled = true;
        if (timeout) clearTimeout(timeout);
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch (err) {
          console.warn('[fundstrFirstQuery] failed closing ws', err);
        }
        resolve([...events]);
      };

      timeout = setTimeout(() => {
        finalize();
      }, wsTimeoutMs);

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify(['REQ', subId, ...filters]));
      });

      ws.addEventListener('message', ev => {
        try {
          const data = JSON.parse(ev.data as string);
          if (!Array.isArray(data)) return;
          if (data[0] === 'EVENT' && data[1] === subId && data[2]) {
            events.push(data[2]);
          } else if (data[0] === 'EOSE' && data[1] === subId) {
            finalize();
          }
        } catch (err) {
          console.warn('[fundstrFirstQuery] failed to parse ws message', err);
        }
      });

      ws.addEventListener('error', () => {
        finalize();
      });

      ws.addEventListener('close', () => {
        finalize();
      });
    });

    if (wsEvents.length > 0) {
      return wsEvents;
    }
  }

  try {
    const url = new URL(FUNDSTR_HTTP_REQ);
    url.searchParams.set('filters', JSON.stringify(filters));
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      return data;
    }
  } catch (err) {
    console.warn('[fundstrFirstQuery] HTTP fallback failed', err);
  }

  return [];
}

export async function publishNostrEvent(template: {
  kind: number;
  tags: any[];
  content: string;
  created_at?: number;
}) {
  const created_at = template.created_at ?? Math.floor(Date.now() / 1000);
  let signed: any;

  if (typeof window !== 'undefined' && (window as any).nostr?.signEvent) {
    signed = await (window as any).nostr.signEvent({
      ...template,
      created_at,
    });
  } else {
    const ndk = getNutzapNdk();
    const ev = new NDKEvent(ndk, { ...template, created_at });
    await ev.sign();
    signed = await ev.toNostrEvent();
  }

  if (!isNostrEvent(signed)) {
    throw new Error('Not a signed NIP-01 event');
  }

  const ack = await fetch(FUNDSTR_HTTP_EVENT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(signed),
  }).then(r => r.json());

  if (!ack?.accepted) {
    throw new Error(ack?.message || 'Relay rejected');
  }

  return ack;
}
