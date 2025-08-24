import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { LocalStorage } from 'quasar'
import { LOCAL_STORAGE_KEYS } from 'src/constants/localStorageKeys'

interface AutoPageTourOptions {
  dwellMs?: number
  replay?: boolean
}

const SEQUENCE = [
  '/wallet',
  '/find-creators',
  '/creator-hub',
  '/buckets',
  '/subscriptions',
  '/nostr-messenger',
] as const

const isRunning = ref(false)
const isPaused = ref(false)
let replayMode = false

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function useAutoPageTour() {
  const router = useRouter()

  async function startAutoPageTour(opts: AutoPageTourOptions = {}) {
    if (isRunning.value) return
    if (
      !opts.replay &&
      LocalStorage.getItem(LOCAL_STORAGE_KEYS.FUNDSTR_AUTOTOUR_DONE) === '1'
    ) {
      return
    }
    const dwellMs = opts.dwellMs ?? 3000
    replayMode = !!opts.replay
    isRunning.value = true
    isPaused.value = false

    for (const path of SEQUENCE) {
      if (!isRunning.value) break
      await router.push(path)
      let elapsed = 0
      while (elapsed < dwellMs && isRunning.value) {
        await sleep(100)
        if (!isPaused.value) {
          elapsed += 100
        }
      }
    }
    if (isRunning.value) finish()
  }

  function finish() {
    if (!replayMode) {
      LocalStorage.set(LOCAL_STORAGE_KEYS.FUNDSTR_AUTOTOUR_DONE, '1')
    }
    isRunning.value = false
    isPaused.value = false
  }

  function skip() {
    if (!isRunning.value) return
    finish()
  }

  function pause() {
    if (isRunning.value) isPaused.value = true
  }

  function resume() {
    if (isRunning.value) isPaused.value = false
  }

  return { startAutoPageTour, isRunning, isPaused, skip, pause, resume }
}
