import NDK from '@nostr-dev-kit/ndk'

let ndk: NDK | null = null
let connectPromise: Promise<void> | null = null

export const PRIMARY_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.band'
]

export function getNDK (): NDK {
  if (!ndk) {
    ndk = new NDK({ explicitRelayUrls: PRIMARY_RELAYS })
  }
  return ndk
}

export async function ensureNDKConnected (): Promise<void> {
  if (!connectPromise) connectPromise = getNDK().connect()
  return connectPromise
}
