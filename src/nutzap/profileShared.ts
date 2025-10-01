import { nip19 } from 'nostr-tools';
import type { Tier } from './types';

const HEX_64_REGEX = /^[0-9a-f]{64}$/i;

type RawTier = {
  id?: string;
  title?: string;
  price?: number | string;
  price_sats?: number | string;
  frequency?: Tier['frequency'];
  description?: string;
  media?: Array<string | { type?: string; url?: string }>;
};

type ReplaceableLike = {
  kind?: number;
  pubkey?: string;
  created_at?: number;
  tags?: any[];
};

function selectLatestByKey<T extends ReplaceableLike>(
  events: readonly T[],
  keyFn: (event: T) => string,
): T | null {
  const map = new Map<string, T>();

  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const { kind, pubkey } = event as ReplaceableLike;
    if (typeof kind !== 'number' || typeof pubkey !== 'string') continue;
    const key = keyFn(event);
    if (!key) continue;
    const current = map.get(key);
    if (!current || ((event as any).created_at ?? 0) > ((current as any).created_at ?? 0)) {
      map.set(key, event);
    }
  }

  const latest = Array.from(map.values()).sort(
    (a, b) => ((b as any).created_at ?? 0) - ((a as any).created_at ?? 0),
  );
  return latest[0] ?? null;
}

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

export function pickLatestReplaceable<T extends ReplaceableLike>(events: readonly T[]): T | null {
  return selectLatestByKey(events, event => {
    const kind = (event as any).kind;
    const pubkey = String((event as any).pubkey ?? '').toLowerCase();
    return typeof kind === 'number' && pubkey ? `${kind}:${pubkey}` : '';
  });
}

export function pickLatestParamReplaceable<T extends ReplaceableLike>(events: readonly T[]): T | null {
  return selectLatestByKey(events, event => {
    const kind = (event as any).kind;
    const pubkey = String((event as any).pubkey ?? '').toLowerCase();
    const tags = Array.isArray((event as any).tags) ? (event as any).tags : [];
    const dTag = tags.find(tag => Array.isArray(tag) && tag[0] === 'd');
    const dValue = typeof dTag?.[1] === 'string' ? dTag[1] : '';
    return typeof kind === 'number' && pubkey ? `${kind}:${pubkey}:${dValue}` : '';
  });
}

function normalizeRawTier(raw: RawTier): Tier | null {
  if (!raw) return null;
  const id = typeof raw.id === 'string' && raw.id ? raw.id : '';
  const title = typeof raw.title === 'string' ? raw.title : '';
  const priceSource = raw.price ?? raw.price_sats ?? 0;
  const price = Number(priceSource);
  const frequency: Tier['frequency'] = ['one_time', 'monthly', 'yearly'].includes(
    raw.frequency as Tier['frequency'],
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
