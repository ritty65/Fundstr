# Fundstr Final Validation Report - 2026-03-16

## Baseline

This report freezes the March 16 release train as the current validated baseline.

- Production branch: `main`
- Production live SHA: `5f07012153002182ae5ff04078d205eb8cbc25d8`
- Staging branch: `Develop2`
- Staging live SHA: `a6555b2914b1de3b489ef1da297d45d007a94ebe`

## Live validation summary

### Production

- `deploy.txt` returns the expected production SHA
- `/find_profiles.php?q=jack` returns `200` JSON
- `/find_profiles.php?q=odell` returns `200` JSON
- `/find_profiles.php?q=walker` returns `200` JSON
- phonebook headers show DB-backed search:
  - `X-Fundstr-Phonebook-Source: db`
  - `X-Fundstr-Phonebook-Status: ok`
- production smoke checks passed

### Staging

- `deploy.txt` returns the expected staging SHA
- `/find_profiles.php?q=jack` returns `200` JSON
- `/find_profiles.php?q=odell` returns `200` JSON
- `/find_profiles.php?q=walker` returns `200` JSON
- phonebook headers show DB-backed search:
  - `X-Fundstr-Phonebook-Source: db`
  - `X-Fundstr-Phonebook-Status: ok`
- staging smoke checks passed

## Measured live timings

### Synthetic deploy canary timings

#### Staging

- root document loads: `714ms`
- primary SPA routes resolve: `1538ms`
- discovery iframe check: `618ms`
- featured creators feed: `509ms`
- extended smoke suite: `8144ms`

#### Production

- root document loads: `675ms`
- primary SPA routes resolve: `1557ms`
- discovery iframe check: `616ms`
- featured creators feed: `509ms`
- extended smoke suite: `7751ms`

### Phonebook query timings

#### Staging

- `jack`: `661ms`
- `odell`: `985ms`
- `walker`: `753ms`

#### Production

- `jack`: `664ms`
- `odell`: `663ms`
- `walker`: `639ms`

## Browser-flow validation

### Live production browser checks

- welcome skip flow advanced successfully in `2463ms`
- welcome generate-new-key flow showed backup dialog in `2648ms`
- mocked NIP-07 welcome connect flow advanced successfully in `3565ms`

Notes:

- the mocked NIP-07 test used a standards-compatible `window.nostr` injection because a real browser extension package is not available in this automation environment
- real extension-specific UX should still be sanity-checked manually in a browser with Alby or another NIP-07 extension installed

## Local end-to-end validation

The following serial Chromium E2E suite passed locally:

```bash
pnpm exec playwright test \
  test/e2e/onboarding-happy-path.spec.ts \
  test/e2e/account-restore.spec.ts \
  test/e2e/wallet-startup-fresh-account.spec.ts \
  test/e2e/wallet-flows-happy-path.spec.ts \
  test/e2e/creator-discovery-rich-profile.spec.ts \
  --project=chromium --workers=1
```

Result:

- `14` tests passed in about `40.8s`

Validated local flows included:

- new user onboarding
- generate/import/skip onboarding variants
- account restore from mnemonic
- restore retry after mint failure
- wallet mint/send/redeem flows
- creator discovery and rich profile rendering

## Unit/integration validation

The following test groups passed:

```bash
pnpm exec vitest run test/vitest/composables/useNostrAuth.spec.ts test/stores/nostr.signers.spec.ts
pnpm exec vitest run test/vitest/__tests__/phonebook.spec.ts
pnpm exec vitest run test/vitest/__tests__/creators.spec.ts test/vitest/__tests__/phonebookEnrichment.spec.ts test/vitest/__tests__/MyProfilePage.phonebook.spec.ts test/vitest/__tests__/PublicCreatorProfilePage.phonebook.spec.ts
```

Validated areas included:

- NIP-07 auth behavior
- signer setup and relay caching
- phonebook request handling
- creator discovery fallbacks
- phonebook-based enrichment on creator/profile surfaces

## What is considered done now

- onboarding/startup regression fixed
- same-origin phonebook endpoint restored
- deploy workflows hardened
- production and staging both use DB-backed phonebook lookups
- release path is staging-first and validated before production promotion

## What is still not fully "done"

### 1. Search quality / ranking

Search is now fast, but not yet especially smart.

Examples:

- substring matches can outrank exact expected users
- common names like `jack` still return many loose matches

Next sprint should improve:

- exact match ranking
- prefix match ranking
- creator/featured boosting
- `nip05` weighting

### 2. DB freshness guarantees

The phonebook is fast because it now uses local DB data.

What still needs confirmation:

- how often `profiles` and `creators` are refreshed
- whether refresh lag is acceptable for production search expectations
- whether stale-result detection should be surfaced in admin diagnostics

### 3. Security/perf hardening

Still worth doing after search-quality work:

- strengthen secret storage paths
- improve HTTP security headers
- reduce oversized frontend bundles

## Overall assessment

Fundstr is now in a much better state than when this remediation started.

- release/deploy workflow: stable
- onboarding: working and materially faster
- creator phonebook search: fast and local-first
- production confidence: good enough to move on from deploy firefighting

The next sprint should focus on **search quality**, not deployment plumbing.
