import { expect, type Page } from "@playwright/test";
import { createE2EApi, type E2EApi } from "./e2e-api";

export const TEST_MINT_URL = "https://mint.test" as const;
export const TEST_MINT_LABEL = "Test Mint" as const;
export const TEST_KEYSET_ID = "e2e-keyset" as const;
export const TEST_RELAY_URL = "wss://relay.test" as const;
export const TEST_CREATOR_HEX = "f".repeat(64);
export const TEST_CREATOR_NPUB = "e2e-pubkey";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
} as const;

export async function bootstrapFundstr(page: Page): Promise<E2EApi> {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).__FUNDSTR_E2E__), null, {
    timeout: 5000,
  });
  const api = createE2EApi(page);
  await api.reset();
  await api.bootstrap();
  return api;
}

export async function bootstrapAndCompleteOnboarding(
  page: Page,
  options?: CompleteOnboardingOptions,
): Promise<E2EApi> {
  await resetBrowserState(page);
  const api = await bootstrapFundstr(page);
  await completeOnboarding(page, options);
  return api;
}

export async function resetBrowserState(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(async () => {
    localStorage.clear();
    sessionStorage.clear();
    if (typeof indexedDB?.databases === "function") {
      try {
        const dbs = await indexedDB.databases();
        await Promise.all(
          dbs
            .map((db) => db?.name)
            .filter((name): name is string => typeof name === "string")
            .map(
              (name) =>
                new Promise<void>((resolve) => {
                  const request = indexedDB.deleteDatabase(name);
                  request.onsuccess = request.onerror = request.onblocked = () => resolve();
                }),
            ),
        );
      } catch {
        /* ignore */
      }
    }
  });
}

export async function installMintCatalogMocks(page: Page): Promise<void> {
  const recommendedMints = JSON.stringify([
    { url: TEST_MINT_URL, label: TEST_MINT_LABEL },
  ]);

  await page.route("**/mints.json", (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS_HEADERS });
    }
    return route.fulfill({
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      body: recommendedMints,
    });
  });

  const infoResponse = {
    name: "Fundstr Test Mint",
    pubkey: "02b8733f0c145a6f0f2d62f4aebcb34faad1a4b67d9a45edc2b88416f4a6d80f21",
    version: "Nutshell 0.16.0",
    description: "Mock mint used for onboarding tests.",
    contact: [{ method: "email", info: "support@mint.test" }],
    nuts: {
      "4": {
        methods: [
          { method: "bolt11", unit: "sat", min_amount: 1, max_amount: 1_000_000 },
        ],
        disabled: false,
      },
      "5": {
        methods: [
          { method: "bolt11", unit: "sat", min_amount: 1, max_amount: 1_000_000 },
        ],
        disabled: false,
      },
      "7": { supported: true },
      "9": { supported: true },
    },
  } as const;

  const keysetsResponse = {
    keysets: [
      {
        id: TEST_KEYSET_ID,
        unit: "sat",
        active: true,
      },
    ],
  };

  const keysResponse = {
    keysets: [
      {
        id: TEST_KEYSET_ID,
        unit: "sat",
        keys: {
          1: "02a18d7f9f08c1e27a3a5b2f0c7a9d6b5c4e3f2a1b0c9d8e7f6a5b4c3d2e1f0aa",
          2: "03f1e2d3c4b5a697887766554433221100ffeeddccbbaa99887766554433221100",
        },
      },
    ],
  };

  await page.route(/https:\/\/mint\.test\/.*/, (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: CORS_HEADERS });
    }

    const { pathname } = new URL(request.url());

    if (pathname === "/keys") {
      return route.fulfill({ status: 200, headers: CORS_HEADERS, body: "" });
    }

    if (pathname === "/info") {
      return route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ name: infoResponse.name, version: infoResponse.version }),
      });
    }

    if (pathname === "/v1/info") {
      return route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify(infoResponse),
      });
    }

    if (pathname === "/v1/keysets") {
      return route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify(keysetsResponse),
      });
    }

    if (pathname.startsWith("/v1/keys")) {
      return route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify(keysResponse),
      });
    }

    return route.fulfill({ status: 404, headers: CORS_HEADERS, body: "" });
  });
}

type CompleteOnboardingOptions = {
  connectMint?: boolean;
  mintLabel?: string;
  mintUrl?: string;
};

export async function completeOnboarding(
  page: Page,
  options: CompleteOnboardingOptions = {},
): Promise<void> {
  const { connectMint = false, mintLabel = TEST_MINT_LABEL } = options;

  await page.goto("/");
  await expect(page).toHaveURL(/welcome/);

  const nextButton = () => page.getByRole("button", { name: /Next|Finish/i });

  await nextButton().click();

  const generateKeyButton = page.getByRole("button", { name: /Generate new key/i });
  if (await generateKeyButton.isVisible()) {
    await generateKeyButton.click();
  }

  const backupDialog = page.getByRole("dialog").filter({ hasText: /Backup your Nostr secret/i });
  if (await backupDialog.isVisible()) {
    const backupInput = backupDialog.getByRole("textbox");
    const nsecValue = await backupInput.inputValue();
    expect(nsecValue).toMatch(/^nsec1[0-9a-z]+$/);
    await backupDialog.getByRole("button", { name: "Got it" }).click();
    await expect(backupDialog).not.toBeVisible();
  }

  await nextButton().click();
  await nextButton().click();

  const backupAcknowledgement = page.getByLabel(/I understand I must back up my recovery\/seed\./i);
  if (await backupAcknowledgement.isVisible()) {
    await backupAcknowledgement.click();
  }

  await nextButton().click();

  const browseMintsButton = page.getByRole("button", { name: /Click to browse mints/i });
  if (connectMint && (await browseMintsButton.isVisible())) {
    await browseMintsButton.click();
    const catalogDialog = page.getByRole("dialog").filter({ hasText: /Browse mints/i });
    await expect(catalogDialog).toBeVisible();
    await catalogDialog.getByText(mintLabel).click();
    await expect(page.getByText(TEST_MINT_URL)).toBeVisible();
    await nextButton().click();
  } else {
    if (await browseMintsButton.isVisible()) {
      await nextButton().click();
    }
  }

  const tosCheckbox = page.getByLabel(/I accept the Terms of Service\./i);
  if (await tosCheckbox.isVisible()) {
    await tosCheckbox.click();
  }

  await nextButton().click();
  await nextButton().click();

  const finishButton = page.getByRole("button", { name: /Finish|Start using wallet/i });
  if (await finishButton.isVisible()) {
    await finishButton.click();
  }

  await expect(page).toHaveURL(/about/);
}

export async function openMainMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Toggle navigation/i }).click();
}

export async function openWallet(page: Page): Promise<void> {
  await openMainMenu(page);
  await page.getByText("Wallet", { exact: true }).click();
  await expect(page).toHaveURL(/\/wallet/);
}

export async function installDeterministicRelayMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const BASE_TIMESTAMP = 1_700_000_000;
    const sockets = new Set<any>();
    const publishedEvents: any[] = [];
    let eventCounter = 0;

    function cloneEvent<T>(event: T): T {
      return JSON.parse(JSON.stringify(event));
    }

    function normalizeEvent(event: any) {
      const normalized = cloneEvent(event);
      eventCounter += 1;
      if (!normalized.id) {
        normalized.id = `e2e-event-${String(eventCounter).padStart(6, "0")}`;
      }
      if (typeof normalized.created_at !== "number") {
        normalized.created_at = BASE_TIMESTAMP + eventCounter;
      }
      if (typeof normalized.kind !== "number") {
        normalized.kind = 1;
      }
      if (!Array.isArray(normalized.tags)) {
        normalized.tags = [];
      }
      return normalized;
    }

    function matchesFilter(event: any, filter: any) {
      if (!filter || typeof filter !== "object") {
        return true;
      }

      if (Array.isArray(filter.kinds) && filter.kinds.length) {
        if (!filter.kinds.includes(event.kind)) {
          return false;
        }
      }

      if (Array.isArray(filter.authors) && filter.authors.length) {
        const normalizedAuthors = filter.authors
          .map((entry: any) => (typeof entry === "string" ? entry.toLowerCase() : ""))
          .filter((entry: string) => entry);
        if (!normalizedAuthors.includes(String(event.pubkey || "").toLowerCase())) {
          return false;
        }
      }

      if (Array.isArray(filter["#d"]) && filter["#d"].length) {
        const desired = filter["#d"].filter((entry: any) => typeof entry === "string");
        const tagValues = Array.isArray(event.tags)
          ? event.tags
              .filter((tag: any) => Array.isArray(tag) && tag[0] === "d")
              .map((tag: any) => tag[1])
          : [];
        if (!desired.some((value: any) => tagValues.includes(value))) {
          return false;
        }
      }

      return true;
    }

    function matchesAnyFilter(event: any, filters: any[]) {
      if (!Array.isArray(filters) || filters.length === 0) {
        return true;
      }
      return filters.some((filter) => matchesFilter(event, filter));
    }

    function queryEvents(filters: any[]) {
      if (!Array.isArray(filters) || filters.length === 0) {
        return publishedEvents.slice();
      }

      const results: any[] = [];
      for (const filter of filters) {
        let collected = 0;
        const limit =
          typeof filter?.limit === "number" && filter.limit > 0 ? filter.limit : Infinity;
        for (const event of publishedEvents) {
          if (matchesFilter(event, filter)) {
            results.push(cloneEvent(event));
            collected += 1;
            if (collected >= limit) {
              break;
            }
          }
        }
      }
      return results;
    }

    function broadcastEvent(event: any) {
      for (const socket of sockets) {
        const subscriptionEntries = (socket as any)._subscriptions as Map<string, any[]>;
        for (const [subId, filters] of subscriptionEntries.entries()) {
          if (matchesAnyFilter(event, filters)) {
            const payload = JSON.stringify(["EVENT", subId, cloneEvent(event)]);
            setTimeout(() => {
              (socket as any)._emit("message", { data: payload });
            }, 0);
          }
        }
      }
    }

    function pushEvent(event: any) {
      const normalized = normalizeEvent(event);
      const existingIndex = publishedEvents.findIndex((entry) => entry.id === normalized.id);
      if (existingIndex >= 0) {
        publishedEvents[existingIndex] = normalized;
      } else {
        publishedEvents.push(normalized);
      }
      broadcastEvent(normalized);
    }

    class MockWebSocket {
      url: string;
      readyState: number;
      onopen: ((event: any) => void) | null;
      onmessage: ((event: any) => void) | null;
      onerror: ((event: any) => void) | null;
      onclose: ((event: any) => void) | null;
      private listeners: Record<string, Set<(event: any) => void>>;
      private subscriptions: Map<string, any[]>;

      constructor(url: string) {
        this.url = url;
        this.readyState = MockWebSocket.CONNECTING;
        this.onopen = null;
        this.onmessage = null;
        this.onerror = null;
        this.onclose = null;
        this.listeners = {
          open: new Set(),
          message: new Set(),
          error: new Set(),
          close: new Set(),
        };
        this.subscriptions = new Map();
        sockets.add(this);
        setTimeout(() => {
          this.readyState = MockWebSocket.OPEN;
          this._emit("open", {});
        }, 5);
      }

      addEventListener(type: string, handler: (event: any) => void) {
        const bucket = this.listeners[type];
        if (bucket) {
          bucket.add(handler);
        }
      }

      removeEventListener(type: string, handler: (event: any) => void) {
        const bucket = this.listeners[type];
        if (bucket) {
          bucket.delete(handler);
        }
      }

      dispatchEvent(event: any) {
        this._emit(event?.type, event);
        return true;
      }

      private _emit(type: string, event: any) {
        if (!type) {
          return;
        }
        const payload = event || {};
        payload.target = this;
        const handler = (this as any)[`on${type}`];
        if (typeof handler === "function") {
          try {
            handler.call(this, payload);
          } catch (err) {
            console.error("MockWebSocket handler error", err);
          }
        }
        const bucket = this.listeners[type];
        if (bucket) {
          for (const listener of bucket) {
            try {
              listener.call(this, payload);
            } catch (err) {
              console.error("MockWebSocket listener error", err);
            }
          }
        }
      }

      send(serialized: string) {
        try {
          const message = JSON.parse(serialized);
          if (!Array.isArray(message) || message.length === 0) {
            return;
          }
          const [type, ...rest] = message;
          if (type === "EVENT") {
            const event = rest[0];
            if (event) {
              pushEvent(event);
              setTimeout(() => {
                this._emit("message", {
                  data: JSON.stringify(["OK", event.id ?? publishedEvents.at(-1)?.id, true, "accepted"]),
                });
              }, 5);
            }
            return;
          }
          if (type === "REQ") {
            const [subId, ...filters] = rest;
            if (typeof subId === "string") {
              this.subscriptions.set(subId, filters);
              const events = queryEvents(filters);
              for (const event of events) {
                setTimeout(() => {
                  this._emit("message", { data: JSON.stringify(["EVENT", subId, event]) });
                }, 5);
              }
              setTimeout(() => {
                this._emit("message", { data: JSON.stringify(["EOSE", subId]) });
              }, 10);
            }
            return;
          }
          if (type === "CLOSE") {
            const [subId] = rest;
            if (typeof subId === "string") {
              this.subscriptions.delete(subId);
            }
          }
        } catch (err) {
          console.error("MockWebSocket send error", err);
        }
      }

      close() {
        this.readyState = MockWebSocket.CLOSED;
        sockets.delete(this);
        this._emit("close", { reason: "mock-close" });
      }

      get _subscriptions() {
        return this.subscriptions;
      }
    }

    MockWebSocket.CONNECTING = 0;
    MockWebSocket.OPEN = 1;
    MockWebSocket.CLOSING = 2;
    MockWebSocket.CLOSED = 3;

    (window as any).WebSocket = MockWebSocket;

    const signerPubkey = "f".repeat(64);
    (window as any).nostr = {
      getPublicKey: async () => signerPubkey,
      signEvent: async (template: any) => {
        eventCounter += 1;
        const createdAt =
          typeof template?.created_at === "number"
            ? template.created_at
            : BASE_TIMESTAMP + eventCounter;
        const tags = Array.isArray(template?.tags)
          ? template.tags.map((tag: any) => (Array.isArray(tag) ? [...tag] : tag))
          : [];
        return {
          id: `e2e-signed-${String(eventCounter).padStart(6, "0")}`,
          pubkey: signerPubkey,
          created_at: createdAt,
          kind: typeof template?.kind === "number" ? template.kind : 1,
          tags,
          content: typeof template?.content === "string" ? template.content : "",
          sig: "c".repeat(128),
        };
      },
    };

    const relayApi = {
      getEventCount() {
        return publishedEvents.length;
      },
      getEvents() {
        return publishedEvents.map(cloneEvent);
      },
      seedEvent(event: any) {
        pushEvent(event);
      },
      reset() {
        publishedEvents.length = 0;
        eventCounter = 0;
      },
    };

    Object.defineProperty(window, "__FUNDSTR_E2E_RELAY__", {
      value: relayApi,
      configurable: false,
      enumerable: false,
      writable: false,
    });

    const originalFetch = window.fetch ? window.fetch.bind(window) : undefined;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof Request
          ? input.url
          : String(input);
      if (url.includes("/req")) {
        try {
          const parsed = new URL(url, window.location.origin);
          const filtersParam = parsed.searchParams.get("filters");
          const filters = filtersParam ? JSON.parse(filtersParam) : [];
          const events = queryEvents(filters);
          return new Response(JSON.stringify(events), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("Mock fetch req failed", err);
          return new Response(JSON.stringify([]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
      }
      if (url.includes("/event")) {
        if (init?.body) {
          try {
            const event = JSON.parse(String(init.body));
            if (event?.id) {
              pushEvent(event);
            }
          } catch (err) {
            console.error("Mock fetch event parse failed", err);
          }
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch ? originalFetch(input as any, init) : Promise.resolve(new Response(null));
    };
  });
}

export async function seedRelayEvent(page: Page, event: Record<string, unknown>): Promise<void> {
  await page.evaluate((payload) => {
    const relay = (window as any).__FUNDSTR_E2E_RELAY__;
    if (!relay || typeof relay.seedEvent !== "function") {
      throw new Error("Relay mock not installed");
    }
    relay.seedEvent(payload);
  }, event);
}

