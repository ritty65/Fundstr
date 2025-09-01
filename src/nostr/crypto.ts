export type DMEncryptionMethod = 'nip44' | 'nip04';
export type DMEncryptResult = { method: DMEncryptionMethod; content: string };

export function signerCapabilities() {
  const n = (globalThis as any).nostr;
  return {
    hasNip44: !!n?.nip44?.encrypt && !!n?.nip44?.decrypt,
    hasNip04: !!n?.nip04?.encrypt && !!n?.nip04?.decrypt,
    hasSigner: !!n,
  };
}

async function tryLocalNip04Encrypt(recipientHex: string, plaintext: string, privKeyHex?: string): Promise<string | null> {
  return null;
}

async function tryLocalNip04Decrypt(senderHex: string, parsed: ParsedCipher, privKeyHex?: string): Promise<string | null> {
  return null;
}

export async function encryptDM(
  plaintext: string,
  recipientHex: string,
  privKeyHex?: string,
): Promise<DMEncryptResult> {
  const n = (globalThis as any).nostr;
  const caps = signerCapabilities();

  if (caps.hasNip44) {
    const content = await n.nip44.encrypt(recipientHex, plaintext);
    return { method: 'nip44', content };
  }
  if (caps.hasNip04) {
    const content = await n.nip04.encrypt(recipientHex, plaintext);
    return { method: 'nip04', content };
  }

  const local = await tryLocalNip04Encrypt(recipientHex, plaintext, privKeyHex);
  if (local) return { method: 'nip04', content: local };

  throw new Error('No encryption available: enable a NIP-07 signer (e.g., Alby) or import a local key.');
}

export type ParsedCipher = { scheme: 'nip44' | 'nip04'; ciphertext: string; iv?: string };

export function parseCipher(content: string): ParsedCipher | null {
  if (/^v\d[\s:,-]/.test(content) || content.startsWith('v1') || content.startsWith('v2')) {
    return { scheme: 'nip44', ciphertext: content };
  }
  const [ct, query] = content.split('?');
  const iv = new URLSearchParams(query || '').get('iv') || undefined;
  if (!ct || !iv) return null;
  return { scheme: 'nip04', ciphertext: ct, iv };
}

export async function decryptDM(senderHex: string, content: string, privKeyHex?: string): Promise<string | null> {
  const n = (globalThis as any).nostr;
  const caps = signerCapabilities();
  const parsed = parseCipher(content);

  if (!parsed) throw new Error('Invalid encrypted message (missing iv or malformed).');

  if (parsed.scheme === 'nip44' && caps.hasNip44) {
    try {
      return await n.nip44.decrypt(senderHex, content);
    } catch {}
  }
  if (caps.hasNip04) {
    try {
      return await n.nip04.decrypt(senderHex, content);
    } catch {}
  }

  return (await tryLocalNip04Decrypt(senderHex, parsed, privKeyHex)) ?? null;
}
