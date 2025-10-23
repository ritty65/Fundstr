import { v4 as uuidv4 } from "uuid";
import { LOCAL_STORAGE_KEYS } from "@/constants/localStorageKeys";

function isLocalStorageAvailable(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    const testKey = "__fundstr_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function getOrCreateBrowserId(): string | null {
  if (!isLocalStorageAvailable()) {
    return null;
  }

  const storage = window.localStorage;
  const existing = storage.getItem(LOCAL_STORAGE_KEYS.FUNDSTR_BROWSER_ID);
  if (existing && typeof existing === "string" && existing.trim().length > 0) {
    return existing;
  }

  const id = uuidv4();
  storage.setItem(LOCAL_STORAGE_KEYS.FUNDSTR_BROWSER_ID, id);
  return id;
}
