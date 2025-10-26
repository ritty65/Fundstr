import { test, expect, type Page } from "@playwright/test";
import { createE2EApi } from "./support/e2e-api";

const MINT_URL = "https://mint.test";
const KEYSET_ID = "test-keyset";

async function installOnboardingFixtures(page: Page) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  };

  const recommendedMints = JSON.stringify([
    { url: MINT_URL, label: "Test Mint" },
  ]);

  await page.route("**/mints.json", (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    return route.fulfill({
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: recommendedMints,
    });
  });

  const infoResponse = {
    name: "Fundstr Test Mint",
    pubkey:
      "02b8733f0c145a6f0f2d62f4aebcb34faad1a4b67d9a45edc2b88416f4a6d80f21",
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
        id: KEYSET_ID,
        unit: "sat",
        active: true,
      },
    ],
  };

  const keysResponse = {
    keysets: [
      {
        id: KEYSET_ID,
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
      return route.fulfill({ status: 204, headers: corsHeaders });
    }

    const { pathname } = new URL(request.url());

    if (pathname === "/keys") {
      return route.fulfill({ status: 200, headers: corsHeaders, body: "" });
    }

    if (pathname === "/info") {
      return route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: infoResponse.name, version: infoResponse.version }),
      });
    }

    if (pathname === "/v1/info") {
      return route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(infoResponse),
      });
    }

    if (pathname === "/v1/keysets") {
      return route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(keysetsResponse),
      });
    }

    if (pathname.startsWith("/v1/keys")) {
      return route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(keysResponse),
      });
    }

    return route.fulfill({ status: 404, headers: corsHeaders, body: "" });
  });
}

test.describe("welcome onboarding happy path", () => {
  test("new visitor generates a nostr key, backs it up, and connects a mint", async ({ page }) => {
    await installOnboardingFixtures(page);

    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
      if (typeof indexedDB?.databases === "function") {
        indexedDB
          .databases()
          .then((dbs) =>
            Promise.all(
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
            ),
          )
          .catch(() => undefined);
      }
    });

    await page.context().clearCookies();

    await page.goto("/");

    const api = createE2EApi(page);
    await api.reset();
    await api.bootstrap();

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
          // ignore
        }
      }
    });

    await page.reload();

    await expect(page).toHaveURL(/welcome/);

    const nextButton = () => page.getByRole("button", { name: /Next|Finish/i });

    await nextButton().click();

    await page.getByRole("button", { name: /Generate new key/i }).click();

    const backupDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Backup your Nostr secret" });

    await expect(backupDialog).toBeVisible();

    const backupInput = backupDialog.getByRole("textbox");
    const nsecValue = await backupInput.inputValue();
    expect(nsecValue).toMatch(/^nsec1[0-9a-z]+$/);

    await backupDialog.getByRole("button", { name: "Got it" }).click();
    await expect(backupDialog).not.toBeVisible();

    await nextButton().click();

    await nextButton().click();

    await page
      .getByLabel(/I understand I must back up my recovery\/seed\./i)
      .click();

    await nextButton().click();

    await page.getByRole("button", { name: /Click to browse mints/i }).click();

    const catalogDialog = page.getByRole("dialog").filter({ hasText: "Browse mints" });
    await expect(catalogDialog).toBeVisible();
    await catalogDialog.getByText("Test Mint").click();

    await expect(page.getByText(MINT_URL)).toBeVisible();

    await nextButton().click();

    await page.getByLabel(/I accept the Terms of Service\./i).click();

    await nextButton().click();

    await nextButton().click();

    await expect(page).toHaveURL(/about/);

    const storedMints = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("cashu.mints") || "[]"),
    );
    expect(storedMints).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: MINT_URL })]),
    );
  });
});
