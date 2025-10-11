import type NDK from "@nostr-dev-kit/ndk";

type FreeRelayFallbackState = {
  attemptedAt: number | null;
  unreachable: boolean;
  warned: boolean;
};

export type FreeRelayFallbackStatus = {
  lastAttemptAt: number | null;
  unreachable: boolean;
};

export type FreeRelayFallbackContext = "bootstrap" | "watchdog";

const fallbackStates = new WeakMap<NDK, FreeRelayFallbackState>();

let fallbackStatus: FreeRelayFallbackStatus = {
  lastAttemptAt: null,
  unreachable: false,
};

const fallbackStatusListeners = new Set<
  (status: FreeRelayFallbackStatus) => void
>();

function getState(ndk: NDK): FreeRelayFallbackState {
  let state = fallbackStates.get(ndk);
  if (!state) {
    state = { attemptedAt: null, unreachable: false, warned: false };
    fallbackStates.set(ndk, state);
  }
  return state;
}

function emitStatus() {
  const snapshot: FreeRelayFallbackStatus = { ...fallbackStatus };
  for (const listener of fallbackStatusListeners) {
    try {
      listener(snapshot);
    } catch {
      /* noop */
    }
  }
}

function updateStatus(partial: Partial<FreeRelayFallbackStatus>) {
  const next: FreeRelayFallbackStatus = {
    ...fallbackStatus,
    ...partial,
  };
  if (
    next.lastAttemptAt === fallbackStatus.lastAttemptAt &&
    next.unreachable === fallbackStatus.unreachable
  ) {
    return;
  }
  fallbackStatus = next;
  emitStatus();
}

export function getFreeRelayFallbackStatus(): FreeRelayFallbackStatus {
  return { ...fallbackStatus };
}

export function onFreeRelayFallbackStatusChange(
  listener: (status: FreeRelayFallbackStatus) => void,
): () => void {
  fallbackStatusListeners.add(listener);
  try {
    listener({ ...fallbackStatus });
  } catch {
    /* noop */
  }
  return () => {
    fallbackStatusListeners.delete(listener);
  };
}

export function hasFallbackAttempt(ndk: NDK): boolean {
  return getState(ndk).attemptedAt != null;
}

export function recordFallbackAttempt(ndk: NDK): number {
  const state = getState(ndk);
  const now = Date.now();
  state.attemptedAt = now;
  state.unreachable = false;
  state.warned = false;
  updateStatus({ lastAttemptAt: now, unreachable: false });
  return now;
}

export function isFallbackUnreachable(ndk: NDK): boolean {
  return getState(ndk).unreachable;
}

export function markFallbackUnreachable(
  ndk: NDK,
  context: FreeRelayFallbackContext,
  error?: Error,
) {
  const state = getState(ndk);
  if (!state.unreachable) {
    state.unreachable = true;
  }
  if (!state.warned) {
    state.warned = true;
    const scope = context === "watchdog" ? "watchdog" : "bootstrap";
    const suffix = error?.message ? ` (${error.message})` : "";
    console.warn(`[NDK] fallback relay pool unreachable during ${scope}${suffix}`);
  }
  updateStatus({ unreachable: true });
}

export function resetFallbackState(ndk: NDK) {
  const state = getState(ndk);
  if (state.attemptedAt == null && !state.unreachable && !state.warned) {
    return;
  }
  state.attemptedAt = null;
  state.unreachable = false;
  state.warned = false;
  updateStatus({ lastAttemptAt: null, unreachable: false });
}

export const __testing = {
  clearTelemetry() {
    fallbackStatusListeners.clear();
    fallbackStatus = { lastAttemptAt: null, unreachable: false };
  },
  getState,
};
