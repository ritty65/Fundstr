import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { createExponentialBackoffScheduler } from "../../public/retryScheduler.js";

describe("createExponentialBackoffScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries with exponential backoff until the task succeeds", async () => {
    const task = vi.fn();
    let attempt = 0;
    task.mockImplementation(async () => {
      attempt += 1;
      if (attempt < 3) {
        throw new Error(`fail-${attempt}`);
      }
      return attempt;
    });

    const onFailure = vi.fn();
    const onSuccess = vi.fn();

    const scheduler = createExponentialBackoffScheduler(task, {
      initialRetryDelayMs: 1000,
      maxRetryDelayMs: 8000,
      successDelayMs: 60000,
      onFailure,
      onSuccess,
    });

    scheduler.start();

    await vi.runOnlyPendingTimersAsync();
    expect(task).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure.mock.calls[0][1]).toMatchObject({
      attempt: 1,
      nextDelay: 1000,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onFailure).toHaveBeenCalledTimes(2);
    expect(onFailure.mock.calls[1][1]).toMatchObject({
      attempt: 2,
      nextDelay: 2000,
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(task).toHaveBeenCalledTimes(3);
    expect(onSuccess).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60000);
    expect(task).toHaveBeenCalledTimes(4);

    scheduler.stop();
  });
});
