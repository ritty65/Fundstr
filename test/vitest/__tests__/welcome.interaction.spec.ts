import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive, ref, nextTick, defineComponent, h, provide, inject } from 'vue'

import WelcomeSlideNostr from '../../../src/pages/welcome/WelcomeSlideNostr.vue'
import NostrSetupWizard from '../../../src/components/NostrSetupWizard.vue'
import NostrIdentityManager from '../../../src/components/NostrIdentityManager.vue'
import WelcomePage from '../../../src/pages/WelcomePage.vue'

let welcomeStore: any
let nostrStore: any
let messengerStore: any
let settingsStore: any
let loginWithExtension: any
let loginWithSecret: any
let markWelcomeSeen: any
let routerMock: any
let routeMock: any
let hasSeenWelcome: any

const StepperSymbol = Symbol('stepper')

vi.mock('src/stores/welcome', () => ({
  useWelcomeStore: () => welcomeStore,
  LAST_WELCOME_SLIDE: 6,
}))

vi.mock('src/stores/nostr', () => ({
  useNostrStore: () => nostrStore,
}))

vi.mock('src/stores/messenger', () => ({
  useMessengerStore: () => messengerStore,
}))

vi.mock('src/stores/settings', () => ({
  useSettingsStore: () => settingsStore,
}))

vi.mock('src/composables/useNostrAuth', () => ({
  useNostrAuth: () => ({
    loginWithExtension,
    loginWithSecret,
  }),
}))

vi.mock('src/composables/useWelcomeGate', () => ({
  markWelcomeSeen: () => markWelcomeSeen(),
  hasSeenWelcome: () => hasSeenWelcome(),
}))

vi.mock('src/composables/usePwaInstall', () => ({
  usePwaInstall: () => ({ deferredPrompt: null }),
}))

vi.mock('src/composables/useNdk', () => ({
  useNdk: () => Promise.resolve(),
}))

vi.mock('src/stores/mnemonic', () => ({
  useMnemonicStore: () => ({ mnemonic: 'test mnemonic phrase' }),
}))

vi.mock('src/stores/storage', () => ({
  useStorageStore: () => ({ exportWalletState: vi.fn() }),
}))

vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia')
  return {
    ...actual,
    storeToRefs: (store: any) => ({ nip07SignerAvailable: store.nip07SignerAvailable }),
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    tm: () => [],
  }),
  createI18n: () => ({ global: { t: (key: string) => key } }),
}))

const quasarNotify = vi.fn()

vi.mock('quasar', () => {
  const QBtn = defineComponent({
    name: 'QBtn',
    props: {
      label: { type: String, default: '' },
      disable: { type: Boolean, default: false },
      loading: { type: Boolean, default: false },
      flat: { type: Boolean, default: false },
      round: { type: Boolean, default: false },
      icon: { type: String, default: '' },
      color: { type: String, default: '' },
      dense: { type: Boolean, default: false },
      outline: { type: Boolean, default: false },
      type: { type: String, default: 'button' },
    },
    emits: ['click'],
    setup(props, { emit, slots }) {
      const onClick = () => {
        if (!props.disable && !props.loading) emit('click')
      }
      return () =>
        h(
          'button',
          {
            type: props.type,
            disabled: props.disable || props.loading,
            'data-icon': props.icon,
            'data-label': props.label,
            onClick,
          },
          [slots.default ? slots.default() : props.label]
        )
    },
  })

  const QIcon = defineComponent({
    name: 'QIcon',
    props: { name: { type: String, required: true }, size: { type: String, default: '' }, color: { type: String, default: '' } },
    setup(props) {
      return () => h('i', { 'data-icon': props.name })
    },
  })

  const QForm = defineComponent({
    name: 'QForm',
    emits: ['submit'],
    setup(_, { emit, slots }) {
      const onSubmit = (evt: Event) => {
        evt.preventDefault()
        emit('submit', evt)
      }
      return () => h('form', { onSubmit }, slots.default ? slots.default() : [])
    },
  })

  const QInput = defineComponent({
    name: 'QInput',
    props: {
      modelValue: { type: [String, Number], default: '' },
      label: { type: String, default: '' },
      type: { type: String, default: 'text' },
      autocomplete: { type: String, default: undefined },
      readonly: { type: Boolean, default: false },
      dense: { type: Boolean, default: false },
      placeholder: { type: String, default: '' },
    },
    emits: ['update:modelValue', 'keyup'],
    setup(props, { emit }) {
      return () =>
        h('input', {
          value: props.modelValue,
          type: props.type,
          readonly: props.readonly,
          placeholder: props.placeholder,
          onInput: (evt: Event) => emit('update:modelValue', (evt.target as HTMLInputElement).value),
          onKeyup: (evt: KeyboardEvent) => emit('keyup', evt),
        })
    },
  })

  const QDialog = defineComponent({
    name: 'QDialog',
    props: {
      modelValue: { type: Boolean, default: false },
    },
    emits: ['update:modelValue'],
    setup(props, { slots }) {
      return () => (props.modelValue ? h('div', { class: 'dialog' }, slots.default ? slots.default() : []) : null)
    },
  })

  const QCard = defineComponent({ name: 'QCard', setup(_, { slots }) { return () => h('div', { class: 'card' }, slots.default ? slots.default() : []) } })
  const QCardSection = defineComponent({ name: 'QCardSection', setup(_, { slots }) { return () => h('section', slots.default ? slots.default() : []) } })
  const QCardActions = defineComponent({ name: 'QCardActions', setup(_, { slots }) { return () => h('footer', slots.default ? slots.default() : []) } })
  const QLinearProgress = defineComponent({ name: 'QLinearProgress', setup() { return () => h('div', { class: 'linear-progress' }) } })
  const QBanner = defineComponent({ name: 'QBanner', setup(_, { slots }) { return () => h('div', slots.default ? slots.default() : []) } })
  const QOptionGroup = defineComponent({
    name: 'QOptionGroup',
    props: {
      modelValue: { type: [String, Number], default: null },
      options: { type: Array as () => Array<{ label: string; value: any }>, default: () => [] },
      type: { type: String, default: 'radio' },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h(
          'div',
          props.options.map((option) =>
            h('label', { key: option.value }, [
              h('input', {
                type: props.type === 'radio' ? 'radio' : 'checkbox',
                checked: props.modelValue === option.value,
                value: option.value,
                onChange: () => emit('update:modelValue', option.value),
              }),
              option.label,
            ])
          )
        )
    },
  })

  const QList = defineComponent({ name: 'QList', setup(_, { slots }) { return () => h('ul', slots.default ? slots.default() : []) } })
  const QItem = defineComponent({ name: 'QItem', setup(_, { slots }) { return () => h('li', slots.default ? slots.default() : []) } })
  const QItemSection = defineComponent({ name: 'QItemSection', setup(_, { slots }) { return () => h('div', slots.default ? slots.default() : []) } })
  const QExpansionItem = defineComponent({ name: 'QExpansionItem', setup(_, { slots }) { return () => h('div', slots.default ? slots.default() : []) } })
  const QCheckbox = defineComponent({
    name: 'QCheckbox',
    props: { modelValue: { type: Boolean, default: false }, label: { type: String, default: '' } },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () =>
        h('label', [
          h('input', {
            type: 'checkbox',
            checked: props.modelValue,
            onChange: (evt: Event) => emit('update:modelValue', (evt.target as HTMLInputElement).checked),
          }),
          props.label,
        ])
    },
  })

  const QPage = defineComponent({ name: 'QPage', setup(_, { slots }) { return () => h('div', { class: 'q-page' }, slots.default ? slots.default() : []) } })
  const QSpinner = defineComponent({ name: 'QSpinner', template: '<div class="spinner"></div>' })
  const QStepper = defineComponent({
    name: 'QStepper',
    props: { modelValue: { type: Number, required: true } },
    emits: ['update:modelValue'],
    setup(props, { slots }) {
      provide(StepperSymbol, props)
      return () => h('div', { 'data-testid': 'stepper' }, slots.default ? slots.default() : [])
    },
  })
  const QStep = defineComponent({
    name: 'QStep',
    props: { name: { type: Number, required: true }, title: String, done: Boolean },
    setup(props, { slots }) {
      const stepper = inject<any>(StepperSymbol)
      return () =>
        stepper && stepper.modelValue === props.name
          ? h('div', { 'data-step': `step-${props.name}` }, slots.default ? slots.default() : [])
          : null
    },
  })

  const exports = {
    QBtn,
    QIcon,
    QForm,
    QInput,
    QDialog,
    QCard,
    QCardSection,
    QCardActions,
    QLinearProgress,
    QBanner,
    QOptionGroup,
    QList,
    QItem,
    QItemSection,
    QExpansionItem,
    QCheckbox,
    QPage,
    QStepper,
    QStep,
    QSpinner,
    ClosePopup: {},
  }

  ;(globalThis as any).__quasarStubs = exports

  return {
    useQuasar: () => ({ notify: quasarNotify, platform: { has: {} } }),
    ...exports,
  }
})

vi.mock('vue-router', () => ({
  useRouter: () => routerMock,
  useRoute: () => routeMock,
}))

const quasarStubs = (globalThis as any).__quasarStubs as Record<string, any>

const componentStubs = {
  ...quasarStubs,
  ThemeToggle: defineComponent({ name: 'ThemeToggle', template: '<div class="theme-toggle"></div>' }),
  RevealSeedDialog: defineComponent({
    name: 'RevealSeedDialog',
    props: { modelValue: { type: Boolean, default: false }, seed: { type: String, default: '' } },
    emits: ['update:modelValue'],
    setup(props, { slots }) {
      return () =>
        props.modelValue
          ? h('div', { class: 'reveal-dialog' }, slots.default ? slots.default() : [])
          : null
    },
  }),
  TaskChecklist: defineComponent({
    name: 'TaskChecklist',
    props: { tasks: { type: Array, default: () => [] }, progress: { type: String, default: '' }, canFinish: { type: Boolean, default: false } },
    emits: ['run', 'finish'],
    setup(_, { emit }) {
      return () =>
        h('div', [
          h('button', {
            type: 'button',
            'data-test': 'checklist-finish',
            onClick: () => emit('finish'),
          }, 'finish'),
        ])
    },
  }),
  NostrBackupDialog: defineComponent({
    name: 'NostrBackupDialog',
    props: { modelValue: { type: Boolean, default: false }, nsec: { type: String, default: '' } },
    emits: ['update:modelValue'],
    setup(props) {
      return () => (props.modelValue ? h('div', { class: 'backup-dialog' }, props.nsec) : null)
    },
  }),
  WelcomeSlideFeatures: defineComponent({ name: 'WelcomeSlideFeatures', template: '<div>features</div>' }),
  WelcomeSlidePwa: defineComponent({ name: 'WelcomeSlidePwa', template: '<div>pwa</div>' }),
  WelcomeSlideBackup: defineComponent({ name: 'WelcomeSlideBackup', template: '<div>backup</div>' }),
  WelcomeSlideMints: defineComponent({ name: 'WelcomeSlideMints', template: '<div>mints</div>' }),
  WelcomeSlideTerms: defineComponent({ name: 'WelcomeSlideTerms', template: '<div>terms</div>' }),
  WelcomeSlideFinish: defineComponent({ name: 'WelcomeSlideFinish', emits: ['open-wallet'], template: '<div>finish</div>' }),
}

const welcomePageStubs = {
  ...componentStubs,
  WelcomeSlideNostr: defineComponent({ name: 'WelcomeSlideNostr', template: '<div>nostr slide</div>' }),
}

beforeEach(() => {
  vi.clearAllMocks()
  loginWithExtension = vi.fn().mockResolvedValue(undefined)
  loginWithSecret = vi.fn().mockResolvedValue(undefined)
  markWelcomeSeen = vi.fn()
  hasSeenWelcome = vi.fn().mockReturnValue(false)
  routerMock = { replace: vi.fn() }
  routeMock = { path: '/welcome', query: {} }
  nostrStore = reactive({
    checkNip07Signer: vi.fn().mockResolvedValue(true),
    connectBrowserSigner: vi.fn().mockResolvedValue(undefined),
    initWalletSeedPrivateKeySigner: vi.fn().mockImplementation(async () => {
      nostrStore.activePrivateKeyNsec = 'nsec-generated'
      nostrStore.npub = 'npub-generated'
    }),
    initPrivateKeySigner: vi.fn().mockImplementation(async (value: string) => {
      nostrStore.activePrivateKeyNsec = value
      nostrStore.npub = 'npub-imported'
    }),
    initNip07Signer: vi.fn().mockResolvedValue(undefined),
    updateIdentity: vi.fn().mockResolvedValue(undefined),
    signer: null,
    activePrivateKeyNsec: '',
    npub: 'npub-initial',
    hasIdentity: true,
    privKeyHex: '',
    nip07SignerAvailable: ref(true),
  })
  const aliasMap = reactive<Record<string, string>>({})
  messengerStore = reactive({
    relays: ['wss://relay1'],
    connect: vi.fn().mockImplementation(async (relays: string[]) => {
      messengerStore.connected = true
      messengerStore.relays = [...relays]
    }),
    connected: false,
    aliases: aliasMap,
    setAlias: vi.fn((pubkey: string, alias: string) => {
      if (alias) {
        aliasMap[pubkey] = alias
      } else {
        delete aliasMap[pubkey]
      }
    }),
  })
  settingsStore = reactive({
    defaultNostrRelays: [],
  })
  welcomeStore = reactive({
    showWelcome: true,
    currentSlide: 0,
    seedPhraseValidated: false,
    walletRestored: false,
    termsAccepted: false,
    nostrSetupCompleted: false,
    mintConnected: false,
    featuresVisited: { creatorStudio: false, subscriptions: false, buckets: false },
    welcomeCompleted: false,
    canProceed: vi.fn(() => true),
    closeWelcome: vi.fn(() => {
      welcomeStore.showWelcome = false
      welcomeStore.currentSlide = 0
      welcomeStore.welcomeCompleted = true
    }),
  })
})

afterEach(() => {
  vi.useRealTimers()
  delete (globalThis as any).nostr
})

describe('WelcomeSlideNostr', () => {
  it('connects via extension and marks setup complete', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).nostr = { getPublicKey: vi.fn() }
    const wrapper = mount(WelcomeSlideNostr, {
      global: {
        stubs: componentStubs,
      },
    })
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    await flushPromises()

    const connectBtn = wrapper.findAll('button').find((btn) => btn.text().includes('Welcome.nostr.connect'))
    expect(connectBtn).toBeTruthy()
    await connectBtn!.trigger('click')
    await flushPromises()

    expect(nostrStore.checkNip07Signer).toHaveBeenCalled()
    expect(nostrStore.connectBrowserSigner).toHaveBeenCalled()
    expect(loginWithExtension).toHaveBeenCalled()
    expect(welcomeStore.nostrSetupCompleted).toBe(true)
    expect(wrapper.text()).toContain('npub-initial')
    expect(quasarNotify).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Welcome.nostr.connected', type: 'positive' })
    )
    expect(connectBtn!.attributes('disabled')).toBeDefined()
  })

  it('generates secret and uses loginWithSecret', async () => {
    const wrapper = mount(WelcomeSlideNostr, {
      global: { stubs: componentStubs },
    })

    const generateBtn = wrapper.findAll('button').find((btn) => btn.text().includes('Welcome.nostr.generate'))
    expect(generateBtn).toBeTruthy()
    await generateBtn!.trigger('click')
    await flushPromises()

    expect(nostrStore.initWalletSeedPrivateKeySigner).toHaveBeenCalled()
    expect(loginWithSecret).toHaveBeenCalledWith('nsec-generated')
    expect(welcomeStore.nostrSetupCompleted).toBe(true)
    expect(wrapper.text()).toContain('npub-generated')
    const backupDialog = wrapper.find('.backup-dialog')
    expect(backupDialog.exists()).toBe(true)
    expect(backupDialog.text()).toContain('nsec-generated')
  })

  it('shows error when extension unavailable', async () => {
    vi.useFakeTimers()
    ;(globalThis as any).nostr = { getPublicKey: vi.fn() }
    nostrStore.checkNip07Signer.mockResolvedValue(false)
    const wrapper = mount(WelcomeSlideNostr, {
      global: { stubs: componentStubs },
    })
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    await flushPromises()

    const connectBtn = wrapper.findAll('button').find((btn) => btn.text().includes('Welcome.nostr.connect'))
    await connectBtn!.trigger('click')
    await flushPromises()
    await nextTick()

    expect(loginWithExtension).not.toHaveBeenCalled()
    expect(quasarNotify).toHaveBeenCalledWith(expect.objectContaining({ message: 'Welcome.nostr.errorConnect', type: 'negative' }))
    expect((wrapper.vm as any).error).toBe('Welcome.nostr.errorConnect')
    delete (globalThis as any).nostr
  })
})

describe('NostrSetupWizard', () => {
  const mountWizard = () =>
    mount(NostrSetupWizard, {
      props: { modelValue: true },
      global: {
        stubs: quasarStubs,
      },
    })

  it('walks through private key flow and connects', async () => {
    const wrapper = mountWizard()

    const step1 = wrapper.get('[data-step="step-1"]')
    const keyInput = step1
      .findAll('input')
      .find((input) => input.attributes('type') !== 'radio')
    expect(keyInput).toBeTruthy()
    await keyInput!.setValue('nsec1examplekey')

    const nextFromKey = step1.findAll('button').find((btn) => btn.text() === 'Next')
    expect(nextFromKey).toBeTruthy()
    await nextFromKey!.trigger('click')
    await flushPromises()

    expect(nostrStore.initPrivateKeySigner).toHaveBeenCalledWith('nsec1examplekey')
    expect((wrapper.vm as any).step).toBe(2)

    const step2 = wrapper.get('[data-step="step-2"]')
    const relayInput = step2.find('input')
    await relayInput.setValue('wss://relay.test')
    await relayInput.trigger('keyup', { key: 'Enter' })
    await nextTick()

    expect((wrapper.vm as any).relays).toContain('wss://relay.test')

    const removeBtn = step2.find('[data-icon="delete"]')
    await removeBtn.trigger('click')
    await nextTick()
    expect((wrapper.vm as any).relays).not.toContain('wss://relay1')

    const nextFromRelays = step2.findAll('button').find((btn) => btn.text() === 'Next')
    await nextFromRelays!.trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).step).toBe(3)

    const step3 = wrapper.get('[data-step="step-3"]')
    const connectBtn = step3.findAll('button').find((btn) => btn.text() === 'Connect')
    await connectBtn!.trigger('click')
    await flushPromises()

    const connectArgs = messengerStore.connect.mock.calls[0]?.[0]
    expect(new Set(connectArgs)).toEqual(new Set(['wss://relay.test']))
    expect(step3.text()).toContain('Connected!')

    const finishBtn = step3.findAll('button').find((btn) => btn.text() === 'Finish')
    await finishBtn!.trigger('click')

    expect(wrapper.emitted('complete')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([false])
  })

  it('prevents advancing when key missing and handles extension failure', async () => {
    nostrStore.checkNip07Signer.mockResolvedValue(false)
    const wrapper = mountWizard()

    const step1 = wrapper.get('[data-step="step-1"]')
    const keyInput = step1
      .findAll('input')
      .find((input) => input.attributes('type') !== 'radio')
    expect(keyInput).toBeTruthy()
    await keyInput!.setValue('')
    const nextFromKey = step1.findAll('button').find((btn) => btn.text() === 'Next')
    await nextFromKey!.trigger('click')
    expect((wrapper.vm as any).step).toBe(1)

    const radios = step1.findAll('input[type="radio"]')
    await radios[1].setValue()

    const connectExtension = step1.findAll('button').find((btn) => btn.text() === 'Connect Extension')
    await connectExtension!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('No NIP-07 extension detected')
  })

  it('does not advance relays step without relay entries', async () => {
    const wrapper = mountWizard()

    const step1 = wrapper.get('[data-step="step-1"]')
    const keyInput = step1
      .findAll('input')
      .find((input) => input.attributes('type') !== 'radio')
    expect(keyInput).toBeTruthy()
    await keyInput!.setValue('nsec1examplekey')
    const nextFromKey = step1.findAll('button').find((btn) => btn.text() === 'Next')
    await nextFromKey!.trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).step).toBe(2)

    const step2 = wrapper.get('[data-step="step-2"]')
    const nextFromRelays = step2.findAll('button').find((btn) => btn.text() === 'Next')
    // clear any existing relays
    ;(wrapper.vm as any).relays = []
    await nextTick()
    await nextFromRelays!.trigger('click')
    expect((wrapper.vm as any).step).toBe(2)
  })
})

describe('NostrIdentityManager', () => {
  const mountIdentity = () =>
    mount(NostrIdentityManager, {
      global: {
        stubs: quasarStubs,
      },
    })

  it('adds and removes aliases while persisting to store', async () => {
    const wrapper = mountIdentity()

    const openBtn = wrapper.findAll('button').find((btn) => btn.text() === 'Identity / Relays')
    await openBtn!.trigger('click')
    await nextTick()

    const inputs = wrapper.findAll('input')
    // alias inputs are near the end
    await inputs[inputs.length - 2].setValue('npub1alias')
    await inputs[inputs.length - 1].setValue('Alice')

    const addBtn = wrapper.findAll('button').find((btn) => btn.text() === 'Add')
    await addBtn!.trigger('click')
    await nextTick()

    expect(messengerStore.setAlias).toHaveBeenCalledWith('npub1alias', 'Alice')
    expect(Object.keys(messengerStore.aliases)).toContain('npub1alias')

    const deleteBtn = wrapper.find('[data-icon="delete"]')
    await deleteBtn.trigger('click')
    await nextTick()

    expect(messengerStore.setAlias).toHaveBeenCalledWith('npub1alias', '')
    expect(Object.keys(messengerStore.aliases)).not.toContain('npub1alias')
  })

  it('adds and removes relays in settings', async () => {
    const wrapper = mountIdentity()

    const openBtn = wrapper.findAll('button').find((btn) => btn.text() === 'Identity / Relays')
    await openBtn!.trigger('click')
    await nextTick()

    const inputs = wrapper.findAll('input')
    const relayInput = inputs[2]
    await relayInput.setValue('wss://relay.test')
    await relayInput.trigger('keyup', { key: 'Enter' })
    await nextTick()

    expect((wrapper.vm as any).relays).toContain('wss://relay.test')

    const deleteBtn = wrapper.find('[data-icon="delete"]')
    await deleteBtn.trigger('click')
    await nextTick()

    expect((wrapper.vm as any).relays).toHaveLength(0)
  })
})

describe('WelcomePage', () => {
  const mountPage = () =>
    mount(WelcomePage, {
      global: {
        stubs: welcomePageStubs,
        mocks: {
          $t: (key: string) => key,
          $tm: () => [],
        },
      },
    })

  it('disables navigation when canProceed blocks the step', () => {
    welcomeStore.currentSlide = 1
    welcomeStore.canProceed = vi.fn((slide: number) => slide !== 1)

    const wrapper = mountPage()
    const nextBtn = wrapper.findAll('button').find((btn) => btn.text().includes('Welcome.footer.next'))
    expect(nextBtn?.attributes('disabled')).toBeDefined()
    nextBtn && nextBtn.trigger('click')
    expect(welcomeStore.currentSlide).toBe(1)
  })

  it('finishes onboarding through footer and marks welcome seen', async () => {
    welcomeStore.currentSlide = 6
    welcomeStore.canProceed = vi.fn(() => true)

    const wrapper = mountPage()
    await flushPromises()

    const finishBtn = wrapper.findAll('button').find((btn) => btn.text().includes('Welcome.footer.finish'))
    expect(finishBtn).toBeTruthy()
    await finishBtn!.trigger('click')
    await flushPromises()

    expect(welcomeStore.closeWelcome).toHaveBeenCalled()
    expect(markWelcomeSeen).toHaveBeenCalled()
    expect(routerMock.replace).toHaveBeenCalledWith('/about')
  })

  it('invokes markWelcomeSeen when checklist completes', async () => {
    const wrapper = mountPage()

    ;(wrapper.vm as any).showChecklist = true
    await nextTick()

    const finishChecklist = wrapper.get('[data-test="checklist-finish"]')
    await finishChecklist.trigger('click')
    await flushPromises()

    expect(welcomeStore.closeWelcome).toHaveBeenCalled()
    expect(markWelcomeSeen).toHaveBeenCalled()
    expect(routerMock.replace).toHaveBeenCalledWith('/about')
  })
})

