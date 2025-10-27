import { vi } from "vitest";
import { SimpleStub, QBtnStub, QBannerStub, QTabsStub, QTabStub, QTabPanelsStub, QTabPanelStub, QExpansionItemStub, QDialogStub, QSkeletonStub } from "./quasarStubs";

const signerType = {
  NIP07: "nip07",
  PRIVATE_KEY: "private_key",
};

vi.mock("src/stores/ui", async () => {
  const { defineStore } = await import("pinia");
  return {
    useUiStore: defineStore("ui", {
      state: () => ({
        tickerShort: "USD",
        showInvoiceDetails: false,
        showSendDialog: false,
        showReceiveDialog: false,
        expandHistory: false,
        tab: "history",
        showMissingSignerModal: false,
      }),
      actions: {
        enableDebugConsole() {
          /* noop */
        },
        setTab(this: any, value: string) {
          this.tab = value;
        },
      },
    }),
  };
});

vi.mock("src/stores/mints", async () => {
  const { defineStore } = await import("pinia");
  return {
    useMintsStore: defineStore("mints", {
      state: () => ({
        activeMintUrl: "",
        activeProofs: [],
        keys: [],
        mints: [],
        activeMint: null,
        addMintData: {},
        showAddMintDialog: false,
      }),
      actions: {
        activateMintUrl: vi.fn(),
        addMint: vi.fn(),
        assertMintError: vi.fn(),
        getBalance: vi.fn(async () => 0),
        setActiveProofs: vi.fn(),
        setProofs: vi.fn(),
        getKeysForKeyset: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/sendTokensStore", async () => {
  const { defineStore } = await import("pinia");
  return {
    useSendTokensStore: defineStore("sendTokens", {
      state: () => ({
        showSendTokens: false,
        sendData: { tokens: "", tokensBase64: "", amount: null, memo: "" },
      }),
    }),
  };
});

vi.mock("src/stores/receiveTokensStore", async () => {
  const { defineStore } = await import("pinia");
  return {
    useReceiveTokensStore: defineStore("receiveTokens", {
      state: () => ({
        showReceiveTokens: false,
        receiveData: { tokensBase64: "" },
      }),
    }),
  };
});

vi.mock("src/stores/workers", async () => {
  const { defineStore } = await import("pinia");
  return {
    useWorkersStore: defineStore("workers", {
      state: () => ({
        invoiceCheckListener: null,
        tokensCheckSpendableListener: null,
      }),
      actions: {
        clearAllWorkers: vi.fn(),
        invoiceCheckWorker: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/tokens", async () => {
  const { defineStore } = await import("pinia");
  return {
    useTokensStore: defineStore("tokens", {
      state: () => ({ historyTokens: [] }),
      actions: {
        setTokenPaid: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/wallet", async () => {
  const { defineStore } = await import("pinia");
  return {
    useWalletStore: defineStore("wallet", {
      state: () => ({
        invoiceData: {
          amount: "",
          bolt11: "",
          hash: "",
          memo: "",
        },
        payInvoiceData: {
          show: false,
          invoice: null,
          lnurlpay: null,
          lnurlauth: null,
          input: {
            request: "",
            amount: 0,
            comment: "",
            paymentChecker: null,
          },
        },
      }),
      actions: {
        setInvoicePaid: vi.fn(),
        mint: vi.fn(),
        checkPendingTokens: vi.fn(),
        decodeRequest: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/mnemonic", async () => {
  const { defineStore } = await import("pinia");
  return {
    useMnemonicStore: defineStore("mnemonic", {
      state: () => ({}),
      actions: {
        initializeMnemonic: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/invoiceHistory", async () => {
  const { defineStore } = await import("pinia");
  return {
    useInvoiceHistoryStore: defineStore("invoiceHistory", {
      state: () => ({ invoiceHistory: [] }),
    }),
  };
});

vi.mock("src/stores/proofs", async () => {
  const { defineStore } = await import("pinia");
  return {
    useProofsStore: defineStore("proofs", {
      state: () => ({}),
      actions: {
        serializeProofs: vi.fn(),
        getProofsMint: vi.fn(),
        serializeProofsV2: vi.fn(),
        sumProofs: vi.fn(),
        deleteProofs: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/camera", async () => {
  const { defineStore } = await import("pinia");
  return {
    useCameraStore: defineStore("camera", {
      state: () => ({
        camera: { show: false, data: "" },
        hasCamera: false,
      }),
      actions: {
        closeCamera: vi.fn(),
        showCamera: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/p2pk", async () => {
  const { defineStore } = await import("pinia");
  return {
    useP2PKStore: defineStore("p2pk", {
      state: () => ({ showP2PKDialog: false }),
    }),
  };
});

vi.mock("src/stores/nwc", async () => {
  const { defineStore } = await import("pinia");
  return {
    useNWCStore: defineStore("nwc", {
      state: () => ({ showNWCDialog: false, nwcEnabled: false }),
      actions: {
        listenToNWCCommands: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/npubcash", async () => {
  const { defineStore } = await import("pinia");
  return {
    useNPCStore: defineStore("npc", {
      state: () => ({}),
      actions: {
        generateNPCConnection: vi.fn(),
        claimAllTokens: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/nostr", async () => {
  const { defineStore } = await import("pinia");
  return {
    useNostrStore: defineStore("nostr", {
      state: () => ({
        signerType: signerType.PRIVATE_KEY,
        hasIdentity: true,
        relays: ["wss://relay"],
        failedRelays: [] as string[],
        pubkey: "npub",
      }),
      actions: {
        sendDirectMessageUnified: vi.fn(),
        ensureDmListeners: vi.fn(),
        initSigner: vi.fn(),
        checkNip07Signer: vi.fn(async () => true),
        initNip07Signer: vi.fn(),
        initSignerIfNotSet: vi.fn(),
        loadIdentity: vi.fn(),
        setDrawer: vi.fn(),
      },
    }),
    SignerType: signerType,
  };
});

vi.mock("src/stores/payment-request", async () => {
  const { defineStore } = await import("pinia");
  return {
    usePRStore: defineStore("paymentRequest", {
      state: () => ({ enablePaymentRequest: false }),
      actions: {
        createPaymentRequest: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/dexie", async () => {
  const { defineStore } = await import("pinia");
  return {
    useDexieStore: defineStore("dexie", {
      state: () => ({}),
      actions: {
        migrateToDexie: vi.fn(async () => undefined),
      },
    }),
  };
});

vi.mock("src/stores/storage", async () => {
  const { defineStore } = await import("pinia");
  return {
    useStorageStore: defineStore("storage", {
      state: () => ({}),
      actions: {
        checkLocalStorage: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/invoicesWorker", async () => {
  const { defineStore } = await import("pinia");
  return {
    useInvoicesWorkerStore: defineStore("invoicesWorker", {
      state: () => ({}),
      actions: {
        startInvoiceCheckerWorker: vi.fn(),
        checkPendingInvoices: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/lockedTokensRedeemWorker", async () => {
  const { defineStore } = await import("pinia");
  return {
    useLockedTokensRedeemWorker: defineStore("lockedTokensRedeem", {
      state: () => ({}),
      actions: {
        startLockedTokensRedeemWorker: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/subscriptionRedeemWorker", async () => {
  const { defineStore } = await import("pinia");
  return {
    useSubscriptionRedeemWorker: defineStore("subscriptionRedeem", {
      state: () => ({}),
      actions: {
        start: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/cashuSendWorker", async () => {
  const { defineStore } = await import("pinia");
  return {
    useCashuSendWorker: defineStore("cashuSend", {
      state: () => ({}),
      actions: {
        start: vi.fn(),
      },
    }),
  };
});

vi.mock("src/stores/migrations", async () => {
  const { defineStore } = await import("pinia");
  return {
    useMigrationsStore: defineStore("migrations", {
      state: () => ({}),
      actions: {
        initMigrations: vi.fn(),
        runMigrations: vi.fn(async () => undefined),
      },
    }),
  };
});

vi.mock("src/stores/welcome", async () => {
  const { defineStore } = await import("pinia");
  return {
    useWelcomeStore: defineStore("welcome", {
      state: () => ({ welcomeCompleted: true }),
    }),
  };
});

vi.mock("src/stores/signer", async () => {
  const { defineStore } = await import("pinia");
  return {
    useSignerStore: defineStore("signer", {
      state: () => ({ method: null }),
      actions: {
        reset(this: any) {
          this.method = null;
        },
      },
    }),
  };
});

vi.mock("src/stores/onboarding", async () => {
  const { defineStore } = await import("pinia");
  return {
    useOnboardingStore: defineStore("onboarding", {
      state: () => ({ completed: false }),
      actions: {
        markComplete(this: any) {
          this.completed = true;
        },
      },
    }),
  };
});

vi.mock("src/stores/messenger", async () => {
  const { defineStore } = await import("pinia");
  return {
    useMessengerStore: defineStore("messenger", {
      state: () => ({
        connected: true,
        currentConversation: "npub",
        conversations: { npub: [] as unknown[] },
        relayInfos: [],
        sendQueue: [],
        failedRelays: [] as string[],
        messages: [],
        drawerOpen: false,
        connecting: false,
        connectedRelays: 1,
        totalRelays: 1,
        nextReconnectIn: null as number | null,
        started: true,
      }),
      actions: {
        loadIdentity: vi.fn(),
        start: vi.fn(async () => undefined),
        retryFailedMessages: vi.fn(),
        startChat: vi.fn(),
        setCurrentConversation: vi.fn(),
        setDrawer: vi.fn(function (this: any, value: boolean) {
          this.drawerOpen = value;
        }),
        reconnectAll: vi.fn(),
        removeRelay: vi.fn(),
        disconnect: vi.fn(),
        sendDm: vi.fn(),
      },
    }),
  };
});

vi.mock("@gandlaf21/bc-ur", () => ({
  UR: {},
  UREncoder: class {},
  URDecoder: class {},
}));

vi.mock("src/js/token", () => ({
  default: {
    decode: vi.fn(() => ({})),
    getProofs: vi.fn(() => []),
    getMint: vi.fn(() => ({})),
  },
}));

vi.mock("src/composables/useNdk", () => ({
  useNdk: vi.fn(async () => ({})),
}));

vi.mock("src/js/notify", () => ({
  notify: vi.fn(),
  notifyError: vi.fn(),
  notifyWarning: vi.fn(),
}));

vi.mock("lucide-vue-next", async () => {
  const { defineComponent, h } = await import("vue");
  const cache: Record<string | symbol, any> = { __esModule: true };
  return new Proxy(cache, {
    get(target, prop) {
      if (!(prop in target)) {
        target[prop] = defineComponent({
          name: `${String(prop)}Stub`,
          setup(_, { attrs }) {
            return () => h("span", { class: "icon-stub", "data-icon": String(prop), ...attrs });
          },
        });
      }
      return target[prop];
    },
    has() {
      return true;
    },
  });
});

vi.mock("quasar", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    TouchSwipe: {},
    useQuasar: () => ({
      dark: { isActive: false },
      screen: { gt: { xs: true }, lt: { md: false } },
    }),
    date: { formatDate: vi.fn((value: any) => value) },
    QPage: SimpleStub('QPage'),
    QBanner: QBannerStub,
    QBtn: QBtnStub,
    QSpinner: SimpleStub('QSpinner'),
    QSpace: SimpleStub('QSpace'),
    QDialog: QDialogStub,
    QTabs: QTabsStub,
    QTab: QTabStub,
    QTabPanels: QTabPanelsStub,
    QTabPanel: QTabPanelStub,
    QExpansionItem: QExpansionItemStub,
    QSkeleton: QSkeletonStub,
    QIcon: SimpleStub('QIcon'),
    QCard: SimpleStub('QCard'),
    QCardSection: SimpleStub('QCardSection'),
    QSeparator: SimpleStub('QSeparator'),
    QTooltip: SimpleStub('QTooltip'),
    QItem: SimpleStub('QItem'),
    QItemSection: SimpleStub('QItemSection'),
  };
});

export const SignerTypeMock = signerType;
