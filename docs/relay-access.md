# Relay Access Layer

Fundstr ships with a **client-managed relay access layer** that speaks raw
Nostr. The module lives at `src/nostr/relayClient.ts` and is the single entry
point for issuing queries and publishing Nutzap events.

## Transport flow

1. The client always **prefers the isolated Fundstr relay**
   (`wss://relay.fundstr.me`).
2. Each request attempts a WebSocket REQ/EOSE round-trip first. Connections are
   bounded by an 8&nbsp;s timeout.
3. If the socket cannot be opened or no events arrive before timeout, the client
   automatically falls back to the HTTP bridge exposed by the relay at
   `https://relay.fundstr.me/req?filters=…`.
4. When Fundstr returns no data the client will fan out across a vetted pool of
   public relays (`relay.primal.net`, `relay.f7z.io`, `nos.lol`,
   `relay.damus.io`). The pool is also used for general discovery when the
   operation does not explicitly require Fundstr.

All fetches use `cache: 'no-store'` with `cache-control: no-cache` headers so
service workers never cache responses.

Publishing Nutzap events uses a direct HTTP POST to
`https://relay.fundstr.me/event`. The relay responds with a JSON payload shaped
like `{ ok, id, accepted, message }`. UI surfaces should display the message when
`ok` is false or `accepted` is false.

## Replaceable event handling

The relay layer implements deduplication and NIP-01 replaceable semantics:

- `dedup` removes duplicate events by ID.
- `normalizeEvents` coalesces replaceable kinds (`0/3/10000-19999`) so only the
  latest `{kind,pubkey}` wins.
- Parameterised replaceable kinds (`30000-39999`) are keyed by
  `{kind,pubkey,d}` where the `d` tag is read from event tags.

Helpers are exposed for consumers that want the latest Nutzap profile and tier
definitions: `queryNutzapProfile` (kind `10019`) and `queryNutzapTiers` (kind
`30019` with `d:"tiers"`).

## Discovery fallbacks

When Fundstr cannot serve a Nutzap profile the client asks the public pool for a
kind `10002` relay list (NIP-65). Any discovered URLs are queued as additional
targets for subsequent `queryNostr` calls. Screens such as “Find Creators” and
the creators store feed these hints back into the relay layer so parameterised
events (tiers) can be sourced from a creator’s preferred relays.

## Service worker considerations

`src-pwa/custom-service-worker.js` pins `/req` and `/event` requests to a
`NetworkOnly` strategy. Together with the explicit `no-store` fetch options this
guarantees that relay responses are never cached inside the service worker,
which is required to always observe the most recent replaceable events.
