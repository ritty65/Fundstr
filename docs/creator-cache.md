# Creator cache behaviour

Fundstr preloads and warms Dexie-backed caches for Nutzap creator metadata so the UI can stay responsive even when relays are slow. Two cache layers matter for the Find Creators experience:

- **`db.profiles`**: populated by `creatorsStore.fetchCreator`. Entries expire after **3 hours** (`3 * 60 * 60 * 1000` milliseconds) to balance freshness with the cost of re-querying relays.
- **Warm Nutzap cache**: hydrated by `fundstr-preload` and `creatorCacheService`. It persists the raw profile event (`kind:10019`/`kind:0`) plus parsed tier definitions so we can instantly render cards or tier modals while fresh data streams in.

When tuning “super snappy” UX, adjust the 3 hour expiry in `fetchCreator` if you need more aggressive refreshes, and consider increasing preload coverage so warm cache hits remain high.
