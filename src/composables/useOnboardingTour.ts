import { LocalStorage } from 'quasar'
import { createApp } from 'vue'
import OnboardingTour from 'src/components/OnboardingTour.vue'
import { LOCAL_STORAGE_KEYS } from 'src/constants/localStorageKeys'

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
    }
  })
  app.mount(el)
}
