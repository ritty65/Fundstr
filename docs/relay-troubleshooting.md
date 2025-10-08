# Relay connectivity issues analysis

## Symptoms seen in staging
- Browser devtools show repeated `Firefox can’t establish a connection to the server at wss://relay.fundstr.me` together with the same message for public relays such as `relay.snort.social` and `nos.lol`.
- HTTP fallbacks to `https://relay.fundstr.me/event` fail the CORS preflight: the response omits the `Access-Control-Allow-Headers: content-type` permission so Firefox aborts the `fetch` with `NetworkError`.
- The Creator Studio console prints `No active mint. This should not happen. switching to first one.` which comes from the Pinia mint store when it cannot resolve an active mint.

Those symptoms line up with the way Fundstr’s Nostr layer is wired: the SPA assumes the first-party relay is reachable and will short-circuit if that host is down or blocks cross-origin requests.

## Relay debug logging
- Relay diagnostics for disconnects and heartbeat stalls are gated by the `cashu.settings.relayDebugLogsEnabled` flag in the settings store.【F:src/stores/settings.ts†L5-L74】【F:src/boot/ndk.ts†L83-L129】
- Development and test builds keep the toggle enabled by default. To force-enable the logs in other environments, set `VITE_RELAY_DEBUG_LOGS=true` before building or flip the flag at runtime via the Pinia settings store (e.g. `useSettingsStore().relayDebugLogsEnabled.value = true`).【F:src/stores/settings.ts†L5-L74】【F:src/boot/ndk.ts†L83-L129】

## How the client is configured
- The primary relay endpoints are hard-coded to `wss://relay.fundstr.me` / `https://relay.fundstr.me` and copied into every default relay list (`DEFAULT_RELAYS`, `FALLBACK_RELAYS`, `FREE_RELAYS`).【F:src/config/relays.ts†L1-L33】
- The Nutzap stack reads the Vite env overrides but still defaults to that Fundstr relay and derives the HTTP `/req` and `/event` endpoints from it.【F:src/nutzap/relayConfig.ts†L1-L36】【F:src/nutzap/relayEndpoints.ts†L1-L86】
- `getNutzapNdk` bootstraps an `NDK` instance with `explicitRelayUrls: [NUTZAP_RELAY_WSS]`, so Creator Studio can only talk to the primary relay unless it reconnects to a different URL.【F:src/nutzap/ndkInstance.ts†L1-L15】
- The Creator Studio relay console (`useRelayConnection`) drives a single WebSocket connection to the configured relay, retries with exponential backoff, and records the status that surfaces in the UI.【F:src/nutzap/onepage/useRelayConnection.ts†L1-L206】
- If the WebSocket cannot come up, publish operations fall back to `POST https://relay.fundstr.me/event` with the JSON body and `content-type: application/json` header.【F:src/nutzap/relayClient.ts†L531-L590】
- Read-side fallbacks query `GET https://relay.fundstr.me/req?filters=…` with the same Accept header; the helper logs and bails if the HTTP response is not JSON.【F:src/nutzap/relayClient.ts†L819-L899】
- Separately, the Pinia mint store logs “No active mint…” whenever it has at least one mint in local storage but `activeMintUrl` is blank; it then tries to promote the first mint as a stop-gap.【F:src/stores/mints.ts†L239-L251】

## Likely root causes
1. **Primary relay is unreachable over WebSocket.** Because every layer prefers `wss://relay.fundstr.me`, a TLS, DNS, or firewall issue on that host produces the “can’t establish a connection” spam you are seeing. The retry logic in `useRelayConnection` and the watchdog in `src/js/nostr-runtime.ts` keep probing the relay, so the console fills up with reconnect attempts.【F:src/nutzap/onepage/useRelayConnection.ts†L171-L207】【F:src/js/nostr-runtime.ts†L150-L236】 Verify that the relay is listening for WebSocket upgrades on port 443, serves the correct certificate chain, and is not rate-limiting or IP-blocking the staging origin.
2. **CORS on `POST /event` is misconfigured.** The publish fallback sets `content-type: application/json`, which forces a preflight. The relay must respond to `OPTIONS /event` with `Access-Control-Allow-Origin: https://staging.fundstr.me` (or `*`) and `Access-Control-Allow-Headers: content-type`. Without those headers, Firefox raises the exact CORS error you captured. Matching `Access-Control-Allow-Methods: POST, OPTIONS` is also required for browsers to send the follow-up POST.【F:src/nutzap/relayClient.ts†L531-L590】
3. **Public fallbacks appear unhealthy too.** The Nostr store registers Fundstr plus vetted public relays for reads and publishes.【F:src/config/relays.ts†L5-L27】【F:src/stores/nostr.ts†L44-L121】 If the browser shows failures for snort/damus as well, check whether the environment is blocking WebSockets entirely (corporate proxies, browser privacy settings, or CSP). Running `wscat -c wss://relay.snort.social` from the same network is a quick sanity check.
4. **Mint selection bootstrapping.** The Creator Studio flows call into the mint store to read active mint data (for P2PK diagnostics, etc.). When a new operator has no `cashu.activeMintUrl`, the store logs the “No active mint…” message before it promotes the first mint. This is harmless but noisy; we can either seed a default mint or quiet the log once we confirm the promotion succeeds.【F:src/stores/mints.ts†L239-L251】
5. **Service worker still whitelists the old Primal relay.** The injected Workbox route only matches `https://relay.primal.net/req|/event`, so requests to `relay.fundstr.me` are no longer explicitly forced to network-only with `cache: 'no-store'`. While browsers should still bypass the HTTP cache because the fetch options set `cache: 'no-store'`, updating the service worker keeps behaviour consistent if you migrate back to an offline context.【F:src-pwa/custom-service-worker.js†L37-L45】

## Remediation checklist
- **Relay health:** Confirm `relay.fundstr.me` accepts WebSocket connections (try `wscat` or `openssl s_client -connect relay.fundstr.me:443 -servername relay.fundstr.me` and check for the Nostr handshake). Make sure the host proxies upgrades to the Nostr backend and is reachable from staging.
- **CORS headers:** Adjust the relay (or its reverse proxy) to return the appropriate CORS headers for both `OPTIONS` and actual `POST /event` requests. A minimal NGINX stanza would be:
  ```nginx
  add_header Access-Control-Allow-Origin "https://staging.fundstr.me" always;
  add_header Access-Control-Allow-Headers "content-type" always;
  add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
  if ($request_method = OPTIONS) {
    return 204;
  }
  ```
  This mirrors what the SPA expects in `publishViaHttp` and prevents the Firefox errors.【F:src/nutzap/relayClient.ts†L531-L590】
- **Fallback relays:** Once Fundstr relay is healthy, validate that reads/publishes succeed with a known public relay by temporarily overriding `VITE_NUTZAP_PRIMARY_RELAY_WSS` to `wss://relay.damus.io` and ensuring the UI shows a successful connection. That isolates whether the problem is global or Fundstr-specific.【F:src/nutzap/relayConfig.ts†L11-L34】
- **Mint UX:** Decide whether to seed a default mint or downgrade the “No active mint” log to a debug-level message so Creator Studio operators are not alarmed.【F:src/stores/mints.ts†L239-L251】
- **Service worker host list:** Update `src-pwa/custom-service-worker.js` so the network-only rule covers `relay.fundstr.me` as well. This avoids stale caches if the relay ever sits behind a CDN that honours cache headers.【F:src-pwa/custom-service-worker.js†L37-L45】

Addressing the WebSocket reachability and CORS headers should resolve the critical Creator Studio failures; the remaining items are quality-of-life improvements to reduce noise and keep the relay migration tidy.
