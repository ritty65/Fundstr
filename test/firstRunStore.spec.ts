import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref } from 'vue'

vi.mock('@vueuse/core', () => ({
  useLocalStorage: <T>(_k: string, v: T) => ref(v),
}))

const nostrStore = { pubkey: 'abcdef1234567890' }
vi.mock('src/stores/nostr', () => ({
  useNostrStore: () => nostrStore,
}))

const startSpy = vi.fn()
vi.mock('src/composables/useOnboardingTour', () => ({
  startOnboardingTour: (...args: any[]) => startSpy(...args),
  getBrowserId: () => 'browserid1234',
}))

import { useFirstRunStore } from 'src/stores/firstRun'

beforeEach(() => {
  setActivePinia(createPinia())
  startSpy.mockReset()
  vi.useFakeTimers()
})

describe('first run store', () => {
  it('marks completion only on finish', async () => {
    const store = useFirstRunStore()
    const router = { push: vi.fn(), replace: vi.fn() }
    store.beginFirstRun(router as any)
    expect(store.firstRunCompleted).toBe(false)
    await vi.runAllTimersAsync()
    expect(startSpy).toHaveBeenCalled()
    expect(store.firstRunCompleted).toBe(false)
    const cb = startSpy.mock.calls[0][2] as () => void
    cb()
    expect(store.firstRunCompleted).toBe(true)
  })
})
