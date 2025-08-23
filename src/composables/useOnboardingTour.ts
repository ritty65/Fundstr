import { LocalStorage } from 'quasar'
import { createApp } from 'vue'
import OnboardingTour from 'src/components/OnboardingTour.vue'

const KEY_PREFIX = 'fundstr:onboarding:v1:'

function key(prefix: string) {
  return `${KEY_PREFIX}${prefix}:done`
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
