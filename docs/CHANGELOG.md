# Changelog

## Unreleased

- Added a production hardening execution checklist at `docs/production-readiness-gameplan.md` and linked it from README.
- Continued CI/CD hardening: staging deploy now tracks `develop` and `Develop2`, production deploy includes smoke tests, and workflows use pnpm 8.15.7 consistently.
- Added release operations runbook at `docs/release-ops-runbook.md` for branch protection and required-check policy.
- Expanded CI test scope to run a broader, stable vitest set covering relay fallback, tier parsing, Nutzap profile publishing, creator subscriptions, and critical sanitization checks.
- Added shared tier contract helpers (`src/nostr/tierContract.ts`) and wired tier parsing/publishing paths toward canonical kind `30019` object payloads.
- Buckets UI redesign – Phase9
- Bucket detail opens in a modal from the Buckets page.
  Direct links to `/buckets/:id` still work but are only kept
  for backward compatibility. Navigate to `/buckets` and select
  "Manage" on a bucket to open the modal.
- Bucket detail modal includes a History tab.
- Documented iframe snippet support and Nostr event link embedding for media previews. These previews also show when viewing tiers from the find creators page.
- Creator Hub: publish uses fallback relays on failure; per-relay results and connected count fixes; tier definitions included.
