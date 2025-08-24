import { LocalStorage, Quasar } from 'quasar'
import { createApp } from 'vue'
import { getActivePinia } from 'pinia'
import OnboardingTour from 'src/components/OnboardingTour.vue'
import { LOCAL_STORAGE_KEYS } from 'src/constants/localStorageKeys'
import { i18n } from 'src/boot/i18n'

function key(prefix: string) {
  return `${LOCAL_STORAGE_KEYS.FUNDSTR_ONBOARDING_DONE}:${prefix}:done`
}

export function hasCompletedOnboarding(prefix: string): boolean {
  return LocalStorage.getItem(key(prefix)) === '1'
}

export function resetOnboarding(prefix: string): void {
  LocalStorage.remove(key(prefix))
}

export function startOnboardingTour(prefix: string): void {
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(OnboardingTour, {
    pubkeyPrefix: prefix,
    onFinish: () => {
      app.unmount()
      el.remove()
    },
  })
  const pinia = getActivePinia()
  if (pinia) app.use(pinia)
  app.use(i18n)
  app.use(Quasar, {})
  app.mount(el)
}
