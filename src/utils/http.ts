export interface JsonRequestInit extends RequestInit {
  timeoutMs?: number | null
}

const DEFAULT_TIMEOUT_MS = 6000

export async function getJson<T>(url: string, opts: JsonRequestInit = {}): Promise<T> {
  const { signal: callerSignal, headers, timeoutMs: requestedTimeout, ...rest } = opts
  const hasTimeoutOverride = Object.prototype.hasOwnProperty.call(opts, 'timeoutMs')
  const timeoutMs = hasTimeoutOverride ? requestedTimeout : DEFAULT_TIMEOUT_MS

  const signals: AbortSignal[] = []
  const cleanupListeners: Array<() => void> = []

  if (callerSignal) {
    signals.push(callerSignal)
  }

  let timeoutController: AbortController | null = null
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  if (timeoutMs != null) {
    if (typeof AbortSignal !== 'undefined' && typeof (AbortSignal as any).timeout === 'function') {
      signals.push((AbortSignal as any).timeout(timeoutMs))
    } else {
      timeoutController = new AbortController()
      timeoutId = setTimeout(() => timeoutController?.abort(), timeoutMs)
      signals.push(timeoutController.signal)
    }
  }

  let combinedSignal: AbortSignal | undefined
  if (signals.length === 1) {
    combinedSignal = signals[0]
  } else if (signals.length > 1) {
    const controller = new AbortController()
    const propagateAbort = (signal: AbortSignal) => {
      if (signal.aborted) {
        controller.abort(signal.reason)
        return
      }
      const onAbort = () => controller.abort(signal.reason)
      signal.addEventListener('abort', onAbort, { once: true })
      cleanupListeners.push(() => signal.removeEventListener('abort', onAbort))
    }
    signals.forEach(propagateAbort)
    combinedSignal = controller.signal
  }

  try {
    const res = await fetch(url, {
      ...rest,
      mode: 'cors',
      credentials: 'omit',
      headers: { accept: 'application/json', ...(headers || {}) },
      signal: combinedSignal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return (await res.json()) as T
  } finally {
    cleanupListeners.forEach(fn => fn())
    if (timeoutId != null) {
      clearTimeout(timeoutId)
    }
    if (timeoutController && !timeoutController.signal.aborted) {
      timeoutController.abort()
    }
  }
}
