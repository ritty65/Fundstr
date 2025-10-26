import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
