import { test, expect } from "@playwright/test";
import { createE2EApi } from "./support/e2e-api";
import {
  completeOnboarding,
  openMainMenu,
  resetBrowserState,
  TEST_MINT_URL,
  TEST_KEYSET_ID,
} from "./support/journey-fixtures";

test.describe.serial("end-to-end happy paths", () => {
  test("runs primary user journeys with mocked data", async ({ page }) => {
    await resetBrowserState(page);
    await page.goto("/");
    const api = createE2EApi(page);
    await api.reset();
    await api.bootstrap();

    await completeOnboarding(page);

    await api.seedMint({
      url: TEST_MINT_URL,
      keysetId: TEST_KEYSET_ID,
    });
    await api.creditProofs([2000, 1000, 1000, 1000]);

    await openMainMenu(page);
    await page.getByText("Wallet", { exact: true }).click();
    await expect(page).toHaveURL(/\/wallet/);

    let snapshot = await api.getSnapshot();
    expect(snapshot.balance).toBeGreaterThanOrEqual(5000);

    await page.getByRole("button", { name: /Send/i }).click();
    await page.getByRole("button", { name: /Lightning/i }).click();
    await api.debitProofs([2000]);
    await page.keyboard.press("Escape");

    snapshot = await api.getSnapshot();
    expect(snapshot.balance).toBeGreaterThanOrEqual(3000);

    await page.getByRole("button", { name: /Send/i }).click();
    await page.getByRole("button", { name: /Ecash/i }).click();
    const token = await api.generateToken(1000);
    await page.keyboard.press("Escape");
    await api.redeemToken(1000);

    snapshot = await api.getSnapshot();
    expect(snapshot.balance).toBeGreaterThanOrEqual(3000);

    await api.setCreatorProfile({
      display_name: "E2E Creator",
      about: "Testing profile",
      mints: ["https://mint.test"],
      relays: ["wss://relay.test"],
    });
    await page.goto("/creator-studio");
    await expect(page.getByText("E2E Creator")).toBeVisible();

    await api.addSubscription({
      creatorNpub: "e2e-pubkey",
      tierId: "tier-basic",
      amountPerInterval: 500,
    });
    await page.goto("/subscriptions");
    await expect(page.getByText("Supporter")).toBeVisible();

    await api.seedConversation("e2e-pubkey", [
      {
        id: "msg-1",
        pubkey: "e2e-pubkey",
        content: `Sharing token ${token}`,
        created_at: Math.floor(Date.now() / 1000),
        outgoing: true,
        status: "sent",
      },
    ]);
    await page.goto("/nostr-messenger");
    await expect(page.getByText(/Sharing token/)).toBeVisible();

    snapshot = await api.getSnapshot();
    expect(snapshot.subscriptions.length).toBeGreaterThanOrEqual(1);
    expect(snapshot.conversationCount).toBeGreaterThanOrEqual(1);
  });
});

