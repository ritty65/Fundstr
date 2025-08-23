import { boot } from 'quasar/wrappers'
import { watch, nextTick } from 'vue'
import { useNostrStore } from 'src/stores/nostr'
import { hasCompletedOnboarding, startOnboardingTour } from 'src/composables/useOnboardingTour'

export default boot(async ({ router }) => {
  router.isReady().then(() => {
    const nostr = useNostrStore()
    const run = async () => {
      const prefix = (nostr.pubkey || 'anon').slice(0, 8)
      if (hasCompletedOnboarding(prefix)) return
      await nextTick()
      startOnboardingTour(prefix)
    }
    if (nostr.pubkey) {
      run()
    } else {
      const stop = watch(() => nostr.pubkey, (val) => {
        if (val) {
          stop()
          run()
        }
      })
    }
  })
})
