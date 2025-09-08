export const FUNDSTR_PRIMARY_RELAY = 'wss://relay.fundstr.me';
export const PRIMARY_RELAY = 'wss://relay.fundstr.me';

export const FALLBACK_RELAYS: string[] = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
]; // keep small and easy to rotate

// Curated default read relays – these are added at boot for read operations only.
export const DEFAULT_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://nos.lol",
];

// Small set of known-open relays used as fallback for write operations.
export const FREE_RELAYS = [
  "wss://offchain.pub",
  "wss://no.str.cr",
  "wss://nostr.mom",
  // Last resort large pools
  "wss://relay.damus.io",
  "wss://relay.snort.social",
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
