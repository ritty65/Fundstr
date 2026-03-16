import { boot } from "quasar/wrappers";
import { nextTick } from "vue";
import { useWelcomeStore } from "src/stores/welcome";
import { useWalletStore } from "src/stores/wallet";
import { useMnemonicStore } from "src/stores/mnemonic";
import { useMintsStore } from "src/stores/mints";
import { useProofsStore } from "src/stores/proofs";
import { useUiStore } from "src/stores/ui";
import { useSettingsStore } from "src/stores/settings";
import { useCreatorProfileStore } from "src/stores/creatorProfile";
import { generateP2pkKeyPair, useP2PKStore } from "src/stores/p2pk";
/* eslint-disable @typescript-eslint/no-this-alias */
import { useSubscriptionsStore } from "src/stores/subscriptions";
import { useMessengerStore } from "src/stores/messenger";
import { useTokensStore } from "src/stores/tokens";
import { useInvoiceHistoryStore } from "src/stores/invoiceHistory";
import type { LocalEchoMeta, MessengerMessage } from "src/stores/messenger";
import { buildEventContent, normalizeFileMeta } from "src/utils/messengerFiles";
import type { FileMeta } from "src/utils/messengerFiles";
import type { Proof } from "@cashu/cashu-ts";
import type { WalletProof } from "src/types/proofs";
import { MintQuoteState, MeltQuoteState } from "@cashu/cashu-ts";
import { currentDateStr } from "src/js/utils";
import { DEFAULT_BUCKET_ID } from "@/constants/buckets";
import type { Event as NostrEvent } from "nostr-tools";
import { markWelcomeSeen, resetWelcome } from "src/composables/useWelcomeGate";
import { useNostrStore } from "src/stores/nostr";
import { useCreatorHub } from "src/composables/useCreatorHub";

declare global {
  interface Window {
    __FUNDSTR_E2E__?: Record<string, any>;
    __FUNDSTR_E2E_READY__?: boolean;
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

function createMockProof(amount: number, keysetId: string, tag: string): Proof {
  const timestamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    amount,
    id: keysetId,
    secret: `e2e-${tag}-secret-${timestamp}`,
    C: `e2e-${tag}-C-${timestamp}`,
  };
}

function selectProofsForAmount(
  proofs: WalletProof[],
  targetAmount: number,
): { selected: WalletProof[]; total: number } {
  const sorted = [...proofs].sort((left, right) => right.amount - left.amount);
  const selected: WalletProof[] = [];
  let total = 0;

  for (const proof of sorted) {
    if (total >= targetAmount) {
      break;
    }
    selected.push(proof);
    total += proof.amount;
  }

  if (total < targetAmount) {
    throw new Error(`Unable to cover mock amount ${targetAmount}`);
  }

  return { selected, total };
}

class WalletMockController {
  private get wallet() {
    return useWalletStore();
  }

  private get proofsStore() {
    return useProofsStore();
  }

  private get tokensStore() {
    return useTokensStore();
  }

  private get invoiceHistoryStore() {
    return useInvoiceHistoryStore();
  }

  private get mintsStore() {
    return useMintsStore();
  }

  private creditProofsHandler: CreditProofsHandler | null = null;
  private installed = false;
  private mintCounter = 1;
  private meltCounter = 1;
  private lastMintQuote: string | null = null;
  private mintQuotes = new Map<string, MintQuoteMock>();
  private lightningInvoices = new Map<string, LightningInvoiceMock>();
  private invoicesByRequest = new Map<string, LightningInvoiceMock>();

  private originalRequestMint: any = null;
  private originalDecodeRequest: any = null;
  private originalMeltQuoteInvoiceData: any = null;
  private originalMelt: any = null;

  install() {
    if (this.installed) {
      return;
    }

    const wallet = this.wallet;
    const controller = this;

    this.originalRequestMint = wallet.requestMint.bind(wallet);
    this.originalDecodeRequest = wallet.decodeRequest.bind(wallet);
    this.originalMeltQuoteInvoiceData =
      wallet.meltQuoteInvoiceData.bind(wallet);
    this.originalMelt = wallet.melt.bind(wallet);

    wallet.requestMint = async function (
      this: any,
      amount: number,
      mintWallet: any,
    ) {
      const unit = mintWallet.unit ?? controller.mintsStore.activeUnit ?? "sat";
      const mintUrl =
        mintWallet.mint?.mintUrl ?? controller.mintsStore.activeMintUrl;
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
    } as any;

    wallet.decodeRequest = async function (req: string) {
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

    wallet.meltQuoteInvoiceData = async function () {
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

    wallet.melt = async function (
      proofs: WalletProof[],
      quote: any,
      mintWallet: any,
    ) {
      const invoice =
        controller.mintQuotes.get(quote.quote) ||
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
      const { selected, total } = selectProofsForAmount(proofs, amountNeeded);
      const toSpend: Proof[] = selected;
      const changeAmount = total - amountNeeded;

      await controller.proofsStore.removeProofs(toSpend, bucketId);
      const keysetId =
        controller.mintsStore.activeKeysets[0]?.id ||
        controller.mintsStore.mints[0]?.keysets?.[0]?.id;
      const changeProofs =
        changeAmount > 0 && keysetId
          ? [createMockProof(changeAmount, keysetId, "melt-change")]
          : [];
      if (changeProofs.length) {
        await controller.proofsStore.addProofs(
          changeProofs,
          undefined,
          bucketId,
          "",
        );
        controller.proofsStore.proofs =
          await controller.proofsStore.getProofs();
        await controller.proofsStore.updateActiveProofs();
      }

      const serialized = controller.proofsStore.serializeProofs(toSpend);
      controller.tokensStore.addPaidToken({
        amount: -quote.amount,
        token: serialized,
        mint: mintWallet.mint?.mintUrl ?? controller.mintsStore.activeMintUrl,
        unit: mintWallet.unit ?? controller.mintsStore.activeUnit,
        description: this.payInvoiceData.invoice?.memo ?? "",
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
        change: changeProofs,
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
      bucketId:
        (invoice as { bucketId?: string } | undefined)?.bucketId ??
        DEFAULT_BUCKET_ID,
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

export default boot(() => {
  if (!import.meta.env.VITE_E2E) {
    return;
  }

  const walletMock = new WalletMockController();
  walletMock.install();

  const ui = useUiStore();
  const settings = useSettingsStore();
  settings.checkIncomingInvoices = false;
  settings.periodicallyCheckIncomingInvoices = false;
  settings.useWebsockets = false;
  ui.globalMutexLock = false;

  const messenger = useMessengerStore();
  const getConversationMap = () => {
    const raw = (messenger as any).conversations;
    return raw && typeof raw === "object" && "value" in raw ? raw.value : raw;
  };
  const getCurrentConversation = () => {
    const raw = (messenger as any).currentConversation;
    return raw && typeof raw === "object" && "value" in raw ? raw.value : raw;
  };
  const originalExecuteSendWithMeta =
    messenger.executeSendWithMeta.bind(messenger);
  type ExecuteOptions = Parameters<typeof messenger.executeSendWithMeta>[0];
  type ExecuteResult = Awaited<ReturnType<typeof originalExecuteSendWithMeta>>;
  let messengerSendMock:
    | null
    | ((options: ExecuteOptions) => Promise<ExecuteResult>) = null;

  messenger.executeSendWithMeta = async function (
    options: ExecuteOptions,
  ): Promise<ExecuteResult> {
    if (messengerSendMock) {
      return messengerSendMock(options);
    }
    return originalExecuteSendWithMeta(options);
  };

  const api = {
    async reset() {
      localStorage.clear();
      sessionStorage.clear();
      resetWelcome();
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
      const p2pkStore = useP2PKStore();
      p2pkStore.p2pkKeys = [];
      p2pkStore.verificationRecords = {};
      const wallet = useWalletStore();
      wallet.setActiveP2pk("", "");
      const mints = useMintsStore();
      mints.mints = [];
      mints.activeMintUrl = "";
      mints.activeProofs = [];
      await nextTick();
      walletMock.reset();
      messengerSendMock = null;
      messenger.currentConversation = "";
      messenger.started = false;
      messenger.conversations = {} as any;
      messenger.eventLog = [] as any;
      messenger.unreadCounts = {} as any;
      messenger.aliases = {} as any;
      messenger.pinned = {} as any;
      for (const key of Object.keys(messenger.localEchoTimeouts)) {
        const handle = messenger.localEchoTimeouts[key];
        if (handle) {
          clearTimeout(handle);
        }
        delete messenger.localEchoTimeouts[key];
      }
    },
    async bootstrap() {
      const mnemonic = useMnemonicStore();
      if (!mnemonic.mnemonic) {
        await mnemonic.initializeMnemonic();
      }
      ui.mainNavOpen = false;
    },
    async finishWelcome() {
      const mnemonic = useMnemonicStore();
      if (!mnemonic.mnemonic) {
        await mnemonic.initializeMnemonic();
      }

      const welcome = useWelcomeStore();
      welcome.seedPhraseValidated = true;
      welcome.walletRestored = true;
      welcome.termsAccepted = true;
      welcome.nostrSetupCompleted = true;
      welcome.closeWelcome();
      markWelcomeSeen();
      await nextTick();
    },
    async setPrivateKeyIdentity(
      nsec: string,
      options: { skipRelayConnect?: boolean } = {},
    ) {
      const nostr = useNostrStore();
      await nostr.initPrivateKeySigner(nsec, {
        skipRelayConnect: options.skipRelayConnect !== false,
      });

      const welcome = useWelcomeStore();
      welcome.nostrSetupCompleted = true;
      markWelcomeSeen();
      await nextTick();

      return {
        pubkey: nostr.pubkey,
        npub: nostr.npub,
        signerType: nostr.signerType,
      };
    },
    async seedMint(config: {
      url: string;
      nickname?: string;
      keysetId: string;
      keys?: Record<number, string>;
      nuts?: Record<number, unknown>;
      info?: {
        name?: string;
        pubkey?: string;
        version?: string;
      };
    }) {
      const mints = useMintsStore();
      const defaultKeys = {
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
      } satisfies Record<number, string>;
      const infoDefaults = {
        name: "E2E Mint",
        pubkey: "e2e",
        version: "0.0-test",
      } as const;
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
            keys: config.keys ?? defaultKeys,
          },
        ],
        info: {
          ...infoDefaults,
          ...config.info,
          contact: [],
          nuts: config.nuts ?? {
            4: { methods: [], disabled: false },
            5: { methods: [], disabled: false },
            10: { supported: true },
            11: { supported: true },
            14: { supported: true },
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
    async addMint(url: string, verbose = false) {
      const mints = useMintsStore();
      const mint = await mints.addMint({ url }, verbose);
      await nextTick();
      return mint?.url ?? url;
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
      proofsStore.proofs = await proofsStore.getProofs();
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
        proofsStore.proofs = await proofsStore.getProofs();
        await proofsStore.updateActiveProofs();
      }
    },
    async generateToken(amount: number) {
      const proofsStore = useProofsStore();
      const mints = useMintsStore();
      const proofs = await proofsStore.getProofs();
      const { selected, total } = selectProofsForAmount(proofs, amount);
      await proofsStore.removeProofs(selected);
      const keysetId =
        mints.activeKeysets[0]?.id || mints.mints[0]?.keysets?.[0]?.id;
      if (!keysetId) {
        throw new Error("No keyset available for mock token generation");
      }
      const changeAmount = total - amount;
      if (changeAmount > 0) {
        await proofsStore.addProofs([
          createMockProof(changeAmount, keysetId, "token-change"),
        ]);
      }
      proofsStore.proofs = await proofsStore.getProofs();
      await proofsStore.updateActiveProofs();
      const token = proofsStore.serializeProofs([
        createMockProof(amount, keysetId, "token-send"),
      ]);
      localStorage.setItem("e2e.lastToken", token);
      return token;
    },
    async walletMockCreatePendingEcash(amount: number, description = "") {
      const token = await api.generateToken(amount);
      const mints = useMintsStore();
      useTokensStore().addPendingToken({
        amount: -amount,
        tokenStr: token,
        mint: mints.activeMintUrl || "https://mint.test",
        unit: mints.activeUnit || "sat",
        description,
        bucketId: DEFAULT_BUCKET_ID,
      });
      return token;
    },
    async redeemToken(amount: number) {
      await api.creditProofs([amount]);
      const mints = useMintsStore();
      const tokensStore = useTokensStore();
      tokensStore.addPaidToken({
        amount,
        token:
          localStorage.getItem("e2e.lastToken") || `cashu:e2e-token-${amount}`,
        mint: mints.activeMintUrl || "https://mint.test",
        unit: mints.activeUnit || "sat",
        description: "",
        bucketId: DEFAULT_BUCKET_ID,
      });
    },
    async setCreatorProfile(profile: Record<string, unknown>) {
      const creator = useCreatorProfileStore();
      creator.setProfile(profile as any);
      creator.markClean();
    },
    async setCreatorTiers(tiers: Record<string, unknown>[], markClean = false) {
      const creatorHub = useCreatorHub();
      creatorHub.replaceTierDrafts(tiers as any);
      if (markClean) {
        creatorHub.markTierDraftsClean();
      }
      await nextTick();
    },
    async seedCreatorP2pk() {
      const p2pkStore = useP2PKStore();
      const walletStore = useWalletStore();
      const { pub, priv } = generateP2pkKeyPair();

      p2pkStore.p2pkKeys.unshift({
        publicKey: pub,
        privateKey: priv,
        used: false,
        usedCount: 0,
      });
      walletStore.setActiveP2pk(pub, priv);
      p2pkStore.recordVerification(pub, {
        timestamp: Date.now(),
        mint: useMintsStore().activeMintUrl || "https://mint.test",
      });
      await nextTick();
      return { publicKey: pub };
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
      const key = messenger.normalizeKey(pubkey);
      getConversationMap()[key] = messages;
      messenger.currentConversation = key;
    },
    messengerCreateLocalEcho(config: {
      pubkey: string;
      content?: string;
      relays?: string[];
      filesPayload?: FileMeta[];
      attachment?: { name: string; type: string } | null;
      eventId?: string;
      createdAt?: number;
    }) {
      const key = messenger.normalizeKey(config.pubkey);
      const now = Date.now();
      const content = config.content ?? "E2E pending message";
      const attachment = config.attachment
        ? { type: config.attachment.type, name: config.attachment.name }
        : undefined;
      const rawFiles = Array.isArray(config.filesPayload)
        ? config.filesPayload
        : undefined;
      const normalizedFiles = Array.isArray(rawFiles)
        ? rawFiles
            .map((file) => normalizeFileMeta(file))
            .filter((file): file is FileMeta => !!file)
        : [];
      const eventContent = buildEventContent(content, normalizedFiles);
      const localId =
        typeof crypto?.randomUUID === "function"
          ? crypto.randomUUID()
          : `local-${Math.random().toString(36).slice(2)}`;
      const eventId = config.eventId ?? null;
      const createdAtSeconds = Math.floor((config.createdAt ?? now) / 1000);
      const meta: LocalEchoMeta = {
        localId,
        eventId,
        status: "pending",
        relayResults: {},
        createdAt: now,
        updatedAt: now,
        lastAckAt: null,
        timerStartedAt: null,
        error: null,
        relays: config.relays,
        attempt: 1,
        payload: {
          content: eventContent,
          text: content,
          attachment,
          tokenPayload: undefined,
          filesPayload: normalizedFiles.length ? normalizedFiles : undefined,
        },
      };
      const message = messenger.addOutgoingMessage(
        key,
        content,
        createdAtSeconds,
        eventId ?? undefined,
        attachment,
        "pending",
        undefined,
        meta,
      );
      message.filesPayload = normalizedFiles.length
        ? normalizedFiles
        : undefined;
      messenger.started = true;
      messenger.currentConversation = key;
      messenger.scheduleLocalEcho(meta, message);
      return { localId: meta.localId, messageId: message.id };
    },
    messengerMarkLocalEchoSent(localId: string) {
      const message = messenger.findMessageByLocalId(localId);
      if (!message || !message.localEcho) {
        return false;
      }
      messenger.markLocalEchoSent(
        message,
        message.localEcho,
        { "e2e-mock": { ok: true, reason: "Mock acknowledgement" } },
        "e2e",
      );
      return true;
    },
    messengerMarkLocalEchoFailed(localId: string, reason = "Mock failure") {
      const message = messenger.findMessageByLocalId(localId);
      if (!message || !message.localEcho) {
        return false;
      }
      messenger.markLocalEchoFailed(message, message.localEcho, reason, {
        "e2e-mock": { ok: false, reason },
      });
      return true;
    },
    messengerSetSendMock(config: {
      mode: "success" | "failure";
      reason?: string;
    }) {
      messengerSendMock = async ({ msg, meta }) => {
        if (config.mode === "success") {
          messenger.markLocalEchoSent(
            msg,
            meta,
            { "e2e-mock": { ok: true, reason: "Mock acknowledgement" } },
            "e2e",
          );
          return { success: true, event: null } as ExecuteResult;
        }
        const reason = config.reason ?? "Mock failure";
        messenger.markLocalEchoFailed(msg, meta, reason, {
          "e2e-mock": { ok: false, reason },
        });
        return { success: false, event: null } as ExecuteResult;
      };
    },
    messengerClearSendMock() {
      messengerSendMock = null;
    },
    async messengerRetryLocalEcho(localId: string) {
      const message = messenger.findMessageByLocalId(localId);
      if (!message || !message.localEcho) {
        return { success: false, event: null };
      }

      if (messengerSendMock) {
        const meta = message.localEcho;
        meta.error = null;
        meta.relayResults = {};
        message.relayResults = {};
        messenger.scheduleLocalEcho(meta, message);
        meta.attempt += 1;
        return messengerSendMock({ msg: message, meta } as ExecuteOptions);
      }

      return messenger.retrySend(localId);
    },
    messengerDropConversationSubscription() {
      messenger.pauseConversationSubscription();
      return true;
    },
    messengerResumeConversationSubscription() {
      if (!messenger.currentConversation) {
        return false;
      }
      void messenger.resumeConversationSubscription("e2e");
      return true;
    },
    messengerDeliverEvent(event: {
      id: string;
      pubkey: string;
      content: string;
      created_at?: number;
      tags?: string[][];
      kind?: number;
    }) {
      return messenger.deliverDmEventForTesting({
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        created_at: event.created_at ?? Math.floor(Date.now() / 1000),
        kind: event.kind ?? 4,
        tags: event.tags ?? [],
        sig: "",
      } as NostrEvent);
    },
    getNostrPubkey() {
      return useNostrStore().pubkey;
    },
    getConversation(pubkey: string) {
      const key = messenger.normalizeKey(pubkey);
      const conversations = getConversationMap() || {};
      return ((conversations[key] as MessengerMessage[]) || []).map(
        (message) => ({
          id: message.id,
          content: message.content,
          status: message.status,
          localEcho: message.localEcho
            ? {
                localId: message.localEcho.localId,
                status: message.localEcho.status,
                attempt: message.localEcho.attempt,
                error: message.localEcho.error,
              }
            : null,
        }),
      );
    },
    async getSnapshot() {
      const mints = useMintsStore();
      const proofsStore = useProofsStore();
      const subs = useSubscriptionsStore();
      proofsStore.proofs = await proofsStore.getProofs();
      await proofsStore.updateActiveProofs();
      const subscriptions = Array.isArray((subs as any).subscriptions)
        ? (subs as any).subscriptions
        : Array.isArray((subs as any).subscriptions?.value)
        ? (subs as any).subscriptions.value
        : [];
      const activeConversation = getCurrentConversation();
      const conversations = getConversationMap() || {};
      const conversation = activeConversation
        ? conversations[activeConversation] || []
        : [];
      return {
        balance: mints.totalUnitBalance,
        subscriptions: subscriptions.map((s: any) => s.id),
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
    async walletMockPayLightningInvoice(
      request: string,
      bucketId: string = DEFAULT_BUCKET_ID,
    ) {
      const wallet = useWalletStore();
      const mints = useMintsStore();
      const proofsStore = useProofsStore();
      await wallet.decodeRequest(request);
      const proofs = await proofsStore.getProofs();
      const mintWallet = wallet.mintWallet(
        mints.activeMintUrl,
        mints.activeUnit || "sat",
      );
      return wallet.melt(
        proofs.filter(
          (proof) => (proof.bucketId || DEFAULT_BUCKET_ID) === bucketId,
        ),
        wallet.payInvoiceData.meltQuote.response,
        mintWallet,
      );
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
  window.__FUNDSTR_E2E_READY__ = true;
});
