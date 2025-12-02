import { boot } from 'quasar/wrappers'
import { initSentry } from 'src/utils/telemetry'

export default boot(async ({ app, router }) => {
  try {
    initSentry(app, router)
  } catch (error) {
    console.warn('[sentry] failed to initialize telemetry', error)
  }
})
