import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useCashuSendWorker } from "stores/cashuSendWorker";

const cashuStoreMock: any = {};
const messengerStoreMock: any = {};

vi.mock("stores/cashu", () => ({
  useCashuStore: () => cashuStoreMock,
}));

vi.mock("stores/messenger", () => ({
  useMessengerStore: () => messengerStoreMock,
}));

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  cashuStoreMock.sendQueue = [];
  cashuStoreMock.retryQueuedSends = vi.fn(async () => {});
  messengerStoreMock.isConnected = vi.fn(() => true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cashuSendWorker", () => {
  it("starts an interval and processes immediately", async () => {
    const worker = useCashuSendWorker();
    const processSpy = vi
      .spyOn(worker, "process")
      .mockImplementation(async () => {});

    worker.start();

    expect(worker.worker).not.toBeNull();
    expect(processSpy).toHaveBeenCalledTimes(1);

    await vi.runOnlyPendingTimersAsync();
    expect(processSpy).toHaveBeenCalledTimes(2);

    worker.stop();
    expect(worker.worker).toBeNull();
  });

  it("does not start a second interval when already running", () => {
    const worker = useCashuSendWorker();
    const processSpy = vi
      .spyOn(worker, "process")
      .mockImplementation(async () => {});

    worker.start();
    const currentWorker = worker.worker;

    worker.start();

    expect(worker.worker).toBe(currentWorker);
    expect(processSpy).toHaveBeenCalledTimes(1);
  });

  it("stops and clears the timer", () => {
    const worker = useCashuSendWorker();
    worker.start();

    worker.stop();

    expect(worker.worker).toBeNull();
  });

  it("skips processing when disconnected", async () => {
    messengerStoreMock.isConnected = vi.fn(() => false);
    cashuStoreMock.sendQueue = [1];

    const worker = useCashuSendWorker();
    await worker.process();

    expect(cashuStoreMock.retryQueuedSends).not.toHaveBeenCalled();
  });

  it("skips processing when there is no queued send", async () => {
    messengerStoreMock.isConnected = vi.fn(() => true);
    cashuStoreMock.sendQueue = [];

    const worker = useCashuSendWorker();
    await worker.process();

    expect(cashuStoreMock.retryQueuedSends).not.toHaveBeenCalled();
  });

  it("retries queued sends when connected and queue has entries", async () => {
    messengerStoreMock.isConnected = vi.fn(() => true);
    cashuStoreMock.sendQueue = [1];

    const worker = useCashuSendWorker();
    await worker.process();

    expect(cashuStoreMock.retryQueuedSends).toHaveBeenCalledTimes(1);
  });
});
