import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { LocalStorage, Quasar } from 'quasar'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import OnboardingTour from 'src/components/OnboardingTour.vue'
import { i18n } from 'src/boot/i18n'

const currentRoute = ref({ path: '/' })
const afterEachCbs: any[] = []
vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute,
    afterEach: (cb: any) => {
      afterEachCbs.push(cb)
      return () => {}
    },
  }),
}))

describe('OnboardingTour component', () => {
  beforeEach(() => {
    LocalStorage.clear()
    setActivePinia(createPinia())
    currentRoute.value.path = '/'
    afterEachCbs.length = 0
  })

  it('does not mark done when no step was shown', () => {
    const wrapper = mount(OnboardingTour, {
      props: { pubkeyPrefix: 'test', onFinish: () => {} },
      global: { plugins: [[Quasar, {}], i18n] },
    })
    ;(wrapper.vm as any).finish()
    expect(LocalStorage.getItem('fundstr:onboarding:v3:test:done')).toBeNull()
  })

  it('marks done when a step was shown', () => {
    const wrapper = mount(OnboardingTour, {
      props: { pubkeyPrefix: 'test2', onFinish: () => {} },
      global: { plugins: [[Quasar, {}], i18n] },
    })
    ;(wrapper.vm as any).steps = [{}]
    ;(wrapper.vm as any).index = 1
    ;(wrapper.vm as any).shownAtLeastOneStep = true
    ;(wrapper.vm as any).finish()
    expect(LocalStorage.getItem('fundstr:onboarding:v3:test2:done')).toBe('1')
  })

  it('resetOnboarding clears key', async () => {
    LocalStorage.set('fundstr:onboarding:v3:abc:done', '1')
    const { resetOnboarding } = await import('src/composables/useOnboardingTour')
    resetOnboarding('abc')
    expect(LocalStorage.getItem('fundstr:onboarding:v3:abc:done')).toBeNull()
  })

  it('auto advances on route change', async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<div data-tour="step1"></div><div data-tour="step2"></div>'
    const wrapper = mount(OnboardingTour, {
      props: {
        pubkeyPrefix: 'route',
        onFinish: () => {},
        steps: [
          {
            id: 's1',
            target: '[data-tour="step1"]',
            instruction: 'first',
            completeWhen: { path: '/next' },
            advanceMode: 'auto',
          },
          {
            id: 's2',
            target: '[data-tour="step2"]',
            instruction: 'second',
            completeWhen: { predicate: () => true },
          },
        ],
      },
      global: { plugins: [[Quasar, {}], i18n] },
    })
    currentRoute.value.path = '/next'
    afterEachCbs.forEach(cb => cb({ path: '/next' }))
    await vi.runAllTimersAsync()
    expect((wrapper.vm as any).index).toBe(1)
    vi.useRealTimers()
  })

  it('auto advances when predicate becomes true', async () => {
    vi.useFakeTimers()
    document.body.innerHTML =
      '<div data-tour="p1"></div><div data-tour="p2"></div>'
    const flag = ref(false)
    const wrapper = mount(OnboardingTour, {
      props: {
        pubkeyPrefix: 'pred',
        onFinish: () => {},
        steps: [
          {
            id: 'p1',
            target: '[data-tour="p1"]',
            instruction: 'first',
            completeWhen: { predicate: () => flag.value },
            advanceMode: 'auto',
          },
          {
            id: 'p2',
            target: '[data-tour="p2"]',
            instruction: 'second',
            completeWhen: { predicate: () => true },
          },
        ],
      },
      global: { plugins: [[Quasar, {}], i18n] },
    })
    flag.value = true
    await vi.runAllTimersAsync()
    expect((wrapper.vm as any).index).toBe(1)
    vi.useRealTimers()
  })
})
