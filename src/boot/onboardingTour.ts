import { boot } from 'quasar/wrappers'
import { nextTick, watch } from 'vue'
import { useNostrStore } from 'src/stores/nostr'
import { hasCompletedOnboarding, startOnboardingTour } from 'src/composables/useOnboardingTour'

const MAIN_ROUTES = ['/dashboard', '/wallet', '/find-creators', '/subscriptions', '/settings']

function isMainRoute(path: string) {
  return MAIN_ROUTES.some(r => path.startsWith(r))
}

export default boot(async ({ router }) => {
  router.isReady().then(() => {
    const nostr = useNostrStore()
    let started = false

    const tryStart = async () => {
      const path = router.currentRoute.value.path
      if (started || !isMainRoute(path)) return
      const prefix = (nostr.pubkey || 'anon').slice(0, 8)
      if (hasCompletedOnboarding(prefix)) return
      await nextTick()
      for (let i = 0; i < 3; i++) {
        if (document.querySelector('[data-tour]')) break
        await new Promise(r => setTimeout(r, 200))
      }
      if (!document.querySelector('[data-tour]')) return
      started = true
      startOnboardingTour(prefix)
    }

    const reset = () => {
      started = false
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
