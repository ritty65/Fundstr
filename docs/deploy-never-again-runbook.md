# Deploy Never-Again Runbook

Last updated: 2026-02-28
Scope: Prevent staging/prod cross-impact and keep deploy recovery deterministic.

## Golden Rules

- `main` deploys production only.
- `Develop2` deploys staging only.
- Every successful deploy must publish a matching `/deploy.txt` marker and return `200` on core endpoints.
- Do not rerun stale failed deploy runs after workflow changes; trigger a fresh run from current branch tip.

## Hostinger Constraint

Hostinger subdomains may be constrained to `public_html/<subdir>` instead of a fully separate docroot.

- Preferred: non-nested staging path.
- Supported fallback: nested staging path (`.../public_html/staging`) with production workflow preserve/restore guard enabled.

## Required Secrets

Repository secrets that must stay valid:

- `SSH_HOST`
- `SSH_PORT`
- `SSH_USER`
- `SSH_PRIVATE_KEY`
- `SSH_TARGET_PRODUCTION`
- `SSH_TARGET_STAGING`
- Optional explicit staging overrides:
  - `SSH_PORT_STAGING`
  - `SSH_USER_STAGING`

## Release Flow (Safe Sequence)

1. Merge to `Develop2`.
2. Confirm `deploy-staging` success.
3. Verify staging marker and health checks.
4. Merge to `main`.
5. Confirm `Deploy production (main -> Hostinger)` success.
6. Verify production marker and then re-check staging marker is still healthy.

## Health Verification Commands

Run from any shell with curl:

```bash
curl -fsSL https://fundstr.me/deploy.txt
curl -fsSL https://staging.fundstr.me/deploy.txt

for p in / /deploy.txt /find-creators.html /manifest.json /featured-creators.json; do
  echo "PROD    $p $(curl -sS -o /dev/null -w "%{http_code}" "https://fundstr.me$p")"
  echo "STAGING $p $(curl -sS -o /dev/null -w "%{http_code}" "https://staging.fundstr.me$p")"
done
```

Expected:

- Both markers return `200`.
- Production marker SHA equals `origin/main`.
- Staging marker SHA equals `origin/Develop2`.
- All listed endpoints return `200`.

## Production Guard Behavior (Nested Staging)

When `SSH_TARGET_STAGING` is nested under `SSH_TARGET_PRODUCTION`, production deploy now:

1. Detects overlap and computes nested subpath.
2. Snapshots nested staging directory.
3. Performs production atomic swap.
4. Restores nested staging directory.
5. Verifies production artifacts and smoke test.

This prevents production deploy from wiping staging content.

## Failure Map

- `Trust remote host` fails:
  - check `SSH_HOST`, `SSH_PORT`, `SSH_PORT_STAGING`.
  - ensure host/port are reachable from GitHub runners.
- `Evaluate staging/prod target overlap` fails:
  - `SSH_TARGET_STAGING` equals production target or invalid subpath.
  - correct secret path and re-run fresh workflow.
- Staging JS chunk 404 with marker 200:
  - stale browser cache/service worker.
  - clear site data and hard reload.

## Emergency Staging Restore (If Staging Is Wiped)

Run on server only if staging folder is missing/corrupt:

```bash
set -euo pipefail
BASE="/home/<user>/domains/<domain>"
mkdir -p "$BASE/public_html/staging"
rsync -av --delete --exclude 'staging/' "$BASE/public_html/" "$BASE/public_html/staging/"
```

Then immediately trigger `deploy-staging` from `Develop2`.

## Latest Verified Snapshot (2026-02-28)

- Main release sync:
  - PR `#1357` merged `release/main-rc-20260228` into `main`.
  - Merge commit on `main`: `167e0d3c18a3f8cff1b7e4404973b5d7a7ce59f0`.
- Main quality checks:
  - `build` run `22521072310` -> success.
  - `Test` run `22521072300` -> success.
- Production deployment:
  - `Deploy production (main -> Hostinger)` run `22521072297` -> success.
  - `/deploy.txt` on production reports `env=production` and `sha=167e0d3c18a3f8cff1b7e4404973b5d7a7ce59f0`.
- Staging parity post-production:
  - `/deploy.txt` on staging remains `env=staging` and `sha=6c9e8dafa0140c575796d532839ca04da029afa2`.
  - `/` and `/restore` return `200` on both production and staging.
- Manual script checks executed after deploy:
  - `BASE_URL=https://fundstr.me SMOKE_EXPECT_ENV=production ./scripts/smoke-tests.sh` -> pass.
  - `BASE_URL=https://staging.fundstr.me SMOKE_EXPECT_ENV=staging ./scripts/smoke-tests.sh` -> pass.
  - `BASE_URL=https://fundstr.me node scripts/synthetic-staging-journey.mjs` -> pass.
  - `BASE_URL=https://staging.fundstr.me node scripts/synthetic-staging-journey.mjs` -> pass.
- Remaining launch blockers:
  - Branch-protection audit requires `BRANCH_PROTECTION_AUDIT_TOKEN` with admin rights (`verify-branch-protection` cannot be dispatched with limited PAT).
  - Rollback rehearsal evidence still needs one controlled drill and a run log entry.

## Weekly Ops Check (5 Minutes)

1. Verify latest `deploy-staging` run is green.
2. Verify latest production deploy run is green.
3. Run the health verification commands above.
4. Confirm branch heads match live markers.
5. Capture run IDs in release notes or ops log.
