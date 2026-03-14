import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useCashuStore, type CashuQueuedSend } from "../src/stores/cashu";

const sendDm = vi.fn<
  [string, string],
  Promise<{ success: boolean }>
>();

vi.mock("../src/stores/messenger", () => ({
  useMessengerStore: () => ({
    sendDm,
  }),
}));

describe("cashu send queue handling", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    sendDm.mockReset();
    window.localStorage.clear();
  });

  it("resendQueued only removes entries after a successful send", async () => {
    const store = useCashuStore();
    const item: CashuQueuedSend = {
      npub: "npub1",
      token: "token-1",
      unlockTime: 123,
      createdAt: Date.now(),
    };

    store.queueSend(item);
    await nextTick();

    sendDm.mockResolvedValueOnce({ success: false });

    await expect(store.resendQueued(item)).resolves.toBe(false);
    expect(store.sendQueue).toHaveLength(1);
    expect(JSON.parse(window.localStorage.getItem("cashu.cashu.sendQueue") || "[]")).toHaveLength(1);

    sendDm.mockResolvedValueOnce({ success: true });

    await expect(store.resendQueued(item)).resolves.toBe(true);
    await nextTick();

    expect(store.sendQueue).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem("cashu.cashu.sendQueue") || "[]")).toHaveLength(0);
  });

  it("retryQueuedSends stops at first failure then clears queue on subsequent retries", async () => {
    const store = useCashuStore();
    const items: CashuQueuedSend[] = [
      { npub: "npub1", token: "token-1", unlockTime: 1, createdAt: 1 },
      { npub: "npub2", token: "token-2", unlockTime: 2, createdAt: 2 },
      { npub: "npub3", token: "token-3", unlockTime: 3, createdAt: 3 },
    ];

    items.forEach((entry) => store.queueSend(entry));
    await nextTick();

    sendDm.mockResolvedValueOnce({ success: false });
    sendDm.mockResolvedValue({ success: true });

    await store.retryQueuedSends();
    await nextTick();

    expect(sendDm).toHaveBeenCalledTimes(1);
    expect(store.sendQueue).toHaveLength(3);
    expect(JSON.parse(window.localStorage.getItem("cashu.cashu.sendQueue") || "[]")).toHaveLength(3);

    sendDm.mockReset();
    sendDm.mockResolvedValue({ success: true });

    await store.retryQueuedSends();
    await nextTick();

    expect(sendDm).toHaveBeenCalledTimes(3);
    expect(store.sendQueue).toHaveLength(0);
    expect(JSON.parse(window.localStorage.getItem("cashu.cashu.sendQueue") || "[]")).toHaveLength(0);
  });
});
