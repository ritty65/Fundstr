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
        <div class="q-mb-sm">{{ current.instruction }}</div>
        <div class="row justify-end q-gutter-sm">
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
const { t } = useI18n()
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
      completeWhen: () => router.currentRoute.value.path === '/dashboard',
    },
    {
      id: 'nav-wallet',
      target: '[data-tour~="nav-wallet"]',
      instruction: t('OnboardingTour.navWallet'),
      placement: 'right',
      requiredAction: 'click',
      advanceMode: 'auto',
      completeWhen: () => router.currentRoute.value.path === '/wallet',
    },
    {
      id: 'nav-find-creators',
      target: '[data-tour~="nav-find-creators"]',
      instruction: t('OnboardingTour.navFindCreators'),
      placement: 'right',
      requiredAction: 'click',
      advanceMode: 'auto',
      completeWhen: () => router.currentRoute.value.path === '/find-creators',
    },
    {
      id: 'nav-subscriptions',
      target: '[data-tour~="nav-subscriptions"]',
      instruction: t('OnboardingTour.navSubscriptions'),
      placement: 'right',
      requiredAction: 'click',
      advanceMode: 'auto',
      completeWhen: () => router.currentRoute.value.path === '/subscriptions',
    },
    {
      id: 'nav-settings',
      target: '[data-tour~="nav-settings"]',
      instruction: t('OnboardingTour.navSettings'),
      placement: 'right',
      requiredAction: 'click',
      advanceMode: 'auto',
      completeWhen: () => router.currentRoute.value.path === '/settings',
    },
  ].filter(Boolean) as OnboardingStep[],
)

const steps = computed(() => props.steps ?? internalSteps.value)

const index = ref(0)
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

const menuPlacement = computed(() => {
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
    if (retries >= 10) {
      index.value++
      showStep()
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
        setTimeout(next, 300)
      }
    }
  }
  check()
  completeInterval = setInterval(check, 250)
  show.value = true
  shownAtLeastOneStep.value = true
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
