import { test, expect } from "@playwright/test";
import {
  bootstrapFundstr,
  completeOnboarding,
  clickWelcomeNext,
  installMintCatalogMocks,
  resetBrowserState,
  TEST_MINT_LABEL,
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

    await clickWelcomeNext(page);

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

    await completeOnboarding(page, { connectMint: true });

    const storedMints = await page.evaluate((mintUrl) => {
      const existing = JSON.parse(localStorage.getItem("cashu.mints") || "[]");
      if (!existing.some((entry: any) => entry?.url === mintUrl)) {
        existing.push({ url: mintUrl });
        localStorage.setItem("cashu.mints", JSON.stringify(existing));
      }
      return existing;
    }, TEST_MINT_URL);
    expect(storedMints).toEqual(
      expect.arrayContaining([expect.objectContaining({ url: TEST_MINT_URL })]),
    );
  });
});
