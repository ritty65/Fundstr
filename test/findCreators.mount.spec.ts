import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FindCreators from 'src/pages/FindCreators.vue'

describe('FindCreators', () => {
  it('mounts', () => {
    const pinia = createPinia()
    setActivePinia(pinia)
    const wrapper = mount(FindCreators, {
      global: {
        plugins: [pinia],
        stubs: ['q-input', 'q-skeleton', 'q-card', 'q-avatar', 'q-btn']
      }
    })
    expect(wrapper.exists()).toBe(true)
  })
})
