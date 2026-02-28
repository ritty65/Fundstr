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
  - PR `#1357` merged `release/main-rc-20260228` into `main` (`167e0d3c18a3f8cff1b7e4404973b5d7a7ce59f0`).
  - PR `#1358` merged `chore/main-launch-evidence-20260228` into `main` (`fe1e86f6344f39f5aa34f8bbafcf2b7b7e6e0a74`).
- Main quality checks:
  - `build` run `22521782161` -> success.
  - `Test` run `22521782164` -> success.
- Production deployment:
  - `Deploy production (main -> Hostinger)` run `22521782163` -> success.
  - `/deploy.txt` on production reports `env=production` and `sha=fe1e86f6344f39f5aa34f8bbafcf2b7b7e6e0a74`.
- Staging parity post-production:
  - `/deploy.txt` on staging remains `env=staging` and `sha=6c9e8dafa0140c575796d532839ca04da029afa2`.
  - `/` and `/restore` return `200` on both production and staging.
- Manual script checks executed after deploy:
  - `BASE_URL=https://fundstr.me SMOKE_EXPECT_ENV=production ./scripts/smoke-tests.sh` -> pass.
  - `BASE_URL=https://staging.fundstr.me SMOKE_EXPECT_ENV=staging ./scripts/smoke-tests.sh` -> pass.
  - `BASE_URL=https://fundstr.me node scripts/synthetic-staging-journey.mjs` -> pass.
  - `BASE_URL=https://staging.fundstr.me node scripts/synthetic-staging-journey.mjs` -> pass.
- Branch-protection audit status:
  - Workflow dispatch with limited PAT is blocked (`HTTP 403`).
  - Local verification script is wired via `pnpm run verify:branch-protection`, but requires admin-capable `BRANCH_PROTECTION_AUDIT_TOKEN` to pass.
- Remaining launch blocker:
  - Rollback rehearsal evidence still needs one controlled drill and a run log entry.

## Rollback Rehearsal (Remaining Blocker)

Recommended approach: run a controlled docs-only rollback drill so deploy mechanics are exercised without user-facing code risk.

1. **Create drill commit on `main`**
   - Change only a doc file (for example append a dated marker line in `docs/CHANGELOG.md`).
   - Merge PR and wait for `build`, `Test`, and `Deploy production (main -> Hostinger)` to pass.
2. **Capture forward-deploy evidence**
   - Record production deploy run ID.
   - Confirm `https://fundstr.me/deploy.txt` SHA matches drill commit.
   - Run `BASE_URL=https://fundstr.me SMOKE_EXPECT_ENV=production ./scripts/smoke-tests.sh`.
3. **Rollback by revert PR**
   - Revert the drill commit via a new PR to `main`.
   - Merge and wait for `build`, `Test`, and production deploy workflow to pass.
4. **Capture rollback evidence**
   - Record rollback deploy run ID.
   - Confirm `https://fundstr.me/deploy.txt` SHA matches pre-drill commit.
   - Re-run production smoke script and verify pass.
5. **Document closure evidence**
   - Add both run IDs, forward/rollback SHAs, and smoke outputs to `docs/CHANGELOG.md`.
   - Mark rollback rehearsal blocker as complete in this runbook.

Exit condition: two consecutive successful prod deploys (forward + rollback) with marker parity and green smoke checks.

## Weekly Ops Check (5 Minutes)

1. Verify latest `deploy-staging` run is green.
2. Verify latest production deploy run is green.
3. Run the health verification commands above.
4. Confirm branch heads match live markers.
5. Capture run IDs in release notes or ops log.
