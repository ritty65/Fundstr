import { boot } from 'quasar/wrappers'

export default boot(() => {
  if (typeof window !== 'undefined' && !('nostr' in window)) {
    console.warn('No Nostr provider detected.')
  }
})
