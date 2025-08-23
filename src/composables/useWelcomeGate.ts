import { LocalStorage, Cookies } from 'quasar'

// storage keys for tracking if the welcome flow has been seen on this device
const KEY = 'welcome.seen:v1'
const COOKIE_KEY = 'welcome_seen_v1'

function getStorage() {
  // use Quasar LocalStorage if available, otherwise fall back to the native API
  try {
    // accessing LocalStorage may throw if plugin not available
    LocalStorage.getItem(KEY)
    return LocalStorage
  } catch {
    return window.localStorage
  }
}

export function hasSeenWelcome(): boolean {
  const storage: any = getStorage()
  const val = storage.getItem(KEY)
  if (val === '1' || val === true) return true

  // check for persisted cookie or legacy flags and migrate
  if (Cookies.get(COOKIE_KEY) === '1') {
    markWelcomeSeen()
    return true
  }

  const legacy = storage.getItem('cashu.welcome.completed')
  if (legacy === '1' || legacy === true) {
    markWelcomeSeen()
    return true
  }

  return false
}

export function markWelcomeSeen(): void {
  const storage: any = getStorage()
  if (storage.set) storage.set(KEY, '1')
  else storage.setItem(KEY, '1')
  Cookies.set(COOKIE_KEY, '1', { maxAge: 31536000, path: '/' })
}

export function resetWelcome(): void {
  const storage: any = getStorage()
  if (storage.remove) storage.remove(KEY)
  else storage.removeItem(KEY)
  Cookies.remove(COOKIE_KEY, { path: '/' })
}
