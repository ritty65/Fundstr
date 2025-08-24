import { boot } from 'quasar/wrappers'
import { nextTick, watch } from 'vue'
import { useNostrStore } from 'src/stores/nostr'
import { hasCompletedOnboarding, startOnboardingTour } from 'src/composables/useOnboardingTour'
import { useFirstRunStore } from 'src/stores/firstRun'

const MAIN_ROUTES = ['/dashboard', '/wallet', '/find-creators', '/subscriptions', '/settings']

function isMainRoute(path: string) {
  return MAIN_ROUTES.some(r => path.startsWith(r))
}

export default boot(async ({ router }) => {
  router.isReady().then(() => {
    const nostr = useNostrStore()
    const firstRunStore = useFirstRunStore()
    let started = false

    const tryStart = async () => {
      const path = router.currentRoute.value.path
      if (started || firstRunStore.tourStarted || firstRunStore.suppressModals || !isMainRoute(path)) return
      const prefix = (nostr.pubkey || 'anon').slice(0, 8)
      if (hasCompletedOnboarding(prefix)) return
      await nextTick()

      const found = await new Promise<boolean>(resolve => {
        if (document.querySelector('[data-tour]')) {
          resolve(true)
          return
        }
        const observer = new MutationObserver(() => {
          if (document.querySelector('[data-tour]')) {
            observer.disconnect()
            clearTimeout(timeout)
            resolve(true)
          }
        })
        observer.observe(document.body, { childList: true, subtree: true })
        const timeout = setTimeout(() => {
          observer.disconnect()
          resolve(false)
        }, 5000)
      })

      if (!found) {
        firstRunStore.tourStarted = false
        return
      }
      started = true
      firstRunStore.tourStarted = true
      startOnboardingTour(prefix, undefined, reset)
    }

    const reset = () => {
      started = false
      firstRunStore.tourStarted = false
    }

    watch(
      () => nostr.pubkey,
      () => {
        reset()
        tryStart()
      }
    )

    router.afterEach(() => {
      tryStart()
    })

    tryStart()
  })
})
