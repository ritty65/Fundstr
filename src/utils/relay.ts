export function sanitizeRelayUrls(relays: string[], cap = 10): string[] {
  const cleaned: string[] = [];
  for (const r of Array.isArray(relays) ? relays : []) {
    if (!r) continue;
    let url = String(r).trim();
    if (!url) continue;
    if (/^https?:\/\//i.test(url)) {
      url = url.replace(/^https?/i, "wss");
    } else if (/^ws:\/\//i.test(url)) {
      url = url.replace(/^ws:/i, "wss:");
    } else if (!/^wss?:\/\//i.test(url)) {
      url = `wss://${url}`;
    }
    if (!url.startsWith("wss://")) continue;
    url = url.replace(/\/+$/, "");
    cleaned.push(url);
    if (cleaned.length >= cap) break;
  }
  return Array.from(new Set(cleaned));
}
