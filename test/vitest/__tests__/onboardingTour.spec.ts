import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'

// mock LocalStorage and Quasar components
const storage: Record<string, string> = {}
vi.mock('quasar', () => ({
  LocalStorage: {
    getItem: (key: string) => storage[key],
    set: (key: string, val: string) => {
      storage[key] = val
    },
    remove: (key: string) => {
      delete storage[key]
    }
  },
  QTooltip: { template: '<div><slot/></div>' },
  QBtn: { template: '<button @click="$emit(\'click\')"><slot/></button>' }
}))

// mock i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (s: string) => s })
}))

// mock stores
const nostrStore = reactive<{ pubkey: string | null }>({ pubkey: null })
vi.mock('src/stores/nostr', () => ({
  useNostrStore: () => nostrStore
}))
vi.mock('src/stores/ui', () => ({
  useUiStore: () => ({ openMainNav: vi.fn() })
}))

beforeEach(() => {
  for (const k in storage) delete storage[k]
  nostrStore.pubkey = null
  document.body.innerHTML = ''
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.resetModules()
})

describe('Onboarding tour', () => {
  it('starts tour when onboarding key is absent', async () => {
    nostrStore.pubkey = 'abcdef1234567890'
    const prefix = nostrStore.pubkey.slice(0, 8)

    const onboarding = await import('src/composables/useOnboardingTour')
    const startSpy = vi.spyOn(onboarding, 'startOnboardingTour').mockImplementation(() => {})
    const bootModule = await import('src/boot/onboardingTour')
    await bootModule.default({ router: { isReady: () => Promise.resolve() } })
    await nextTick()
    await nextTick()
    vi.runAllTimers()
    expect(startSpy).toHaveBeenCalledWith(prefix)
  })

  it('skip sets key and prevents subsequent runs', async () => {
    nostrStore.pubkey = '1234567890abcdef'
    const prefix = nostrStore.pubkey.slice(0, 8)

    const target = document.createElement('div')
    target.setAttribute('data-tour', 'nav-toggle')
    document.body.appendChild(target)

    const OnboardingTour = (await import('src/components/OnboardingTour.vue')).default
    const wrapper = mount(OnboardingTour, {
      props: { pubkeyPrefix: prefix, onFinish: () => {} },
      global: {
        config: { globalProperties: { $t: (s: string) => s } }
      }
    })
    await nextTick()
    await nextTick()
    await wrapper.find('button.skip-btn').trigger('click')

    const key = `fundstr:onboarding:v1:${prefix}:done`
    expect(storage[key]).toBe('1')

    const onboarding = await import('src/composables/useOnboardingTour')
    const startSpy = vi.spyOn(onboarding, 'startOnboardingTour').mockImplementation(() => {})
    const bootModule = await import('src/boot/onboardingTour')
    await bootModule.default({ router: { isReady: () => Promise.resolve() } })
    await nextTick()
    await nextTick()
    vi.runAllTimers()
    expect(startSpy).not.toHaveBeenCalled()
  })
})
