import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { LOCAL_STORAGE_KEYS } from '../../../src/constants/localStorageKeys'
import { messages as enUSMessages } from '../../../src/i18n/en-US'

const mockGetCreatorsByPubkeys = vi.fn()

vi.mock('../../../src/api/fundstrDiscovery', () => ({
  createFundstrDiscoveryClient: () => ({
    getCreatorsByPubkeys: mockGetCreatorsByPubkeys
  })
}))

let DonationPrompt: typeof import('../../../src/components/DonationPrompt.vue')['default']

async function loadComponent(envOverrides: Record<string, string> = {}) {
  vi.resetModules()
  vi.unstubAllEnvs()
  mockGetCreatorsByPubkeys.mockReset()
  mockGetCreatorsByPubkeys.mockResolvedValue({ results: [], warnings: [] })

  vi.stubEnv('VITE_DONATION_LIQUID_ADDRESS', '')
  vi.stubEnv('VITE_DONATION_BITCOIN', '')
  vi.stubEnv('VITE_DONATION_SUPPORTER_NPUB', '')

  for (const [key, value] of Object.entries(envOverrides)) {
    vi.stubEnv(key, value)
  }

  ;({ default: DonationPrompt } = await import('../../../src/components/DonationPrompt.vue'))
}

const mountComponent = () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'en-US',
    messages: { 'en-US': enUSMessages }
  })

  return mount(DonationPrompt, {
    global: {
      plugins: [i18n],
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
          template: '<button v-bind="$attrs" :disabled="disable">{{ label }}</button>'
        },
        VueQrcode: { template: '<div />' },
        DonationCashuPanel: { template: '<div class="cashu-panel-stub" />' }
      }
    }
  })
}

describe('DonationPrompt', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is hidden for first-time users', async () => {
    await loadComponent()
    const wrapper = mountComponent()
    expect(wrapper.vm.visible).toBe(false)
  })

  it('shows when thresholds are met', async () => {
    await loadComponent()
    localStorage.setItem(
      LOCAL_STORAGE_KEYS.DONATION_LAST_PROMPT,
      (Date.now() - 8 * 24 * 60 * 60 * 1000).toString()
    )
    localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_LAUNCH_COUNT, '4')
    const wrapper = mountComponent()
    expect(wrapper.vm.visible).toBe(true)
  })

  it('disables donate button when no address is configured', async () => {
    await loadComponent()
    const wrapper = mountComponent()
    await flushPromises()
    // Defaults to Cashu tab so the Liquid/Bitcoin donate button is hidden
    const donateBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Join') || b.text().includes('Donate'))
    expect(donateBtn).toBeUndefined()
    expect(wrapper.vm.tab).toBe('cashu')
    // Switching to Liquid tab should surface the address warning
    wrapper.vm.tab = 'liquid'
    await flushPromises()
    expect(wrapper.text()).toContain('No Liquid address configured.')
  })

  it('renders Liquid and Bitcoin tabs when configured', async () => {
    await loadComponent({
      VITE_DONATION_LIQUID_ADDRESS: 'liquid1exampleaddress',
      VITE_DONATION_BITCOIN: 'bc1qexampleaddress'
    })
    const wrapper = mountComponent()
    expect(wrapper.html()).toContain('liquidnetwork:liquid1exampleaddress')
    expect(wrapper.html()).toContain('bitcoin:bc1qexampleaddress')
  })

  it('fetches supporter profile without relying on tiers', async () => {
    const supporterHex = 'f'.repeat(64)

    await loadComponent({
      VITE_DONATION_LIQUID_ADDRESS: 'liquid1exampleaddress',
      VITE_DONATION_BITCOIN: 'bc1qexampleaddress',
      VITE_DONATION_SUPPORTER_NPUB: supporterHex
    })

    mockGetCreatorsByPubkeys.mockResolvedValueOnce({
      results: [
        {
          pubkey: supporterHex,
          displayName: 'Fundstr',
          tiers: [
            { id: 'tier-1', name: 'Supporter', amountMsat: 5_000_000, cadence: 'monthly' },
            { id: 'tier-2', name: 'Champion', amountMsat: 15_000_000, cadence: 'monthly' }
          ]
        }
      ],
      warnings: []
    })

    localStorage.setItem(
      LOCAL_STORAGE_KEYS.DONATION_LAST_PROMPT,
      (Date.now() - 8 * 24 * 60 * 60 * 1000).toString()
    )
    localStorage.setItem(LOCAL_STORAGE_KEYS.DONATION_LAUNCH_COUNT, '4')

    const wrapper = mountComponent()
    await flushPromises()

    expect(mockGetCreatorsByPubkeys).toHaveBeenCalled()
    expect(wrapper.text()).not.toContain('Membership tiers')
    const donateBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Donate'))
    expect(donateBtn?.text()).toBe('Donate Now')
  })
})
