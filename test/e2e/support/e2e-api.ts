import type { Page } from "@playwright/test";

export class E2EApi {
  constructor(private readonly page: Page) {}

  private async call<T>(method: string, ...args: unknown[]): Promise<T> {
    return this.page.evaluate(
      ([name, params]) => {
        const api = (window as any).__FUNDSTR_E2E__;
        if (!api || typeof api[name] !== "function") {
          throw new Error(`E2E helper '${name}' is not available`);
        }
        return api[name](...params);
      },
      [method, args] as const,
    );
  }

  reset() {
    return this.call("reset");
  }

  bootstrap() {
    return this.call("bootstrap");
  }

  seedMint(config: {
    url: string;
    nickname?: string;
    keysetId: string;
    keys?: Record<number, string>;
    info?: {
      name?: string;
      pubkey?: string;
      version?: string;
    };
  }) {
    return this.call("seedMint", config);
  }

  creditProofs(amounts: number[]) {
    return this.call("creditProofs", amounts);
  }

  debitProofs(amounts: number[]) {
    return this.call("debitProofs", amounts);
  }

  generateToken(amount: number) {
    return this.call<string>("generateToken", amount);
  }

  redeemToken(amount: number) {
    return this.call("redeemToken", amount);
  }

  setCreatorProfile(profile: Record<string, unknown>) {
    return this.call("setCreatorProfile", profile);
  }

  addSubscription(data: {
    creatorNpub: string;
    tierId: string;
    amountPerInterval: number;
    frequency?: string;
  }) {
    return this.call("addSubscription", data);
  }

  seedConversation(pubkey: string, messages: unknown[]) {
    return this.call("seedConversation", pubkey, messages);
  }

  messengerCreateLocalEcho(config: {
    pubkey: string;
    content?: string;
    relays?: string[];
    attachment?: { name: string; type: string } | null;
    eventId?: string;
    createdAt?: number;
  }) {
    return this.call("messengerCreateLocalEcho", config);
  }

  messengerMarkLocalEchoSent(localId: string) {
    return this.call("messengerMarkLocalEchoSent", localId);
  }

  messengerSetSendMock(config: { mode: "success" | "failure"; reason?: string }) {
    return this.call("messengerSetSendMock", config);
  }

  messengerClearSendMock() {
    return this.call("messengerClearSendMock");
  }

  messengerDropConversationSubscription() {
    return this.call("messengerDropConversationSubscription");
  }

  messengerResumeConversationSubscription() {
    return this.call("messengerResumeConversationSubscription");
  }

  messengerDeliverEvent(event: {
    id: string;
    pubkey: string;
    content: string;
    created_at?: number;
    tags?: string[][];
    kind?: number;
  }) {
    return this.call("messengerDeliverEvent", event);
  }

  getNostrPubkey() {
    return this.call<string | null>("getNostrPubkey");
  }

  getSnapshot() {
    return this.call<{
      balance: number;
      subscriptions: string[];
      conversationCount: number;
    }>("getSnapshot");
  }

  walletMockPayMintQuote(
    quote: string,
    options?: { proofAmounts?: number[]; description?: string },
  ) {
    return this.call("walletMockPayMintQuote", quote, options);
  }

  walletMockGetLastMintQuote() {
    return this.call<string | null>("walletMockGetLastMintQuote");
  }

  walletMockCreateLightningInvoice(config: {
    amount: number;
    description?: string;
    feeReserve?: number;
  }) {
    return this.call<{ request: string; quote: string }>(
      "walletMockCreateLightningInvoice",
      config,
    );
  }

  getHistoryTokens() {
    return this.call<any[]>("getHistoryTokens");
  }

  getInvoiceHistory() {
    return this.call<any[]>("getInvoiceHistory");
  }
}

export function createE2EApi(page: Page): E2EApi {
  return new E2EApi(page);
}

