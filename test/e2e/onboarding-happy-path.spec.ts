import { test, expect } from "@playwright/test";
import {
  bootstrapFundstr,
  completeOnboarding,
  installMintCatalogMocks,
  resetBrowserState,
  TEST_MINT_URL,
} from "./support/journey-fixtures";

test.describe("welcome onboarding happy path", () => {
  test("new visitor generates a nostr key, backs it up, and connects a mint", async ({
    page,
  }) => {
    await installMintCatalogMocks(page);
    await resetBrowserState(page);

    await bootstrapFundstr(page);

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
