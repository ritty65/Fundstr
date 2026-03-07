import { test, expect } from "@playwright/test";
import {
  bootstrapAndCompleteOnboarding,
  TEST_MINT_URL,
  TEST_KEYSET_ID,
} from "./support/journey-fixtures";

test.describe.serial("end-to-end happy paths", () => {
  test("runs primary user journeys with mocked data", async ({ page }) => {
    const api = await bootstrapAndCompleteOnboarding(page);

    await api.seedMint({
      url: TEST_MINT_URL,
      keysetId: TEST_KEYSET_ID,
    });
    await api.creditProofs([2000, 1000, 1000, 1000]);

    await page.goto("/wallet");
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
    await expect(
      page.getByRole("heading", { name: "Subscriptions" }),
    ).toBeVisible();

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
    await expect
      .poll(async () => {
        const conversation = await api.getConversation("e2e-pubkey");
        return conversation[0]?.content ?? null;
      })
      .toContain("Sharing token");

    snapshot = await api.getSnapshot();
    expect(snapshot.subscriptions.length).toBeGreaterThanOrEqual(1);
    const seededConversation = await api.getConversation("e2e-pubkey");
    expect(seededConversation.length).toBeGreaterThanOrEqual(1);
  });
});
