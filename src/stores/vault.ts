import { defineStore } from "pinia";
import { toRaw, watch } from "vue";
import {
  VAULT_SALT_STORAGE_KEY,
  VAULT_STORAGE_KEY,
  decryptVaultPayload,
  deriveVaultKey,
  encryptVaultPayload,
  ensureVaultSalt,
  hasEncryptedVault,
} from "src/services/vault";
import { assertValidPin } from "src/utils/pin-policy";
import { normalizeSaltValue } from "src/utils/crypto-service";
import { useP2PKStore, type P2PKKey } from "./p2pk";
import {
  defaultActiveP2pk,
  type ActiveP2pk,
  useWalletStore,
} from "./wallet";

type VaultPayload = {
  p2pkKeys: P2PKKey[];
  activeP2pk: ActiveP2pk;
};

function defaultVaultPayload(): VaultPayload {
  return {
    p2pkKeys: [],
    activeP2pk: defaultActiveP2pk(),
  };
}

function cloneP2pkKeys(keys: P2PKKey[]): P2PKKey[] {
  return (keys || []).map((entry) => ({ ...toRaw(entry) }));
}

function cloneActiveP2pk(active?: ActiveP2pk): ActiveP2pk {
  if (!active) {
    return defaultActiveP2pk();
  }
  return {
    publicKey: active.publicKey || "",
    privateKey: active.privateKey || "",
  };
}

export const useVaultStore = defineStore("vault", {
  state: () => ({
    encryptionKey: null as CryptoKey | null,
    unlocked: false,
    payload: defaultVaultPayload(),
    watchersRegistered: false,
    failedUnlockAttempts: 0,
    unlockCooldownUntil: 0,
  }),
  getters: {
    hasEncryptedVault: () => hasEncryptedVault(),
    isUnlocked: (state) => state.unlocked && Boolean(state.encryptionKey),
  },
  actions: {
    normalizePin(pin: string) {
      return assertValidPin(pin);
    },
    enforceUnlockCooldown() {
      const now = Date.now();
      if (this.unlockCooldownUntil > now) {
        const seconds = Math.ceil((this.unlockCooldownUntil - now) / 1000);
        throw new Error(`Too many failed attempts. Try again in ${seconds}s.`);
      }
    },
    recordUnlockFailure() {
      this.failedUnlockAttempts += 1;
      const backoffMs = Math.min(
        30_000,
        1000 * 2 ** (this.failedUnlockAttempts - 1),
      );
      this.unlockCooldownUntil = Date.now() + backoffMs;
    },
    resetUnlockFailures() {
      this.failedUnlockAttempts = 0;
      this.unlockCooldownUntil = 0;
    },
    async setEncryptionKeyFromPin(pin: string) {
      const normalizedPin = this.normalizePin(pin);
      const salt = ensureVaultSalt();
      this.encryptionKey = await deriveVaultKey(normalizedPin, salt);
      this.unlocked = true;
      this.payload = defaultVaultPayload();
      await this.persistPayload();
      this.applyPayloadToStores();
      this.registerWatchers();
    },
    async unlockWithPin(pin: string) {
      const normalizedPin = this.normalizePin(pin);
      this.enforceUnlockCooldown();
      const salt = localStorage.getItem(VAULT_SALT_STORAGE_KEY);
      if (!salt) {
        throw new Error("No vault configured. Set your PIN first.");
      }
      const normalizedSalt = normalizeSaltValue(salt);
      localStorage.setItem(VAULT_SALT_STORAGE_KEY, normalizedSalt.serialized);
      try {
        this.encryptionKey = await deriveVaultKey(normalizedPin, normalizedSalt);
        await this.loadPayload();
        this.unlocked = true;
        this.registerWatchers();
        this.resetUnlockFailures();
      } catch (error) {
        this.recordUnlockFailure();
        throw error;
      }
    },
    async ensureUnlocked(pin: string) {
      if (this.isUnlocked) {
        return;
      }
      if (this.hasEncryptedVault) {
        await this.unlockWithPin(pin);
        return;
      }
      await this.setEncryptionKeyFromPin(pin);
    },
    async loadPayload() {
      if (!this.encryptionKey) {
        throw new Error("Vault is locked");
      }
      const blob = localStorage.getItem(VAULT_STORAGE_KEY);
      const parsed = blob
        ? await decryptVaultPayload(this.encryptionKey, blob)
        : {};
      this.payload = {
        ...defaultVaultPayload(),
        ...parsed,
        p2pkKeys: Array.isArray(parsed?.p2pkKeys)
          ? parsed.p2pkKeys
          : [],
        activeP2pk: cloneActiveP2pk(parsed?.activeP2pk),
      };
      this.applyPayloadToStores();
    },
    async persistPayload() {
      if (!this.encryptionKey) {
        throw new Error("Vault is locked");
      }
      const serializedPayload = {
        ...this.payload,
        p2pkKeys: cloneP2pkKeys(this.payload.p2pkKeys),
        activeP2pk: cloneActiveP2pk(this.payload.activeP2pk),
      };
      const encrypted = await encryptVaultPayload(
        this.encryptionKey,
        serializedPayload,
      );
      localStorage.setItem(VAULT_STORAGE_KEY, encrypted);
    },
    lockVault() {
      this.encryptionKey = null;
      this.unlocked = false;
      this.payload = defaultVaultPayload();
      const wallet = useWalletStore();
      const p2pk = useP2PKStore();
      p2pk.p2pkKeys = [];
      wallet.activeP2pk = defaultActiveP2pk();
    },
    applyPayloadToStores() {
      const wallet = useWalletStore();
      const p2pk = useP2PKStore();
      const active = cloneActiveP2pk(this.payload.activeP2pk);
      p2pk.p2pkKeys = cloneP2pkKeys(this.payload.p2pkKeys);
      wallet.activeP2pk = active;
    },
    registerWatchers() {
      if (this.watchersRegistered) {
        return;
      }
      const wallet = useWalletStore();
      const p2pk = useP2PKStore();
      watch(
        () => p2pk.p2pkKeys,
        async (keys) => {
          if (!this.isUnlocked) return;
          this.payload = {
            ...this.payload,
            p2pkKeys: cloneP2pkKeys(keys as P2PKKey[]),
          };
          await this.persistPayload();
        },
        { deep: true },
      );
      watch(
        () => wallet.activeP2pk,
        async (active) => {
          if (!this.isUnlocked) return;
          this.payload = {
            ...this.payload,
            activeP2pk: cloneActiveP2pk(active as ActiveP2pk),
          };
          await this.persistPayload();
        },
        { deep: true },
      );
      this.watchersRegistered = true;
    },
  },
});

