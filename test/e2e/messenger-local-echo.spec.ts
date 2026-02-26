import { test, expect } from "@playwright/test";
import { bootstrapFundstr, TEST_CREATOR_HEX } from "./support/journey-fixtures";

const MESSAGE_ACK_TEXT = "Hello pending ack";
const MESSAGE_RETRY_TEXT = "Retry this message";

test.describe("Messenger local echo status", () => {
  test("pending message transitions to sent when acknowledgement arrives", async ({ page }) => {
    const api = await bootstrapFundstr(page);
    await page.goto("/nostr-messenger");

    const { localId } = await api.messengerCreateLocalEcho({
      pubkey: TEST_CREATOR_HEX,
      content: MESSAGE_ACK_TEXT,
    });

    const messageRow = page
      .locator(".message-row")
      .filter({ hasText: MESSAGE_ACK_TEXT })
      .first();

    await expect(messageRow).toBeVisible();
    await expect(messageRow.locator(".q-spinner")).toBeVisible();

    await api.messengerMarkLocalEchoSent(localId);

    await expect(
      messageRow.locator(".q-icon").filter({ hasText: "done" }).first(),
    ).toBeVisible();
  });

  test("failed message can be retried successfully", async ({ page }) => {
    const api = await bootstrapFundstr(page);
    await page.goto("/nostr-messenger");

    const { localId } = await api.messengerCreateLocalEcho({
      pubkey: TEST_CREATOR_HEX,
      content: MESSAGE_RETRY_TEXT,
    });

    const messageRow = page
      .locator(".message-row")
      .filter({ hasText: MESSAGE_RETRY_TEXT })
      .first();

    await expect(messageRow).toBeVisible();
    await expect(messageRow.locator(".q-spinner")).toBeVisible();

    await page.waitForTimeout(5200);

    await expect(
      messageRow.locator(".q-icon").filter({ hasText: "error" }).first(),
    ).toBeVisible();
    await expect(messageRow.getByRole("button", { name: "Retry" })).toBeVisible();

    await api.messengerSetSendMock({ mode: "success" });
    try {
      await messageRow.getByRole("button", { name: "Retry" }).click();
      await expect(
        messageRow.locator(".q-icon").filter({ hasText: "done" }).first(),
      ).toBeVisible({ timeout: 2000 });
    } finally {
      await api.messengerClearSendMock();
    }
  });
});
