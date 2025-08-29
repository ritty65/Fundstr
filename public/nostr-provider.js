/**
 * Placeholder Nostr provider script.
 * Browser extensions (e.g., NIP-07 wallets) intercept requests to this path
 * and inject their own implementation. If no extension is installed,
 * this file simply warns so the request does not fall back to index.html.
 */
if (typeof window !== 'undefined' && typeof (window as any).nostr === 'undefined') {
  console.warn('No Nostr provider detected.');
}
