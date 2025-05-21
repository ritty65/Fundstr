export const LS_KEY = 'encrypted_nsec';

export function saveEncrypted(encrypted) {
  if (encrypted) localStorage.setItem(LS_KEY, encrypted);
  else localStorage.removeItem(LS_KEY);
}

export function loadEncrypted() {
  return localStorage.getItem(LS_KEY);
}

export async function encryptPrivKey(sk, password) {
  if (!window.NostrTools || !window.NostrTools.nip49) {
    throw new Error('NIP-49 not available');
  }
  return await window.NostrTools.nip49.encrypt(sk, password);
}

export async function decryptPrivKey(enc, password) {
  if (!window.NostrTools || !window.NostrTools.nip49) {
    throw new Error('NIP-49 not available');
  }
  return await window.NostrTools.nip49.decrypt(enc, password);
}
