// Curated public write relays used ONLY as fallback when user relays don't ACK.
// Keep this list short to reduce latency and avoid closed/paid/whitelisted relays.
export const FREE_RELAYS = [
  "wss://nostr.fmt.wiz.biz",
  "wss://nostr.oxtr.dev",
  "wss://nostr.mom",
  "wss://no.str.cr",
  "wss://relay.nostr.bg",
  "wss://offchain.pub",
  "wss://relay.plebstr.com",
  "wss://nostr.zebedee.cloud",
];

// This list should only contain relays that are known to be reliable and fast.
export const DEFAULT_RELAYS = [
  "wss://purplepag.es",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://relay.snort.social",
  "wss://nos.lol",
];

