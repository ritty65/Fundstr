import { LocalStorage } from 'quasar'

// storage key for tracking if the welcome flow has been seen on this device
const KEY = 'welcome.seen:v1'

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
  return val === '1' || val === true
}

export function markWelcomeSeen(): void {
  const storage: any = getStorage()
  if (storage.set) storage.set(KEY, '1')
  else storage.setItem(KEY, '1')
}

export function resetWelcome(): void {
  const storage: any = getStorage()
  if (storage.remove) storage.remove(KEY)
  else storage.removeItem(KEY)
}
