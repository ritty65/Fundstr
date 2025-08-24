import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('firstRun store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    vi.unmock('src/composables/useOnboardingTour')
    vi.resetModules()
  })

  it('sets completion only on finish', async () => {
    vi.useFakeTimers()
    let finish!: () => void
    const startSpy = vi.fn((_prefix: string, _steps: any, onFinish?: () => void) => {
      finish = onFinish!
    })
    vi.doMock('src/composables/useOnboardingTour', () => ({
      startOnboardingTour: startSpy,
      getBrowserId: () => 'browserid',
    }))
    const { useFirstRunStore } = await import('src/stores/firstRun')
    const router: any = { push: vi.fn(), replace: vi.fn() }
    const store = useFirstRunStore()
    store.beginFirstRun(router)
    await vi.advanceTimersByTimeAsync(5000)
    expect(startSpy).toHaveBeenCalled()
    expect(store.firstRunCompleted).toBe(false)
    finish()
    expect(store.firstRunCompleted).toBe(true)
    vi.useRealTimers()
  })
})
