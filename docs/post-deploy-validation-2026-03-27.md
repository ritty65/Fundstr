# Post-Deploy Validation - 2026-03-27

## Scope

- Production deploy validation after merging:
  - PR `#1414` - `fix(app): stop wallet relay bootstrap thrash`
  - PR `#1415` - `fix(app): keep passive wallet and relay probes lightweight`
- Production deploy marker at validation time:
  - `env=production`
  - `sha=44e647c36d8b4a6bb11a08c283ee9b589fe8aa20`
  - `ref=main`
  - `built_at=2026-03-27T09:06:10Z`
  - `run_id=23638879461`

## Automated Validation Completed

### Repo validation

- `pnpm test`
  - `130` test files passed
  - `688` tests passed
  - `1` skipped
- `pnpm run build`
  - passed

### Production and canary validation

- `BASE_URL=https://fundstr.me SMOKE_EXPECT_ENV=production ./scripts/smoke-tests.sh`
  - passed
- `BASE_URL=https://fundstr.me SYNTHETIC_CANARY_ARTIFACT_DIR=artifacts/prod-synthetic-canary-20260327 node scripts/synthetic-staging-journey.mjs`
  - passed
- `CANARY_MINT_URLS="https://mint.minibits.cash/Bitcoin" CANARY_REQUIRE_MINTS=1 CANARY_ARTIFACT_DIR=artifacts/external-relay-mint-canary-20260327 node scripts/external-relay-mint-canary.mjs`
  - passed

### Local browser E2E coverage

Run with Chromium against the local E2E app:

- `test/e2e/onboarding-happy-path.spec.ts` - passed
- `test/e2e/wallet-startup-fresh-account.spec.ts` - passed (`3/3`)
- `test/e2e/wallet-flows-happy-path.spec.ts` - passed (`4/4`)
- `test/e2e/messenger-local-echo.spec.ts` - passed (`2/2`)
- `test/e2e/messenger-subscription-reconcile.spec.ts` - failed (`1/1`)

Notes on the failing messenger E2E:

- Failure was `expect(myPubkey).toBeTruthy()` in `test/e2e/messenger-subscription-reconcile.spec.ts`
- This appears to be a stale test harness issue: the test uses `bootstrapAndCompleteOnboarding(page)` without creating a Nostr identity first, then expects `getNostrPubkey()` to exist
- This failure did not affect the production deploy or the relay hardening changes validated elsewhere

## Live Browser Validation

## Fresh generated production identity

- A fresh production test identity was generated during validation
- Generated test `npub`:
  - `npub1ctj5qn6vag6t4xv0075qgkytdrqlqpq5ly7v753799zymyglr5mszn2gfg`
- A second synthetic fresh browser-state identity was also generated for route checks:
  - `npub1qxrqx9qew0gu5k7a4sxl9g3336z64sr9t4h7zxcpnqf9z8lvnlpq0g47pz`

No funds were added and no sensitive secret was persisted in this report.

### Welcome flow observations

- Generating a fresh Nostr key worked in production
- The Nostr backup dialog appeared and was dismissible
- During headless production validation, the welcome flow remained on the backup step until the backup acknowledgement was satisfied
- Before finishing onboarding, the welcome route still produced substantial background relay and phonebook traffic:
  - `22` websocket connection attempts
  - `46` relay HTTP requests
  - `24` phonebook requests to `/find_profiles.php`

This means the signer-bootstrap regression is improved, but passive background data warming is still active during welcome browsing.

### Wallet route observations with fresh simulated browser state

- Route loaded successfully at `/wallet`
- Observed empty-wallet state with mint setup UI:
  - `Join a mint`
  - `Add mint`
  - `Receive ecash`
  - `Discover mints`
- Timing:
  - wallet route reached and stabilized in about `9.4s` in headless production validation
- Background network activity during the first `8s` on `/wallet`:
  - `8` websocket connection attempts
  - all unique websocket URLs were `wss://relay.fundstr.me/`
  - `60` relay HTTP requests
  - `24` phonebook requests

Interpretation:

- The shipped fixes stopped the worst signer-backed wallet bootstrap path
- The wallet route is still not quiet on a fresh session because other background preload systems are warming creator/profile data immediately

### Discover mints observations

- `Discover mints` completed successfully on production with a fresh simulated browser state
- Outcome:
  - `recommendations-visible`
- Duration to visible recommendations:
  - about `13.5s`
- Websocket activity during this phase:
  - `9` unique websocket endpoints opened
  - included:
    - `wss://relay.fundstr.me/`
    - `wss://relay.damus.io/`
    - `wss://relay.primal.net/`
    - `wss://purplepag.es/`
    - `wss://nos.lol/`
    - `wss://nostr.mom/`
    - `wss://relay.snort.social/`
    - `wss://nostr.wine/`
    - `wss://nostr.bitcoiner.social/`
- One warning was observed:
  - `wss://relay.damus.io/` returned a websocket handshake `503`

Interpretation:

- Discover mints now completes instead of hanging indefinitely
- It still depends on a broad relay fan-out and is not yet what would be called "snappy"

### Messenger route observations

- Route loaded successfully at `/nostr-messenger`
- Timing:
  - route stabilized in about `8.3s`
- UI state on the fresh synthetic identity:
  - `No active conversations.`
  - `Choose a conversation`
  - `Open chats`
  - `Retry connection`
- Body text also included:
  - `Still trying to reach the Nutzap relay…`
- Background activity in the first `8s`:
  - `18` websocket connection attempts
  - relay fan-out across `9` unique websocket endpoints
  - `47` relay HTTP requests
  - `24` phonebook requests

Interpretation:

- The messenger route no longer crashes during this validation path
- Relay-heavy routes are still intentionally relay-heavy, but there is still significant startup fan-out and retry noise

## What Looks Fixed

- Production deployed the intended `main` SHA successfully
- Automated smoke, synthetic canary, and external mint/relay canary all passed
- Read-only NDK behavior is improved enough that:
  - production smoke is stable
  - Discover mints completes instead of stalling forever
  - wallet passive loads no longer show the original signer-bootstrap behavior as the dominant issue
- A fresh generated Nostr identity can still be created successfully in production

## What Still Looks Noisy

- Passive browsing is still not quiet enough
- Production route validation still showed large background fetch volume even without active wallet or messenger interaction
- The remaining passive churn is most likely coming from overlapping creator/profile preload systems, not the signer bootstrap bug that was just fixed

## Most Likely Remaining Sources Of Churn

These repo locations are the strongest remaining suspects based on the live network pattern and code review:

- `src/boot/fundstr-preload.ts`
  - immediately hydrates featured creators and discovery bundles in the background
- `src/boot/prefetch-featured-creators.ts`
  - triggers `creatorsStore.loadFeaturedCreators()` during deferred startup
- `src/layouts/MainLayout.vue:465`
  - calls `creatorCacheService.start()` on mount
- `src/nutzap/creatorCache.ts`
  - iterates through `FEATURED_CREATORS` and calls `fetchFundstrProfileBundle()` for each creator

These systems appear additive and likely explain the remaining relay HTTP and phonebook volume during passive page loads.

## Recommended Next Fix Batch

1. Gate featured creator warming by route or intent

   - do not preload creator bundles on `/welcome` or fresh `/wallet` idle load
   - defer until the user visits discovery, supporters, creator profile, or another route that benefits from the cache

2. Remove duplicate background warmers

   - choose one featured-creator warmup strategy instead of running all of:
     - `fundstr-preload`
     - `prefetch-featured-creators`
     - `creatorCacheService.start()`

3. Add a passive-browsing regression check

   - introduce a Playwright diagnostic that asserts bounded websocket and relay-request counts for:
     - fresh `/welcome`
     - fresh `/wallet`
     - `/wallet` after generated local key onboarding

4. Tighten Discover mints success budget
   - keep the current fallback behavior
   - reduce the fan-out budget and add a target latency threshold for recommendations on healthy relay conditions

## Bottom Line

- The release is not catastrophic and production is up
- The just-merged fixes did land and improved the original wallet/signer bootstrap issue
- Production is healthier than before, but it is not yet "fully quiet"
- The next likely performance win is to stop passive featured-creator/profile warming from running on every fresh route load

## Follow-up Local Hardening

After the production validation above, a local follow-up hardening pass was prepared in the clean main-based worktree to cut the remaining passive preload noise before the next ship.

### Local code changes prepared

- removed the `prefetch-featured-creators` boot file from startup wiring in `quasar.config.js` and `src/main.js`
- stopped `MainLayout` from starting `creatorCacheService` on every app mount
- removed automatic featured creator warming from `src/boot/fundstr-preload.ts`
- gated passive profile auto-fetching in `src/components/UserInfo.vue`
- deferred identity profile warming on passive routes in `src/stores/nostr.ts`
- narrowed `subscribeToNutzaps()` to fundstr-only read-only mode in `src/stores/nostr.ts`
- added a faster staged mint discovery path in `src/components/MintSettings.vue`
- made `src/stores/nostr.ts` mint discovery accept tunable timeout and limit options for quick-path discovery
- added a two-tier mint discovery path:
  - fast `fundstr-only` pass first
  - short broader relay pass second
  - cached or curated results shown immediately if live discovery stays slow
- added regression coverage in:
  - `test/boot/fundstr-preload.boot.spec.ts`
  - `test/components/UserInfo.behavior.spec.ts`
  - `test/stores/nostr.signers.spec.ts`
  - `test/stores/nostr.fetchMints.spec.ts`

### Local validation after the follow-up patch

- `pnpm test`
  - `131` test files passed
  - `696` tests passed
  - `1` skipped
- `pnpm run build`
  - passed

### Local browser diagnostics after the follow-up patch

Using a fresh synthetic browser state against the local app build:

- `/wallet`
  - relay HTTP requests: `0`
  - phonebook requests: `0`
  - websocket attempts still fan out to the default relay set (`9` unique relay endpoints plus the dev-server socket)
- `Discover mints`
  - still succeeds
  - recommendations visible in about `4.3s` on a fresh synthetic state
  - recommendations visible in about `51ms` when cached recommendations already exist
  - websocket fan-out remains broad by design for discovery
- `/nostr-messenger`
  - phonebook requests dropped to `0`
  - websocket fan-out remains broad, which is expected for messenger startup today

### Interpretation of the local follow-up

- the passive phonebook and relay-HTTP churn identified in the post-deploy report is materially reduced by the local hardening patch
- the remaining startup noise is now mostly websocket fan-out, not the old signer-bootstrap or phonebook-fallback problem
- mint discovery is materially more responsive now because it no longer blocks the UI on two consecutive live relay attempts before showing usable recommendations
- that remaining websocket fan-out likely needs a separate pass focused on default read-relay connection policy, not another phonebook/cache preload cleanup
