<template>
  <div v-if="current">
    <div v-if="show && overlay" class="onboarding-overlay">
      <div class="overlay-part" :style="topStyle"></div>
      <div class="overlay-part" :style="bottomStyle"></div>
      <div class="overlay-part" :style="leftStyle"></div>
      <div class="overlay-part" :style="rightStyle"></div>
    </div>

    <q-menu
      v-model="show"
      :target="current.el"
      :anchor="menuPlacement.anchor"
      :self="menuPlacement.self"
      :offset="menuOffset"
      no-parent-event
      persistent
      transition-show="fade"
      transition-hide="fade"
      content-class="onboarding-tooltip"
    >
      <div class="onboarding-body">
        <div class="step-counter text-body2 text-1 q-mb-xs">
          {{
            te('OnboardingTour.step')
              ? t('OnboardingTour.step', { current: index + 1, total: steps.length })
              : `Step ${index + 1} of ${steps.length}`
          }}
        </div>
        <div class="step-progress q-mb-sm">
          <div class="bar" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <div class="q-mb-sm">
          {{ current.instruction }}
          <div v-if="current.notFound" class="text-negative q-mt-sm">
            {{
              te('OnboardingTour.targetMissing')
                ? t('OnboardingTour.targetMissing')
                : "We couldn't find this element."
            }}
          </div>
        </div>
        <div class="row justify-end q-gutter-sm">
          <q-btn
            v-if="!isLast"
            flat
            dense
            class="skip-btn"
            @click="skipStep"
            >{{
              te('OnboardingTour.cantFind')
                ? t('OnboardingTour.cantFind')
                : "I can't find this"
            }}</q-btn
          >
          <q-btn
            flat
            dense
            class="skip-btn"
            @click="skip"
            >{{ t('OnboardingTour.skip') }}</q-btn
          >
          <q-btn
            v-if="!current.requiredAction || current.advanceMode === 'manual'"
            flat
            dense
            color="primary"
            :disable="current.requiredAction && !actionDone"
            @click="next"
          >
            {{ isLast ? t('OnboardingTour.gotIt') : t('OnboardingTour.next') }}
          </q-btn>
        </div>
      </div>
    </q-menu>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { LocalStorage } from 'quasar'
import { useUiStore } from 'src/stores/ui'
import { LOCAL_STORAGE_KEYS } from 'src/constants/localStorageKeys'
import type { OnboardingStep } from 'src/types/onboarding'
import { useRouter } from 'vue-router'

const props = defineProps<{
  pubkeyPrefix: string
  onFinish: () => void
  steps?: OnboardingStep[]
}>()

const ui = useUiStore()
const { t, te } = useI18n()
const router = useRouter()

const internalSteps = computed<OnboardingStep[]>(() =>
  [
    !ui.mainNavOpen && {
      id: 'nav-toggle',
      target: '[data-tour~="nav-toggle"]',
      instruction: t('OnboardingTour.navToggle'),
      placement: 'bottom',
      requiredAction: 'click',
      advanceMode: 'auto',
      completeWhen: () => ui.mainNavOpen,
    },
    {
      id: 'nav-dashboard',
      target: '[data-tour~="nav-dashboard"]',
      instruction: t('OnboardingTour.navDashboard'),
      placement: 'right',
      requiredAction: 'click',
      advanceMode: 'auto',
      ensure: () => ui.openMainNav(),
      completeWhen: () => router.currentRoute.value.path === '/dashboard',
    },
    {
      id: 'nav-wallet',
      target: '[data-tour~="nav-wallet"]',
      instruction: t('OnboardingTour.navWallet'),
      placement: 'right',
      requiredAction: 'click',
      advanceMode: 'auto',
      ensure: () => ui.openMainNav(),
      completeWhen: () => router.currentRoute.value.path === '/wallet',
    },
    {
      id: 'nav-find-creators',
      target: '[data-tour~="nav-find-creators"]',
      instruction: t('OnboardingTour.navFindCreators'),
      placement: 'right',
      requiredAction: 'click',
      advanceMode: 'auto',
      ensure: () => ui.openMainNav(),
      completeWhen: () => router.currentRoute.value.path === '/find-creators',
    },
    {
      id: 'nav-subscriptions',
      target: '[data-tour~="nav-subscriptions"]',
      instruction: t('OnboardingTour.navSubscriptions'),
      placement: 'right',
      requiredAction: 'click',
      advanceMode: 'auto',
      ensure: () => ui.openMainNav(),
      completeWhen: () => router.currentRoute.value.path === '/subscriptions',
    },
    {
      id: 'nav-settings',
      target: '[data-tour~="nav-settings"]',
      instruction: t('OnboardingTour.navSettings'),
      placement: 'right',
      requiredAction: 'click',
      advanceMode: 'auto',
      ensure: () => ui.openMainNav(),
      completeWhen: () => router.currentRoute.value.path === '/settings',
    },
  ].filter(Boolean) as OnboardingStep[],
)

const steps = computed(() => props.steps ?? internalSteps.value)

const index = ref(0)
const progressPercent = computed(() =>
  steps.value.length ? ((index.value + 1) / steps.value.length) * 100 : 0,
)
const current = ref<any>(null)
const show = ref(false)
const shownAtLeastOneStep = ref(false)
const actionDone = ref(false)
const overlay = ref<{
  top: number
  bottom: number
  left: number
  right: number
  height: number
}>()
const disabledEls: { el: HTMLElement; pointer: string; opacity: string }[] = []
let completeInterval: ReturnType<typeof setInterval>

function waitForSelector(selector: string, timeout = 10000) {
  return new Promise<boolean>(resolve => {
    if (document.querySelector(selector)) {
      resolve(true)
      return
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        cleanup(true)
      }
    })
    const timer = setTimeout(() => cleanup(false), timeout)
    const cleanup = (found: boolean) => {
      observer.disconnect()
      clearTimeout(timer)
      resolve(found)
    }
    observer.observe(document.body, { childList: true, subtree: true })
  })
}

const menuPlacement = computed(() => {
  if (current.value?.notFound) {
    return { anchor: 'center middle', self: 'center middle' }
  }
  const placement = current.value?.placement || 'auto'
  switch (placement) {
    case 'top':
      return { anchor: 'top middle', self: 'bottom middle' }
    case 'left':
      return { anchor: 'center left', self: 'center right' }
    case 'right':
      return { anchor: 'center right', self: 'center left' }
    case 'bottom':
    default:
      return { anchor: 'bottom middle', self: 'top middle' }
  }
})

const menuOffset = computed((): [number, number] => {
  if (current.value?.notFound) {
    return [0, 0]
  }
  const offset = current.value?.offset ?? 0
  const placement = current.value?.placement || 'auto'
  switch (placement) {
    case 'left':
    case 'right':
      return [offset, 0]
    case 'top':
    case 'bottom':
    default:
      return [0, offset]
  }
})

const storageKey = `${LOCAL_STORAGE_KEYS.FUNDSTR_ONBOARDING_DONE}:${props.pubkeyPrefix}:done`

function markDone() {
  LocalStorage.set(storageKey, '1')
}

function restoreDisabled() {
  disabledEls.forEach(({ el, pointer, opacity }) => {
    el.style.pointerEvents = pointer
    el.style.opacity = opacity
  })
  disabledEls.length = 0
}

function finish() {
  if (shownAtLeastOneStep.value) {
    markDone()
  } else {
    console.warn('Onboarding tour finished without displaying any steps')
  }
  restoreDisabled()
  props.onFinish()
}

const isLast = computed(() => index.value === steps.value.length - 1)

async function showStep(retries = 0) {
  try {
    const step = steps.value[index.value]
    if (!step) {
      finish()
      return
    }
    if (step.ensure) {
      await step.ensure()
    }
    await nextTick()
    const el = document.querySelector(step.target) as HTMLElement | null
    if (!el) {
      if (retries === 20) {
        await step.ensure?.()
      }
      if (retries >= 40) {
        console.warn(`Onboarding step ${step.id}: target not found (${step.target})`)
        current.value = { ...step, el: document.body, notFound: true }
        actionDone.value = false
        overlay.value = undefined
        show.value = true
        shownAtLeastOneStep.value = true
      } else {
        setTimeout(() => showStep(retries + 1), 300)
      }
      return
    }
    current.value = { ...step, el }
    actionDone.value = false
    const rect = el.getBoundingClientRect()
    const padding = step.padding ?? 0
    overlay.value = {
      top: rect.top - padding,
      bottom: rect.bottom + padding,
      left: rect.left - padding,
      right: rect.right + padding,
      height: rect.height + padding * 2,
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus?.()
    if (step.requiredAction === 'click') {
      const handler = () => {
        el.removeEventListener('click', handler)
        disabledEls.push({ el, pointer: el.style.pointerEvents, opacity: el.style.opacity })
        el.style.pointerEvents = 'none'
        el.style.opacity = '0.6'
      }
      el.addEventListener('click', handler)
      current.value.cleanup = () => el.removeEventListener('click', handler)
    }
    const check = () => {
      if (step.completeWhen()) {
        actionDone.value = true
        if (step.advanceMode === 'auto') {
          clearInterval(completeInterval)
          const nextStep = steps.value[index.value + 1]
          if (nextStep) {
            waitForSelector(nextStep.target).then(() => setTimeout(next, 300))
          } else {
            setTimeout(next, 300)
          }
        }
      }
    }
    check()
    completeInterval = setInterval(check, 250)
    show.value = true
    shownAtLeastOneStep.value = true
  } catch (err) {
    console.error('Error showing onboarding step', err)
    restoreDisabled()
    finish()
  }
}

function next() {
  show.value = false
  clearInterval(completeInterval)
  current.value?.cleanup?.()
  const before = steps.value.length
  current.value?.onNext?.()
  const diff = before - steps.value.length
  index.value += 1 - diff
  setTimeout(showStep, 200)
}

function skipStep() {
  show.value = false
  clearInterval(completeInterval)
  current.value?.cleanup?.()
  restoreDisabled()
  index.value += 1
  setTimeout(showStep, 200)
}

function skip() {
  clearInterval(completeInterval)
  current.value?.cleanup?.()
  finish()
}

const topStyle = computed(() =>
  overlay.value ? { height: `${overlay.value.top}px`, width: '100vw', top: '0', left: '0' } : {},
)
const bottomStyle = computed(() =>
  overlay.value
    ? {
        top: `${overlay.value.bottom}px`,
        height: `calc(100vh - ${overlay.value.bottom}px)`,
        width: '100vw',
        left: '0',
      }
    : {},
)
const leftStyle = computed(() =>
  overlay.value
    ? {
        top: `${overlay.value.top}px`,
        height: `${overlay.value.height}px`,
        width: `${overlay.value.left}px`,
        left: '0',
      }
    : {},
)
const rightStyle = computed(() =>
  overlay.value
    ? {
        top: `${overlay.value.top}px`,
        height: `${overlay.value.height}px`,
        left: `${overlay.value.right}px`,
        width: `calc(100vw - ${overlay.value.right}px)`,
      }
    : {},
)

onMounted(showStep)
</script>

<style scoped>
.onboarding-tooltip {
  max-width: 260px;
  padding: 8px 12px;
  background: var(--surface-2);
  color: var(--text-1);
  border: 1px solid var(--surface-contrast-border);
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}
.onboarding-tooltip .skip-btn {
  color: var(--text-1);
}
.step-counter {
  font-weight: 600;
  font-size: 1rem;
  color: var(--accent-500);
}
.step-progress {
  height: 4px;
  background: var(--surface-contrast-border);
  border-radius: 4px;
  overflow: hidden;
}
.step-progress .bar {
  height: 100%;
  background: var(--accent-500);
  transition: width 0.3s ease;
}
.onboarding-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
  .onboarding-overlay .overlay-part {
    position: fixed;
    background: rgba(0, 0, 0, 0.6);
    pointer-events: auto;
  }
</style>
