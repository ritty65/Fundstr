import { v4 as uuidv4 } from "uuid";
import { LOCAL_STORAGE_KEYS } from "@/constants/localStorageKeys";

const BROWSER_ID_COOKIE = "fundstr_browser_id";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

let inMemoryBrowserId: string | null = null;

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

function getCookie(name: string): string | null {
  if (typeof document === "undefined" || !document.cookie) {
    return null;
  }

  const entries = document.cookie.split(";");
  for (const entry of entries) {
    const [rawKey, ...rest] = entry.trim().split("=");
    if (rawKey === name) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return null;
}

function setCookie(name: string, value: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  try {
    document.cookie = `${name}=${encodeURIComponent(
      value,
    )}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
    return true;
  } catch {
    return false;
  }
}

function getInMemoryId(): string | null {
  return inMemoryBrowserId && inMemoryBrowserId.trim().length > 0
    ? inMemoryBrowserId
    : null;
}

function cacheInMemory(id: string): void {
  inMemoryBrowserId = id;
}

export function getOrCreateBrowserId(): string {
  const cached = getInMemoryId();
  if (cached) {
    return cached;
  }

  if (isLocalStorageAvailable()) {
    const storage = window.localStorage;
    const existing = storage.getItem(LOCAL_STORAGE_KEYS.FUNDSTR_BROWSER_ID);
    if (existing && typeof existing === "string" && existing.trim().length > 0) {
      cacheInMemory(existing);
      return existing;
    }

    const id = uuidv4();
    storage.setItem(LOCAL_STORAGE_KEYS.FUNDSTR_BROWSER_ID, id);
    cacheInMemory(id);
    return id;
  }

  const cookieId = getCookie(BROWSER_ID_COOKIE);
  if (cookieId && cookieId.trim().length > 0) {
    cacheInMemory(cookieId);
    return cookieId;
  }

  const id = uuidv4();
  const cookiePersisted = setCookie(BROWSER_ID_COOKIE, id);
  if (!cookiePersisted) {
    cacheInMemory(id);
    return id;
  }

  cacheInMemory(id);
  return id;
}
