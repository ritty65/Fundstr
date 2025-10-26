import { boot } from "quasar/wrappers";
import { nextTick } from "vue";
import { useWelcomeStore } from "src/stores/welcome";
import { useMnemonicStore } from "src/stores/mnemonic";
import { useMintsStore } from "src/stores/mints";
import { useProofsStore } from "src/stores/proofs";
import { useUiStore } from "src/stores/ui";
import { useSettingsStore } from "src/stores/settings";
import { useCreatorProfileStore } from "src/stores/creatorProfile";
import { useSubscriptionsStore } from "src/stores/subscriptions";
import { useMessengerStore } from "src/stores/messenger";
import { useTokensStore } from "src/stores/tokens";
import { useInvoiceHistoryStore } from "src/stores/invoiceHistory";
import type { MessengerMessage } from "src/stores/messenger";
import type { Proof } from "@cashu/cashu-ts";
import type { WalletProof } from "src/types/proofs";
import { MintQuoteState, MeltQuoteState } from "@cashu/cashu-ts";
import { currentDateStr } from "src/js/utils";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";

declare global {
  interface Window {
    __FUNDSTR_E2E__?: Record<string, any>;
  }
}

function deleteIndexedDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = window.indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

type CreditProofsHandler = (amounts: number[]) => Promise<void>;

type MintQuoteMock = {
  id: string;
  amount: number;
  unit: string;
  request: string;
  expiry: number;
  mintUrl: string;
  state: (typeof MintQuoteState)[keyof typeof MintQuoteState];
};

type LightningInvoiceMock = {
  id: string;
  request: string;
  amount: number;
  unit: string;
  description: string;
  feeReserve: number;
  state: (typeof MeltQuoteState)[keyof typeof MeltQuoteState];
};

class WalletMockController {
  private readonly wallet = useWalletStore();
  private readonly proofsStore = useProofsStore();
  private readonly tokensStore = useTokensStore();
  private readonly invoiceHistoryStore = useInvoiceHistoryStore();
  private readonly mintsStore = useMintsStore();

  private creditProofsHandler: CreditProofsHandler | null = null;
  private installed = false;
  private mintCounter = 1;
  private meltCounter = 1;
  private lastMintQuote: string | null = null;
  private mintQuotes = new Map<string, MintQuoteMock>();
  private lightningInvoices = new Map<string, LightningInvoiceMock>();
  private invoicesByRequest = new Map<string, LightningInvoiceMock>();

  private readonly originalRequestMint = this.wallet.requestMint.bind(this.wallet);
  private readonly originalDecodeRequest = this.wallet.decodeRequest.bind(this.wallet);
  private readonly originalMeltQuoteInvoiceData = this.wallet.meltQuoteInvoiceData.bind(
    this.wallet,
  );
  private readonly originalMelt = this.wallet.melt.bind(this.wallet);

  install() {
    if (this.installed) {
      return;
    }

    const controller = this;

    this.wallet.requestMint = async function (amount: number, mintWallet: any) {
      const unit = mintWallet.unit ?? controller.mintsStore.activeUnit ?? "sat";
      const mintUrl = mintWallet.mint?.mintUrl ?? controller.mintsStore.activeMintUrl;
      const quoteId = `mock-quote-${controller.mintCounter++}`;
      const response: MintQuoteMock = {
        id: quoteId,
        amount,
        unit,
        request: `lnbc${amount}mock${quoteId}`,
        expiry: Date.now() + 10 * 60 * 1000,
        mintUrl,
        state: MintQuoteState.UNPAID,
      };
      controller.mintQuotes.set(quoteId, response);
      controller.lastMintQuote = quoteId;

      this.invoiceData.amount = amount;
      this.invoiceData.bolt11 = response.request;
      this.invoiceData.quote = quoteId;
      this.invoiceData.date = currentDateStr();
      this.invoiceData.status = "pending";
      this.invoiceData.mint = mintUrl;
      this.invoiceData.unit = unit;
      this.invoiceData.mintQuote = {
        quote: quoteId,
        request: response.request,
        amount,
        unit,
        expiry: response.expiry,
        state: MintQuoteState.UNPAID,
      } as any;
      controller.invoiceHistoryStore.invoiceHistory.push({
        ...this.invoiceData,
      });

      return this.invoiceData.mintQuote;
    };

    this.wallet.decodeRequest = async function (req: string) {
      const trimmed = req.trim();
      const invoice = controller.invoicesByRequest.get(trimmed);
      if (!invoice) {
        return controller.originalDecodeRequest(trimmed);
      }

      this.payInvoiceData.input.request = invoice.request;
      const invoiceData = Object.freeze({
        bolt11: invoice.request,
        memo: invoice.description,
        sat: invoice.amount,
        msat: invoice.amount * 1000,
        fsat: invoice.amount,
        hash: `mock-hash-${invoice.id}`,
        description: invoice.description,
        timestamp: Math.floor(Date.now() / 1000),
        expireDate: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        expired: false,
      });
      this.payInvoiceData.invoice = invoiceData as any;
      this.payInvoiceData.blocking = false;
      this.payInvoiceData.meltQuote.response = {
        quote: invoice.id,
        amount: invoice.amount,
        fee_reserve: invoice.feeReserve,
        state: invoice.state,
        expiry: Date.now() + 10 * 60 * 1000,
        request: invoice.request,
        unit: invoice.unit,
      } as any;
      this.payInvoiceData.meltQuote.error = "";
      this.payInvoiceData.show = true;
    };

    this.wallet.meltQuoteInvoiceData = async function () {
      const request = this.payInvoiceData.input.request;
      const invoice = controller.invoicesByRequest.get(request);
      if (!invoice) {
        return controller.originalMeltQuoteInvoiceData();
      }
      const response = {
        quote: invoice.id,
        amount: invoice.amount,
        fee_reserve: invoice.feeReserve,
        state: invoice.state,
        expiry: Date.now() + 10 * 60 * 1000,
        request: invoice.request,
        unit: invoice.unit,
      } as any;
      this.payInvoiceData.meltQuote.response = response;
      this.payInvoiceData.meltQuote.error = "";
      this.payInvoiceData.blocking = false;
      return response;
    };

    this.wallet.melt = async function (proofs: WalletProof[], quote: any, mintWallet: any) {
      const invoice = controller.mintQuotes.get(quote.quote) ||
        controller.lightningInvoices.get(quote.quote);
      const lightning = controller.lightningInvoices.get(quote.quote);
      if (!lightning) {
        return controller.originalMelt(proofs, quote, mintWallet);
      }

      await this.addOutgoingPendingInvoiceToHistory({
        ...quote,
        request: lightning.request,
        unit: lightning.unit,
      } as any);

      const bucketId = proofs[0]?.bucketId ?? DEFAULT_BUCKET_ID;
      const amountNeeded = quote.amount + quote.fee_reserve;
      let remaining = amountNeeded;
      const toSpend: Proof[] = [];
      for (const proof of proofs) {
        if (remaining <= 0) {
          break;
        }
        toSpend.push(proof);
        remaining -= proof.amount;
      }
      if (remaining > 0) {
        throw new Error("insufficient proofs for mock melt");
      }

      await controller.proofsStore.removeProofs(toSpend, bucketId);

      const serialized = controller.proofsStore.serializeProofs(toSpend);
      controller.tokensStore.addPaidToken({
        amount: -quote.amount,
        token: serialized,
        mint: mintWallet.mint?.mintUrl ?? controller.mintsStore.activeMintUrl,
        unit: mintWallet.unit ?? controller.mintsStore.activeUnit,
        description: this.payInvoiceData.invoice?.description ?? "",
        bucketId,
      });

      controller.invoiceHistoryStore.updateOutgoingInvoiceInHistory(
        {
          ...quote,
          state: MeltQuoteState.PAID,
        } as any,
        { status: "paid", amount: -quote.amount },
      );

      lightning.state = MeltQuoteState.PAID;
      this.payInvoiceData.meltQuote.response = {
        ...quote,
        state: MeltQuoteState.PAID,
      } as any;
      this.payInvoiceData.invoice = { sat: 0, memo: "", bolt11: "" } as any;
      this.payInvoiceData.show = false;

      return {
        quote: {
          ...quote,
          state: MeltQuoteState.PAID,
        },
        change: [],
      } as any;
    };

    this.installed = true;
  }

  setCreditProofsHandler(handler: CreditProofsHandler) {
    this.creditProofsHandler = handler;
  }

  reset() {
    this.mintCounter = 1;
    this.meltCounter = 1;
    this.lastMintQuote = null;
    this.mintQuotes.clear();
    this.lightningInvoices.clear();
    this.invoicesByRequest.clear();
  }

  getLastMintQuote() {
    return this.lastMintQuote;
  }

  async payMintQuote(
    quoteId: string,
    options?: { proofAmounts?: number[]; description?: string },
  ) {
    const quote = this.mintQuotes.get(quoteId);
    if (!quote) {
      throw new Error(`Unknown mint quote ${quoteId}`);
    }
    const amounts = options?.proofAmounts?.length
      ? options.proofAmounts
      : [quote.amount];
    if (this.creditProofsHandler) {
      await this.creditProofsHandler(amounts);
    }
    quote.state = MintQuoteState.PAID;
    const invoice = this.invoiceHistoryStore.invoiceHistory.find(
      (entry) => entry.quote === quoteId,
    );
    if (invoice) {
      invoice.status = "paid";
      invoice.mintQuote = {
        ...invoice.mintQuote,
        state: MintQuoteState.PAID,
      } as any;
    }
    this.wallet.invoiceData.status = "paid";
    this.wallet.invoiceData.mintQuote = {
      ...(this.wallet.invoiceData.mintQuote as any),
      state: MintQuoteState.PAID,
    };

    const tokenId = `mock-mint-token-${quoteId}-${Date.now()}`;
    this.tokensStore.addPaidToken({
      amount: quote.amount,
      token: tokenId,
      mint: quote.mintUrl,
      unit: quote.unit,
      description: options?.description ?? invoice?.memo ?? "",
      bucketId: invoice?.bucketId ?? DEFAULT_BUCKET_ID,
    });
  }

  createLightningInvoice(config: {
    amount: number;
    description?: string;
    feeReserve?: number;
  }) {
    const id = `mock-ln-${this.meltCounter++}`;
    const request = `mock-ln-invoice-${id}`;
    const invoice: LightningInvoiceMock = {
      id,
      request,
      amount: config.amount,
      unit: this.mintsStore.activeUnit || "sat",
      description: config.description ?? "",
      feeReserve: config.feeReserve ?? 0,
      state: MeltQuoteState.UNPAID,
    };
    this.lightningInvoices.set(id, invoice);
    this.invoicesByRequest.set(request, invoice);
    return { request, quote: id };
  }

  getHistoryTokens() {
    return this.tokensStore.historyTokens.slice();
  }

  getInvoiceHistory() {
    return this.invoiceHistoryStore.invoiceHistory.slice();
  }
}

const walletMock = new WalletMockController();
walletMock.install();

export default boot(() => {
  if (!import.meta.env.VITE_E2E) {
    return;
  }

  const ui = useUiStore();
  const settings = useSettingsStore();
  settings.checkIncomingInvoices = false;
  settings.periodicallyCheckIncomingInvoices = false;
  settings.useWebsockets = false;
  ui.globalMutexLock = false;

  const api = {
    async reset() {
      localStorage.clear();
      sessionStorage.clear();
      await deleteIndexedDb("cashuDatabase");
      const welcome = useWelcomeStore();
      welcome.$reset?.();
      welcome.showWelcome = true;
      welcome.currentSlide = 0;
      welcome.seedPhraseValidated = false;
      welcome.walletRestored = false;
      welcome.termsAccepted = false;
      welcome.nostrSetupCompleted = false;
      welcome.mintConnected = false;
      welcome.featuresVisited = {
        creatorStudio: false,
        subscriptions: false,
        buckets: false,
      };
      welcome.welcomeCompleted = false;
      const mints = useMintsStore();
      mints.mints = [];
      mints.activeMintUrl = "";
      mints.activeProofs = [];
      await nextTick();
      walletMock.reset();
    },
    async bootstrap() {
      const mnemonic = useMnemonicStore();
      if (!mnemonic.mnemonic) {
        await mnemonic.initializeMnemonic();
      }
      ui.mainNavOpen = false;
    },
    async seedMint(config: {
      url: string;
      nickname?: string;
      keysetId: string;
    }) {
      const mints = useMintsStore();
      const mintEntry = {
        url: config.url,
        nickname: config.nickname ?? "E2E Mint",
        keysets: [
          {
            id: config.keysetId,
            unit: "sat",
            active: true,
          },
        ],
        keys: [
          {
            id: config.keysetId,
            unit: "sat",
            keys: {
              1: "02" + "1".repeat(64),
              2: "02" + "2".repeat(64),
              4: "02" + "3".repeat(64),
              8: "02" + "4".repeat(64),
              16: "02" + "5".repeat(64),
              32: "02" + "6".repeat(64),
              64: "02" + "7".repeat(64),
              128: "02" + "8".repeat(64),
              256: "02" + "9".repeat(64),
              512: "02" + "a".repeat(64),
              1024: "02" + "b".repeat(64),
            },
          },
        ],
        info: {
          name: "E2E Mint",
          pubkey: "e2e",
          version: "0.0-test",
          contact: [],
          nuts: {
            4: { methods: [], disabled: false },
            5: { methods: [], disabled: false },
          },
        },
      } as any;
      mints.mints = [mintEntry];
      mints.activeMintUrl = config.url;
      mints.addMintData.url = config.url;
      localStorage.setItem("cashu.mints", JSON.stringify([mintEntry]));
      localStorage.setItem("cashu.activeMintUrl", config.url);
      localStorage.setItem("cashu.activeUnit", "sat");
      await nextTick();
    },
    async creditProofs(amounts: number[]) {
      const proofsStore = useProofsStore();
      const mints = useMintsStore();
      const keysetId =
        mints.activeKeysets[0]?.id || mints.mints[0]?.keysets?.[0]?.id;
      if (!keysetId) return;
      const proofs: Proof[] = amounts.map((amount, index) => ({
        amount,
        id: keysetId,
        secret: `e2e-secret-${Date.now()}-${index}-${Math.random()}`,
        C: `e2e-C-${Date.now()}-${index}`,
      }));
      await proofsStore.addProofs(proofs);
      await proofsStore.updateActiveProofs();
    },
    async debitProofs(amounts: number[]) {
      const proofsStore = useProofsStore();
      const proofs = await proofsStore.getProofs();
      const toRemove: Proof[] = [];
      for (const amount of amounts) {
        const index = proofs.findIndex(
          (p) => p.amount === amount && !toRemove.includes(p as Proof),
        );
        if (index >= 0) {
          toRemove.push(proofs[index]);
        }
      }
      if (toRemove.length) {
        await proofsStore.removeProofs(toRemove);
        await proofsStore.updateActiveProofs();
      }
    },
    async generateToken(amount: number) {
      await api.debitProofs([amount]);
      const token = `cashu:e2e-token-${amount}-${Date.now()}`;
      localStorage.setItem("e2e.lastToken", token);
      return token;
    },
    async redeemToken(amount: number) {
      await api.creditProofs([amount]);
    },
    async setCreatorProfile(profile: Record<string, unknown>) {
      const creator = useCreatorProfileStore();
      creator.setProfile(profile as any);
      creator.markClean();
    },
    async addSubscription(data: {
      creatorNpub: string;
      tierId: string;
      amountPerInterval: number;
      frequency?: string;
    }) {
      const store = useSubscriptionsStore();
      await store.addSubscription({
        creatorNpub: data.creatorNpub,
        tierId: data.tierId,
        creatorP2PK: "",
        mintUrl: useMintsStore().activeMintUrl || "https://mint.test",
        amountPerInterval: data.amountPerInterval,
        frequency: (data.frequency as any) ?? "monthly",
        startDate: Date.now(),
        commitmentLength: 1,
        intervals: [],
        status: "active",
        creatorName: "E2E Creator",
        tierName: "Supporter",
        benefits: [],
        creatorAvatar: "",
      } as any);
    },
    async seedConversation(pubkey: string, messages: MessengerMessage[]) {
      const messenger = useMessengerStore();
      const key = messenger.normalizeKey(pubkey);
      messenger.conversations[key] = messages;
      messenger.currentConversation = key;
    },
    getSnapshot() {
      const mints = useMintsStore();
      const subs = useSubscriptionsStore();
      const messenger = useMessengerStore();
      const activeConversation = messenger.currentConversation;
      const conversation = activeConversation
        ? messenger.conversations[activeConversation] || []
        : [];
      return {
        balance: mints.totalUnitBalance,
        subscriptions: subs.subscriptions.value.map((s) => s.id),
        conversationCount: conversation.length,
      };
    },
    walletMockPayMintQuote(
      quote: string,
      options?: { proofAmounts?: number[]; description?: string },
    ) {
      return walletMock.payMintQuote(quote, options);
    },
    walletMockGetLastMintQuote() {
      return walletMock.getLastMintQuote();
    },
    walletMockCreateLightningInvoice(config: {
      amount: number;
      description?: string;
      feeReserve?: number;
    }) {
      return walletMock.createLightningInvoice(config);
    },
    getHistoryTokens() {
      return walletMock.getHistoryTokens();
    },
    getInvoiceHistory() {
      return walletMock.getInvoiceHistory();
    },
  };

  walletMock.setCreditProofsHandler((amounts) => api.creditProofs(amounts));

  window.__FUNDSTR_E2E__ = api;
});

