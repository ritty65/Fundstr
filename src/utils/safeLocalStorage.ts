import { useLocalStorage } from "@vueuse/core";

export function safeUseLocalStorage<T>(key: string, defaultValue: T) {
  const raw = localStorage.getItem(key);
  if (raw !== null) {
    try {
      JSON.parse(raw);
    } catch (e) {
      // Legacy values may be stored as plain strings. Wrap them in JSON so
      // they can be read on the next access instead of dropping the data.
      console.warn(`Invalid JSON for ${key}, migrating to JSON`, e);
      localStorage.setItem(key, JSON.stringify(raw));
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
