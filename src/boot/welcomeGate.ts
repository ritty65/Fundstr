import { boot } from 'quasar/wrappers'
import { hasSeenWelcome } from 'src/composables/useWelcomeGate'

// router guard to ensure the welcome flow is shown only once per device
export default boot(({ router }) => {
  router.beforeEach((to, _from, next) => {
    const seen = hasSeenWelcome()
    const isWelcome = to.path.startsWith('/welcome')

    if (!seen && !isWelcome) {
      next({ path: '/welcome', query: { first: '1' } })
      return
    }

    if (seen && isWelcome && to.query.allow !== '1') {
      next('/wallet')
      return
    }

    next()
  })
})
