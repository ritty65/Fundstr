import { test, expect } from "@playwright/test";
import { createE2EApi } from "./support/e2e-api";

async function completeOnboarding(page: any) {
  await page.goto("/");
  await expect(page).toHaveURL(/welcome/);
  const nextButton = page.getByRole("button", { name: /Next|Finish/i });

  await page.getByRole("button", { name: /Next/i }).click();
  await page.getByRole("button", { name: /Next/i }).click();
  await page.getByRole("button", { name: /Next/i }).click();
  await page.getByLabel("I understand I must back up my recovery/seed.").click();
  await page.getByRole("button", { name: /Next/i }).click();
  await page.getByRole("button", { name: /Next/i }).click();
  await page.getByLabel("I accept the Terms of Service.").click();
  await nextButton.click();
  await page.getByRole("button", { name: /Finish|Start using wallet/i }).click();
  await expect(page).toHaveURL(/about/);
}

const AUTHOR_HEX = "f".repeat(64);
const DISPLAY_NAME = "E2E Creator";
const PICTURE_URL = "https://example.com/avatar.png";
const TRUSTED_MINT = "https://mint.test";
const TIER_TITLE = "Founders Club";
const TIER_PRICE = "5000";

function installRelayStubs(page: any) {
  return page.addInitScript(() => {
    const publishedEvents = [] as any[];
    const sockets = new Set<any>();
    let eventCounter = 0;

    function cloneEvent(event: any) {
      return JSON.parse(JSON.stringify(event));
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
      return filters.some(filter => matchesFilter(event, filter));
    }

    function queryEvents(filters: any[]) {
      if (!Array.isArray(filters) || filters.length === 0) {
        return publishedEvents.slice();
      }

      const results: any[] = [];
      for (const filter of filters) {
        let collected = 0;
        const limit = typeof filter?.limit === "number" && filter.limit > 0 ? filter.limit : Infinity;
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
            const event = cloneEvent(rest[0]);
            publishedEvents.push(event);
            broadcastEvent(event);
            setTimeout(() => {
              this._emit("message", { data: JSON.stringify(["OK", event.id, true, "accepted"]) });
            }, 5);
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

    Object.defineProperty(window, "__FUNDSTR_E2E_RELAY__", {
      value: {
        getEventCount() {
          return publishedEvents.length;
        },
        getEvents() {
          return publishedEvents.slice();
        },
      },
      configurable: false,
      enumerable: false,
      writable: false,
    });

    (window as any).nostr = {
      getPublicKey: async () => signerPubkey,
      signEvent: async (template: any) => {
        eventCounter += 1;
        const idSeed = (Date.now() + eventCounter).toString(16);
        const id = idSeed.padStart(64, "0").slice(-64);
        const createdAt =
          typeof template?.created_at === "number"
            ? template.created_at
            : Math.floor(Date.now() / 1000);
        const tags = Array.isArray(template?.tags)
          ? template.tags.map((tag: any) => (Array.isArray(tag) ? [...tag] : tag))
          : [];
        return {
          id,
          pubkey: signerPubkey,
          created_at: createdAt,
          kind: typeof template?.kind === "number" ? template.kind : 1,
          tags,
          content: typeof template?.content === "string" ? template.content : "",
          sig: "c".repeat(128),
        };
      },
    };

    const originalFetch = window.fetch ? window.fetch.bind(window) : undefined;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
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
              const cloned = cloneEvent(event);
              publishedEvents.push(cloned);
              broadcastEvent(cloned);
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

test.describe("creator studio happy path", () => {
  test("creator configures profile, publishes tiers, and profile page renders", async ({ page }) => {
    await installRelayStubs(page);

    await page.goto("/");
    const api = createE2EApi(page);
    await api.reset();
    await api.bootstrap();
    await completeOnboarding(page);

    await page.goto("/creator-studio");
    await expect(page.getByRole("heading", { name: "Creator Dashboard" })).toBeVisible();

    await page.getByRole("button", { name: "Connect" }).click();
    await expect(page.getByText("Relay status: Connected")).toBeVisible();

    await page.getByLabel("Creator author (npub or hex)").fill(AUTHOR_HEX);
    await expect(page.getByText("Relay and author ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("Profile identity")).toBeVisible();
    await page.getByLabel("Display name").fill(DISPLAY_NAME);
    await page.getByLabel("Picture URL").fill(PICTURE_URL);
    await page.getByPlaceholder("Add mint & press enter").fill(TRUSTED_MINT);
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Add new key" }).click();
    await page.getByRole("button", { name: "Generate" }).click();

    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.getByRole("button", { name: "Next" }).click();

    await expect(page.getByText("Manage Tiers")).toBeVisible();
    await page.getByRole("button", { name: "Add Tier" }).click();
    const tierCard = page.locator(".tier-composer__card").first();
    await tierCard.getByLabel("Title").fill(TIER_TITLE);
    await tierCard.getByLabel("Price (sats)").fill(TIER_PRICE);
    await tierCard.getByLabel("Frequency").click();
    await page.getByRole("option", { name: /Monthly/i }).click();

    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
    await page.getByRole("button", { name: "Next" }).click();

    const publishButton = page.getByRole("button", { name: "Publish profile & tiers" });
    await expect(publishButton).toBeEnabled();
    await publishButton.click();

    await page.waitForFunction(() => {
      return (window as any).__FUNDSTR_E2E_RELAY__?.getEventCount?.() >= 3;
    });

    await page.goto(`/creator/${AUTHOR_HEX}/profile`);

    await expect(page.getByRole("heading", { name: DISPLAY_NAME })).toBeVisible();
    await expect(page.getByText(TRUSTED_MINT)).toBeVisible();
    await expect(page.getByRole("heading", { name: TIER_TITLE })).toBeVisible();
    await expect(page.locator(".profile-tier-list")).toContainText(/5[\s,\u202f]?000\s*sats/i);
  });
});
