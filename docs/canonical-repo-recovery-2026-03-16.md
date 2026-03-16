# Fundstr Canonical Repo Recovery - 2026-03-16

## Purpose

This document is the full handoff for humans and AI systems after the March 2026 repository cleanup and production remediation pass.

It explains:

- which local Fundstr folder is safe to use now
- which branches are the real source of truth
- what went wrong in the previous folder/worktree sprawl
- what fixes were isolated into the new clean branch
- how staging and production must be released going forward
- what commands to run so this does not become messy again

Use this document as the canonical operational context before making release changes.

## Executive Summary

The main issue was not only code quality.

The bigger problem was **operational ambiguity**:

- many local `Fundstr*` directories existed at the same time
- several of those worktrees were dirty
- some were detached heads
- some were far behind `origin/main` or `origin/Develop2`
- local docs had stale branch/build instructions
- the live site was still serving old deploy output while local fixes only existed in a sandbox worktree

To resolve that safely, a new clean worktree was created from the actual staging source of truth:

- local path: `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-cleanroom-20260316`
- branch: `ai/develop2-clean-remediation-20260316`
- upstream base: `origin/Develop2`
- base commit at creation: `c8c53a4`

Only the vetted onboarding, phonebook, deploy-guard, and documentation fixes were ported into that clean worktree.

This clean worktree is now the only local folder that should be used for the current remediation release effort.

## Confirmed Live Baseline

The remediation release is now live in both environments.

- Production branch truth: `origin/main`
- Production live SHA: `1bcc9cbdff1482f92b655cd6bb9be142260dfa94`
- Production deploy run: `23134106991`
- Staging branch truth: `origin/Develop2`
- Staging live SHA: `069747d1580f42adcdd150ed292e44c1076f56a8`
- Staging deploy run: `23133608775`

Verified outcomes:

- `fundstr.me/deploy.txt` reports the new production SHA
- `staging.fundstr.me/deploy.txt` reports the new staging SHA
- `/find_profiles.php?q=jack` returns JSON on both staging and production
- onboarding skip flow and generate-key flow both complete successfully in live browser checks

The release baseline is therefore considered frozen and validated.

## Current Source-of-Truth Rules

### GitHub branch truth

- `origin/Develop2` is the staging source of truth.
- `origin/main` is the production source of truth.

Verified from:

- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-prod.yml`
- `docs/deploy-never-again-runbook.md`

### Local release-worktree truth

For the current fix cycle, use only:

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-cleanroom-20260316`

Do **not** release from:

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr`
- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-livefix`
- any detached-head `Fundstr*` directory
- any dirty historical sandbox/worktree unless it is intentionally being mined for diff context only

## What Was Wrong Before Cleanup

### 1. Too many local worktrees

The machine contained dozens of local `Fundstr*` directories. Many were valid git worktrees, but they represented one-off hotfixes, diagnostics, canary branches, rollback drills, or partial staging experiments.

That created a real operational risk:

- it was easy to open the wrong folder
- it was easy to assume a folder was “latest” when it was not
- it was easy to push a branch that was not based on the current staging or production head

### 2. Dirty worktrees blocked confidence

Two obvious candidate folders were not safe as release sources:

#### `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-livefix`

- branch: `ai/staging-creator-inbox-prime-20260313`
- head: `50e91ea`
- dirty: yes
- relative to `origin/main`: behind by 10 commits

This folder was useful for investigation and targeted remediation work, but it was not a safe release base because it mixed:

- valid remediation work
- pre-existing messenger changes
- local artifacts
- untracked files not intended for the release

#### `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr`

- branch: `fix/verify-branch-protection-case-normalization`
- head: `92ceb8c`
- dirty: yes
- relative to `origin/main`: extremely diverged (`1428` commits on main side, `6` on branch side)

This folder should not be used as a release base for the current deploy stabilization work.

### 3. Documentation drift

Some local instructions still said:

- staging branch was `develop`
- build target was SPA

Those statements were stale.

Real current truth is:

- staging branch = `Develop2`
- production branch = `main`
- build target = PWA

### 4. Live deploy mismatch

The remediation introduced a real `/find_profiles.php` endpoint and rewrite exemptions, but production/staging still returned SPA HTML for that URL.

That proved the code fix existed only locally and had **not** yet been deployed to Hostinger.

## What Was Ported Into The Clean Worktree

Only the vetted remediation set was carried over.

### Onboarding / startup fixes

- `src/main.js`
- `src/pages/WelcomePage.vue`
- `src/pages/welcome/WelcomeSlideNostr.vue`
- `src/pages/NostrLogin.vue`
- `src/stores/nostr.ts`
- `src/composables/useWelcomeGate.ts`

These changes do the following:

- remove duplicate NIP-07 login work
- stop the welcome flow from passively doing heavy extension bootstrap on mount
- add soft timeouts around slow NIP-07 readiness and relay-list lookups
- defer heavy boot work until after first paint
- bump welcome gate storage keys to force the revised onboarding to re-run

### Phonebook / deploy correctness fixes

- `public/find_profiles.php`
- `public/.htaccess`
- `src/api/phonebook.ts`
- `src/lib/fundstrApi.ts`
- `.env.example`
- `.env.staging`
- `.env.production`

These changes do the following:

- restore the same-origin `/find_profiles.php` contract expected by the frontend
- prevent SPA rewrite fallback from intercepting the PHP endpoint
- align phonebook config to same-origin routing
- make legacy API base resolution prefer `VITE_API_BASE` when available

### Deploy verification / ops hardening

- `scripts/smoke-tests.sh`
- `scripts/ci/verify-deploy-artifacts.mjs`
- `scripts/ci/staging-diagnostics.sh`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-prod.yml`
- `docs/deployment/README.md`
- `docs/deploy-never-again-runbook.md`

These changes do the following:

- fail deploy validation if `find_profiles.php` is missing
- fail smoke tests if `find_profiles.php` returns HTML instead of JSON
- include phonebook endpoint diagnostics in staging snapshots
- ensure future deploys catch this exact failure mode before release confidence is claimed

### Repo hygiene / handoff docs

- `.gitignore`
- `AGENTS.md`
- `docs/production-remediation-2026-03-16.md`
- `docs/canonical-repo-recovery-2026-03-16.md`

These changes reduce future folder mess and document the new safe workflow.

## Explicitly Excluded From This Clean Branch

The cleanroom intentionally does **not** include unrelated dirty work from the sandbox, especially:

- `src/pages/NostrMessenger.vue`
- `src/stores/messenger.ts`
- `test/vitest/__tests__/messenger.spec.ts`
- sandbox artifacts and test output
- extra ad hoc Playwright configs and launch-diagnosis files

This isolation is intentional. It keeps the current release focused on onboarding, deployment correctness, and phonebook stability.

## Validation Executed On The Clean Worktree

All verification below was run inside:

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-cleanroom-20260316`

Commands executed successfully:

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run types
pnpm exec vitest run test/vitest/__tests__/welcome.interaction.spec.ts test/vitest/__tests__/phonebook.spec.ts test/stores/nostr.signers.spec.ts
pnpm exec vitest run test/lib/fundstrApi.spec.ts
pnpm run test:ci
pnpm run build
node scripts/ci/verify-deploy-artifacts.mjs
php -l public/find_profiles.php
```

Observed result:

- targeted onboarding and phonebook tests passed
- `test:ci` passed (`108` files passed, `512` tests passed, `1` skipped)
- PWA build passed
- deploy artifact validation passed
- PHP syntax check passed for `public/find_profiles.php`

This means the clean branch is locally verified and materially safer than the old sandbox worktrees.

## New Canonical Workflow Going Forward

### Rule 1: Always start from remote truth

Before starting release work:

```bash
git fetch origin --prune
```

Never assume an old local folder is current.

### Rule 2: Create a fresh worktree for each release effort

For staging-targeted work:

```bash
git worktree add -b <new-branch-name> ../<new-folder-name> origin/Develop2
```

For production-only verification or hotfixes:

```bash
git worktree add -b <new-branch-name> ../<new-folder-name> origin/main
```

### Rule 3: Keep one purpose per worktree

Examples:

- onboarding + deploy remediation
- relay latency investigation
- production smoke hardening

Do not mix unrelated messenger, financial, deploy, and UI experiments in the same release worktree.

### Rule 4: Never push from a dirty historical sandbox

If a worktree contains unrelated edits, scratch files, or stale branch ancestry:

- mine it for diff context only
- do not release directly from it

### Rule 5: Promote exact tested commits only

Safe sequence:

1. branch from `origin/Develop2`
2. make isolated changes
3. run local gates
4. push branch and open PR to `Develop2`
5. verify staging deploy on the merged SHA
6. promote the exact validated commit to `main`
7. verify production deploy on that same content

## Non-Negotiable Verification Gates

Run these locally before staging PR merge:

```bash
pnpm run lint
pnpm run types
pnpm exec vitest run test/vitest/__tests__/welcome.interaction.spec.ts test/vitest/__tests__/phonebook.spec.ts test/stores/nostr.signers.spec.ts
pnpm exec vitest run test/lib/fundstrApi.spec.ts
pnpm run test:ci
pnpm run build
node scripts/ci/verify-deploy-artifacts.mjs
```

Run these after staging deploy:

```bash
curl -fsSL https://staging.fundstr.me/deploy.txt
curl -i 'https://staging.fundstr.me/find_profiles.php?q=jack'
curl -i 'https://staging.fundstr.me/featured-creators.json'
BASE_URL=https://staging.fundstr.me SMOKE_EXPECT_ENV=staging ./scripts/smoke-tests.sh
```

Run these after production deploy:

```bash
curl -fsSL https://fundstr.me/deploy.txt
curl -i 'https://fundstr.me/find_profiles.php?q=jack'
curl -i 'https://fundstr.me/featured-creators.json'
BASE_URL=https://fundstr.me SMOKE_EXPECT_ENV=production ./scripts/smoke-tests.sh
```

Required outcome:

- `/deploy.txt` matches the expected branch environment
- `/find_profiles.php?q=jack` returns `application/json`
- `/find_profiles.php?q=jack` does not return the SPA shell
- onboarding opens quickly in a private/incognito browser session

## Hostinger Verification Commands

Use these after deploy if SSH access is available:

```bash
ls -la /home/u444965226/domains/fundstr.me/public_html/find_profiles.php
php -l /home/u444965226/domains/fundstr.me/public_html/find_profiles.php
```

If staging is nested, also verify its docroot target and `deploy.txt` separately.

## Current Branch And Folder Decision

### Approved current working folder

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-backend-sprint-20260316`

### Approved current branch

- `ai/develop2-backend-phonebook-sprint-20260316`

### Do not release from

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr`
- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-livefix`
- any detached-head `Fundstr*` folder

## Current Remaining Risks

Even after the release baseline was stabilized, a few issues still remain:

1. `api.fundstr.me/discover/creators` is still too slow for a best-in-class UX.
2. discovery responses leak an internal relay address (`ws://127.0.0.1:7777`) publicly.
3. the current `find_profiles.php` endpoint is now correct and resilient, but still degrades when upstream discovery is unhealthy.
4. the next sprint should move creator phonebook lookups toward a local DB-backed fast path on Hostinger instead of relying on slow upstream discovery.

## Current Release Recommendation

Recommended next release path:

1. keep the March 16 remediation release frozen as the clean baseline
2. do new work only from fresh branches created from `origin/Develop2`
3. focus the next sprint on backend discovery and phonebook performance, not deployment plumbing
4. validate on staging before promoting to `main`
5. keep using the cleanup policy below so no new worktree zoo forms around the release baseline

Do **not** reopen the old remediation branches or use `Fundstr-main-livefix` as a release source.

## How To Hand This To Another AI

Tell the AI the following:

- The canonical local worktree is `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-backend-sprint-20260316`.
- The active branch is `ai/develop2-backend-phonebook-sprint-20260316`.
- Staging source of truth is `origin/Develop2`.
- Production source of truth is `origin/main`.
- Production is confirmed live on `1bcc9cbdff1482f92b655cd6bb9be142260dfa94`.
- Staging is confirmed live on `069747d1580f42adcdd150ed292e44c1076f56a8`.
- Do not use `Fundstr` or `Fundstr-main-livefix` as release sources.
- Read these documents first:
  - `docs/project-state-handoff-2026-03-16.md`
  - `docs/canonical-repo-recovery-2026-03-16.md`
  - `docs/production-remediation-2026-03-16.md`
  - `docs/worktree-cleanup-2026-03-16.md`
  - `docs/deploy-never-again-runbook.md`
  - `AGENTS.md`

## Final Goal

The cleanup baseline is now successful because:

- staging deploys from `Develop2` cleanly
- production promotes from tested content only
- `/find_profiles.php` serves JSON on both staging and production
- onboarding is fast and no longer appears stuck
- future deploys fail automatically if the phonebook endpoint disappears again

The remaining objective is different now: speed up backend discovery and phonebook lookups while shrinking the local worktree footprint.
