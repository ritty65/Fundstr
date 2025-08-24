import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { LocalStorage, Quasar } from 'quasar'
import { mount } from '@vue/test-utils'
import OnboardingTour from 'src/components/OnboardingTour.vue'
import { i18n } from 'src/boot/i18n'

describe('OnboardingTour component', () => {
  beforeEach(() => {
    LocalStorage.clear()
    setActivePinia(createPinia())
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
})
