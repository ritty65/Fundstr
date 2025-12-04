const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;
const PBKDF2_ITERATIONS_LEGACY = 100_000;
const PBKDF2_ITERATIONS_STRONG = 310_000;
const CURRENT_KDF_VERSION = 2;

type Pbkdf2SaltRecord = {
  version: number;
  kdf: "pbkdf2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
};

export type NormalizedSalt = {
  record: Pbkdf2SaltRecord;
  serialized: string;
  isLegacy: boolean;
};

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

function generateSaltBytes(): string {
  const salt = new Uint8Array(SALT_LENGTH_BYTES);
  getSubtle();
  crypto.getRandomValues(salt);
  return btoa(String.fromCharCode(...salt));
}

function isSaltRecord(candidate: any): candidate is Pbkdf2SaltRecord {
  return (
    candidate &&
    typeof candidate === "object" &&
    candidate.kdf === "pbkdf2" &&
    candidate.hash === "SHA-256" &&
    typeof candidate.salt === "string" &&
    typeof candidate.iterations === "number"
  );
}

export function generateSalt(): NormalizedSalt {
  const record: Pbkdf2SaltRecord = {
    version: CURRENT_KDF_VERSION,
    kdf: "pbkdf2",
    hash: "SHA-256",
    iterations: PBKDF2_ITERATIONS_STRONG,
    salt: generateSaltBytes(),
  };
  const serialized = JSON.stringify(record);
  return {
    record,
    serialized,
    isLegacy: false,
  };
}

export function normalizeSaltValue(rawSalt: string | null): NormalizedSalt {
  if (rawSalt) {
    try {
      const parsed = JSON.parse(rawSalt);
      if (isSaltRecord(parsed)) {
        return {
          record: parsed,
          serialized: rawSalt,
          isLegacy: false,
        };
      }
    } catch {
      // Fall through to legacy handling
    }

    const legacyRecord: Pbkdf2SaltRecord = {
      version: 1,
      kdf: "pbkdf2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS_LEGACY,
      salt: rawSalt,
    };

    return {
      record: legacyRecord,
      serialized: JSON.stringify(legacyRecord),
      isLegacy: true,
    };
  }

  return generateSalt();
}

export async function deriveKey(
  pin: string,
  salt: string | NormalizedSalt,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const encoder = new TextEncoder();
  const normalizedSalt =
    typeof salt === "string" ? normalizeSaltValue(salt) : salt;
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
      salt: Uint8Array.from(
        atob(normalizedSalt.record.salt),
        (c) => c.charCodeAt(0),
      ),
      iterations:
        normalizedSalt.record.iterations ?? PBKDF2_ITERATIONS_STRONG,
      hash: normalizedSalt.record.hash,
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

