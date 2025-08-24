import { LocalStorage, Quasar } from 'quasar'
import { createApp } from 'vue'
import { getActivePinia } from 'pinia'
import OnboardingTour from 'src/components/OnboardingTour.vue'
import { LOCAL_STORAGE_KEYS } from 'src/constants/localStorageKeys'
import { i18n } from 'src/boot/i18n'
import type { OnboardingStep } from 'src/types/onboarding'
import type { Router } from 'vue-router'

export function getBrowserId(): string {
  let id = LocalStorage.getItem<string>(LOCAL_STORAGE_KEYS.FUNDSTR_BROWSER_ID)
  if (!id) {
    id = crypto.randomUUID()
    LocalStorage.set(LOCAL_STORAGE_KEYS.FUNDSTR_BROWSER_ID, id)
  }
  return id
}

function key(prefix: string) {
  return `${LOCAL_STORAGE_KEYS.FUNDSTR_ONBOARDING_DONE}:${prefix}:done`
}

export function hasCompletedOnboarding(prefix: string): boolean {
  return LocalStorage.getItem(key(prefix)) === '1'
}

export function resetOnboarding(prefix: string): void {
  LocalStorage.remove(key(prefix))
}

export function startOnboardingTour(
  prefix: string,
  passedRouter: Router,
  steps?: OnboardingStep[],
  onFinish?: () => void
): void {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(OnboardingTour, {
    pubkeyPrefix: prefix,
    steps,
    onFinish: () => {
      onFinish?.()
      app.unmount()
      el.remove()
    },
  })
  const pinia = getActivePinia()
  if (pinia) app.use(pinia)
  app.use(i18n)
  app.use(Quasar, {})
  app.use(passedRouter)
  app.mount(el)
}
