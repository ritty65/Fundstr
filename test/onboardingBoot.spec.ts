import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

describe.skip('onboarding boot', () => {
  it('starts after navigating away from /welcome', async () => {
    vi.useFakeTimers()
    const startSpy = vi.fn()
    vi.doMock('src/composables/useOnboardingTour', () => ({
      hasCompletedOnboarding: () => false,
      startOnboardingTour: startSpy,
      getBrowserId: () => 'browserid',
    }))
    const { default: boot } = await import('src/boot/onboardingTour')
    const afterEachCbs: any[] = []
    const router: any = {
      currentRoute: ref({ path: '/welcome' }),
      isReady: () => Promise.resolve(),
      afterEach: (cb: any) => afterEachCbs.push(cb),
    }
    setActivePinia(createPinia())
    const { useNostrStore } = await import('src/stores/nostr')
    useNostrStore().pubkey = 'abcdef123456'
    await boot({ router })
    await Promise.resolve()
    expect(startSpy).not.toHaveBeenCalled()
    document.body.innerHTML = '<div data-tour="nav-toggle"></div>'
    router.currentRoute.value.path = '/wallet'
    afterEachCbs.forEach(cb => cb())
    await vi.runAllTimersAsync()
    expect(startSpy).toHaveBeenCalledWith('abcdef12', undefined, expect.any(Function))
    vi.unmock('src/composables/useOnboardingTour')
    vi.resetModules()
    vi.useRealTimers()
  })

  it('retries when target appears after timeout', async () => {
    vi.useFakeTimers()
    const startSpy = vi.fn()
    vi.doMock('quasar', () => ({ Notify: { create: vi.fn() } }))
    vi.doMock('src/composables/useOnboardingTour', () => ({
      hasCompletedOnboarding: () => false,
      startOnboardingTour: startSpy,
      getBrowserId: () => 'browserid',
    }))
    const { default: boot } = await import('src/boot/onboardingTour')
    const router: any = {
      currentRoute: ref({ path: '/wallet' }),
      isReady: () => Promise.resolve(),
      afterEach: () => {},
    }
    setActivePinia(createPinia())
    const { useNostrStore } = await import('src/stores/nostr')
    useNostrStore().pubkey = 'abcdef123456'
    document.body.innerHTML = ''
    await boot({ router })
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(20000)
    startSpy.mockClear()
    document.body.innerHTML = '<div data-tour="nav-toggle"></div>'
    await Promise.resolve()
    await vi.runAllTimersAsync()
    expect(startSpy).toHaveBeenCalled()
    vi.unmock('src/composables/useOnboardingTour')
    vi.unmock('quasar')
    vi.useRealTimers()
    vi.resetModules()
  })
})
