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

export const FALLBACK_RELAYS: string[] = [
  'wss://purplepag.es',
  'wss://nostr.wine',
  'wss://relay.damus.io',
]; // keep small and easy to rotate

// Curated default read relays – these are added at boot for read operations only.
export const DEFAULT_RELAYS = [
  FUNDSTR_PRIMARY_RELAY,
  "wss://relay.damus.io",
  "wss://purplepag.es",
  "wss://nostr.wine",
];

// Small set of known-open relays used as fallback for write operations.
export const FREE_RELAYS = [
  "wss://nostr.wine",
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  // Last resort large pools
  "wss://relay.damus.io",
  "wss://nostr.mom",
];

export const VETTED_OPEN_WRITE_RELAYS: string[] = [
  // TODO(app-maintainer): add 3–6 vetted open write relays here (wss://...)
];

export const MIN_HEALTHY_WRITES = 1; // prefer 2 later, but keep minimal-risk default now

// Optional: allow overrides via env (comma-separated)
export function envRelayList(key: string, fallback: string[]): string[] {
  const v = (import.meta as any).env?.[key];
  if (!v) return fallback;
  return v
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
}
