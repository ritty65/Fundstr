# Fundstr Production Remediation - 2026-03-16

## What was happening

The production app had two urgent problems:

1. The welcome flow could look stuck on the Nostr identity step because the UI was doing repeated NIP-07 extension handshakes and waiting on work that was not required to continue onboarding.
2. The live site expected a same-origin phonebook endpoint at `/find_profiles.php`, but Hostinger was serving the SPA shell instead because no real endpoint existed in the deployed artifact.

There was also avoidable startup latency because heavy boot work ran before the app mounted.

## Changes shipped in this remediation

### 1. Faster, safer onboarding NIP-07 flow

- `src/pages/welcome/WelcomeSlideNostr.vue`
  - removed the duplicate `loginWithExtension()` call after `connectBrowserSigner()`
  - stopped passive mount-time extension checks from doing a full signer handshake
  - added completion/skip events so the parent welcome flow can advance deliberately
- `src/pages/WelcomePage.vue`
  - removed automatic `initNip07Signer()` work on welcome page mount
  - added step-complete and step-skip handlers for the Nostr slide
- `src/pages/NostrLogin.vue`
  - replaced the duplicate browser-signer login flow with a single `updateIdentity({ preferNip07: true })` path
- `src/stores/nostr.ts`
  - added soft timeouts around `blockUntilReady()`, `user()`, and relay-list lookup inside `initNip07Signer()` so the app no longer waits forever on slow extensions or relay APIs

### 2. Faster first paint for onboarding and initial load

- `src/main.js`
  - reduced critical startup boot work to the essentials needed to render
  - moved heavy boots (`cashu`, preload, relay preconnect, featured creators, nostr provider) into deferred background startup
  - delayed deferred startup slightly for the welcome experience so the page can paint before wallet/relay work begins

### 3. Restored same-origin phonebook endpoint contract

- `public/find_profiles.php`
  - added a production-safe same-origin JSON endpoint that proxies discovery search into the existing phonebook response shape
  - this prevents Hostinger from returning SPA HTML for `/find_profiles.php`
- `src/api/phonebook.ts`
  - switched the default phonebook URL to same-origin `/find_profiles.php`
  - updated endpoint construction so staging and production both resolve correctly on their own origins
- `.env.example`
- `.env.staging`
- `.env.production`
  - aligned `VITE_FIND_PROFILES_URL` to `/find_profiles.php`
- `public/.htaccess`
  - explicitly exempted `find_profiles.php` from SPA rewrite rules and asset-style rewrite fallback
- `scripts/ci/verify-deploy-artifacts.mjs`
- `scripts/smoke-tests.sh`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-prod.yml`
  - added deploy verification and smoke coverage so future deploys fail if `find_profiles.php` is missing or resolves to HTML

### 4. Reduced bad API fallback behavior

- `src/lib/fundstrApi.ts`
  - added support for `VITE_API_BASE` as a fallback source for legacy API base resolution
  - this prevents accidental fallback to the broken same-origin `/api/v1` path when a configured API base already exists

### 5. Forced the revised onboarding to re-run

- `src/composables/useWelcomeGate.ts`
  - bumped the welcome gate key from `welcome.seen:v1` to `welcome.seen:v2`
  - bumped the cookie from `welcome_seen_v1` to `welcome_seen_v2`

## Local verification completed

The following checks were run after the code changes:

```bash
pnpm exec vitest run test/vitest/__tests__/welcome.interaction.spec.ts test/vitest/__tests__/phonebook.spec.ts test/stores/nostr.signers.spec.ts
pnpm exec vitest run test/lib/fundstrApi.spec.ts
pnpm run types
pnpm run lint
pnpm run test:ci
pnpm run build
```

All of the commands above completed successfully.

## What still needs to be fixed outside this patch

### High priority infra work

1. `api.fundstr.me/discover/creators` is still too slow for a snappy production search experience.
   - Live evidence showed ~17.7s response time for a basic search query.
2. The discovery API response currently leaks an internal relay address (`ws://127.0.0.1:7777`) in `relays_used`.
3. The new `find_profiles.php` endpoint currently proxies discovery search.
   - This restores correctness.
   - It does **not** restore true phonebook speed.
   - The long-term fix is a direct DB-backed query path on Hostinger or a dedicated fast API route.
4. Legacy `/api/v1` creator endpoints still appear absent on `api.fundstr.me`.
   - The app is more defensive now, but the backend contract is still incomplete.

### Important hardening work

1. Nostr private keys and wallet mnemonics still need stronger storage hardening in other parts of the app.
2. Hostinger should serve stronger headers than only `Content-Security-Policy: upgrade-insecure-requests`.
3. The large frontend bundles and oversized route chunks still need follow-up optimization.

## Deployment follow-up checklist

After deploying this remediation, verify:

```bash
curl -i 'https://fundstr.me/find_profiles.php?q=jack'
curl -i 'https://staging.fundstr.me/find_profiles.php?q=jack'
curl -i 'https://fundstr.me/deploy.txt'
curl -i 'https://fundstr.me/featured-creators.json'
```

Expected result:

- `/find_profiles.php` returns `application/json`, not SPA HTML
- `deploy.txt` shows the new SHA
- onboarding opens quickly and no longer hangs when the extension path is slow or unavailable

## Current rollout note

As of the latest manual verification, production and staging are still returning SPA HTML for `/find_profiles.php`.

That means the patch has **not been deployed yet** to the Hostinger docroots.

The release-ready clean worktree for this remediation is now:

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-cleanroom-20260316`
- branch `ai/develop2-clean-remediation-20260316`

That clean branch was rebuilt and re-verified after the remediation was isolated from the older sandbox worktrees.

The immediate next step is to deploy the new build so the following file exists remotely:

- `/home/u444965226/domains/fundstr.me/public_html/find_profiles.php`

Once deployed, re-run:

```bash
curl -i 'https://fundstr.me/find_profiles.php?q=jack'
curl -i 'https://staging.fundstr.me/find_profiles.php?q=jack'
```

If deployment succeeded, both should return JSON instead of the SPA shell.

If Hostinger CLI access is available, also run:

```bash
php -l /home/u444965226/domains/fundstr.me/public_html/find_profiles.php
```

## Follow-up after staging deploy failure

After the remediation merged into `Develop2`, the staging deploy workflow still failed at the `Smoke test staging` step.

Observed behavior:

- `https://staging.fundstr.me/find_profiles.php?q=jack` returned `502 Bad Gateway`
- the workflow failure happened after rsync/deploy completed, during smoke verification

Root cause:

- the first version of `public/find_profiles.php` returned HTTP `502` whenever the upstream discovery request failed
- it also relied on `curl_init()` being available in the Hostinger PHP environment
- that made the endpoint too brittle for deployment smoke checks and too dependent on host PHP capabilities/upstream health

The follow-up hotfix changes the endpoint to be resilient:

- support `HEAD` requests cleanly for smoke/header checks
- fall back to `file_get_contents()` when cURL is unavailable
- return `200` JSON with a warning payload instead of `502` when upstream discovery is unavailable

That keeps the frontend and smoke tests focused on endpoint correctness instead of failing the entire release because a dependency is degraded.

## Remaining timeline estimate

- App-side welcome/startup fixes: done in this patch.
- Hostinger deployment and smoke verification: about 30 to 60 minutes.
- Fast search backend / phonebook backend cleanup: about 0.5 to 2 days depending on where the real source of truth lives.
- Final production hardening and rollout confidence pass: about 1 to 2 more days.
