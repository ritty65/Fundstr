<template>
  <q-tooltip
    v-if="current"
    v-model="show"
    :target="current.el"
    :anchor="current.anchor"
    :self="current.self"
    class="onboarding-tooltip"
    no-parent-event
    persistent
    transition-show="fade"
    transition-hide="fade"
  >
    <div class="onboarding-body">
      <div class="q-mb-sm">{{ current.text }}</div>
      <div class="row justify-end q-gutter-sm">
        <q-btn flat dense class="skip-btn" @click="skip">{{ $t('OnboardingTour.skip') }}</q-btn>
        <q-btn flat dense color="primary" @click="next">{{ isLast ? $t('OnboardingTour.gotIt') : $t('OnboardingTour.next') }}</q-btn>
      </div>
    </div>
  </q-tooltip>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { LocalStorage } from 'quasar'
import { useUiStore } from 'src/stores/ui'

const props = defineProps<{ pubkeyPrefix: string; onFinish: () => void }>()

const ui = useUiStore()
const { t } = useI18n()

const steps = computed(() =>
  [
    !ui.mainNavOpen && {
      target: '[data-tour~="nav-toggle"]',
      text: t('OnboardingTour.navToggle'),
      anchor: 'bottom middle',
      self: 'top middle',
      onNext: () => ui.openMainNav(),
    },
    {
      target: '[data-tour~="nav-dashboard"]',
      text: t('OnboardingTour.navDashboard'),
      anchor: 'right middle',
      self: 'left middle',
    },
    {
      target: '[data-tour~="nav-wallet"]',
      text: t('OnboardingTour.navWallet'),
      anchor: 'right middle',
      self: 'left middle',
    },
    {
      target: '[data-tour~="nav-find-creators"]',
      text: t('OnboardingTour.navFindCreators'),
      anchor: 'right middle',
      self: 'left middle',
    },
    {
      target: '[data-tour~="nav-subscriptions"]',
      text: t('OnboardingTour.navSubscriptions'),
      anchor: 'right middle',
      self: 'left middle',
    },
    {
      target: '[data-tour~="nav-settings"]',
      text: t('OnboardingTour.navSettings'),
      anchor: 'right middle',
      self: 'left middle',
    },
  ].filter(Boolean),
)

const index = ref(0)
const current = ref<any>(null)
const show = ref(false)

const storageKey = `fundstr:onboarding:v1:${props.pubkeyPrefix}:done`

function markDone() {
  LocalStorage.set(storageKey, '1')
}

function finish() {
  markDone()
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
  show.value = true
}

function next() {
  show.value = false
  const before = steps.value.length
  current.value?.onNext?.()
  const diff = before - steps.value.length
  index.value += 1 - diff
  setTimeout(showStep, 200)
}

function skip() {
  finish()
}

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
</style>
