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

// Optional: allow overrides via env (comma-separated)
export function envRelayList(key: string, fallback: string[]): string[] {
  const v = (import.meta as any).env?.[key];
  if (!v) return fallback;
  return v
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
}
