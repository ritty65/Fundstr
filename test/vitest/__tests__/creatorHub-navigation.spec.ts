import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { ref, computed } from 'vue'

import WelcomeSlideNostr from '../../../src/pages/welcome/WelcomeSlideNostr.vue'
import { useNostrStore } from '../../../src/stores/nostr'
import { useCreatorHubStore } from '../../../src/stores/creatorHub'
import { useCreatorHub } from '../../../src/composables/useCreatorHub'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (s: string) => s }),
  createI18n: vi.fn(),
}))

vi.mock('quasar', () => ({
  useQuasar: () => ({ notify: vi.fn(), screen: { lt: { md: false } }, platform: { has: {} } }),
  QIcon: { template: '<i></i>' },
  QBtn: { template: '<button @click="$emit(\'click\')"><slot/></button>' },
  QForm: { template: '<form @submit.prevent="(e)=>$emit(\'submit\',e)"><slot/></form>' },
  QInput: { props:['modelValue','label','type','dense','outlined','readonly'], template: '<input />' },
  QDialog: { template: '<div><slot/></div>' },
  QCard: { template: '<div><slot/></div>' },
  QCardSection: { template: '<div><slot/></div>' },
  QSeparator: { template: '<hr />' },
  QCardActions: { template: '<div><slot/></div>' },
  QLinearProgress: { template: '<div></div>' },
}))

vi.mock('nostr-tools', () => ({ nip19: { npubEncode: (s: string) => `npub${s}`, decode: vi.fn(), nsecEncode: vi.fn() } }))

// simplify useCreatorHub to depend only on nostr.pubkey
vi.mock('../../../src/composables/useCreatorHub', () => ({
  useCreatorHub: () => {
    const nostr = useNostrStore()
    const loggedIn = computed(() => !!nostr.pubkey)
    const npub = computed(() => (nostr.pubkey ? `npub${nostr.pubkey}` : ''))
    return {
      loggedIn,
      npub,
      // unused placeholders
      isMobile: computed(() => false),
      splitterModel: ref(50),
      tab: ref('profile'),
      draggableTiers: ref([]),
      deleteDialog: ref(false),
      deleteId: ref(''),
      showTierDialog: ref(false),
      currentTier: ref({}),
      publishing: ref(false),
      isDirty: ref(false),
      login: vi.fn(),
      logout: vi.fn(),
      initPage: vi.fn(),
      publishFullProfile: vi.fn(),
      addTier: vi.fn(),
      editTier: vi.fn(),
      confirmDelete: vi.fn(),
      updateOrder: vi.fn(),
      refreshTiers: vi.fn(),
      removeTier: vi.fn(),
      performDelete: vi.fn(),
    }
  },
}))

describe('Welcome flow to Creator Hub', () => {
  it('keeps user logged in after welcome flow', async () => {
    localStorage.clear()
    setActivePinia(createPinia())
    const nostr = useNostrStore()
    nostr.initWalletSeedPrivateKeySigner = vi.fn().mockImplementation(async () => {
      nostr.pubkey = 'pub'
    })
    Object.defineProperty(nostr, 'activePrivateKeyNsec', { get: () => 'nsec1abc' })

    const creatorHub = useCreatorHubStore()
    const loginSpy = vi.spyOn(creatorHub, 'login').mockResolvedValue()

    const wrapperWelcome = mount(WelcomeSlideNostr, {
      global: {
        stubs: { NostrBackupDialog: { template: '<div></div>', props: ['modelValue','nsec'] } },
      },
    })
    const btns = wrapperWelcome.findAll('button')
    await btns[1].trigger('click')
    expect(loginSpy).toHaveBeenCalledWith('nsec1abc')

    const { loggedIn } = useCreatorHub()
    expect(loggedIn.value).toBe(true)
  })
})
