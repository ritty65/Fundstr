// A more extensive list of relays known to be active and reliable.
const ALL_VETTED_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://nostr-pub.wellorder.net",
  "wss://relay.f7z.io",
  "wss://offchain.pub",
  "wss://no.str.cr",
  "wss://nostr.mom",
  "wss://nostr.wine",
  "wss://relay.nostr.band",
];

// Curated default read relays – these are added at boot for read operations only.
export const DEFAULT_RELAYS = ALL_VETTED_RELAYS;

// Small set of known-open relays used as fallback for write operations.
export const FREE_RELAYS = ALL_VETTED_RELAYS;

export const VETTED_OPEN_WRITE_RELAYS: string[] = ALL_VETTED_RELAYS;

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
