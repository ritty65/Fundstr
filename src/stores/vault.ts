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
  }),
  getters: {
    hasEncryptedVault: () => hasEncryptedVault(),
    isUnlocked: (state) => state.unlocked && Boolean(state.encryptionKey),
  },
  actions: {
    async setEncryptionKeyFromPin(pin: string) {
      const salt = ensureVaultSalt();
      this.encryptionKey = await deriveVaultKey(pin, salt);
      this.unlocked = true;
      this.payload = defaultVaultPayload();
      await this.persistPayload();
      this.applyPayloadToStores();
      this.registerWatchers();
    },
    async unlockWithPin(pin: string) {
      const salt = localStorage.getItem(VAULT_SALT_STORAGE_KEY);
      if (!salt) {
        throw new Error("No vault configured. Set your PIN first.");
      }
      this.encryptionKey = await deriveVaultKey(pin, salt);
      await this.loadPayload();
      this.unlocked = true;
      this.registerWatchers();
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

