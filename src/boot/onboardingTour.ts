import { boot } from 'quasar/wrappers'
import { watch, nextTick } from 'vue'
import { useNostrStore } from 'src/stores/nostr'
import { hasCompletedOnboarding, startOnboardingTour } from 'src/composables/useOnboardingTour'

export default boot(async ({ router }) => {
  router.isReady().then(() => {
    const nostr = useNostrStore()
    let lastPrefix: string | null = null
    const run = async () => {
      const prefix = (nostr.pubkey || 'anon').slice(0, 8)
      if (prefix === lastPrefix) return
      lastPrefix = prefix
      if (hasCompletedOnboarding(prefix)) return
      await nextTick()
      setTimeout(() => startOnboardingTour(prefix), 300)
    }
    run()
    watch(() => nostr.pubkey, run)
  })
})
