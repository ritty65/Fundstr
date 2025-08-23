import { boot } from 'quasar/wrappers'
import { hasSeenWelcome } from 'src/composables/useWelcomeGate'

// router guard to ensure the welcome flow is shown only once per device
export default boot(({ router }) => {
  router.beforeEach((to, _from, next) => {
    const seen = hasSeenWelcome()
    const isWelcome = to.path.startsWith('/welcome')

    const env = import.meta.env.VITE_APP_ENV
    const allow =
      to.query.allow === '1' && (env === 'development' || env === 'staging')

    if (!seen && !isWelcome) {
      next({ path: '/welcome', query: { first: '1' } })
      return
    }

    if (seen && isWelcome && !allow) {
      next('/wallet')
      return
    }

    next()
  })
})
