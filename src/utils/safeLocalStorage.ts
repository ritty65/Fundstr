import { useLocalStorage } from "@vueuse/core";

export function safeUseLocalStorage<T>(key: string, defaultValue: T) {
  const raw = localStorage.getItem(key);
  if (raw !== null) {
    try {
      JSON.parse(raw);
    } catch (e) {
      console.warn(`Invalid JSON for ${key}, resetting`, e);
      localStorage.removeItem(key);
    }
  }
  const serializer = {
    read: (v: string): T => {
      try {
        return JSON.parse(v) as T;
      } catch {
        return defaultValue;
      }
    },
    write: (v: T): string => JSON.stringify(v),
  };
  return useLocalStorage<T>(key, defaultValue, { serializer });
}
