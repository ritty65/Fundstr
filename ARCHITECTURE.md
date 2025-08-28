# Fundstr Architecture Notes

## NDK Singleton
The app uses a single Nostr Dev Kit instance located at `src/ndk/ndk-singleton.ts`. It is configured with a short list of performant relays (`nos.lol`, `relay.primal.net`, `relay.nostr.band`) and connects once per app lifecycle via `ensureNDKConnected`.

## Relay Policy
Subscriptions use the relay list from the singleton and may supply dedicated relay sets for NIP-50 search. Unhealthy relays are not retried during a session.

## Caching
Profile data and follower counts are cached in-memory inside the creators store with a 24 h lifetime. Cached values are returned immediately and refreshed asynchronously.

## Indexers and Search
Name and keyword search uses NIP-50 against `relay.nostr.band`, `search.nos.today`, and `relay.noswhere.com`. Direct pubkey lookups are still supported.

## Image Proxy
Avatars load through an optional proxy defined by `VITE_IMAGE_PROXY_URL` to avoid Firefox ETP blocking. When no proxy is configured, the original URL is used and failures fall back to a local placeholder.
