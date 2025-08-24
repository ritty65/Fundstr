import { boot } from 'quasar/wrappers'
import { nextTick, watch } from 'vue'
import { Notify } from 'quasar'
import { useNostrStore } from 'src/stores/nostr'
import {
  hasCompletedOnboarding,
  startOnboardingTour,
  getBrowserId,
} from 'src/composables/useOnboardingTour'
import { useFirstRunStore } from 'src/stores/firstRun'
import { useUiStore } from 'src/stores/ui'

const BLOCKED_ROUTES = ['/welcome', '/onboarding', '/tour']

function canRunOnRoute(path: string) {
  return !BLOCKED_ROUTES.some(r => path.startsWith(r))
}

export default boot(async ({ router }) => {
  router.isReady().then(() => {
    const nostr = useNostrStore()
    const firstRunStore = useFirstRunStore()
    const ui = useUiStore()
    let started = false
    let activeTour: symbol | null = null

    const waitForTourTargets = (selector: string, timeout = 20000) =>
      new Promise<boolean>(resolve => {
        if (document.querySelector(selector)) {
          resolve(true)
          return
        }
        const start = Date.now()
        const observer = new MutationObserver(() => {
          if (document.querySelector(selector)) {
            cleanup(true)
          }
        })
        const check = () => {
          if (document.querySelector(selector)) {
            cleanup(true)
          } else if (Date.now() - start >= timeout) {
            cleanup(false)
          } else {
            setTimeout(check, 500)
          }
        }
        const cleanup = (found: boolean) => {
          observer.disconnect()
          resolve(found)
        }
        observer.observe(document.body, { childList: true, subtree: true })
        check()
      })

    const rerunWhenReady = (selector: string) => {
      const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) {
          observer.disconnect()
          tryStart()
        }
      })
      observer.observe(document.body, { childList: true, subtree: true })
    }

    const getFirstSelector = () =>
      ui.mainNavOpen ? '[data-tour~="nav-dashboard"]' : '[data-tour~="nav-toggle"]'

    const tryStart = async () => {
      const path = router.currentRoute.value.path
      if (started || firstRunStore.tourStarted || firstRunStore.suppressModals || !canRunOnRoute(path)) return
      const prefix = (nostr.pubkey || getBrowserId()).slice(0, 8)
      if (hasCompletedOnboarding(prefix)) return
      await nextTick()

      const selector = getFirstSelector()
      const found = await waitForTourTargets(selector, 20000)

      if (!found) {
        console.warn('Onboarding tour: required elements not found, aborting start')
        Notify.create({ type: 'warning', message: 'Onboarding tour could not start' })
        firstRunStore.tourStarted = false
        rerunWhenReady(selector)
        return
      }
      started = true
      firstRunStore.tourStarted = true
      const instance = Symbol('tour')
      activeTour = instance
      startOnboardingTour(prefix, router, undefined, () => {
        if (activeTour === instance) reset()
      })
    }

    const reset = () => {
      started = false
      activeTour = null
      firstRunStore.tourStarted = false
    }

    watch(
      () => nostr.pubkey,
      () => {
        if (activeTour) return
        tryStart()
      }
    )

    router.afterEach(() => {
      if (activeTour) return
      tryStart()
    })

    tryStart()
  })
})
