import { onMounted, onUnmounted, ref } from "vue";

const RECENT_OFFLINE_MS = 30_000;
const isOnline = ref(typeof navigator === "undefined" ? true : navigator.onLine);
const wasOfflineRecently = ref(false);
let offlineTimer: ReturnType<typeof setTimeout> | null = null;
let activeListeners = 0;

const clearOfflineTimer = () => {
  if (offlineTimer) {
    clearTimeout(offlineTimer);
    offlineTimer = null;
  }
};

const markOffline = () => {
  isOnline.value = false;
  wasOfflineRecently.value = true;
  clearOfflineTimer();
  offlineTimer = setTimeout(() => {
    wasOfflineRecently.value = false;
    offlineTimer = null;
  }, RECENT_OFFLINE_MS);
};

const markOnline = () => {
  isOnline.value = true;
};

const registerListeners = () => {
  if (typeof window === "undefined") {
    return () => {};
  }
  if (activeListeners === 0) {
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
  }
  activeListeners += 1;
  return () => {
    activeListeners = Math.max(activeListeners - 1, 0);
    if (activeListeners === 0) {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
    }
  };
};

export const waitForOnline = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (navigator.onLine) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const handleOnline = () => {
      window.removeEventListener("online", handleOnline);
      resolve();
    };
    window.addEventListener("online", handleOnline, { once: true });
  });
};

export function useNetworkStatus() {
  let unregister: (() => void) | null = null;

  onMounted(() => {
    unregister = registerListeners();
  });

  onUnmounted(() => {
    unregister?.();
    unregister = null;
  });

  return {
    isOnline,
    wasOfflineRecently,
    waitForOnline,
  };
}
