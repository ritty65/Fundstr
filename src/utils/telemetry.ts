import * as Sentry from '@sentry/vue'
import type { Router } from 'vue-router'

const SESSION_STORAGE_KEY = 'cashu.telemetry.session'
const CONSENT_STORAGE_KEY = 'guest.consent'

function safeLocalStorageGet(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null
  }
  try {
    return localStorage.getItem(key)
  } catch (error) {
    console.warn('[telemetry] failed to read localStorage', { key, error })
    return null
  }
}

function safeLocalStorageSet(key: string, value: string): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  try {
    localStorage.setItem(key, value)
  } catch (error) {
    console.warn('[telemetry] failed to write localStorage', { key, error })
  }
}

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

export function getTelemetrySessionId(): string {
  const existing = safeLocalStorageGet(SESSION_STORAGE_KEY)
  if (existing) {
    return existing
  }
  const next = generateSessionId()
  safeLocalStorageSet(SESSION_STORAGE_KEY, next)
  return next
}

function telemetryAllowed(): boolean {
  const consent = safeLocalStorageGet(CONSENT_STORAGE_KEY)
  if (consent === 'false') {
    return false
  }
  return true
}

function buildRelease(): string | undefined {
  const envRelease = (import.meta as any)?.env?.VITE_SENTRY_RELEASE
  if (typeof envRelease === 'string' && envRelease.trim()) {
    return envRelease.trim()
  }
  const fallback = (import.meta as any)?.env?.VITE_COMMIT_SHA
  if (typeof fallback === 'string' && fallback.trim()) {
    return fallback.trim()
  }
  return undefined
}

export function initSentry(app: Parameters<typeof Sentry.init>[0]['app'], router?: Router) {
  const dsn = (import.meta as any)?.env?.VITE_SENTRY_DSN
  if (!dsn) {
    return
  }

  const environment =
    (import.meta as any)?.env?.VITE_APP_ENV || (import.meta as any)?.env?.MODE || 'production'
  const release = buildRelease()
  const tracesSampleRateRaw = (import.meta as any)?.env?.VITE_SENTRY_TRACES_SAMPLE_RATE
  const tracesSampleRate =
    typeof tracesSampleRateRaw === 'string'
      ? Number.parseFloat(tracesSampleRateRaw)
      : typeof tracesSampleRateRaw === 'number'
        ? tracesSampleRateRaw
        : 0.05

  const sessionId = getTelemetrySessionId()

  const integrations = [] as any[]
  if (router) {
    integrations.push(
      Sentry.browserTracingIntegration({
        router,
        tracePropagationTargets: [/.*/],
      }),
    )
  }

  Sentry.init({
    app,
    dsn,
    release,
    environment,
    sendDefaultPii: false,
    integrations,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0.05,
    beforeSend(event) {
      if (!telemetryAllowed()) {
        return null
      }
      if (event.request) {
        delete (event.request as any).headers
        delete (event.request as any).cookies
      }
      return event
    },
  })

  Sentry.setTag('app_env', environment)
  Sentry.setUser({ id: sessionId })
  if (release) {
    Sentry.setTag('release', release)
  }

  if (router) {
    router.afterEach((to) => {
      Sentry.addBreadcrumb({
        category: 'navigation',
        message: `Navigated to ${to.fullPath}`,
        level: 'info',
      })
    })
  }
}

export function captureException(
  error: unknown,
  context?: Record<string, unknown>,
): string | undefined {
  const client = Sentry.getClient()
  if (!client || !telemetryAllowed()) {
    return undefined
  }
  let eventId: string | undefined
  Sentry.withScope((scope) => {
    if (context) {
      scope.setContext('context', context)
    }
    scope.setTag('session_id', getTelemetrySessionId())
    scope.setLevel('error')
    eventId = Sentry.captureException(error)
  })
  return eventId
}

export function captureWarning(
  message: string,
  data?: Record<string, unknown>,
): string | undefined {
  const client = Sentry.getClient()
  if (!client || !telemetryAllowed()) {
    return undefined
  }
  const breadcrumbData = {
    ...data,
    sessionId: getTelemetrySessionId(),
  }
  Sentry.addBreadcrumb({
    category: 'warning',
    message,
    data: breadcrumbData,
    level: 'warning',
  })
  let eventId: string | undefined
  Sentry.withScope((scope) => {
    if (data) {
      scope.setContext('context', data)
    }
    scope.setTag('session_id', getTelemetrySessionId())
    scope.setLevel('warning')
    eventId = Sentry.captureMessage(message, 'warning')
  })
  return eventId
}
