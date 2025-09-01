import type { NostrEvent } from 'nostr-tools';
import { useNostrStore } from 'src/stores/nostr';

export function looksLikeNip04(s: string): boolean {
  return typeof s === 'string' && s.includes('?iv=');
}
export function looksLikeNip44(s: string): boolean {
  return (
    typeof s === 'string' &&
    !s.includes('?iv=') &&
    /^[A-Za-z0-9+/=]+$/.test(s)
  );
}

export type EncryptResult = { protocol: 'nip44' | 'nip04'; content: string };
export type DecryptResult = {
  protocolTried: ('nip44' | 'nip04')[];
  plaintext?: string;
  error?: string;
  protocol?: 'nip44' | 'nip04';
};

export async function encryptFor(
  pubkey: string,
  plaintext: string,
): Promise<EncryptResult> {
  const nostr = useNostrStore();
  if (nostr.canNip44) {
    try {
      const c44 = await nostr.nip44Encrypt(pubkey, plaintext);
      if (typeof c44 === 'string' && c44.length > 0)
        return { protocol: 'nip44', content: c44 };
    } catch {
      /* fall through */
    }
  }
  if (nostr.canNip04) {
    const c04 = await nostr.nip04Encrypt(pubkey, plaintext);
    if (typeof c04 === 'string' && c04.length > 0)
      return { protocol: 'nip04', content: c04 };
  }
  throw new Error(
    'No available encryption method (nip44/nip04) or user denied permission.',
  );
}

export async function decryptFrom(
  pubkey: string,
  ciphertext: string,
): Promise<DecryptResult> {
  const nostr = useNostrStore();
  const tried: ('nip44' | 'nip04')[] = [];
  const prefer44 = looksLikeNip44(ciphertext);
  if (prefer44 && nostr.canNip44) {
    tried.push('nip44');
    try {
      return {
        protocolTried: tried,
        plaintext: await nostr.nip44Decrypt(pubkey, ciphertext),
        protocol: 'nip44',
      };
    } catch {
      /* ignore */
    }
  }
  if (nostr.canNip04) {
    tried.push('nip04');
    try {
      return {
        protocolTried: tried,
        plaintext: await nostr.nip04Decrypt(pubkey, ciphertext),
        protocol: 'nip04',
      };
    } catch {
      /* ignore */
    }
  }
  if (!prefer44 && nostr.canNip44 && !tried.includes('nip44')) {
    tried.push('nip44');
    try {
      return {
        protocolTried: tried,
        plaintext: await nostr.nip44Decrypt(pubkey, ciphertext),
        protocol: 'nip44',
      };
    } catch {
      /* ignore */
    }
  }
  return { protocolTried: tried, error: 'Unable to decrypt with nip44 or nip04.' };
}

