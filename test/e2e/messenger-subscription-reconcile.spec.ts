import { test, expect } from "@playwright/test";
import {
  bootstrapAndCompleteOnboarding,
  TEST_CREATOR_HEX,
} from "./support/journey-fixtures";

const MESSAGE_TEXT = "Late echo reconciliation";

test.describe("Messenger conversation subscription", () => {
  test("late echo after subscription restart stays as a single bubble", async ({
    page,
  }) => {
    const api = await bootstrapAndCompleteOnboarding(page);

    const eventId = `e2e-event-${Date.now()}`;

    await api.messengerCreateLocalEcho({
      pubkey: TEST_CREATOR_HEX,
      content: MESSAGE_TEXT,
      eventId,
    });

    await expect
      .poll(async () => {
        const conversation = await api.getConversation(TEST_CREATOR_HEX);
        return {
          count: conversation.filter((entry) => entry.content === MESSAGE_TEXT)
            .length,
          status:
            conversation.find((entry) => entry.content === MESSAGE_TEXT)
              ?.localEcho?.status ?? null,
        };
      })
      .toEqual({ count: 1, status: "pending" });

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

    await expect
      .poll(async () => {
        const conversation = await api.getConversation(TEST_CREATOR_HEX);
        return {
          count: conversation.filter((entry) => entry.content === MESSAGE_TEXT)
            .length,
          status:
            conversation.find((entry) => entry.content === MESSAGE_TEXT)
              ?.localEcho?.status ?? null,
        };
      })
      .toEqual({ count: 1, status: "sent" });
  });
});
