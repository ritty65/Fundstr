import { test, expect } from "@playwright/test";
import {
  bootstrapFundstr,
  TEST_CREATOR_HEX,
} from "./support/journey-fixtures";

const MESSAGE_TEXT = "Late echo reconciliation";

test.describe("Messenger conversation subscription", () => {
  test("late echo after subscription restart stays as a single bubble", async ({
    page,
  }) => {
    const api = await bootstrapFundstr(page);
    await page.goto("/nostr-messenger");

    const eventId = `e2e-event-${Date.now()}`;

    await api.messengerCreateLocalEcho({
      pubkey: TEST_CREATOR_HEX,
      content: MESSAGE_TEXT,
      eventId,
    });

    const messageRow = page
      .locator(".message-row")
      .filter({ hasText: MESSAGE_TEXT })
      .first();

    await expect(messageRow).toBeVisible();
    await expect(messageRow.locator(".q-spinner")).toBeVisible();

    await api.messengerDropConversationSubscription();
    await api.messengerResumeConversationSubscription();

    const myPubkey = await api.getNostrPubkey();
    expect(myPubkey).toBeTruthy();

    await api.messengerDeliverEvent({
      id: eventId,
      pubkey: myPubkey || "",
      content: MESSAGE_TEXT,
      tags: [["p", TEST_CREATOR_HEX]],
      created_at: Math.floor(Date.now() / 1000),
    });

    await expect(
      messageRow.locator(".q-icon").filter({ hasText: "done" }).first(),
    ).toBeVisible({ timeout: 2000 });

    await expect(
      page.locator(".message-row").filter({ hasText: MESSAGE_TEXT }),
    ).toHaveCount(1);
  });
});
