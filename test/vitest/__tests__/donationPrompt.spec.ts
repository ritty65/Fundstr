import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DonationPrompt from '../../../src/components/DonationPrompt.vue'
import { LOCAL_STORAGE_KEYS } from '../../../src/constants/localStorageKeys'

const mountComponent = () =>
  mount(DonationPrompt, {
    global: {
      stubs: {
        QDialog: { template: '<div><slot /></div>' },
        QCard: { template: '<div><slot /></div>' },
        QCardSection: { template: '<div><slot /></div>' },
        QTabs: { template: '<div><slot /></div>' },
        QTab: { template: '<div><slot /></div>' },
        QSeparator: { template: '<div></div>' },
        QTabPanels: { template: '<div><slot /></div>' },
        QTabPanel: { template: '<div><slot /></div>' },
        QInput: { template: '<input />', props: ['modelValue'] },
        QCardActions: { template: '<div><slot /></div>' },
        QBtn: {
          props: ['label', 'disable'],
          template: '<button :disabled="disable">{{ label }}</button>'
        },
        QBanner: { template: '<div><slot /></div>' },
        VueQrcode: { template: '<div />' }
      }
    }
  })

describe('DonationPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('is hidden for first-time users', () => {
    const wrapper = mountComponent()
    expect(wrapper.vm.visible).toBe(false)
  })

  it('shows when thresholds are met', () => {
    localStorage.setItem(
      LOCAL_STORAGE_KEYS.DONATION_LAST_PROMPT,
      (Date.now() - 8 * 24 * 60 * 60 * 1000).toString()
    )
    localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_LAUNCH_COUNT, '4')
    const wrapper = mountComponent()
    expect(wrapper.vm.visible).toBe(true)
  })

  it('disables donate button when no address is configured', () => {
    const wrapper = mountComponent()
    const donateBtn = wrapper
      .findAll('button')
      .find((b) => b.text() === 'Donate Now')
    expect(donateBtn?.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Donation address not configured')
  })
})
