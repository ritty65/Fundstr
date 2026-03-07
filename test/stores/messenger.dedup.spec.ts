import { describe, it, expect } from "vitest";
import {
  mergeMessengerEvent,
  type MessengerMessage,
} from "src/stores/messenger";

describe("mergeMessengerEvent", () => {
  it("reuses existing message from the event map", () => {
    const existing: MessengerMessage = {
      id: "event-1",
      pubkey: "peer",
      content: "hello",
      created_at: 100,
      outgoing: false,
    };
    const eventMap: Record<string, MessengerMessage> = { "event-1": existing };
    const eventLog: MessengerMessage[] = [existing];
    const conversation: MessengerMessage[] = [existing];
    const localEchoIndex: Record<string, MessengerMessage> = {};

    const result = mergeMessengerEvent({
      eventId: "event-1",
      eventMap,
      eventLog,
      conversation,
      localEchoIndex,
      createMessage: () => ({
        id: "event-1",
        pubkey: "peer",
        content: "new",
        created_at: 200,
        outgoing: false,
      }),
    });

    expect(result.created).toBe(false);
    expect(result.deduped).toBe(true);
    expect(result.reason).toBe("event-map");
    expect(conversation).toHaveLength(1);
    expect(eventLog).toHaveLength(1);
    expect(eventMap["event-1"]).toBe(existing);
  });

  it("adds a new message and indexes ids and local echoes", () => {
    const eventMap: Record<string, MessengerMessage> = {};
    const eventLog: MessengerMessage[] = [];
    const conversation: MessengerMessage[] = [];
    const localEchoIndex: Record<string, MessengerMessage> = {};

    const result = mergeMessengerEvent({
      eventId: "event-2",
      eventMap,
      eventLog,
      conversation,
      localEchoIndex,
      createMessage: () => ({
        id: "event-2",
        pubkey: "peer",
        content: "hi",
        created_at: 500,
        outgoing: false,
        localEcho: {
          localId: "local-123",
          eventId: "event-2",
          status: "pending",
          relayResults: {},
          createdAt: Date.now(),
          updatedAt: Date.now(),
          lastAckAt: null,
          timerStartedAt: null,
          error: null,
          relays: [],
          attempt: 1,
          payload: { content: "hi" },
        },
      }),
    });

    expect(result.created).toBe(true);
    expect(result.deduped).toBe(false);
    expect(eventLog).toHaveLength(1);
    expect(conversation).toHaveLength(1);
    expect(eventMap["event-2"]).toBe(result.message);
    expect(localEchoIndex["local-123"]).toBe(result.message);
  });
});
