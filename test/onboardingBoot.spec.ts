import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

describe('onboarding boot', () => {
  it('starts after navigating away from /welcome', async () => {
    const startSpy = vi.fn()
    vi.doMock('src/composables/useOnboardingTour', () => ({
      hasCompletedOnboarding: () => false,
      startOnboardingTour: startSpy,
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
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(startSpy).toHaveBeenCalledWith('abcdef12', undefined, expect.any(Function))
    vi.unmock('src/composables/useOnboardingTour')
    vi.resetModules()
  })
})
