const metaEnv = (typeof import.meta !== 'undefined' && (import.meta as any)?.env) || {};
const processEnv = (typeof process !== 'undefined' && (process as any)?.env) || {};

function pickRelayUrl(key: string, fallback: string): string {
  const metaValue = typeof metaEnv[key] === 'string' ? metaEnv[key].trim() : '';
  const processValue = typeof processEnv[key] === 'string' ? processEnv[key].trim() : '';

  if (metaValue) return metaValue;
  if (processValue) return processValue;
  return fallback;
}

export const FUNDSTR_PRIMARY_RELAY = pickRelayUrl('VITE_FUNDSTR_PRIMARY_RELAY_WSS', 'wss://relay.nostr.band');
export const FUNDSTR_PRIMARY_RELAY_HTTP = pickRelayUrl(
  'VITE_FUNDSTR_PRIMARY_RELAY_HTTP',
  'https://relay.nostr.band',
);
export const PRIMARY_RELAY = FUNDSTR_PRIMARY_RELAY;

export function normalizeRelayUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function uniqueRelayList(relays: string[]): string[] {
  const seen = new Set<string>();
  for (const relay of relays) {
    const normalized = normalizeRelayUrl(relay);
    if (normalized) {
      seen.add(normalized);
    }
  }
  return Array.from(seen);
}

export const FALLBACK_RELAYS: string[] = [
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
  'wss://nostr.wine',
  'wss://purplepag.es',
]; // keep small and easy to rotate

// Curated default read relays – these are added at boot for read operations only.
export const DEFAULT_RELAYS = [
  FUNDSTR_PRIMARY_RELAY,
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
  'wss://nostr.wine',
  'wss://purplepag.es',
  'wss://nos.lol',
  'wss://nostr.mom',
  'wss://nostr.bitcoiner.social',
];

// Small set of known-open relays used as fallback for write operations.
export const FREE_RELAYS = [
  'wss://relay.nostr.band',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
  'wss://nostr.wine',
  'wss://purplepag.es',
  // Last resort large pools
  'wss://nostr.mom',
  'wss://nos.lol',
];

export const VETTED_OPEN_WRITE_RELAYS: string[] = [
  // TODO(app-maintainer): add 3–6 vetted open write relays here (wss://...)
];

export const MIN_HEALTHY_WRITES = 1; // prefer 2 later, but keep minimal-risk default now

export const RELAY_CONNECT_RETRY = {
  maxAttempts: 4,
  baseDelayMs: 900,
  maxDelayMs: 12_000,
  jitterRatio: 0.2,
  timeoutMs: 10_000,
};

export function computeRelayBackoffMs(attempt: number): number {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  const exponential = RELAY_CONNECT_RETRY.baseDelayMs * 2 ** (normalizedAttempt - 1);
  const capped = Math.min(RELAY_CONNECT_RETRY.maxDelayMs, exponential);
  const jitterRange = capped * RELAY_CONNECT_RETRY.jitterRatio;
  const jitterOffset = (Math.random() * 2 - 1) * jitterRange;
  return Math.max(RELAY_CONNECT_RETRY.baseDelayMs, Math.round(capped + jitterOffset));
}

// Optional: allow overrides via env (comma-separated)
export function envRelayList(key: string, fallback: string[]): string[] {
  const v = (import.meta as any).env?.[key];
  if (!v) return fallback;
  return uniqueRelayList(
    v
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean),
  );
}
