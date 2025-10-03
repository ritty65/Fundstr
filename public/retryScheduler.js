export function createExponentialBackoffScheduler(task, options = {}) {
  const {
    initialRetryDelayMs = 5000,
    maxRetryDelayMs = 300000,
    successDelayMs = 30000,
    multiplier = 2,
    onSuccess,
    onFailure,
  } = options;

  let attempt = 0;
  let active = false;
  let timerId = null;

  const clearTimer = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const scheduleNext = (delay) => {
    if (!active) return;
    clearTimer();
    timerId = setTimeout(runTask, delay);
  };

  const runTask = async () => {
    if (!active) return;
    let nextDelay = successDelayMs;
    try {
      const result = await task();
      attempt = 0;
      if (typeof onSuccess === "function") {
        try {
          onSuccess(result);
        } catch (hookError) {
          console.error("[retryScheduler] onSuccess hook failed", hookError);
        }
      }
      nextDelay = successDelayMs;
    } catch (error) {
      attempt += 1;
      const exponent = Math.max(0, attempt - 1);
      const calculatedDelay = initialRetryDelayMs * Math.pow(multiplier, exponent);
      nextDelay = Math.min(calculatedDelay, maxRetryDelayMs);
      if (typeof onFailure === "function") {
        try {
          onFailure(error, { attempt, nextDelay });
        } catch (hookError) {
          console.error("[retryScheduler] onFailure hook failed", hookError);
        }
      }
    }
    scheduleNext(nextDelay);
  };

  return {
    start() {
      if (active) return;
      active = true;
      attempt = 0;
      scheduleNext(0);
    },
    stop() {
      active = false;
      clearTimer();
    },
    isRunning() {
      return active;
    },
    getAttempt() {
      return attempt;
    },
  };
}
