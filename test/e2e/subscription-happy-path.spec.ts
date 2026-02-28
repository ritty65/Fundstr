import { test, expect } from "@playwright/test";
import {
  bootstrapAndCompleteOnboarding,
  installDeterministicRelayMocks,
  seedRelayEvent,
  TEST_CREATOR_HEX,
  TEST_CREATOR_NPUB,
  TEST_KEYSET_ID,
  TEST_MINT_URL,
  TEST_RELAY_URL,
} from "./support/journey-fixtures";

test.describe("subscription happy path", () => {
  test("supporter subscriptions appear in dashboard after successful checkout", async ({ page }) => {
    await installDeterministicRelayMocks(page);

    const api = await bootstrapAndCompleteOnboarding(page);

    await api.seedMint({ url: TEST_MINT_URL, keysetId: TEST_KEYSET_ID });
    await api.creditProofs([2000, 2000, 1000]);

    await api.setCreatorProfile({
      display_name: "E2E Creator",
      about: "Testing profile",
      mints: [TEST_MINT_URL],
      relays: [TEST_RELAY_URL],
      pubkey: TEST_CREATOR_HEX,
    });

    await seedRelayEvent(page, {
      kind: 10019,
      pubkey: TEST_CREATOR_HEX,
      content: JSON.stringify({
        p2pk: TEST_CREATOR_HEX,
        mints: [TEST_MINT_URL],
        relays: [TEST_RELAY_URL],
      }),
      tags: [
        ["mint", TEST_MINT_URL],
        ["relay", TEST_RELAY_URL],
        ["d", `${TEST_CREATOR_HEX}:profile`],
      ],
    });

    await api.addSubscription({
      creatorNpub: TEST_CREATOR_NPUB,
      tierId: "tier-basic",
      amountPerInterval: 500,
      frequency: "monthly",
    });

    await page.goto("/subscriptions");
    await expect(page.getByRole("heading", { name: /My Subscriptions/i })).toBeVisible();
    await expect(page.getByText(/Supporter/i)).toBeVisible();

    const snapshot = await api.getSnapshot();
    expect(snapshot.balance).toBeGreaterThan(0);
    expect(snapshot.subscriptions.length).toBeGreaterThanOrEqual(1);
  });
});

