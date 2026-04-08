# Relay Stability Hardening - 2026-03-26

## What was happening

- The app felt slow, spammed Firefox with repeated `wss://relay.fundstr.me` errors, and sometimes kept asking the signer extension for `getPublicKey()` more often than expected.
- `Discover mints` could spin forever when relay reads stalled.
- The browser tab icon used placeholder assets instead of Fundstr branding.
- The donation popup worked, but it felt dense, generic, and less trustworthy than the rest of the UI.

## Live relay architecture confirmed on production

- Public edge is `Caddy`, not `nginx`.
- `nginx` is installed but stale; it cannot bind `80/443` because `caddy` already owns those ports.
- Production relay flow is:
  - `https://relay.fundstr.me` and `wss://relay.fundstr.me`
  - `Caddy -> 127.0.0.1:7777 -> strfry`
- Discovery/indexer sidecars are behind the same host:
  - `/discover/*`, `/nutzap/*`, `/health` -> `127.0.0.1:8789`
  - `/index/*`, `/api/v1/*` -> `127.0.0.1:8791`
  - `/event`, `/req` -> `127.0.0.1:8788`
- `strfry` is alive as a process on `127.0.0.1:7777`, even though `strfry.service` is currently disabled/inactive. That means the process is being launched outside the systemd unit and should be normalized later.

## Root causes

### 1. The frontend was over-connecting to the relay

Several places were eagerly bootstrapping relay work even during passive browsing:

- `src/layouts/MainLayout.vue`
- `src/layouts/FullscreenLayout.vue`
- `src/boot/fundstr-preload.ts`
- `src/boot/fundstrRelay.ts`
- `src/boot/ndk.ts`

That meant small relay hiccups were amplified into visible UI slowness and websocket error noise.

### 2. Read-only browsing was forcing required relay connections

The read-only NDK path was still calling the required-DM relay hook, which is appropriate for publish/DM reliability but too aggressive for simple browsing and discovery.

### 3. Read-only NDK boot still touched the signer and wallet page warmed the wrong client

- `createNdk()` was still calling `initSignerIfNotSet()` even when callers explicitly asked for `requireSigner: false`.
- `WalletPage.vue` also eagerly called `useNdk()` during mount just to warm background features.

That combination triggered unnecessary `getPublicKey()` calls and could still build a signed NDK with reconnect/watchdog behavior even on the wallet page.

### 4. Mint discovery had no timeout and weak loading-state cleanup

- `src/stores/nostr.ts` used `ndk.fetchEvents(...)` with no timeout.
- `src/components/MintSettings.vue` turned on `discoveringMints` before async work but did not guard the whole flow with `finally`.

If the relay stalled, the spinner could stay active indefinitely.

### 5. Favicon wiring pointed to placeholder assets

`index.html` referenced `public/icons/16x16.png`, `32x32.png`, `96x96.png`, `128x128.png`, plus `public/favicon.ico`, but those files were placeholders rather than the real Fundstr icon set.

## What changed

### Relay and startup hardening

- `src/boot/fundstr-preload.ts`
  - removed eager `initNdkReadOnly({ fundstrOnly: true })`
  - switched preload work to idle-time discovery cache warming only
- `src/boot/fundstrRelay.ts`
  - removed the unconditional boot-time relay preconnect
- `src/boot/ndk.ts`
  - stopped forcing `mustConnectRequiredRelays()` for read-only browsing mode
  - honors `requireSigner: false` so read-only callers no longer trigger signer bootstrap
  - uses a short, single-attempt connect window for read-only relay work
  - no longer starts the reconnect watchdog for read-only NDK instances
- `src/layouts/MainLayout.vue`
  - removed eager signer/relay bootstrap on mount
  - scoped relay banner + reconnect behavior to relay-heavy routes only
  - reconnects immediately when a relay-heavy route becomes active
- `src/layouts/FullscreenLayout.vue`
  - removed eager signer/relay bootstrap on mount
- `src/pages/WalletPage.vue`
  - removed eager `useNdk()` warming from mount so the wallet page no longer creates a signed relay client just by loading
- `src/stores/npubcash.ts`
  - NIP-98 helpers now use read-only NDK context for signing-only flows instead of forcing a signed relay bootstrap

### Mint discovery hardening

- `src/stores/nostr.ts`
  - added a 5-second timeout around live mint discovery
- `src/components/MintSettings.vue`
  - added `try/finally` so loading always clears
  - reduced blind retry count
  - added fallback to curated `/mints.json`
  - added fallback to cached recommendations
  - surfaces warning copy when fallback data is shown

### Browser tab branding

- `index.html`
  - now points to the real Fundstr favicon assets
  - adds `shortcut icon`, `apple-touch-icon`, and `theme-color`
- `public/find-creators.html`
  - now uses the same branded tab icons

### Donation modal UX

- `src/components/DonateDialog.vue`
  - stronger creator-focused header
  - close button in the header
  - mint status chip instead of a raw full URL feel
  - quick amount chips
  - advanced options collapsed behind an expansion panel
  - clearer footer guidance and more honest CTA wording
  - better mobile presentation with maximized dialog behavior

## Tests run

### App-side validation

- `pnpm vitest run test/stores/nostr.fetchMints.spec.ts test/boot/ndk.boot.spec.ts test/vitest/__tests__/relayClient.spec.ts`
- `pnpm build`

### New/extended test coverage

- mint discovery times out instead of hanging forever
- mint discovery falls back to the curated catalog when relay reads stall
- read-only NDK bootstrap does not force required relay connections
- read-only NDK bootstrap skips signer bootstrap and watchdog startup

## Production diagnostics that confirmed the infra state

Useful commands that were run against the VPS:

```bash
sudo ss -ltnp | grep -E ':80|:443|:7777|:8788|:8789|:8791'
sudo systemctl status caddy --no-pager -l
sudo cat /etc/caddy/Caddyfile
curl -i https://relay.fundstr.me
curl -i https://relay.fundstr.me/health
```

Key findings:

- `caddy` owns `80/443`
- `strfry` listens on `127.0.0.1:7777`
- `relay.fundstr.me/health` returns discovery-side health JSON
- direct `https://relay.fundstr.me` returns the Strfry NIP-11 page as expected

## Remaining infra cleanup recommended later

These are not blockers for the current app fix, but they should be cleaned up:

1. normalize how `strfry` is started
   - right now `strfry.service` is inactive while the process is running anyway
   - move production relay startup fully under systemd or clearly document the custom launcher
2. remove or archive stale `nginx` relay configs
   - they create confusion and noisy bind errors
3. verify Caddy websocket behavior during real browser sessions
   - tail `journalctl -u caddy -f` while reproducing reconnect issues
4. consider adding a small relay health endpoint/check for websocket handshake success, not just HTTP health

## Deployment checklist for this hardening batch

1. push the branch
2. open PR to `main`
3. merge after checks pass
4. run the production deploy workflow
5. hard refresh the live app and verify:
   - landing pages do not hammer the relay immediately
   - `Discover mints` resolves or falls back cleanly
   - favicon shows the Fundstr logo in browser tabs
   - donation popup feels clearer on desktop and mobile

## Recommended post-deploy smoke test

1. load the home page and a public creator profile
2. open browser DevTools and confirm websocket noise is dramatically reduced
3. click `Discover mints`
4. verify it either:
   - succeeds live, or
   - falls back with a warning and stops loading
5. open the donation modal and verify:
   - creator context is visible
   - mint chip shows status
   - quick amount chips work
   - advanced section expands/collapses cleanly
