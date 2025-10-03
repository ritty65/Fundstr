# Nutzap Profile + Tiers (Fundstr Relay)

This page publishes a creator's Nutzap payment profile (kind **10019**) and the
companion tier catalog (kinds **30019** canonical, **30000** legacy fallback)
to the Fundstr relay at `relay.primal.net`. The helper module
`src/pages/nutzap-profile/nostrHelpers.ts` centralises relay endpoints, signing,
and read/write helpers so the page can provide production-grade UX around the
Nostr primitives.

## Event contracts

### Nutzap Profile — kind 10019

* **Tags**
  * Required: `['t','nutzap-profile']`, `['client','fundstr']`
  * For each mint: `['mint','<https-url>','sat']`
  * Optional but encouraged: relay hints `['relay','wss://relay.primal.net']`,
    canonical link to the tier PRE `['a','<kind>:<pubkey>:tiers']`,
    `['name','…']`, `['picture','…']`
* **Content** — JSON string:

  ```json
  {
    "v": 1,
    "p2pk": "<hex Cashu P2PK>",
    "mints": ["https://mint.example", "https://mint2.example"],
    "relays": ["wss://relay.primal.net", "wss://another.example"],
    "tierAddr": "30019:<author_hex>:tiers"
  }
  ```

  `tierAddr` switches to `30000:<author_hex>:tiers` when the UI toggle is set
to legacy mode.

### Nutzap Tiers — kinds 30019 / 30000

* **Tags**
  * Required PRE selector: `['d','tiers']`
  * Optional: `['t','nutzap-tiers']`, `['client','fundstr']`
* **Content** — JSON string (never a bare array):

  ```json
  {
    "v": 1,
    "tiers": [
      {
        "id": "alpha",
        "title": "Supporter",
        "price": 2100,
        "frequency": "monthly",
        "description": "2k sats per month",
        "media": ["https://cdn.example/banner.png"]
      }
    ]
  }
  ```

  The helpers coerce the local `Tier` model into this minimal wire format and
  accept both string and object media entries when parsing events from the
  relay.

## Transport strategy

1. **Reads** use `fundstrRelayClient.requestOnce(filters, options)`.
   * Reuse the shared WebSocket connection to send
     `['REQ', <subId>, ...filters]`.
   * Collect `['EVENT', …]` frames until the relay replies with
     `['EOSE', <subId>]` or a **3 second** timeout elapses (see
     `WS_FIRST_TIMEOUT_MS`).
   * When no events arrive (or the request times out), fall back to
     `GET https://relay.primal.net/req?filters=<urlencoded JSON>` with the
     `HTTP_FALLBACK_TIMEOUT_MS` deadline and return the JSON body
     (`{ ok: true, events:[…] }`).
2. **Writes** call `publishNostrEvent(template)`.
   * Sign the template either via `window.nostr.signEvent` or the NDK signer.
   * Validate the signed event with `isNostrEvent` before sending.
   * POST the event to `https://relay.primal.net/event` and only treat the
     publish as successful when the relay acknowledges with `{"ok":true,
     "accepted":true, ...}`.

The Nutzap page keeps the author input (npub or hex) and the tier kind toggle
visible so the user always knows which PRE coordinate will be written.

## Verification snippets

Replace `$AUTH` with the 64-char lowercase pubkey that signed the events.

```bash
# Latest Nutzap profile (kind 10019)
curl -sS --get 'https://relay.primal.net/req' \
  --data-urlencode 'filters=[{"kinds":[10019],"authors":["'$AUTH'"],"limit":1}]' | jq .

# Latest Nutzap tiers (canonical 30019)
curl -sS --get 'https://relay.primal.net/req' \
  --data-urlencode 'filters=[{"kinds":[30019],"authors":["'$AUTH'"],"#d":["tiers"],"limit":1}]' | jq .
```

If canonical tiers are missing (legacy data only), change `30019` to `30000` in
the second command.

## Troubleshooting checklist

* ✅ **Relay ack** — ensure the POST response contains `"accepted": true`.
  Any other status bubbles up to the UI via `notifyError`.
* ✅ **Author hygiene** — the helpers normalise npub input to 64-char lowercase
  hex before building filters or tier addresses.
* ✅ **Tier selector** — canonical reads always include `"#d":["tiers"]` so
  legacy events with different PRE keys cannot pollute the results.
* ✅ **Transport fallback** — watch the network panel for the initial WebSocket
  subscription. If no events arrive before timeout you should see an HTTP
  fallback request with identical filters.
* ✅ **Content parity** — when reads return unexpected data, run the curl
  commands above to compare the stored JSON against the UI expectations.

