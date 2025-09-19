import { nip19 } from 'nostr-tools';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import { getNutzapNdk } from 'src/nutzap/ndkInstance';

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;
const HEX_128_REGEX = /^[0-9a-f]{128}$/i;

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
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== 'npub') {
      throw new Error('Only npub identifiers are supported.');
    }
    const data = decoded.data;
    if (typeof data !== 'string' || !HEX_64_REGEX.test(data)) {
      throw new Error('Invalid npub payload.');
    }
    return data.toLowerCase();
  }

  throw new Error('Author must be a 64-char hex pubkey or npub.');
}

export function isNostrEvent(e: any): e is NostrEvent {
  if (!e || typeof e !== 'object') return false;
  if (!HEX_64_REGEX.test(e.id ?? '')) return false;
  if (!HEX_64_REGEX.test(e.pubkey ?? '')) return false;
  if (typeof e.created_at !== 'number' || !Number.isFinite(e.created_at)) return false;
  if (typeof e.kind !== 'number') return false;
  if (!Array.isArray(e.tags)) return false;
  if (typeof e.content !== 'string') return false;
  if (!HEX_128_REGEX.test(e.sig ?? '')) return false;
  return true;
}

export function pickLatestReplaceable<T extends { created_at?: number }>(events: T[]): T | null {
  let latest: T | null = null;
  for (const event of events) {
    if (!event || typeof (event as any).kind !== 'number' || typeof (event as any).pubkey !== 'string') {
      continue;
    }
    if (!latest || (event.created_at ?? 0) > (latest.created_at ?? 0)) {
      latest = event;
    }
  }
  return latest;
}

export function pickLatestParamReplaceable<T extends { created_at?: number; tags?: any[] }>(events: T[]): T | null {
  let latest: T | null = null;
  let latestKey = '';
  for (const event of events) {
    if (!event || typeof (event as any).kind !== 'number' || typeof (event as any).pubkey !== 'string') {
      continue;
    }
    const tags = Array.isArray((event as any).tags) ? (event as any).tags : [];
    const dTag = tags.find((t: any) => Array.isArray(t) && t[0] === 'd' && typeof t[1] === 'string');
    const key = `${(event as any).kind}:${(event as any).pubkey}:${dTag ? dTag[1] : ''}`;
    if (!latest || key !== latestKey || (event.created_at ?? 0) > (latest.created_at ?? 0)) {
      latest = event;
      latestKey = key;
    }
  }
  return latest;
}

export async function fundstrFirstQuery(filters: NostrFilter[], wsTimeoutMs = 1500): Promise<any[]> {
  const wsUrl = 'wss://relay.fundstr.me';
  let events: any[] = [];

  try {
    events = await new Promise<any[]>((resolve, reject) => {
      const collected: any[] = [];
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const subId = Math.random().toString(36).slice(2);
      let socket: WebSocket | null = null;

      const finalize = (result: any[], error?: unknown) => {
        if (settled) return;
        settled = true;
        if (timer) {
          clearTimeout(timer);
        }
        if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
          try {
            socket.close();
          } catch (closeErr) {
            console.warn('[nutzap] ws close failed', closeErr);
          }
        }
        if (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          reject(err);
        } else {
          resolve(result);
        }
      };

      try {
        socket = new WebSocket(wsUrl);
      } catch (err) {
        finalize([], err);
        return;
      }

      timer = setTimeout(() => finalize(collected), wsTimeoutMs);

      socket.onopen = () => {
        try {
          socket?.send(JSON.stringify(['REQ', subId, ...filters]));
        } catch (err) {
          finalize(collected, err);
        }
      };

      socket.onmessage = ev => {
        try {
          const data = JSON.parse(ev.data);
          if (!Array.isArray(data)) return;
          const [type, sub, payload] = data;
          if (sub !== subId) return;
          if (type === 'EVENT') {
            collected.push(payload);
          } else if (type === 'EOSE') {
            finalize(collected);
          }
        } catch (err) {
          console.warn('[nutzap] ws message parse failed', err);
        }
      };

      socket.onerror = err => {
        finalize(collected, err instanceof Error ? err : new Error('WebSocket error'));
      };

      socket.onclose = () => {
        finalize(collected);
      };
    });
  } catch (err) {
    console.warn('[nutzap] ws query failed', err);
  }

  if (!Array.isArray(events) || events.length === 0) {
    try {
      const response = await fetch(
        `https://relay.fundstr.me/req?filters=${encodeURIComponent(JSON.stringify(filters))}`
      );
      if (!response.ok) {
        throw new Error(`HTTP query failed with status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        events = data;
      } else if (Array.isArray(data?.events)) {
        events = data.events;
      } else {
        events = [];
      }
    } catch (err) {
      console.warn('[nutzap] http query failed', err);
      if (!Array.isArray(events) || events.length === 0) {
        throw err instanceof Error ? err : new Error(String(err));
      }
    }
  }

  return Array.isArray(events) ? events : [];
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
    const ev = new NDKEvent(ndk, { ...template, created_at });
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

  if (!response.ok) {
    throw new Error(`Relay rejected with status ${response.status}`);
  }

  const ack = await response.json();
  if (!ack?.accepted) {
    throw new Error(ack?.message || 'Relay rejected');
  }

  return { ...ack, event: signed };
}

export async function publishTierDefinitions(tiers: any[], kind: number) {
  const tags = [
    ['d', 'tiers'],
    ['t', 'nutzap-tiers'],
    ['client', 'fundstr'],
  ];
  const content = JSON.stringify({ v: 1, tiers });
  return publishNostrEvent({ kind, tags, content });
}
