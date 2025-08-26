import { boot } from 'quasar/wrappers'
import { hasSeenWelcome } from 'src/composables/useWelcomeGate'
import { useRestoreStore } from 'src/stores/restore'

// router guard to ensure the welcome flow is shown only once per device
export default boot(({ router }) => {
  router.beforeEach((to, _from, next) => {
    const seen = hasSeenWelcome()
    const isWelcome = to.path.startsWith('/welcome')
    const isPublicProfile =
      to.matched.some(r => r.name === 'PublicCreatorProfile') ||
      to.path.startsWith('/creator/')
    const isPublicDiscover = to.path === '/find-creators'
    const restore = useRestoreStore()

    const env = import.meta.env.VITE_APP_ENV
    const allow =
      to.query.allow === '1' && (env === 'development' || env === 'staging')

    if (
      !seen &&
      !isWelcome &&
      !restore.restoringState &&
      to.path !== '/restore' &&
      !isPublicProfile &&
      !isPublicDiscover
    ) {
      next({ path: '/welcome', query: { first: '1' } })
      return
    }

    if (seen && isWelcome && !allow) {
      next('/about')
      return
    }

    next()
  })
})
