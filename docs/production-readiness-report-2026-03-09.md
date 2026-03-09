# Fundstr Production Readiness Report - 2026-03-09

## Purpose

This report captures the full production-readiness push completed in the clean worktree at `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-livefix`.

It is written as a full-context handoff for humans and AI systems. It explains:

- what Fundstr is and how it works
- how staging and production deploys actually work in this repository
- what problems were discovered during live validation
- why those problems happened
- what code changes fixed them
- what validation was run locally and on real staging
- what remaining caveats exist
- whether the app is ready for production promotion

This report intentionally omits raw private keys, recovery phrases, and raw Cashu tokens. A sensitive test identity was exposed during validation and must be rotated before any further real use.

## Executive Summary

### Current Production Recommendation

Recommendation: **GO**, with normal release discipline.

Fundstr is in production-launch shape after a multi-step staging hardening pass. The major launch-blocking issues discovered during real staging validation were fixed, merged to `Develop2`, deployed to staging, and revalidated.

The app is now considered production-ready because:

- local quality gates are green (`lint`, `types`, `test:ci`, `build`)
- staging deploy automation is green on the latest validated SHA
- staging smoke tests are green
- real staging receive flows were proven against `https://mint.lnserver.com`
- fresh-account wallet startup no longer hangs after onboarding
- fresh mint addition no longer blocks receive
- outgoing history is now persisted before Nostr delivery work can stall the flow
- a final manual private-window redemption on the latest staging build succeeded

### Short Problem Summary

The original launch risk was not a single bug. It was a cluster of production-readiness issues that only showed up under realistic staging conditions:

1. staging discovery/phonebook fallback used the production endpoint cross-origin, causing noisy failures
2. onboarding looked stuck because key generation/import waited on relay connection before showing progress
3. fresh-account `/wallet` startup could silently hang after onboarding because wallet/Nostr boot work was racing too early
4. adding a brand-new mint could block token receive because mint activation awaited background profile republish work
5. outgoing send/donate history could be delayed behind Nostr delivery, making the wallet state look inconsistent

### Short Why Summary

These bugs all came from the same class of problem: too much critical user-path work depended on background Nostr/bootstrap side effects.

The fixes focused on a single principle:

> Keep the wallet and payment-critical path synchronous, deterministic, and locally durable. Push relay, publish, and DM behavior into background or follow-up work whenever possible.

## What Fundstr Is

Fundstr is a Quasar/Vue wallet plus creator-support platform for the Nostr ecosystem.

At a high level it combines:

- a Cashu ecash wallet
- Nostr identity and messaging
- creator discovery and public profiles
- direct donations and tier/subscription support
- P2PK/timelocked token workflows for creator funding

The product is described in `README.md` as a Patreon-like experience for Nostr with privacy-preserving Bitcoin support.

## Architecture Overview

### Stack

- Quasar 2 + Vue 3
- Vite build pipeline
- PWA output (`quasar build -m pwa`)
- Pinia for client state
- Dexie / IndexedDB for durable local storage
- `@cashu/cashu-ts` for Cashu wallet operations
- `@nostr-dev-kit/ndk` and `nostr-tools` for Nostr flows
- Vitest + Playwright for validation
- GitHub Actions for CI and deploy automation

### Build and Runtime Shape

Important runtime/build facts from the current codebase:

- build target is PWA, not plain SPA
- routing uses Vue Router history mode with `publicPath: './'`
- production builds strip `console` and `debugger`
- vendor bundles are manually split into UI / Cashu / Nostr chunks
- service worker navigation fallback explicitly excludes hashed assets and static files so they are not accidentally served as app shell responses

Relevant files:

- `package.json`
- `quasar.config.js`
- `src/router/routes.js`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-prod.yml`

### Main App Domains

Primary routed areas:

- `/wallet` - main wallet, receive/send, mint management, QR flows
- `/welcome` - onboarding and wallet/identity setup
- `/find-creators` and `/creator/:npubOrHex` - discovery and public creator pages
- `/supporters` - supporter/donation entry page
- `/creator-studio`, `/my-profile`, `/creator-subscribers` - creator management
- `/subscriptions` - subscription and supporter payment views
- `/nostr-messenger` - built-in Nostr messaging
- `/restore`, `/unlock`, `/settings` - recovery, lock/unlock, operational settings

### Boot Sequence and Runtime Wiring

Quasar boot files currently wire in:

- Sentry
- preloading
- welcome gate boot placeholder
- Cashu initialization
- i18n
- notify helpers
- safe HTML / Trusted Types protections
- NIP-07 provider detection
- featured creator prefetch
- relay preconnect
- E2E testing helpers

Important nuance:

- `welcomeGate` is still listed in Quasar boot, but the real welcome enforcement is done in router logic and composables
- significant NDK bootstrap logic exists in `src/boot/ndk.ts`, but current runtime behavior depends on lazy/composable access patterns rather than guaranteed boot registration

### Storage and Security Model

Fundstr is heavily client-side and browser-state-driven.

Storage layers:

- Pinia + local storage for many user settings and runtime preferences
- Dexie `cashuDatabase` for proofs, locked tokens, history tokens, subscriptions, creator caches, tier data, and related wallet state
- a separate IndexedDB-backed messenger state area for Nostr chat persistence

Security posture:

- encrypted local storage is used for `cashu.ndk.*` Nostr secret material via PIN-derived AES-GCM keying
- route protection prevents access when encrypted Nostr material exists but the app is still locked
- Trusted Types and DOMPurify are used for safer HTML rendering

Important security caveat worth recording:

- the wallet mnemonic is still persisted through normal local storage patterns and is not covered by the same encrypted storage path as Nostr secret state

This is not a launch blocker for the work completed here, but it is a real follow-up hardening item.

## Deploy and Branch Reality

### What Is Actually True Right Now

Observed branch truth in the current repository state:

- **staging branch:** `Develop2`
- **production branch:** `main`

This is enforced by the actual workflows:

- staging deploys on push to `Develop2`
- production deploys on push to `main`

### Important Documentation Drift

Some local documentation still mentions `develop` as the staging branch and still refers to SPA builds.

That is stale.

The current operational truth is:

- staging uses `Develop2`
- current build output is PWA (`dist/pwa`)

That drift should be treated as documentation debt, not a release blocker.

### Deploy Guardrails Already In Place

The repository has stronger-than-average deploy safety for a frontend app:

- `Test` workflow gates deploys
- `build` workflow gates deploys
- predeploy quality gate waits for required checks by SHA
- deploy marker file is written at build time
- remote artifacts are verified after rsync
- staging smoke tests run post-deploy
- production deploy uses atomic swap semantics and overlap guards
- scheduled staging canaries and branch-protection verification already exist

## The Production-Readiness Problems Found

This section is the core incident narrative.

### Problem 1 - Staging Discovery / Phonebook Cross-Origin Fallback

#### What Happened

Staging discovery and DM suggestion flows were attempting to fall back to a production phonebook endpoint from the staging origin.

That caused cross-origin failures and noisy console output.

#### Why It Happened

The fallback behavior did not distinguish between a same-origin-safe fallback and a production default that became cross-origin from staging.

#### Fix

Shipped in commit `4951002`.

Behavior after fix:

- the app detects the unsafe production fallback while on staging
- it skips that fallback instead of spamming errors
- discovery degrades gracefully with warnings instead of noisy broken requests

Primary files:

- `src/api/phonebook.ts`
- `test/vitest/_tests_/phonebook.spec.ts`

### Problem 2 - Onboarding Key Generation / Import Looked Stuck

#### What Happened

Welcome onboarding gave the impression that key generation/import was hanging.

#### Why It Happened

The UI waited for relay connection before surfacing completion state and backup UX.

That made a background network dependency feel like a foreground onboarding failure.

#### Fix

Shipped in commit `4951002`.

Behavior after fix:

- key generate/import uses a skip-relay-connect path for immediate UX completion
- onboarding state updates immediately
- backup dialog appears immediately
- relay connection moves to background work

Primary file:

- `src/pages/welcome/WelcomeSlideNostr.vue`

### Problem 3 - Fresh-Account Wallet Startup Hang After Onboarding

#### What Happened

In a fresh browser profile, onboarding could complete and then navigating to `/wallet` could leave the app effectively non-interactive.

Assets loaded, the route changed, but the page stalled with no obvious console/page errors.

#### Why It Happened

This was the most serious issue found during live staging validation.

Root cause summary:

- wallet/Nostr startup work was being kicked off too early and in parallel
- seed-derived signer setup could begin before the mnemonic was guaranteed to exist
- wallet page startup, NDK bootstrap, signer initialization, and background listener work overlapped in a fragile first-run state

In short: the wallet boot path was too concurrent for a fresh account.

#### Fix

Shipped in commit `7f6eafd`, merged by PR `#1377`.

Key changes:

- ensured mnemonic initialization before wallet seed derivation in `src/stores/wallet.ts`
- mapped `signerType` properly into `WalletPage`
- stopped unnecessary NIP-07 probing when the active signer did not need it
- serialized wallet page startup so `useNdk()` warmup happened after page init settled

Primary files:

- `src/pages/WalletPage.vue`
- `src/stores/wallet.ts`
- `test/e2e/wallet-startup-fresh-account.spec.ts`

### Problem 4 - Fresh Mint Addition Blocked Receive Flow

#### What Happened

On staging, when a real token from a mint not yet known to the wallet was redeemed, the app could stall on `Adding mint...`.

#### Why It Happened

Mint addition awaited background nutzap profile republish work.

That meant a background Nostr/publish side effect could block the critical receive path.

#### Fix

Shipped in commit `55d5237`, merged by PR `#1378`.

Key change:

- mint activation is no longer blocked on profile republish
- republish still happens, but in the background with safe warning logging on failure

Primary files:

- `src/stores/mints.ts`
- `test/mints.store.spec.ts`

### Problem 5 - Outgoing Send / Donate History Persisted Too Late

#### What Happened

The donate/send path could generate the outgoing token and update balance, but pending history could lag behind because Nostr delivery work happened too early in the critical flow.

#### Why It Happened

The pending history record was not durably persisted early enough relative to DM/Nostr delivery behavior.

That created a timing window where the user-visible wallet state could look inconsistent.

#### Fix

Shipped in commit `394a4bc`, merged by PR `#1379`.

Key changes:

- `addPendingToken()` now returns the persisted entry
- send/donate flows persist pending history first
- Nostr delivery is queued after the critical wallet history state is already durable
- follow-up logic uses the persisted history record, not a pre-persistence placeholder

Primary files:

- `src/components/SendTokenDialog.vue`
- `src/stores/tokens.ts`
- `test/SendTokenDialog.interaction.spec.ts`

## Release Timeline and Git History

### Key Branches

- hardening branch: `ai/prod-hardening-20260307`
- staging promotion branch: `staging-promote-20260307`
- staging fix branches:
  - `fix/develop2-wallet-startup-hang`
  - `fix/mint-republish-add-block`
  - `fix/send-history-before-dm`

### Key Commits

- `3e93490` - `fix(app): harden production launch flows and restore CI parity`
- `b00c8c8` - `merge(staging): promote production hardening for launch`
- `4951002` - `fix(staging): unblock identity setup and skip broken phonebook fallback`
- `7f6eafd` - `fix(wallet): unblock fresh-account startup after onboarding`
- `55d5237` - `fix(mints): avoid blocking receives on profile republish`
- `394a4bc` - `fix(send): persist outgoing history before nostr delivery`

### Key PRs

- `#1375` - staging promotion merge
- `#1376` - staging follow-up merge for onboarding/phonebook fixes
- `#1377` - wallet startup unblock
- `#1378` - mint receive unblock
- `#1379` - outgoing history persistence ordering fix

### Current Promotion Delta

At the time of this report, `origin/Develop2` is ahead of `origin/main` by 12 commits and contains the full validated release set.

## Validation Summary

### Local Validation Run

Validated locally in the clean worktree:

- `pnpm lint`
- `pnpm types`
- `pnpm vitest run test/wallet-store.spec.ts test/stores/nostr.signers.spec.ts`
- `pnpm vitest run test/mints.store.spec.ts`
- `pnpm vitest run test/SendTokenDialog.interaction.spec.ts test/mints.store.spec.ts`
- `pnpm exec playwright test test/e2e/onboarding-happy-path.spec.ts test/e2e/wallet-startup-fresh-account.spec.ts --project=chromium`
- `pnpm run test:ci`
- `pnpm run build`

Latest recorded full CI-style local result:

- `100` test files passed
- `477` tests passed
- `1` skipped

### Staging Validation Run

Staging deploy marker validated during the push:

- env: `staging`
- ref: `Develop2`
- sha: `0f9d13ae093750eb09151096e22a202157a6a39d`

Staging smoke checks passed on the current deploy.

### Real-World Payment Validation

Real staging validation included actual Cashu tokens against `https://mint.lnserver.com`.

Proven during the readiness push:

- earlier real receive path validated with previously supplied tokens totaling 30 sats
- latest staging build manually redeemed a fresh 5 sat token in a private window
- staging wallet rendered with the expected LNServer mint attached and balance updated correctly

What this proves:

- real receive on staging works on the latest release candidate build
- fresh-account onboarding and wallet startup work well enough to complete private-window real token redemption

### About the Console `ERR_FAILED` Asset Lines

During late validation, the browser console showed resource failures for:

- Google Fonts `css2`
- hashed CSS and JS asset URLs

These were investigated directly.

Findings:

- the exact hashed staging assets returned `200`
- staging deploy marker pointed at the current validated SHA
- the page still rendered and real token redemption succeeded

Most likely explanation:

- browser-side request blocking or cancellation, likely privacy-mode behavior, not a broken staging deploy

This is treated as non-blocking console noise, not a deploy failure.

## What Was Actually Solved

The production-readiness push made a meaningful architectural improvement, not just a few tactical patches.

### Before

- payment-critical paths were coupled too tightly to networked Nostr side effects
- fresh-account startup did too much work too early
- wallet consistency could depend on background behavior completing in time

### After

- wallet boot is more deterministic on first run
- mnemonic/seed initialization is safer
- staging-specific fallback behavior is environment-aware
- receive paths do not block on unrelated publish work
- outgoing history is durably persisted before DM/relay behavior can lag

That is the correct direction for a payment product: local state first, network side effects second.

## Remaining Caveats (Non-Blocking)

These items should still be recorded even though they do not block release.

### 1. Sensitive Test Identity Must Be Rotated

During validation, a private Nostr key and mnemonic were pasted into chat.

That identity must be considered compromised and rotated immediately.

This report intentionally excludes the raw values.

### 2. Documentation Drift Exists

Known drift to fix later:

- local `AGENTS.md` still mentions `develop` instead of `Develop2`
- some local docs still talk about SPA builds instead of PWA
- some README examples still reflect older routing assumptions

### 3. Mnemonic Storage Hardening Is Still Desirable

Nostr encrypted-secret handling is better than mnemonic handling.

The wallet mnemonic persistence model deserves a separate security hardening pass.

### 4. Build Size Is Large

Build warnings still show large chunks, especially UI and route bundles.

This is not a functional release blocker, but it is a performance and maintainability follow-up item.

### 5. Nested Staging/Production Deploy Target Warning Still Exists

The workflow warns that staging is nested under the production target.

That warning is not blocking the current staging deploy, but infra should eventually move staging to a non-nested target path before a future production deploy.

## Release Gameplan

### Goal

Promote the validated `Develop2` state to `main` and let the production workflow deploy from `main`.

### Safest Path

1. compare `origin/main` to `origin/Develop2`
2. open a PR from latest validated `Develop2` state into `main`
3. merge the PR normally (no force, no history rewrite)
4. let `deploy-prod.yml` run from `main`
5. verify `https://fundstr.me/deploy.txt`
6. run a short production smoke pass on:
   - `/wallet`
   - `/find-creators`
   - `/supporters`
   - onboarding / welcome gate behavior

### Why This Path

This preserves the same PR-based promotion pattern already required by branch protection during staging work.

## Rollback Plan

If production deploy fails or production behavior regresses:

1. identify the previous good `main` SHA from production `deploy.txt` or workflow history
2. revert the production promotion PR on GitHub
3. allow the production deploy workflow to redeploy the reverted `main`
4. re-check production `deploy.txt`
5. run the same short smoke pass on production

The existing production workflow already uses atomic swap behavior and keeps previous deploy state under backup paths, which lowers rollback risk.

## AI Handoff Context

If this report is given to another AI, it should understand these truths immediately:

- work happened only in the clean worktree: `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-livefix`
- the original dirty checkout must remain untouched
- current staging truth is `Develop2`, not `develop`
- production deploy truth is `main`
- latest validated staging SHA is `0f9d13ae093750eb09151096e22a202157a6a39d`
- the main production-readiness fixes were PRs `#1377`, `#1378`, and `#1379`
- the release is a **GO** unless new production-only regressions appear during the main-branch deploy
- any exposed validation secrets must be rotated and must not be reused

## Final Recommendation

Fundstr should be promoted from `Develop2` to `main`.

The production-readiness campaign found real problems, explained why they happened, and fixed them in a way that improved the product architecture rather than papering over symptoms.

This is now a release candidate with enough real staging evidence to justify production promotion.
