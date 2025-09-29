// NIP-11: same URI as the WS endpoint, when Accept: application/nostr+json is sent.
// https://nips.nostr.com/11
export async function fetchRelayInfo(wssUrl: string, ms = 2500) {
  const httpsUrl = wssUrl.replace(/^wss:/, 'https:');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(httpsUrl, {
      headers: { Accept: 'application/nostr+json' },
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` as const };
    const json = await res.json().catch(() => null);
    if (!json || !Array.isArray(json.supported_nips) || !json.supported_nips.includes(1)) {
      return { ok: false, reason: 'unsupported or malformed NIP-11' as const };
    }
    return { ok: true as const, info: json };
  } catch (e: any) {
    clearTimeout(t);
    return { ok: false as const, reason: e?.name === 'AbortError' ? 'timeout' : String(e) };
  }
}
