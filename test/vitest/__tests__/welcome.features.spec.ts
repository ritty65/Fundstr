import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import WelcomeSlideFeatures from "../../../src/pages/welcome/WelcomeSlideFeatures.vue";
import WelcomeSlideNostr from "../../../src/pages/welcome/WelcomeSlideNostr.vue";
import WelcomeSlideMints from "../../../src/pages/welcome/WelcomeSlideMints.vue";
import { setActivePinia, createPinia } from 'pinia'
import { useWelcomeStore } from '../../../src/stores/welcome'
import { useMintsStore } from '../../../src/stores/mints'
import { useNostrStore } from '../../../src/stores/nostr'
import { vi } from 'vitest'

vi.mock('vue-i18n', async () => {
  const actual = await vi.importActual<any>('vue-i18n')
  return {
    ...actual,
    useI18n: () => ({ t: (s: string) => s })
  }
})

vi.mock('quasar', () => ({
  useQuasar: () => ({ notify: vi.fn(), platform: { has: {} } }),
  QIcon: { template: '<i></i>' },
  QBtn: { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  QForm: { template: '<form @submit.prevent="(e)=>$emit(\'submit\',e)"><slot/></form>' },
  QInput: { props: ['modelValue', 'label', 'placeholder'], template: '<input />' },
  QCheckbox: { props: ['modelValue', 'label'], template: '<input type="checkbox" />' },
  QDialog: { template: '<div><slot/></div>' },
  QCard: { template: '<div><slot/></div>' },
  QCardSection: { template: '<div><slot/></div>' },
  QSeparator: { template: '<hr />' },
  QCardActions: { template: '<div><slot/></div>' },
  QLinearProgress: { template: '<div></div>' },
}))

describe("WelcomeSlideFeatures", () => {
  it("renders feature links", () => {
    const wrapper = mount(WelcomeSlideFeatures, {
      global: {
        mocks: { $t: (msg: string) => msg },
        stubs: {
          RouterLink: { props: ['to'], template: '<a :href="to"><slot/></a>' }
        }
      },
    });

    const hrefs = wrapper.findAll("a").map((a) => a.attributes("href"));
    expect(hrefs).toEqual(["/creator-hub", "/subscriptions", "/buckets"]);
  });
});

describe('WelcomeSlideNostr', () => {
  it('marks setup completion on generate', async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const nostr = useNostrStore()
    nostr.initWalletSeedPrivateKeySigner = async () => {}
    const wrapper = mount(WelcomeSlideNostr, {
      global: {
        mocks: { t: (msg: string) => msg },
        stubs: {
          NostrBackupDialog: { template: '<div></div>', props: ['modelValue', 'nsec'] }
        }
      }
    })
    const welcome = useWelcomeStore()
    const btns = wrapper.findAll('button')
    await btns[1].trigger('click')
    expect(welcome.nostrSetupCompleted).toBe(true)
  })

  it('import invalid key shows error and flag remains false', async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const nostr = useNostrStore()
    nostr.initPrivateKeySigner = vi.fn().mockRejectedValue(new Error('bad'))
    const wrapper = mount(WelcomeSlideNostr, {
      global: {
        mocks: { t: (msg: string) => msg },
        stubs: {
          NostrBackupDialog: { template: '<div></div>', props: ['modelValue', 'nsec'] }
        }
      }
    })
    ;(wrapper.vm as any).nsec = 'a'.repeat(64)
    await wrapper.find('form').trigger('submit')
    const welcome = useWelcomeStore()
    expect(welcome.nostrSetupCompleted).toBe(false)
    expect(wrapper.text()).toContain('Welcome.nostr.errorInvalid')
  })

  it('connect extension path', async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const nostr = useNostrStore()
    nostr.connectBrowserSigner = vi.fn().mockResolvedValue(undefined)
    window.nostr = { getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)) } as any
    const wrapper = mount(WelcomeSlideNostr, {
      global: {
        mocks: { t: (msg: string) => msg },
        stubs: {
          NostrBackupDialog: { template: '<div></div>', props: ['modelValue', 'nsec'] }
        }
      }
    })
    const btns = wrapper.findAll('button')
    await btns[0].trigger('click')
    const welcome = useWelcomeStore()
    expect(welcome.nostrSetupCompleted).toBe(true)
    delete (window as any).nostr
  })
})

describe('WelcomeSlideMints', () => {
  it('sets mintConnected when adding mint', async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const mints = useMintsStore()
    mints.addMint = async (d: any) => ({ url: d.url }) as any
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({}))
    const wrapper = mount(WelcomeSlideMints, {
      global: {
        mocks: { t: (msg: string) => msg },
        stubs: {
          MintInfoDrawer: { template: '<div></div>' }
        }
      }
    })
    ;(wrapper.vm as any).url = 'example.com'
    await wrapper.find('form').trigger('submit')
    const welcome = useWelcomeStore()
    expect(welcome.mintConnected).toBe(true)
  })

  it('bad URL shows error and does not set flag', async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const mints = useMintsStore()
    mints.addMint = vi.fn()
    vi.stubGlobal('fetch', vi.fn())
    const wrapper = mount(WelcomeSlideMints, {
      global: {
        mocks: { t: (msg: string) => msg },
        stubs: {
          MintInfoDrawer: { template: '<div></div>' }
        }
      }
    })
    ;(wrapper.vm as any).url = 'badurl'
    await wrapper.find('form').trigger('submit')
    const welcome = useWelcomeStore()
    expect(welcome.mintConnected).toBe(false)
    expect(wrapper.text()).toContain('Welcome.mints.errorInvalid')
  })
})
