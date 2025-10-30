import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LOCAL_STORAGE_KEYS } from "@/constants/localStorageKeys";

const COOKIE_KEY = "fundstr_browser_id";
const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  "localStorage",
);

function clearBrowserIdCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
}

describe("getOrCreateBrowserId", () => {
  beforeEach(() => {
    vi.resetModules();
    clearBrowserIdCookie();
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
    } else {
      Reflect.deleteProperty(window, "localStorage");
    }
  });

  afterEach(() => {
    clearBrowserIdCookie();
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(window, "localStorage", originalLocalStorageDescriptor);
    } else {
      Reflect.deleteProperty(window, "localStorage");
    }
  });

  it("persists the browser id in localStorage when available", async () => {
    const storage = new Map<string, string>();
    const localStorageMock = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    } as Storage;

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: localStorageMock,
    });

    const { getOrCreateBrowserId } = await import("@/utils/browserId");

    const id = getOrCreateBrowserId();
    expect(id).toBeTypeOf("string");
    expect(id.length).toBeGreaterThan(0);
    expect(storage.get(LOCAL_STORAGE_KEYS.FUNDSTR_BROWSER_ID)).toBe(id);

    const cached = getOrCreateBrowserId();
    expect(cached).toBe(id);
  });

  it("falls back to a cookie when localStorage cannot be used", async () => {
    const blockedStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as Storage;

    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: blockedStorage,
    });

    const { getOrCreateBrowserId } = await import("@/utils/browserId");

    const id = getOrCreateBrowserId();
    expect(id).toBeTypeOf("string");
    expect(id.length).toBeGreaterThan(0);

    const cookieValue = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${COOKIE_KEY}=`));
    expect(cookieValue).toBeDefined();
    expect(cookieValue?.split("=")[1]).toBe(id);

    vi.resetModules();
    const reloaded = await import("@/utils/browserId");
    expect(reloaded.getOrCreateBrowserId()).toBe(id);
  });
});
