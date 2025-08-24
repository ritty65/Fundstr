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
  QMenu: { template: '<div><slot/></div>' },
  QBtn: { template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot/></button>' }
}))

// mock i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (s: string) => s })
}))

// mock router
vi.mock('vue-router', () => ({
  useRouter: () => ({ currentRoute: { value: { path: '/' } } })
}))

// mock stores
const nostrStore = reactive<{ pubkey: string | null }>({ pubkey: null })
vi.mock('src/stores/nostr', () => ({
  useNostrStore: () => nostrStore
}))
let uiStore: any
vi.mock('src/stores/ui', () => ({
  useUiStore: () => uiStore
}))

beforeEach(() => {
  for (const k in storage) delete storage[k]
  nostrStore.pubkey = null
  document.body.innerHTML = ''
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.resetModules()
  uiStore = reactive({
    mainNavOpen: false,
    openMainNav: vi.fn(() => {
      uiStore.mainNavOpen = true
    })
  })
})

describe('Onboarding tour', () => {
  it('starts tour when onboarding key is absent', async () => {
    nostrStore.pubkey = 'abcdef1234567890'
    const prefix = nostrStore.pubkey.slice(0, 8)

    const onboarding = await import('src/composables/useOnboardingTour')
    const startSpy = vi.spyOn(onboarding, 'startOnboardingTour').mockImplementation(() => {})
    const toggle = document.createElement('div')
    toggle.setAttribute('data-tour', 'nav-toggle')
    document.body.appendChild(toggle)
    const target = document.createElement('div')
    target.setAttribute('data-tour', 'nav-dashboard')
    document.body.appendChild(target)
    const bootModule = await import('src/boot/onboardingTour')
    const router = { isReady: () => Promise.resolve() }
    await bootModule.default({ router })
    await nextTick()
    await nextTick()
    vi.runAllTimers()
    expect(startSpy).toHaveBeenCalledWith(
      prefix,
      router,
      undefined,
      expect.any(Function),
    )
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

    const key = `fundstr:onboarding:v3:${prefix}:done`
    expect(storage[key]).toBe('1')

    const onboarding = await import('src/composables/useOnboardingTour')
    const startSpy = vi.spyOn(onboarding, 'startOnboardingTour').mockImplementation(() => {})
    const bootModule = await import('src/boot/onboardingTour')
    const router = { isReady: () => Promise.resolve() }
    await bootModule.default({ router })
    await nextTick()
    await nextTick()
    vi.runAllTimers()
    expect(startSpy).not.toHaveBeenCalled()
  })

  it('shows nav toggle when nav is initially closed and advances on toggle click', async () => {
    const prefix = 'abcdef12'
    const navToggle = document.createElement('div')
    navToggle.setAttribute('data-tour', 'nav-toggle')
    navToggle.addEventListener('click', uiStore.openMainNav)
    document.body.appendChild(navToggle)
    const navDashboard = document.createElement('div')
    navDashboard.setAttribute('data-tour', 'nav-dashboard')
    document.body.appendChild(navDashboard)

    const OnboardingTour = (await import('src/components/OnboardingTour.vue')).default
    const wrapper = mount(OnboardingTour, {
      props: { pubkeyPrefix: prefix, onFinish: () => {} },
      global: { config: { globalProperties: { $t: (s: string) => s } } }
    })

    await nextTick()
    await nextTick()
    await vi.runAllTimersAsync()
    expect(wrapper.html()).toContain('OnboardingTour.navToggle')

    navToggle.click()
    await nextTick()
    await vi.runAllTimersAsync()
    expect(uiStore.openMainNav).toHaveBeenCalled()
    expect(document.body.innerHTML).toContain('OnboardingTour.navDashboard')
  })

  it('starts at dashboard when nav is already open', async () => {
    uiStore.mainNavOpen = true
    const prefix = 'abcdef12'
    const navDashboard = document.createElement('div')
    navDashboard.setAttribute('data-tour', 'nav-dashboard')
    document.body.appendChild(navDashboard)

    const OnboardingTour = (await import('src/components/OnboardingTour.vue')).default
    const wrapper = mount(OnboardingTour, {
      props: { pubkeyPrefix: prefix, onFinish: () => {} },
      global: { config: { globalProperties: { $t: (s: string) => s } } }
    })

    await nextTick()
    await nextTick()
    await vi.runAllTimersAsync()
    expect(wrapper.html()).toContain('OnboardingTour.navDashboard')
  })

  it('boots at dashboard when nav is open and nav toggle missing', async () => {
    uiStore.mainNavOpen = true
    nostrStore.pubkey = 'fedcba9876543210'
    const prefix = nostrStore.pubkey.slice(0, 8)

    const navDashboard = document.createElement('div')
    navDashboard.setAttribute('data-tour', 'nav-dashboard')
    document.body.appendChild(navDashboard)

    const onboarding = await import('src/composables/useOnboardingTour')
    const startSpy = vi.spyOn(onboarding, 'startOnboardingTour')

    const bootModule = await import('src/boot/onboardingTour')
    await bootModule.default({ router: { isReady: () => Promise.resolve() } })
    await nextTick()
    await nextTick()
    await vi.runAllTimersAsync()
    await nextTick()
    expect(startSpy).toHaveBeenCalledWith(
      prefix,
      router,
      undefined,
      expect.any(Function),
    )
    expect(document.body.innerHTML).toContain('OnboardingTour.navDashboard')
  })
})
