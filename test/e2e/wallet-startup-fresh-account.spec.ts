import { test, expect, type Page } from "@playwright/test";
import {
  bootstrapFundstr,
  completeOnboarding,
  installMintCatalogMocks,
  resetBrowserState,
} from "./support/journey-fixtures";

async function expectWalletInteractive(page: Page) {
  await page.goto("/wallet");
  await expect(page).toHaveURL(/\/wallet/);
  await expect(
    page.getByRole("button", { name: "Receive", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible({ timeout: 15000 });
}

test.describe("fresh account wallet startup", () => {
  test("wallet stays interactive after generated-key onboarding", async ({
    page,
  }) => {
    await installMintCatalogMocks(page);
    await resetBrowserState(page);
    await bootstrapFundstr(page);

    await completeOnboarding(page, {
      connectMint: true,
      setupNostr: "generate",
    });

    await expectWalletInteractive(page);
  });

  test("wallet stays interactive after skipping nostr setup", async ({
    page,
  }) => {
    await installMintCatalogMocks(page);
    await resetBrowserState(page);
    await bootstrapFundstr(page);

    await completeOnboarding(page, { connectMint: true, setupNostr: "skip" });

    await expectWalletInteractive(page);
  });

  test("wallet stays interactive after imported-key onboarding", async ({
    page,
  }) => {
    await installMintCatalogMocks(page);
    await resetBrowserState(page);
    await bootstrapFundstr(page);

    await completeOnboarding(page, {
      connectMint: true,
      setupNostr: "import",
    });

    await expectWalletInteractive(page);
  });
});
