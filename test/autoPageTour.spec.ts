import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LocalStorage } from 'quasar'
import { LOCAL_STORAGE_KEYS } from 'src/constants/localStorageKeys'

const SEQUENCE = [
  '/wallet',
  '/find-creators',
  '/creator-hub',
  '/buckets',
  '/subscriptions',
  '/nostr-messenger',
]

describe('auto page tour', () => {
  let push: any

  beforeEach(() => {
    push = vi.fn(() => Promise.resolve())
    vi.resetModules()
    vi.doMock('vue-router', () => ({ useRouter: () => ({ push }) }))
    LocalStorage.clear()
  })

  afterEach(() => {
    vi.unmock('vue-router')
    vi.useRealTimers()
  })

  it('navigates through pages with dwell time', async () => {
    vi.useFakeTimers()
    const { useAutoPageTour } = await import('src/composables/useAutoPageTour')
    const { startAutoPageTour } = useAutoPageTour()
    startAutoPageTour({ dwellMs: 1000 })
    expect(push).toHaveBeenCalledWith(SEQUENCE[0])
    for (let i = 1; i < SEQUENCE.length; i++) {
      await vi.advanceTimersByTimeAsync(1000)
      expect(push).toHaveBeenCalledWith(SEQUENCE[i])
    }
    await vi.runAllTimersAsync()
    expect(LocalStorage.getItem(LOCAL_STORAGE_KEYS.FUNDSTR_AUTOTOUR_DONE)).toBe('1')
  })

  it('can skip the tour', async () => {
    vi.useFakeTimers()
    const { useAutoPageTour } = await import('src/composables/useAutoPageTour')
    const { startAutoPageTour, skip, isRunning } = useAutoPageTour()
    startAutoPageTour({ dwellMs: 1000 })
    expect(isRunning.value).toBe(true)
    skip()
    expect(isRunning.value).toBe(false)
    expect(LocalStorage.getItem(LOCAL_STORAGE_KEYS.FUNDSTR_AUTOTOUR_DONE)).toBe('1')
  })

  it('respects completion flag unless replaying', async () => {
    vi.useFakeTimers()
    const { useAutoPageTour } = await import('src/composables/useAutoPageTour')
    const { startAutoPageTour } = useAutoPageTour()
    LocalStorage.set(LOCAL_STORAGE_KEYS.FUNDSTR_AUTOTOUR_DONE, '1')
    startAutoPageTour({ dwellMs: 1000 })
    expect(push).not.toHaveBeenCalled()
    startAutoPageTour({ dwellMs: 1000, replay: true })
    expect(push).toHaveBeenCalledWith(SEQUENCE[0])
  })
})
