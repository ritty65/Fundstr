import { test, expect } from "@playwright/test";
import {
  bootstrapFundstr,
  completeOnboarding,
  installMintCatalogMocks,
  resetBrowserState,
  TEST_MINT_URL,
} from "./support/journey-fixtures";

test.describe("welcome onboarding happy path", () => {
  test("new visitor generates a nostr key, backs it up, and connects a mint", async ({ page }) => {
    await installMintCatalogMocks(page);
    await resetBrowserState(page);

    await bootstrapFundstr(page);

    await completeOnboarding(page, { connectMint: true });

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

    await expect(page.getByText(TEST_MINT_URL)).toBeVisible();

    await nextButton().click();

    await page.getByLabel(/I accept the Terms of Service\./i).click();

    await nextButton().click();

    await nextButton().click();

    await expect(page).toHaveURL(/about/);

    const storedMints = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("cashu.mints") || "[]"),
    );
    expect(storedMints).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: TEST_MINT_URL })]),
    );
  });
});
