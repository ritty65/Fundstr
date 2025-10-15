export async function getJson<T>(
  url: string,
  opts: RequestInit = {},
  timeoutMs = 6000
): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      ...opts,
      mode: 'cors',
      credentials: 'omit',
      headers: { accept: 'application/json', ...(opts.headers || {}) },
      signal: ctrl.signal
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}
