# Relay Access Layer

Fundstr ships with a **client-managed relay access layer** that speaks raw
Nostr. The module lives at `src/nostr/relayClient.ts` and is the single entry
point for issuing queries and publishing Nutzap events.

Publishes must send a fully signed NIP-01 event to /event; the client validates the payload and reports success only when accepted:true. Reads prefer Fundstr WS (1.5 s deadline) then fallback to /req; deep links open the tiers dialog immediately and surface relay errors with Retry.

## Transport flow

1. The client always **prefers the isolated Fundstr relay**
   (`wss://relay.fundstr.me`).
2. Every query begins with a WebSocket REQ/EOSE round-trip. Connections are
   bounded by a ~1.5&nbsp;s timeout to keep the UI responsive.
3. If the socket cannot be opened or returns no events, the client
   automatically performs the same query over HTTP:
   `https://relay.fundstr.me/req?filters=…`.
4. When Fundstr returns no data the client **can** fan out across a vetted pool
   of public relays (`relay.primal.net`, `relay.fundstr.me`, `nos.lol`,
   `relay.damus.io`). This behaviour is opt-in via
   `allowFanoutFallback`—Fundstr-first flows (including Creator Studio load /
   refresh) stay pinned to the first-party relay unless callers explicitly pass
   that flag.

All fetches, including the service-worker passthrough, use
`cache: 'no-store'` together with `cache-control: no-cache` headers so the
responses are never cached.

Publishing Nutzap events uses a direct HTTP POST to
`https://relay.fundstr.me/event`. The relay responds with a JSON payload shaped
like `{ ok, id, accepted, message }`. Callers must treat a publish as successful
**only** when `accepted === true`. When `accepted` is false the provided relay
`message` should be surfaced to the user verbatim.

**Important:** before publishing, always convert signed `NDKEvent` instances to
plain NIP-01 events (`{id,pubkey,created_at,kind,tags,content,sig}`) and let the
client-side guard reject malformed payloads. Fundstr continues to prefer the
first-party websocket with the short timeout above and transparently falls back
to `GET /req` when it cannot return data. Deep links such as
`/creator/:npubOrHex` immediately open the tiers dialog, showing a spinner until
profile/tier data resolves and surfacing the relay error banner + retry control
if the lookup fails.

## Key normalisation

All helpers accept both hex and npub style keys. `toHex(pubOrNpub)` converts the
input to a 64-character lowercase hex string and throws for invalid values.
`queryNostr` automatically normalises any `authors` filters to hex before
sending requests, which keeps Fundstr and public relays happy.

## Replaceable event handling

The relay layer implements deduplication and NIP-01 replaceable semantics:

- `dedup` removes duplicate events by ID.
- `normalizeEvents` coalesces replaceable kinds (`0/3/10000-19999`) so only the
  latest `{kind,pubkey}` wins.
- Parameterised replaceable kinds (`30000-39999`) are keyed by
  `{kind,pubkey,d}` where the `d` tag is read from event tags.

Helpers are exposed for consumers that want the latest Nutzap profile and tier
definitions: `queryNutzapProfile` (kind `10019`) and `queryNutzapTiers` (kind
`30019` with `d:"tiers"`). Both helpers accept npub/hex input and take an
optional `{ fanout, allowFanoutFallback }` bag. Creator Studio calls them with
the default Fundstr-only behaviour, while discovery-driven flows (Find
Creators, creator store refresh) opt in to fan-out by passing relay hints and
`allowFanoutFallback: true`.

## Discovery fallbacks

When Fundstr cannot serve a Nutzap profile the client asks the public pool for a
kind `10002` relay list (NIP-65). Any discovered URLs are queued as additional
targets for subsequent `queryNostr` calls. Screens such as “Find Creators” and
the creators store feed these hints back into the relay layer so parameterised
events (tiers) can be sourced from a creator’s preferred relays. We also honour
any `relay` tags present on the Nutzap profile (`kind:10019`) so a creator’s
self-declared relays are queried before falling back to the public pool.

## Service worker considerations

`src-pwa/custom-service-worker.js` pins `/req` and `/event` requests to a
`NetworkOnly` strategy. Together with the explicit `no-store` fetch options this
guarantees that relay responses are never cached inside the service worker,
which is required to always observe the most recent replaceable events.

## QA checklist

- Establish a successful websocket session and confirm the connection chip in
  the Nutzap profile screen flips to **Connected** while a success entry lands in
  the activity log.
- Trigger repeated connection failures (e.g. point the workspace to an
  unreachable relay) and confirm the inline warning beside the Connect button
  summarizes the latest error and escalates to a “needs attention” state with
  guidance to verify the workspace key or fall back to HTTP.
- While “needs attention” is active, ensure publish controls are disabled and
  the diagnostics banner nudges the operator to resolve the relay transport.
