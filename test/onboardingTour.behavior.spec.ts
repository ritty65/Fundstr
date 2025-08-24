import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    },
  },
  QMenu: { template: '<div><slot/></div>' },
  QBtn: {
    template:
      '<button v-bind="$attrs" :disabled="$attrs.disable" @click="$emit(\'click\')"><slot/></button>',
  },
}))

// mock i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (s: string) => s, te: () => false }),
}))

// mock router
const route = reactive({ path: '/', name: 'start' })
const afterEachCbs: Array<(to: any, from: any) => void> = []
vi.mock('vue-router', () => ({
  useRouter: () => ({
    currentRoute: { value: route },
    afterEach: (cb: any) => {
      afterEachCbs.push(cb)
      return () => {
        const i = afterEachCbs.indexOf(cb)
        if (i >= 0) afterEachCbs.splice(i, 1)
      }
    },
  }),
}))

// mock stores
vi.mock('src/stores/ui', () => ({ useUiStore: () => ({}) }))

beforeEach(() => {
  for (const k in storage) delete storage[k]
  route.path = '/'
  route.name = 'start'
  afterEachCbs.length = 0
  vi.useFakeTimers()
})

describe('Onboarding tour', () => {
  it('advances automatically on matching route', async () => {
    document.body.innerHTML = ''
    const step1 = document.createElement('div')
    step1.setAttribute('data-tour', 'one')
    document.body.appendChild(step1)
    const step2 = document.createElement('div')
    step2.setAttribute('data-tour', 'two')
    document.body.appendChild(step2)

    const OnboardingTour = (await import('src/components/OnboardingTour.vue')).default
    const wrapper = mount(OnboardingTour, {
      props: {
        pubkeyPrefix: 'abcd1234',
        steps: [
          {
            id: 's1',
            target: '[data-tour="one"]',
            instruction: 'step1',
            requiredAction: 'click',
            advanceMode: 'auto',
            completeWhen: { path: '/next' },
          },
          {
            id: 's2',
            target: '[data-tour="two"]',
            instruction: 'step2',
          },
        ],
        onFinish: () => {},
      },
      global: { config: { globalProperties: { $t: (s: string) => s } } },
    })

    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper.html()).toContain('step1')

    route.path = '/next'
    afterEachCbs.forEach(cb => cb({ path: '/next' }, { path: '/' }))
    await vi.advanceTimersByTimeAsync(500)

    expect(wrapper.html()).toContain('step2')
  })

  it('advances when predicate becomes true', async () => {
    document.body.innerHTML = ''
    const el1 = document.createElement('div')
    el1.setAttribute('data-tour', 'one')
    document.body.appendChild(el1)
    const el2 = document.createElement('div')
    el2.setAttribute('data-tour', 'two')
    document.body.appendChild(el2)

    let flag = false
    const OnboardingTour = (await import('src/components/OnboardingTour.vue')).default
    const wrapper = mount(OnboardingTour, {
      props: {
        pubkeyPrefix: 'abcd1234',
        steps: [
          {
            id: 's1',
            target: '[data-tour="one"]',
            instruction: 'step1',
            requiredAction: 'custom',
            advanceMode: 'auto',
            completeWhen: { predicate: () => flag },
          },
          {
            id: 's2',
            target: '[data-tour="two"]',
            instruction: 'step2',
          },
        ],
        onFinish: () => {},
      },
      global: { config: { globalProperties: { $t: (s: string) => s } } },
    })

    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper.html()).toContain('step1')

    flag = true
    await vi.advanceTimersByTimeAsync(500)
    expect(wrapper.html()).toContain('step2')
  })

  it('skip sets completion key', async () => {
    document.body.innerHTML = ''
    const el1 = document.createElement('div')
    el1.setAttribute('data-tour', 'one')
    document.body.appendChild(el1)

    const OnboardingTour = (await import('src/components/OnboardingTour.vue')).default
    const wrapper = mount(OnboardingTour, {
      props: {
        pubkeyPrefix: 'abcd1234',
        onFinish: () => {},
        steps: [
          { id: 's1', target: '[data-tour="one"]', instruction: 'step1' },
        ],
      },
      global: { config: { globalProperties: { $t: (s: string) => s } } },
    })

    await vi.advanceTimersByTimeAsync(500)
    await wrapper.find('button.skip-btn').trigger('click')
    const key = 'fundstr:onboarding:v3:abcd1234:done'
    expect(storage[key]).toBe('1')
  })
})
