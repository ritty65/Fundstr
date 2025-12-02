import {
  decryptData,
  deriveKey,
  encryptData,
  generateSalt,
} from "src/utils/crypto-service";

export const VAULT_STORAGE_KEY = "cashu.vault.data";
export const VAULT_SALT_STORAGE_KEY = "cashu.vault.salt";

export async function deriveVaultKey(
  pin: string,
  salt: string,
): Promise<CryptoKey> {
  return deriveKey(pin, salt);
}

export function ensureVaultSalt(): string {
  let salt = localStorage.getItem(VAULT_SALT_STORAGE_KEY);
  if (!salt) {
    salt = generateSalt();
    localStorage.setItem(VAULT_SALT_STORAGE_KEY, salt);
  }
  return salt;
}

export function hasEncryptedVault(): boolean {
  return Boolean(localStorage.getItem(VAULT_STORAGE_KEY));
}

export async function encryptVaultPayload(
  key: CryptoKey,
  payload: unknown,
): Promise<string> {
  const serialized = JSON.stringify(payload ?? {});
  return encryptData(key, serialized);
}

export async function decryptVaultPayload(
  key: CryptoKey,
  blob: string,
): Promise<any> {
  const decrypted = await decryptData(key, blob);
  return JSON.parse(decrypted || "{}") ?? {};
}

