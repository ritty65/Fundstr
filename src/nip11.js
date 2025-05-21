export async function fetchNip11(relayUrl, name) {
  try {
    const httpUrl = relayUrl.replace(/^ws(s?):\/\//, 'http$1://');
    const url = name ? `${httpUrl}/?name=${encodeURIComponent(name)}` : httpUrl;
    const resp = await fetch(url, { headers: { Accept: 'application/nostr+json' } });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    return data;
  } catch (err) {
    console.warn('Failed to fetch NIP-11 for', relayUrl, err);
    return null;
  }
}
