import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockBeforeInstallPromptEvent extends Event {
  prompt = vi.fn<[], Promise<void>>().mockResolvedValue();
  override preventDefault = vi.fn();

  constructor() {
    super('beforeinstallprompt');
  }
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches the beforeinstallprompt event and prevents default', async () => {
    const { usePwaInstall } = await import('src/composables/usePwaInstall');
    const { deferredPrompt } = usePwaInstall();

    expect(deferredPrompt.value).toBeNull();

    const event = new MockBeforeInstallPromptEvent();

    window.dispatchEvent(event);

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(deferredPrompt.value).toBe(event);
  });

  it('prompts when a deferred install event is cached and clears it afterward', async () => {
    const { usePwaInstall } = await import('src/composables/usePwaInstall');
    const { deferredPrompt, promptInstall } = usePwaInstall();

    await expect(promptInstall()).resolves.toBeUndefined();
    expect(deferredPrompt.value).toBeNull();

    const event = new MockBeforeInstallPromptEvent();

    window.dispatchEvent(event);
    expect(deferredPrompt.value).toBe(event);

    await promptInstall();

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(deferredPrompt.value).toBeNull();

    await promptInstall();

    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('no-ops when window is unavailable', async () => {
    const originalWindow = globalThis.window;
    vi.stubGlobal('window', undefined as unknown as Window & typeof globalThis);

    const { usePwaInstall } = await import('src/composables/usePwaInstall');
    const { deferredPrompt, promptInstall } = usePwaInstall();

    expect(deferredPrompt.value).toBeNull();
    await expect(promptInstall()).resolves.toBeUndefined();

    vi.stubGlobal('window', originalWindow);
  });
});
