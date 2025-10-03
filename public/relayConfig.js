const DEFAULT_PRIMARY_RELAY = "wss://relay.fundstr.me";
const DEFAULT_PAID_RELAYS = ["wss://relay.primal.net"];

// Criteria for curated open relays:
// 1. Operators publish an explicit allowlist or policy permitting third-party web clients.
// 2. Relays accept standard WebSocket connections from browsers without authentication or fees.
// 3. TLS certificates and reachability are validated at least monthly (tracked via #infra/relays).
// 4. Operators provide status channels (NIP-11 contact, Matrix, or nostr) for outage communication.
const DEFAULT_OPEN_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.snort.social",
  "wss://nos.lol",
  "wss://relayable.org",
  "wss://offchain.pub",
  "wss://no.str.cr",
  "wss://nostr.mom",
  "wss://purplepag.es",
];

// Subset confirmed for writes without auth prompts; used as the base for write fallbacks.
const DEFAULT_FREE_WRITE_RELAYS = [
  "wss://relayable.org",
  "wss://offchain.pub",
  "wss://no.str.cr",
  "wss://nostr.mom",
  "wss://purplepag.es",
];

function readJsonConfig() {
  const el = document?.getElementById?.("fundstr-relay-config");
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || "{}");
  } catch (error) {
    console.warn("Failed to parse #fundstr-relay-config", error);
    return null;
  }
}

function readGlobalConfig() {
  const globalConfig =
    (typeof window !== "undefined" &&
      (window.__FUNDSTR_RELAYS__ || window.__FUNDSTR_CONFIG__?.relays)) ||
    null;
  return globalConfig ?? null;
}

function uniq(urls) {
  const seen = new Set();
  const out = [];
  for (const url of urls) {
    if (!url) continue;
    const trimmed = url.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function sanitizeRelays(urls, exclude) {
  const excludes = new Set(exclude ?? []);
  return uniq(urls).filter((url) => !excludes.has(url));
}

function computeConfig() {
  const overrides = Object.assign(
    {},
    readJsonConfig() || {},
    readGlobalConfig() || {},
  );

  const primary = (overrides.primary || DEFAULT_PRIMARY_RELAY).trim();
  const paid = sanitizeRelays(
    overrides.paid || DEFAULT_PAID_RELAYS,
    [primary],
  );
  const backups = sanitizeRelays(
    overrides.backups || DEFAULT_OPEN_RELAYS,
    [primary, ...paid],
  );
  const free = sanitizeRelays(
    overrides.free || DEFAULT_FREE_WRITE_RELAYS,
    [primary, ...paid],
  );

  return {
    primary,
    backups,
    paid,
    free,
  };
}

const RELAY_CONFIG = computeConfig();

export const OPEN_RELAY_CRITERIA = [
  "Explicit third-party web client access policy",
  "Anonymous WebSocket access without captchas or fees",
  "Monthly TLS and reachability verification (tracked in #infra/relays)",
  "Published status contact (NIP-11, Matrix, or nostr account)",
];

export const CURATED_OPEN_RELAYS = [...DEFAULT_OPEN_RELAYS];

export function getRelayConfig() {
  return {
    primary: RELAY_CONFIG.primary,
    backups: [...RELAY_CONFIG.backups],
    paid: [...RELAY_CONFIG.paid],
    free: [...RELAY_CONFIG.free],
  };
}

export function getPrimaryRelay() {
  return RELAY_CONFIG.primary;
}

export function getBackupRelays(options = {}) {
  const includePaid = options.includePaid ?? false;
  if (includePaid) {
    return uniq([...RELAY_CONFIG.backups, ...RELAY_CONFIG.paid]);
  }
  return [...RELAY_CONFIG.backups];
}

export function getPaidRelays() {
  return [...RELAY_CONFIG.paid];
}

export function getDefaultRelayList(options = {}) {
  const includePaid = options.includePaid ?? false;
  const backups = includePaid
    ? uniq([...RELAY_CONFIG.backups, ...RELAY_CONFIG.paid])
    : RELAY_CONFIG.backups;
  return uniq([RELAY_CONFIG.primary, ...backups]);
}

export function getBaseFreeRelays() {
  return [...RELAY_CONFIG.free];
}

export function ensurePrimary(relays) {
  const primary = RELAY_CONFIG.primary;
  return uniq([primary, ...relays]);
}

export function describeRelay(url) {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^wss?:\/\//, "");
  }
}

export function formatRelayList(urls) {
  return uniq(urls).map((url) => describeRelay(url)).join(", ");
}
