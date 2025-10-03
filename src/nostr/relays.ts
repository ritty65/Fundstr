export const REQUIRED_DM_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.fundstr.me',
] as const;

export const DM_BLOCKLIST = new Set<string>([
  'wss://purplepag.es',
  'wss://purplepag.es/',
  'wss://relayable.org',
  'wss://relayable.org/',
  'wss://relay.nostr.band',
  'wss://relay.nostr.band/',
]);

export function normalizeUrl(u: string) {
  return u.replace(/\/+$/, '');
}

export function buildDmPublishSet(allRelays: string[]): string[] {
  const base = new Set(REQUIRED_DM_RELAYS.map(normalizeUrl));
  for (const r of allRelays) {
    const n = normalizeUrl(r);
    if (!DM_BLOCKLIST.has(n)) base.add(n);
  }
  return Array.from(base);
}

export function mustConnectRequiredRelays(ndkOrPool: any) {
  for (const r of REQUIRED_DM_RELAYS) {
    ndkOrPool.addOrConnect?.(r);
    ndkOrPool.addExplicitRelay?.(r);
  }
}
