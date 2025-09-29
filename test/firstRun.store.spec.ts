import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('firstRun store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('marks completion after delay', async () => {
    vi.useFakeTimers()
    const { useFirstRunStore } = await import('src/stores/firstRun')
    const router: any = { push: vi.fn(), replace: vi.fn() }
    const store = useFirstRunStore()
    store.beginFirstRun(router)
    await vi.advanceTimersByTimeAsync(4999)
    expect(store.firstRunCompleted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(store.firstRunCompleted).toBe(true)
    vi.useRealTimers()
  })
})
