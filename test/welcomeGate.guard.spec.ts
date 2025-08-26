import { beforeEach, describe, expect, it, vi } from 'vitest'

// utility to initialize router with the welcome gate guard
async function setup({
  seen = false,
  restoring = false,
  env = 'production',
} = {}) {
  vi.resetModules()
  vi.doMock('src/composables/useWelcomeGate', () => ({
    hasSeenWelcome: () => seen,
  }))
  vi.doMock('src/stores/restore', () => ({
    useRestoreStore: () => ({ restoringState: restoring }),
  }))
  vi.stubEnv('VITE_APP_ENV', env)

  const routes = [
    { path: '/', component: {} },
    { path: '/wallet', component: {} },
    { path: '/about', component: {} },
    { path: '/welcome', component: {} },
    { path: '/restore', component: {} },
  ]

  vi.doMock('src/router/routes', () => ({ default: routes }))

  const oldServer = process.env.SERVER
  process.env.SERVER = '1'
  const createAppRouter = (await import('src/router/index.js')).default
  const router = createAppRouter()
  process.env.SERVER = oldServer

  // start router at root
  await router.push('/')
  return router
}

describe('welcome gate router guard', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('redirects to /welcome when onboarding not seen', async () => {
    const router = await setup()
    await router.push('/wallet')
    expect(router.currentRoute.value.fullPath).toBe('/welcome?first=1')
  })

  it('allows navigation when restoring state', async () => {
    const router = await setup({ restoring: true })
    await router.push('/wallet')
    expect(router.currentRoute.value.fullPath).toBe('/wallet')
  })

  it('skips redirect for restore page', async () => {
    const router = await setup()
    await router.push('/restore')
    expect(router.currentRoute.value.fullPath).toBe('/restore')
  })

  it('redirects away from /welcome after completion', async () => {
    const router = await setup({ seen: true })
    await router.push('/welcome')
    expect(router.currentRoute.value.fullPath).toBe('/about')
  })

  it('allows /welcome with allow flag in dev env', async () => {
    const router = await setup({ seen: true, env: 'development' })
    await router.push('/welcome?allow=1')
    expect(router.currentRoute.value.fullPath).toBe('/welcome?allow=1')
  })
})

