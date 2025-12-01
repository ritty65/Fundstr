import { debug } from "src/js/logger";
import { defineStore, StoreDefinition } from "pinia";
import { useLocalStorage } from "@vueuse/core";
import { useWorkersStore } from "./workers";
import {
  notifyApiError,
  notifyError,
  notifySuccess,
  notifyWarning,
} from "src/js/notify";
import {
  CashuMint,
  CashuAuthMint,
  CashuAuthWallet,
  MintKeys,
  MintAllKeysets,
  MintActiveKeys,
  Proof,
  SerializedBlindedSignature,
  MintKeyset,
  GetInfoResponse,
  getEncodedAuthToken,
} from "@cashu/cashu-ts";
import { useUiStore } from "./ui";
import { cashuDb } from "src/stores/dexie";
import { liveQuery } from "dexie";
import { ref, computed, watch } from "vue";
import { WalletProof } from "src/types/proofs";
import { useProofsStore } from "./proofs";
import { useI18n } from "vue-i18n";
import { maybeRepublishNutzapProfile } from "src/nutzap/profileRepublish";
import { useCreatorProfileStore } from "./creatorProfile";
import { i18n } from "src/boot/i18n";

export type Mint = {
  url: string;
  keys: MintKeys[];
  keysets: MintKeyset[];
  nickname?: string;
  info?: GetInfoResponse;
  errored?: boolean;
  motd_viewed?: boolean;
  // initialize api: new CashuMint(url) on activation
};

type MintAuthState = {
  tokens: string[];
  clearAuthToken?: string;
  keysets?: MintKeyset[];
  keys?: MintKeys[];
};

const mintAuthWalletCache = new Map<string, CashuAuthWallet>();
const mintAuthWalletPromises = new Map<string, Promise<CashuAuthWallet>>();
const pendingBlindAuthFetches = new Map<string, Promise<string[]>>();
const lastIssuedBlindAuthTokens = new Map<string, string>();

export class BlindAuthError extends Error {
  code: "missing-clear-token" | "mint-error";
  mintUrl: string;
  constructor(
    mintUrl: string,
    message: string,
    code: "missing-clear-token" | "mint-error",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BlindAuthError";
    this.code = code;
    this.mintUrl = mintUrl;
  }
}

export class MintClass {
  mint: Mint;
  constructor(mint: Mint) {
    this.mint = mint;
  }
  get api() {
    const mintsStore = useMintsStore();
    const needsBlindAuth = mintsStore.mintHasProtectedEndpoints(this.mint);
    const authTokenGetter = needsBlindAuth
      ? () => mintsStore.getBlindAuthToken(this.mint.url)
      : undefined;
    return new CashuMint(this.mint.url, undefined, authTokenGetter);
  }
  get proofs() {
    const proofsStore = useProofsStore();
    return proofsStore.proofs.filter((p) =>
      this.mint.keysets.map((k) => k.id).includes(p.id),
    );
  }
  get allBalances() {
    // return an object with all balances for each unit
    const balances: Record<string, number> = {};
    this.units.forEach((unit) => {
      balances[unit] = this.unitBalance(unit);
    });
    return balances;
  }

  get keysets() {
    return this.mint.keysets.filter((k) => k.active);
  }

  get units() {
    return this.mint.keysets
      .map((k) => k.unit)
      .filter((value, index, self) => self.indexOf(value) === index);
  }

  unitKeysets(unit: string): MintKeyset[] {
    return this.mint.keysets.filter((k) => k.unit === unit);
  }

  unitProofs(unit: string): WalletProof[] {
    const proofsStore = useProofsStore();
    const unitKeysets = this.unitKeysets(unit);
    return proofsStore.proofs.filter(
      (p) => unitKeysets.map((k) => k.id).includes(p.id) && !p.reserved,
    );
  }

  unitBalance(unit: string) {
    const proofs = this.unitProofs(unit);
    return proofs.reduce((sum, p) => sum + p.amount, 0);
  }
}

export type Balances = {
  [unit: string]: number;
};

type BlindSignatureAudit = {
  signature: SerializedBlindedSignature;
  amount: number;
  secret: Uint8Array;
  id: string;
  r: string;
};

export const useMintsStore = defineStore("mints", {
  state: () => {
    const t = i18n.global.t;
    const activeProofs = ref<WalletProof[]>([]);
    const activeUnit = useLocalStorage<string>("cashu.activeUnit", "sat");
    const activeMintUrl = useLocalStorage<string>("cashu.activeMintUrl", "");
    const addMintData = ref({
      url: "",
      nickname: "",
    });
    const mints = useLocalStorage("cashu.mints", [] as Mint[]);
    const showAddMintDialog = ref(false);
    const addMintBlocking = ref(false);
    const showRemoveMintDialog = ref(false);
    const showMintInfoDialog = ref(false);
    const showMintInfoData = ref({} as Mint);
    const showEditMintDialog = ref(false);
    const mintAuth = useLocalStorage<Record<string, MintAuthState>>(
      "cashu.mints.auth",
      {},
    );

    const uiStoreGlobal: any = useUiStore();

    // Watch for changes in activeMintUrl and activeUnit
    watch([activeMintUrl, activeUnit], async () => {
      const proofsStore = useProofsStore();
      debug(
        `watcher: activeMintUrl: ${activeMintUrl.value}, activeUnit: ${activeUnit.value}`,
      );
      await proofsStore.updateActiveProofs();
    });

    const isValidUrl = (url: string): boolean => {
      if (!url || url === "undefined") {
        return false;
      }
      try {
        const parsed = new URL(url);
        if (parsed.hostname === "undefined") {
          activeMintUrl.value = "";
          return false;
        }
        return parsed.protocol === "https:";
      } catch {
        return false;
      }
    };

    if (!isValidUrl(activeMintUrl.value)) {
      activeMintUrl.value = "";
      uiStoreGlobal.setTab("mints");
    }

    return {
      t,
      activeProofs,
      activeUnit,
      activeMintUrl,
      addMintData,
      mints,
      showAddMintDialog,
      addMintBlocking,
      showRemoveMintDialog,
      showMintInfoDialog,
      showMintInfoData,
      showEditMintDialog,
      uiStoreGlobal,
      mintAuth,
    };
  },
  getters: {
    totalUnitBalance({ activeUnit }): number {
      const proofsStore = useProofsStore();
      const allUnitKeysets = this.mints
        .map((m) => m.keysets)
        .flat()
        .filter((k) => k.unit === activeUnit);
      const balance = proofsStore.proofs
        .filter((p) => allUnitKeysets.map((k) => k.id).includes(p.id))
        .filter((p) => !p.reserved)
        .reduce((sum, p) => sum + p.amount, 0);
      this.uiStoreGlobal.lastBalanceCached = balance;
      return balance;
    },
    activeBalance(): number {
      return this.activeProofs
        .flat()
        .reduce((sum, el) => (sum += el.amount), 0);
    },
    activeKeysets({ activeMintUrl, activeUnit }): MintKeyset[] {
      const unitKeysets = this.mints
        .find((m) => m.url === activeMintUrl)
        ?.keysets?.filter((k) => k.unit === activeUnit);
      if (!unitKeysets) {
        return [];
      }
      return unitKeysets;
    },
    activeKeys({ activeMintUrl, activeUnit }): MintKeys[] {
      const unitKeys = this.mints
        .find((m) => m.url === activeMintUrl)
        ?.keys?.filter((k) => k.unit === activeUnit);
      if (!unitKeys) {
        return [];
      }
      return unitKeys;
    },
    activeInfo({ activeMintUrl }): GetInfoResponse {
      return (
        this.mints.find((m) => m.url === activeMintUrl)?.info ||
        ({} as GetInfoResponse)
      );
    },
    activeUnitLabel({ activeUnit }): string {
      if (activeUnit == "sat") {
        return "SAT";
      } else if (activeUnit == "usd") {
        return "USD";
      } else if (activeUnit == "eur") {
        return "EUR";
      } else if (activeUnit == "msat") {
        return "mSAT";
      } else {
        return activeUnit;
      }
    },
    activeUnitCurrencyMultiplyer({ activeUnit }): number {
      if (activeUnit == "usd") {
        return 100;
      } else if (activeUnit == "eur") {
        return 100;
      } else {
        return 1;
      }
    },
  },
  actions: {
    activeMint() {
      const mint = this.mints.find((m) => m.url === this.activeMintUrl);
      if (mint) {
        return new MintClass(mint);
      } else {
        if (this.mints.length) {
          console.error(
            "No active mint. This should not happen. switching to first one.",
          );
          this.activateMintUrl(this.mints[0].url, false, true);
          return new MintClass(this.mints[0]);
        }
        throw new Error("No active mint");
      }
    },
    mintUnitProofs(mint: Mint, unit: string): WalletProof[] {
      const proofsStore = useProofsStore();
      const unitKeysets = mint.keysets.filter((k) => k.unit === unit);
      return proofsStore.proofs.filter(
        (p) => unitKeysets.map((k) => k.id).includes(p.id) && !p.reserved,
      );
    },
    mintUnitKeysets(mint: Mint, unit: string): MintKeyset[] {
      return mint.keysets.filter((k) => k.unit === unit);
    },
    toggleUnit: function () {
      const units = this.activeMint().units;
      this.activeUnit =
        units[(units.indexOf(this.activeUnit) + 1) % units.length];
      return this.activeUnit;
    },
    toggleActiveUnitForMint(mint: Mint) {
      // method to set the active unit to one that is supported by `mint`
      const mintClass = new MintClass(mint);
      if (
        !this.activeUnit ||
        mintClass.allBalances[this.activeUnit] == undefined
      ) {
        this.activeUnit = mintClass.units[0];
      }
    },
    updateMint(oldMint: Mint, newMint: Mint) {
      const index = this.mints.findIndex((m) => m.url === oldMint.url);
      this.mints[index] = newMint;
    },
    getKeysForKeyset: async function (keyset_id: string): Promise<MintKeys> {
      const mint = this.mints.find((m) => m.url === this.activeMintUrl);
      if (mint) {
        const keys = mint.keys?.find((k) => k.id === keyset_id);
        if (keys) {
          return keys;
        } else {
          throw new Error("Keys not found");
        }
      } else {
        throw new Error("Mint not found");
      }
    },
    addMint: async function (
      addMintData: { url: string; nickname?: string },
      verbose = false,
    ): Promise<Mint> {
      let url = addMintData.url;
      this.addMintBlocking = true;
      try {
        // sanitize url
        const sanitizeUrl = (url: string): string | null => {
          try {
            if (!/^[a-zA-Z]+:\/\//.test(url)) {
              url = "https://" + url;
            }
            const urlObj = new URL(url);
            if (urlObj.protocol !== "https:") {
              return null;
            }
            urlObj.hostname = urlObj.hostname.toLowerCase();
            urlObj.hash = "";
            urlObj.search = "";
            const path = urlObj.pathname;
            if (path && path !== "" && path !== "/" && path !== "/mint") {
              notifyWarning(`Unexpected mint path: ${path}`);
            }
            return urlObj.toString().replace(/\/$/, "");
          } catch (e) {
            return null;
          }
        };
        const sanitized = sanitizeUrl(url);
        if (!sanitized) {
          notifyError(
            this.t("MintSettings.add.actions.add_mint.error_invalid_url"),
          );
          throw new Error("invalid mint url");
        }
        url = sanitized;

        const mintToAdd: Mint = {
          url: url,
          keys: [],
          keysets: [],
          nickname: addMintData.nickname,
        };

        // we have no mints at all
        if (this.mints.length === 0) {
          this.mints = [mintToAdd];
        } else if (this.mints.filter((m) => m.url === url).length === 0) {
          // we don't have this mint yet
          // add mint to this.mints so it can be activated in
          this.mints.push(mintToAdd);
        } else {
          // we already have this mint
          if (verbose) {
            notifySuccess(this.t("wallet.mint.notifications.already_added"));
          }
          return mintToAdd;
        }
        await this.activateMint(mintToAdd, false, true);
        if (verbose) {
          await notifySuccess(this.t("wallet.mint.notifications.added"));
        }
        const profileStore = useCreatorProfileStore();
        if (!profileStore.mints.length) {
          profileStore.mints = [url];
        }
        await maybeRepublishNutzapProfile();
        return mintToAdd;
      } catch (error) {
        // activation failed, we remove the mint again from local storage
        this.mints = this.mints.filter((m) => m.url !== url);
        throw error;
      } finally {
        this.showAddMintDialog = false;
        this.addMintBlocking = false;
      }
    },
    activateMintUrl: async function (
      url: string,
      verbose = false,
      force = false,
      unit: string | undefined = undefined,
    ) {
      const mint = this.mints.filter((m) => m.url === url)[0];
      if (mint) {
        await this.activateMint(mint, verbose, force);
        if (unit) {
          await this.activateUnit(unit, verbose);
        }
      } else {
        notifyError(
          this.t("wallet.mint.notifications.not_found"),
          this.t("wallet.mint.notifications.activation_failed"),
        );
      }
    },
    activateUnit: async function (unit: string, verbose = false) {
      if (unit === this.activeUnit) {
        return;
      }
      const uIStore = useUiStore();
      await uIStore.lockMutex();
      try {
        const mint = this.mints.find((m) => m.url === this.activeMintUrl);
        if (!mint) {
          notifyError(
            this.t("wallet.mint.notifications.no_active_mint"),
            this.t("wallet.mint.notifications.unit_activation_failed"),
          );
          return;
        }
        const mintClass = new MintClass(mint);
        if (mintClass.units.includes(unit)) {
          this.activeUnit = unit;
        } else {
          notifyError(
            this.t("wallet.mint.notifications.unit_not_supported"),
            this.t("wallet.mint.notifications.unit_activation_failed"),
          );
        }
      } finally {
        await uIStore.unlockMutex();
      }
      const worker = useWorkersStore();
      worker.clearAllWorkers();
    },
    activateMint: async function (mint: Mint, verbose = false, force = false) {
      if (mint.url === this.activeMintUrl && !force) {
        return;
      }
      const workers = useWorkersStore();
      const uIStore = useUiStore();
      // we need to stop workers because they will reset the activeMint again
      workers.clearAllWorkers();

      // create new mint.api instance because we can't store it in local storage
      let previousUrl = this.activeMintUrl;
      await uIStore.lockMutex();
      try {
        this.activeMintUrl = mint.url;
        debug("### this.activeMintUrl", this.activeMintUrl);
        const newMintInfo = await this.fetchMintInfo(mint);
        this.triggerMintInfoMotdChanged(newMintInfo, mint);
        mint.info = newMintInfo;
        await this.initializeBlindAuth(mint);
        debug("### activateMint: Mint info: ", mint.info);
        mint = await this.fetchMintKeys(mint);
        this.toggleActiveUnitForMint(mint);
        if (verbose) {
          await notifySuccess(this.t("wallet.mint.notifications.activated"));
        }
        this.mints.filter((m) => m.url === mint.url)[0].errored = false;
        debug("### activateMint: Mint activated: ", this.activeMintUrl);
      } catch (error: any) {
        // restore previous values because the activation errored
        // this.activeMintUrl = previousUrl;
        let err_msg = this.t("wallet.mint.notifications.could_not_connect");
        if (error.message.length) {
          err_msg = err_msg + ` ${error.message}.`;
        }
        await notifyError(
          err_msg,
          this.t("wallet.mint.notifications.activation_failed"),
        );
        this.mints.filter((m) => m.url === mint.url)[0].errored = true;
        throw error;
      } finally {
        await uIStore.unlockMutex();
      }
    },
    checkMintInfoMotdChanged(newMintInfo: GetInfoResponse, mint: Mint) {
      // if mint doesn't have info yet, we don't need to trigger the motd change
      if (!this.mints.find((m) => m.url === mint.url)?.info) {
        return false;
      }
      const motd = newMintInfo.motd;
      if (motd !== this.mints.filter((m) => m.url === mint.url)[0].info?.motd) {
        return true;
      }
      return false;
    },
    triggerMintInfoMotdChanged(newMintInfo: GetInfoResponse, mint: Mint) {
      if (!this.checkMintInfoMotdChanged(newMintInfo, mint)) {
        return;
      }
      // set motd_viewed to false
      this.mints.filter((m) => m.url === mint.url)[0].motd_viewed = false;
      // set the mintinfo data
      this.showMintInfoData = mint;
      // open mint info dialog
      this.showMintInfoDialog = true;
    },
    fetchMintInfo: async function (mint: Mint) {
      try {
        const mintClass = new MintClass(mint);
        const data = await mintClass.api.getInfo();
        return data;
      } catch (error: any) {
        console.error(error);
        try {
          notifyApiError(error, this.t("wallet.mint.notifications.could_not_get_info"));
        } catch {}
        throw error;
      }
    },
    fetchMintKeys: async function (mint: Mint): Promise<Mint> {
      try {
        const mintClass = new MintClass(mint);
        const keysets = await this.fetchMintKeysets(mint);
        if (keysets.length > 0) {
          // store keysets in mint and update local storage
          // TODO: do not overwrite anykeyset, but append new keysets and update existing ones
          this.mints.filter((m) => m.url === mint.url)[0].keysets = keysets;
        }

        // if we do not have any keys yet, fetch them
        if (mint.keys.length === 0 || mint.keys.length == undefined) {
          const keys = await mintClass.api.getKeys();
          // store keys in mint and update local storage
          this.mints.filter((m) => m.url === mint.url)[0].keys = keys.keysets;
        }
        // reload mint from local storage
        mint = this.mints.filter((m) => m.url === mint.url)[0];

        // for each keyset we do not have keys for, fetch keys
        for (const keyset of keysets) {
          if (!mint.keys.find((k) => k.id === keyset.id)) {
            const keys = await mintClass.api.getKeys(keyset.id);
            // store keys in mint and update local storage
            this.mints
              .filter((m) => m.url === mint.url)[0]
              .keys.push(keys.keysets[0]);
          }
        }

        // return the mint with keys set
        return this.mints.filter((m) => m.url === mint.url)[0];
      } catch (error: any) {
        console.error(error);
        try {
          notifyApiError(error, this.t("wallet.mint.notifications.could_not_get_keys"));
        } catch {}
        throw error;
      }
    },
    fetchMintKeysets: async function (mint: Mint) {
      // attention: this function overwrites this.keysets
      try {
        const mintClass = new MintClass(mint);
        const data = await mintClass.api.getKeySets();
        return data.keysets;
      } catch (error: any) {
        console.error(error);
        try {
          notifyApiError(error, this.t("wallet.mint.notifications.could_not_get_keysets"));
        } catch {}
        throw error;
      }
    },
    removeMint: async function (url: string) {
      this.mints = this.mints.filter((m) => m.url !== url);
      if (url === this.activeMintUrl) {
        this.activeMintUrl = "";
      }
      // todo: we always reset to the first mint, improve this
      if (this.mints.length > 0) {
        await this.activateMint(this.mints[0], false);
      }
      const profileStore = useCreatorProfileStore();
      profileStore.mints = profileStore.mints.filter((m) => m !== url);
      notifySuccess(this.t("wallet.mint.notifications.removed"));
      delete this.mintAuth[url];
      mintAuthWalletCache.delete(url);
      mintAuthWalletPromises.delete(url);
      pendingBlindAuthFetches.delete(url);
      lastIssuedBlindAuthTokens.delete(url);
    },
    assertMintError: function (response: { error?: any }, verbose = true) {
      if (response.error != null) {
        if (verbose) {
          notifyError(
            response.error,
            this.t("wallet.mint.notifications.error"),
          );
        }
        throw new Error(`Mint error: ${response.error}`);
      }
    },
    setMintMotdViewed(mintUrl: string) {
      const mintIndex = this.mints.findIndex((mint) => mint.url === mintUrl);
      if (mintIndex !== -1) {
        this.mints[mintIndex].motd_viewed = true;
      }
    },
    ensureMintAuthState(mintUrl: string): MintAuthState {
      const existing = this.mintAuth[mintUrl];
      if (existing && Array.isArray(existing.tokens)) {
        return existing;
      }
      const next: MintAuthState = { tokens: [] };
      this.mintAuth[mintUrl] = next;
      return next;
    },
    updateMintAuthState(
      mintUrl: string,
      updater: (state: MintAuthState) => MintAuthState,
    ) {
      const current = this.ensureMintAuthState(mintUrl);
      const cloned: MintAuthState = {
        tokens: [...(current.tokens ?? [])],
        clearAuthToken: current.clearAuthToken,
        keysets: current.keysets ? [...current.keysets] : undefined,
        keys: current.keys ? [...current.keys] : undefined,
      };
      this.mintAuth[mintUrl] = updater(cloned);
    },
    setMintClearAuthToken(mintUrl: string, token: string | null) {
      this.updateMintAuthState(mintUrl, (state) => ({
        ...state,
        clearAuthToken: token ?? undefined,
      }));
    },
    mintHasProtectedEndpoints(mint: Mint | string): boolean {
      const target =
        typeof mint === "string"
          ? this.mints.find((m) => m.url === mint)
          : mint;
      const endpoints = (target?.info as any)?.nuts?.[22]?.protected_endpoints;
      return Array.isArray(endpoints) && endpoints.length > 0;
    },
    mintRequiresBlindAuth(mint: Mint, path: string): boolean {
      const endpoints = (mint.info as any)?.nuts?.[22]?.protected_endpoints;
      if (!Array.isArray(endpoints) || endpoints.length === 0) {
        return false;
      }
      return endpoints.some((endpoint: any) => {
        if (typeof endpoint?.path !== "string") {
          return false;
        }
        try {
          return new RegExp(endpoint.path).test(path);
        } catch (error) {
          console.warn("Failed to evaluate blind auth endpoint regex", {
            error,
            endpoint,
          });
          return endpoint.path === path;
        }
      });
    },
    async initializeBlindAuth(mint: Mint) {
      if (!this.mintHasProtectedEndpoints(mint)) {
        return;
      }
      try {
        await this.getAuthWallet(mint);
      } catch (error) {
        console.warn("Failed to initialize blind auth wallet", error);
      }
    },
    async getAuthWallet(mint: Mint): Promise<CashuAuthWallet> {
      const existing = mintAuthWalletCache.get(mint.url);
      if (existing) {
        return existing;
      }
      const pending = mintAuthWalletPromises.get(mint.url);
      if (pending) {
        return pending;
      }
      const loader = (async () => {
        const state = this.ensureMintAuthState(mint.url);
        const options: {
          keys?: MintKeys[] | MintKeys;
          keysets?: MintKeyset[];
        } = {};
        if (state.keys && state.keys.length) {
          options.keys = state.keys;
        }
        if (state.keysets && state.keysets.length) {
          options.keysets = state.keysets;
        }
        const wallet = new CashuAuthWallet(new CashuAuthMint(mint.url), options);
        if (!state.keys?.length || !state.keysets?.length) {
          await wallet.loadMint();
          this.updateMintAuthState(mint.url, (current) => ({
            ...current,
            keysets: wallet.keysets,
            keys: Array.from(wallet.keys.values()),
          }));
        }
        mintAuthWalletCache.set(mint.url, wallet);
        return wallet;
      })();
      mintAuthWalletPromises.set(mint.url, loader);
      try {
        return await loader;
      } finally {
        mintAuthWalletPromises.delete(mint.url);
      }
    },
    async fetchBlindAuthTokens(mint: Mint, amount = 1): Promise<string[]> {
      if (!this.mintHasProtectedEndpoints(mint)) {
        return [];
      }
      const existing = pendingBlindAuthFetches.get(mint.url);
      if (existing) {
        return existing;
      }
      const request = (async () => {
        const state = this.ensureMintAuthState(mint.url);
        if (!state.clearAuthToken) {
          throw new BlindAuthError(
            mint.url,
            "Mint requires a clear auth token to mint blind-auth tokens.",
            "missing-clear-token",
          );
        }
        const wallet = await this.getAuthWallet(mint);
        const maxBatch = Number(
          (mint.info as any)?.nuts?.[22]?.bat_max_mint ?? amount,
        );
        const batchSize = Math.max(
          1,
          Math.min(Number.isFinite(maxBatch) ? maxBatch : 1, amount),
        );
        try {
          const proofs = await wallet.mintProofs(batchSize, state.clearAuthToken);
          const tokens = proofs.map((p) => getEncodedAuthToken(p));
          this.updateMintAuthState(mint.url, (current) => ({
            ...current,
            tokens: [...current.tokens, ...tokens],
            keysets: wallet.keysets,
            keys: Array.from(wallet.keys.values()),
          }));
          return tokens;
        } catch (error) {
          throw new BlindAuthError(
            mint.url,
            "Failed to mint blind-auth tokens from mint.",
            "mint-error",
            { cause: error },
          );
        }
      })();
      pendingBlindAuthFetches.set(mint.url, request);
      try {
        return await request;
      } finally {
        pendingBlindAuthFetches.delete(mint.url);
      }
    },
    async ensureBlindAuthPrepared(mint: Mint, path: string): Promise<boolean> {
      if (!this.mintRequiresBlindAuth(mint, path)) {
        return false;
      }
      await this.getAuthWallet(mint);
      const state = this.ensureMintAuthState(mint.url);
      if (!state.tokens.length) {
        const maxBatch = Number((mint.info as any)?.nuts?.[22]?.bat_max_mint ?? 1);
        const batch = Math.max(1, Math.min(5, Number.isFinite(maxBatch) ? maxBatch : 1));
        await this.fetchBlindAuthTokens(mint, batch);
      }
      return true;
    },
    async getBlindAuthToken(mintUrl: string): Promise<string> {
      const mint = this.mints.find((m) => m.url === mintUrl);
      if (!mint) {
        throw new Error(`Mint not found: ${mintUrl}`);
      }
      const state = this.ensureMintAuthState(mintUrl);
      if (!state.tokens.length) {
        await this.fetchBlindAuthTokens(mint, 1);
      }
      const refreshed = this.ensureMintAuthState(mintUrl);
      const [token, ...rest] = refreshed.tokens ?? [];
      if (!token) {
        throw new BlindAuthError(
          mint.url,
          "Mint did not provide a blind-auth token.",
          "mint-error",
        );
      }
      this.updateMintAuthState(mintUrl, (current) => ({
        ...current,
        tokens: rest,
      }));
      lastIssuedBlindAuthTokens.set(mintUrl, token);
      return token;
    },
    finalizeBlindAuthToken(mintUrl: string, success: boolean) {
      const token = lastIssuedBlindAuthTokens.get(mintUrl);
      if (!token) {
        return;
      }
      if (!success) {
        this.updateMintAuthState(mintUrl, (current) => ({
          ...current,
          tokens: [token, ...current.tokens],
        }));
      }
      lastIssuedBlindAuthTokens.delete(mintUrl);
    },
  },
});
