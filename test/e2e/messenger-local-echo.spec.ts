import { test, expect } from "@playwright/test";
import {
  bootstrapAndCompleteOnboarding,
  TEST_CREATOR_HEX,
} from "./support/journey-fixtures";

const MESSAGE_ACK_TEXT = "Hello pending ack";
const MESSAGE_RETRY_TEXT = "Retry this message";

test.describe("Messenger local echo status", () => {
  test("pending message transitions to sent when acknowledgement arrives", async ({
    page,
  }) => {
    const api = await bootstrapAndCompleteOnboarding(page);
    await page.goto("/nostr-messenger");
    const recipient = (await api.getNostrPubkey()) || TEST_CREATOR_HEX;

    const { localId } = await api.messengerCreateLocalEcho({
      pubkey: recipient,
      content: MESSAGE_ACK_TEXT,
    });

    await expect
      .poll(async () => {
        const conversation = await api.getConversation(recipient);
        return conversation[0]?.localEcho?.status ?? null;
      })
      .toBe("pending");

    await api.messengerMarkLocalEchoSent(localId);

    await expect
      .poll(async () => {
        const conversation = await api.getConversation(recipient);
        return conversation[0]?.localEcho?.status ?? null;
      })
      .toBe("sent");
  });

  test("failed message can be retried successfully", async ({ page }) => {
    const api = await bootstrapAndCompleteOnboarding(page);
    await page.goto("/nostr-messenger");
    const recipient = (await api.getNostrPubkey()) || TEST_CREATOR_HEX;

    const { localId } = await api.messengerCreateLocalEcho({
      pubkey: recipient,
      content: MESSAGE_RETRY_TEXT,
    });

    await expect
      .poll(async () => {
        const conversation = await api.getConversation(recipient);
        return conversation[0]?.localEcho?.status ?? null;
      })
      .toBe("pending");

    await api.messengerMarkLocalEchoFailed(localId);

    await expect
      .poll(async () => {
        const conversation = await api.getConversation(recipient);
        return conversation[0]?.localEcho?.status ?? null;
      })
      .toBe("failed");

    await api.messengerSetSendMock({ mode: "success" });
    try {
      await api.messengerRetryLocalEcho(localId);
      await expect
        .poll(async () => {
          const conversation = await api.getConversation(recipient);
          return conversation[0]?.localEcho?.status ?? null;
        })
        .toBe("sent");
    } finally {
      await api.messengerClearSendMock();
    }
  });
});
