const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;

function getSubtle(): SubtleCrypto {
  const globalCrypto: Crypto | undefined =
    (globalThis as any)?.crypto ?? (globalThis as any)?.webcrypto;
  const subtle: SubtleCrypto | undefined =
    globalCrypto?.subtle ?? (globalCrypto as any)?.webcrypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SubtleCrypto API is unavailable");
  }
  return subtle;
}

export function generateSalt(): string {
  const salt = new Uint8Array(SALT_LENGTH_BYTES);
  getSubtle();
  crypto.getRandomValues(salt);
  return btoa(String.fromCharCode(...salt));
}

export async function deriveKey(pin: string, salt: string): Promise<CryptoKey> {
  const subtle = getSubtle();
  const encoder = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    "raw",
    encoder.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );

  const derivedKey = await subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return derivedKey;
}

export async function encryptData(key: CryptoKey, data: string): Promise<string> {
  const subtle = getSubtle();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const encoder = new TextEncoder();
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(data));
  const buff = new Uint8Array(iv.length + ciphertext.byteLength);
  buff.set(iv, 0);
  buff.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...buff));
}

export async function decryptData(key: CryptoKey, ciphertext: string): Promise<string> {
  const subtle = getSubtle();
  const bytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
  const iv = bytes.slice(0, IV_LENGTH_BYTES);
  const payload = bytes.slice(IV_LENGTH_BYTES);
  const decrypted = await subtle.decrypt({ name: "AES-GCM", iv }, key, payload);
  return new TextDecoder().decode(decrypted);
}

export const SALT_STORAGE_KEY = "cashu.salt";

