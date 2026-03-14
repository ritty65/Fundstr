import { beforeEach, describe, expect, it, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { ref } from "vue";

import { useNPCStore } from "stores/npubcash";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

const notifyModule = vi.hoisted(() => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyApiError: vi.fn(),
  notifyWarning: vi.fn(),
  notify: vi.fn(),
}));

vi.mock("src/js/notify", () => ({
  __esModule: true,
  ...notifyModule,
}));

vi.mock("@vueuse/core", () => ({
  __esModule: true,
  useLocalStorage: vi.fn((_key: string, value: any) => ref(value)),
}));

const storeMocks = vi.hoisted(() => ({
  nostrStore: {
    pubkey: "",
    initSignerIfNotSet: vi.fn(async () => {}),
    signer: {},
  },
  receiveStore: {
    receiveData: {
      tokensBase64: "",
      description: undefined as string | undefined,
    },
    showReceiveTokens: false,
    enqueue: vi.fn(async (fn: () => unknown) => fn()),
  },
  walletStore: {
    redeem: vi.fn(async () => {}),
  },
  tokensStore: {
    historyTokens: [] as Array<{ token: string }>,
    addPendingToken: vi.fn(),
  },
}));

vi.mock("stores/nostr", () => ({
  __esModule: true,
  useNostrStore: () => storeMocks.nostrStore,
}));

vi.mock("stores/receiveTokensStore", () => ({
  __esModule: true,
  useReceiveTokensStore: () => storeMocks.receiveStore,
}));

vi.mock("stores/wallet", () => ({
  __esModule: true,
  useWalletStore: () => storeMocks.walletStore,
}));

vi.mock("stores/tokens", () => ({
  __esModule: true,
  useTokensStore: () => storeMocks.tokensStore,
}));

const tokenModule = vi.hoisted(() => ({
  decode: vi.fn(),
  getProofs: vi.fn(),
  getMint: vi.fn(),
  getUnit: vi.fn(),
}));

vi.mock("src/js/token", () => ({
  __esModule: true,
  default: tokenModule,
}));

const nip19Mock = vi.hoisted(() => ({
  npubEncode: vi.fn(() => "npub1encoded"),
}));

vi.mock("nostr-tools", () => ({
  __esModule: true,
  nip19: nip19Mock,
  generateSecretKey: vi.fn(),
  getPublicKey: vi.fn(),
}));

vi.mock("src/composables/useNdk", () => ({
  __esModule: true,
  useNdk: vi.fn(async () => ({})),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const {
  notifySuccess,
  notifyError,
  notifyApiError,
} = notifyModule;
const { nostrStore, receiveStore, walletStore, tokensStore } = storeMocks;
const {
  decode: decodeTokenMock,
  getProofs: getProofsMock,
  getMint: getMintMock,
  getUnit: getUnitMock,
} = tokenModule;

let store: ReturnType<typeof useNPCStore>;

const resetReceiveStore = () => {
  receiveStore.receiveData = {
    tokensBase64: "",
    description: undefined,
  };
  receiveStore.showReceiveTokens = false;
  receiveStore.enqueue = vi.fn(async (fn: () => any) => fn());
};

describe("npc store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());

    fetchMock.mockReset();
    notifySuccess.mockReset();
    notifyError.mockReset();
    notifyApiError.mockReset();
    nip19Mock.npubEncode.mockReset();
    nip19Mock.npubEncode.mockReturnValue("npub1encoded");

    nostrStore.pubkey = "f".repeat(64);
    nostrStore.initSignerIfNotSet.mockReset();
    nostrStore.initSignerIfNotSet.mockResolvedValue(undefined);

    resetReceiveStore();

    walletStore.redeem = vi.fn(async () => {});

    tokensStore.historyTokens = [];
    tokensStore.addPendingToken.mockReset();

    decodeTokenMock.mockReset();
    getProofsMock.mockReset();
    getMintMock.mockReset();
    getUnitMock.mockReset();

    store = useNPCStore();
    store.baseURL = "https://npub.cash";
    store.npcDomain = "npub.cash";
  });

  describe("generateNPCConnection", () => {
    it("configures address and base URL when disabled", async () => {
      store.npcEnabled = false;

      await store.generateNPCConnection();

      expect(notifySuccess).toHaveBeenCalledWith(
        "Lightning address for wallet: npub1encoded@npub.cash",
      );
      expect(store.baseURL).toBe("https://npub.cash");
      expect(store.npcAddress).toBe("npub1encoded@npub.cash");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(store.npcLoading).toBe(false);
    });

    it("loads info and updates address when enabled", async () => {
      store.npcEnabled = true;
      const getInfoMock = vi
        .spyOn(store, "getInfo")
        .mockResolvedValue({
          mintUrl: "https://mint",
          npub: "npub1",
          username: "alice",
        } as any);

      await store.generateNPCConnection();

      expect(getInfoMock).toHaveBeenCalled();
      expect(notifySuccess).toHaveBeenCalledWith(
        "Lightning address for wallet: npub1encoded@npub.cash",
      );
      expect(notifySuccess).toHaveBeenCalledWith("Logged in as alice");
      expect(store.npcAddress).toBe("alice@npub.cash");
      expect(store.npcLoading).toBe(false);
    });

    it("notifies when info contains error", async () => {
      store.npcEnabled = true;
      vi.spyOn(store, "getInfo").mockResolvedValue({
        mintUrl: "",
        npub: "",
        username: "",
        error: "Invalid signature",
      });

      await store.generateNPCConnection();

      expect(notifyError).toHaveBeenCalledWith("Invalid signature");
      expect(store.npcAddress).toBe("npub1encoded@npub.cash");
      expect(store.npcLoading).toBe(false);
    });

    it("reports API errors", async () => {
      store.npcEnabled = true;
      const error = new Error("boom");
      vi.spyOn(store, "getInfo").mockRejectedValue(error);

      await store.generateNPCConnection();

      expect(notifyApiError).toHaveBeenCalledWith(error);
      expect(store.npcLoading).toBe(false);
    });
  });

  describe("getInfo", () => {
    it("returns info payload on success", async () => {
      store.generateNip98Event = vi.fn().mockResolvedValue("auth-token");
      const infoResponse = {
        mintUrl: "https://mint",
        npub: "npub1",
        username: "bob",
        error: "",
      };
      fetchMock.mockResolvedValue({
        json: async () => infoResponse,
      });

      const result = await store.getInfo();

      expect(store.generateNip98Event).toHaveBeenCalledWith(
        "https://npub.cash/api/v1/info",
        "GET",
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://npub.cash/api/v1/info",
        {
          method: "GET",
          headers: { Authorization: "Nostr auth-token" },
        },
      );
      expect(result).toEqual(infoResponse);
    });

    it("returns defaults when fetch fails", async () => {
      store.generateNip98Event = vi.fn().mockResolvedValue("auth-token");
      const error = new Error("network");
      fetchMock.mockRejectedValue(error);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await store.getInfo();

      expect(result).toEqual({
        mintUrl: "",
        npub: "",
        username: "",
      });
      expect(consoleSpy).toHaveBeenCalledWith(error);
      consoleSpy.mockRestore();
    });
  });

  describe("getBalance", () => {
    it("returns numeric balance on success", async () => {
      store.generateNip98Event = vi.fn().mockResolvedValue("auth");
      fetchMock.mockResolvedValue({
        json: async () => ({ error: "", data: 42 }),
      });

      const result = await store.getBalance();

      expect(result).toBe(42);
    });

    it("returns zero when API reports error", async () => {
      store.generateNip98Event = vi.fn().mockResolvedValue("auth");
      fetchMock.mockResolvedValue({
        json: async () => ({ error: "failure", data: 99 }),
      });

      const result = await store.getBalance();

      expect(result).toBe(0);
    });

    it("returns zero when fetch throws", async () => {
      store.generateNip98Event = vi.fn().mockResolvedValue("auth");
      const error = new Error("timeout");
      fetchMock.mockRejectedValue(error);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await store.getBalance();

      expect(result).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(error);
      consoleSpy.mockRestore();
    });
  });

  describe("getClaim", () => {
    it("returns token on success", async () => {
      store.generateNip98Event = vi.fn().mockResolvedValue("auth");
      fetchMock.mockResolvedValue({
        json: async () => ({ error: "", data: { token: "token-123" } }),
      });

      const result = await store.getClaim();

      expect(result).toBe("token-123");
    });

    it("returns empty string when API reports error", async () => {
      store.generateNip98Event = vi.fn().mockResolvedValue("auth");
      fetchMock.mockResolvedValue({
        json: async () => ({ error: "failure", data: { token: "token-456" } }),
      });

      const result = await store.getClaim();

      expect(result).toBe("");
    });

    it("returns empty string when fetch throws", async () => {
      store.generateNip98Event = vi.fn().mockResolvedValue("auth");
      const error = new Error("bad response");
      fetchMock.mockRejectedValue(error);
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await store.getClaim();

      expect(result).toBe("");
      expect(consoleSpy).toHaveBeenCalledWith(error);
      consoleSpy.mockRestore();
    });
  });

  describe("claimAllTokens", () => {
    it("exits early when NPC integration disabled", async () => {
      store.npcEnabled = false;
      const balanceSpy = vi.spyOn(store, "getBalance");

      await store.claimAllTokens();

      expect(balanceSpy).not.toHaveBeenCalled();
    });

    it("does nothing when balance is zero", async () => {
      store.npcEnabled = true;
      vi.spyOn(store, "getBalance").mockResolvedValue(0);
      const claimSpy = vi.spyOn(store, "getClaim");

      await store.claimAllTokens();

      expect(claimSpy).not.toHaveBeenCalled();
      expect(receiveStore.receiveData.tokensBase64).toBe("");
      expect(receiveStore.showReceiveTokens).toBe(false);
    });

    it("redeems tokens automatically on success", async () => {
      store.npcEnabled = true;
      vi.spyOn(store, "getBalance").mockResolvedValue(25);
      vi.spyOn(store, "getClaim").mockResolvedValue("encoded-token");
      vi.spyOn(store, "addPendingTokenToHistory").mockImplementation(() => {});

      await store.claimAllTokens();

      expect(notifySuccess).toHaveBeenCalledWith(
        "You have 25 sats on npub.cash",
      );
      expect(store.getClaim).toHaveBeenCalled();
      expect(store.addPendingTokenToHistory).toHaveBeenCalledWith("encoded-token");
      expect(receiveStore.receiveData.tokensBase64).toBe("encoded-token");
      expect(walletStore.redeem).toHaveBeenCalledWith("encoded-token");
      expect(receiveStore.showReceiveTokens).toBe(false);
    });

    it("shows receive dialog when automatic claim disabled", async () => {
      store.npcEnabled = true;
      store.automaticClaim = false;
      vi.spyOn(store, "getBalance").mockResolvedValue(10);
      vi.spyOn(store, "getClaim").mockResolvedValue("encoded-token");
      vi.spyOn(store, "addPendingTokenToHistory").mockImplementation(() => {});

      await store.claimAllTokens();

      expect(walletStore.redeem).not.toHaveBeenCalled();
      expect(receiveStore.showReceiveTokens).toBe(true);
    });

    it("reveals receive dialog when automatic claim fails", async () => {
      store.npcEnabled = true;
      vi.spyOn(store, "getBalance").mockResolvedValue(5);
      vi.spyOn(store, "getClaim").mockResolvedValue("encoded-token");
      vi.spyOn(store, "addPendingTokenToHistory").mockImplementation(() => {});
      walletStore.redeem = vi.fn().mockRejectedValue(new Error("redeem failed"));
      receiveStore.enqueue = vi.fn(async (fn: () => Promise<any>) => fn());

      await store.claimAllTokens();

      expect(walletStore.redeem).toHaveBeenCalledWith("encoded-token");
      expect(receiveStore.showReceiveTokens).toBe(true);
    });
  });

  describe("addPendingTokenToHistory", () => {
    it("notifies when token already exists in history", () => {
      tokensStore.historyTokens = [{ token: "duplicate" } as any];
      receiveStore.showReceiveTokens = true;

      store.addPendingTokenToHistory("duplicate");

      expect(notifySuccess).toHaveBeenCalledWith("Ecash already in history");
      expect(tokensStore.addPendingToken).not.toHaveBeenCalled();
      expect(receiveStore.showReceiveTokens).toBe(false);
    });

    it("adds pending token with computed details", () => {
      tokensStore.historyTokens = [];
      receiveStore.receiveData.description = "from npc";
      decodeTokenMock.mockReturnValue({});
      getProofsMock.mockReturnValue([
        { amount: 2 },
        { amount: 3 },
      ]);
      getMintMock.mockReturnValue("https://mint");
      getUnitMock.mockReturnValue("sat");

      store.addPendingTokenToHistory("encoded-token");

      expect(decodeTokenMock).toHaveBeenCalledWith("encoded-token");
      expect(tokensStore.addPendingToken).toHaveBeenCalledWith({
        amount: 5,
        tokenStr: "encoded-token",
        mint: "https://mint",
        unit: "sat",
        label: "",
        description: "from npc",
        bucketId: DEFAULT_BUCKET_ID,
      });
      expect(receiveStore.showReceiveTokens).toBe(false);
    });
  });
});
