export async function decryptDM(
  senderHex: string,
  content: string,
  privKeyHex?: string,
): Promise<string | null> {
  const n = (globalThis as any).nostr;
  if (n?.nip04?.decrypt) {
    try {
      return await n.nip04.decrypt(senderHex, content);
    } catch {}
  }
  if (privKeyHex) {
    try {
      const { nip04 } = await import("nostr-tools");
      return await nip04.decrypt(privKeyHex, senderHex, content);
    } catch {}
  }
  return null;
}
