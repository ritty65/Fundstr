import { describe, it, beforeEach, afterEach, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { notifySpy, clipboardReadMock, hapticsVibrateMock } = vi.hoisted(() => ({
  notifySpy: vi.fn(),
  clipboardReadMock: vi.fn(),
  hapticsVibrateMock: vi.fn(),
}));

vi.mock("src/js/notify", () => ({
  notifyApiError: vi.fn(),
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyWarning: vi.fn(),
  notify: notifySpy,
}));

vi.mock("src/js/logger", () => ({
  debug: vi.fn(),
}));

vi.mock("@capacitor/clipboard", () => ({
  Clipboard: {
    read: clipboardReadMock,
  },
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: {
    vibrate: hapticsVibrateMock,
  },
  ImpactStyle: { Light: "Light" },
}));

import { useUiStore } from "src/stores/ui";

describe("ui store", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    notifySpy.mockClear();
    clipboardReadMock.mockReset();
    hapticsVibrateMock.mockReset();
    localStorage.clear();
    setActivePinia(createPinia());

    const clipboardReadText = vi.fn();
    const vibrate = vi.fn();

    vi.stubGlobal("navigator", {
      onLine: true,
      language: "en-US",
      clipboard: {
        readText: clipboardReadText,
      },
      vibrate,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as any).Capacitor;
  });

  it("waits for the mutex to be released before resolving and unlock clears the flag", async () => {
    vi.useFakeTimers();
    const store = useUiStore();
    store.globalMutexLock = true;

    let settled = false;
    const lockPromise = store.lockMutex().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(500 * 3);
    expect(settled).toBe(false);

    store.globalMutexLock = false;

    await vi.advanceTimersByTimeAsync(500);
    await lockPromise;

    expect(settled).toBe(true);
    expect(store.globalMutexLock).toBe(true);

    store.unlockMutex();
    expect(store.globalMutexLock).toBe(false);
  });

  it("throws after 60 retries when the mutex never unlocks", async () => {
    vi.useFakeTimers();
    const store = useUiStore();
    store.globalMutexLock = true;

    const lockPromise = store.lockMutex();
    const handled = lockPromise.catch((error) => error);

    await vi.advanceTimersByTimeAsync(500 * 60);

    await expect(handled).resolves.toEqual(
      expect.objectContaining({ message: "Failed to acquire global mutex lock" }),
    );
    expect(notifySpy).toHaveBeenCalledWith("Please try again.");
  });

  it("formats currency respecting hideBalance, overrides, and unit scaling", () => {
    const store = useUiStore();

    store.hideBalance = true;

    expect(store.formatCurrency(1234, "sat")).toBe("****");
    expect(store.formatCurrency(1234, "sat", true)).toBe("1,234 sat");
    expect(store.formatCurrency(1234, "msat", true)).toBe("1,234 msat");
    expect(store.formatCurrency(12345, "usd", true)).toBe("$123.45");
  });

  it("watches navigator events to toggle offline state", () => {
    const store = useUiStore();
    const listeners: Record<string, Array<(event: Event) => void>> = {};

    const addEventListenerSpy = vi
      .spyOn(window, "addEventListener")
      .mockImplementation((event: string, handler: EventListenerOrEventListenerObject) => {
        const fn = typeof handler === "function" ? handler : handler.handleEvent!.bind(handler);
        (listeners[event] ||= []).push(fn as (event: Event) => void);
      });

    (navigator as any).onLine = true;
    store.initNetworkWatcher();

    expect(store.offline).toBe(false);
    expect(addEventListenerSpy).toHaveBeenCalledWith("online", expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith("offline", expect.any(Function));

    (navigator as any).onLine = false;
    expect(listeners["offline"]).toBeTruthy();
    listeners["offline"]!.forEach((cb) => cb(new Event("offline")));
    expect(store.offline).toBe(true);

    (navigator as any).onLine = true;
    expect(listeners["online"]).toBeTruthy();
    listeners["online"]!.forEach((cb) => cb(new Event("online")));
    expect(store.offline).toBe(false);
  });

  it("prefers Capacitor clipboard and haptics when available", async () => {
    const store = useUiStore();
    clipboardReadMock.mockResolvedValue({ value: "native" });
    const webReadSpy: Mock = vi.fn().mockResolvedValue("web");
    (navigator as any).clipboard.readText = webReadSpy;

    (window as any).Capacitor = {};

    const text = await store.pasteFromClipboard();
    expect(clipboardReadMock).toHaveBeenCalled();
    expect(webReadSpy).not.toHaveBeenCalled();
    expect(text).toBe("native");

    hapticsVibrateMock.mockResolvedValue(undefined);
    await store.vibrate();
    expect(hapticsVibrateMock).toHaveBeenCalledWith({ duration: 200 });
    expect((navigator as any).vibrate).not.toHaveBeenCalled();
  });

  it("falls back to web clipboard and vibration when Capacitor is unavailable", async () => {
    const store = useUiStore();
    clipboardReadMock.mockResolvedValue({ value: "native" });
    const webReadSpy = (navigator as any).clipboard.readText as Mock;
    webReadSpy.mockResolvedValue("web");

    const text = await store.pasteFromClipboard();
    expect(clipboardReadMock).not.toHaveBeenCalled();
    expect(webReadSpy).toHaveBeenCalled();
    expect(text).toBe("web");

    await store.vibrate();
    expect(hapticsVibrateMock).not.toHaveBeenCalled();
    expect((navigator as any).vibrate).toHaveBeenCalledWith(200);
  });

  it("toggles the debug console script when enabling and disabling", () => {
    const store = useUiStore();
    store.showDebugConsole = false;

    const removeSpy = vi.fn();
    const fakeScript = { onload: null as any, src: "" } as HTMLScriptElement;

    const createElementSpy = vi
      .spyOn(document, "createElement")
      .mockReturnValue(fakeScript as unknown as HTMLScriptElement);
    const appendSpy = vi
      .spyOn(document.body, "appendChild")
      .mockImplementation(() => fakeScript as unknown as Node);
    const querySpy = vi
      .spyOn(document, "querySelector")
      .mockReturnValue({ remove: removeSpy } as unknown as Element);

    store.toggleDebugConsole();
    expect(store.showDebugConsole).toBe(true);
    expect(createElementSpy).toHaveBeenCalledWith("script");
    expect(appendSpy).toHaveBeenCalledWith(fakeScript);

    store.toggleDebugConsole();
    expect(store.showDebugConsole).toBe(false);
    expect(querySpy).toHaveBeenCalledWith("#eruda");
    expect(removeSpy).toHaveBeenCalled();
    expect(appendSpy).toHaveBeenCalledTimes(1);
  });
});
