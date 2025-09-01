import { nip19 } from 'nostr-tools';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Normalize a user supplied pubkey identifier (hex, npub, nprofile) to 64-char hex.
 * Returns null if input cannot be parsed.
 */
export function normalizeToHexPubkey(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = nip19.decode(trimmed);
    if (decoded.type === 'npub') {
      return typeof decoded.data === 'string'
        ? decoded.data.toLowerCase()
        : bytesToHex(decoded.data as Uint8Array).toLowerCase();
    }
    if (decoded.type === 'nprofile') {
      const pubkey = (decoded.data as any).pubkey;
      if (typeof pubkey === 'string' && /^[0-9a-fA-F]{64}$/.test(pubkey)) {
        return pubkey.toLowerCase();
      }
    }
  } catch {}
  return null;
}
