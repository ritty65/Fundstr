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
      :anchor="current.anchor"
      :self="current.self"
      no-parent-event
      persistent
      transition-show="fade"
      transition-hide="fade"
      content-class="onboarding-tooltip"
    >
      <div class="onboarding-body">
        <div class="q-mb-sm">{{ current.text }}</div>
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

const props = defineProps<{
  pubkeyPrefix: string
  onFinish: () => void
  steps?: OnboardingStep[]
}>()

const ui = useUiStore()
const { t } = useI18n()

const internalSteps = computed<OnboardingStep[]>(() =>
  [
    !ui.mainNavOpen && {
      target: '[data-tour~="nav-toggle"]',
      text: t('OnboardingTour.navToggle'),
      anchor: 'bottom middle',
      self: 'top middle',
      requiredAction: 'click',
      advanceMode: 'auto',
    },
    {
      target: '[data-tour~="nav-dashboard"]',
      text: t('OnboardingTour.navDashboard'),
      anchor: 'right middle',
      self: 'left middle',
      requiredAction: 'click',
      advanceMode: 'auto',
    },
    {
      target: '[data-tour~="nav-wallet"]',
      text: t('OnboardingTour.navWallet'),
      anchor: 'right middle',
      self: 'left middle',
      requiredAction: 'click',
      advanceMode: 'auto',
    },
    {
      target: '[data-tour~="nav-find-creators"]',
      text: t('OnboardingTour.navFindCreators'),
      anchor: 'right middle',
      self: 'left middle',
      requiredAction: 'click',
      advanceMode: 'auto',
    },
    {
      target: '[data-tour~="nav-subscriptions"]',
      text: t('OnboardingTour.navSubscriptions'),
      anchor: 'right middle',
      self: 'left middle',
      requiredAction: 'click',
      advanceMode: 'auto',
    },
    {
      target: '[data-tour~="nav-settings"]',
      text: t('OnboardingTour.navSettings'),
      anchor: 'right middle',
      self: 'left middle',
      requiredAction: 'click',
      advanceMode: 'auto',
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
  overlay.value = {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left,
    right: rect.right,
    height: rect.height,
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.focus?.()
  if (step.requiredAction === 'click') {
    const handler = () => {
      actionDone.value = true
      el.removeEventListener('click', handler)
      disabledEls.push({ el, pointer: el.style.pointerEvents, opacity: el.style.opacity })
      el.style.pointerEvents = 'none'
      el.style.opacity = '0.6'
      if (step.advanceMode === 'auto') {
        next()
      }
    }
    el.addEventListener('click', handler)
    current.value.cleanup = () => el.removeEventListener('click', handler)
  }
  show.value = true
  shownAtLeastOneStep.value = true
}

function next() {
  show.value = false
  current.value?.cleanup?.()
  const before = steps.value.length
  current.value?.onNext?.()
  const diff = before - steps.value.length
  index.value += 1 - diff
  setTimeout(showStep, 200)
}

function skip() {
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
