# Fundstr Project State / Handoff - 2026-03-16

## Purpose

This is the short, current-state handoff document for any human or AI picking up work after the March 16 remediation and promotion sequence.

Use this first, then read:

1. `docs/canonical-repo-recovery-2026-03-16.md`
2. `docs/production-remediation-2026-03-16.md`
3. `docs/worktree-cleanup-2026-03-16.md`
4. `docs/deploy-never-again-runbook.md`
5. `AGENTS.md`

## Confirmed live status

### Production

- branch: `main`
- live SHA: `1bcc9cbdff1482f92b655cd6bb9be142260dfa94`
- deploy run: `23134106991`
- verification:
  - `https://fundstr.me/deploy.txt` returns the SHA above
  - `https://fundstr.me/find_profiles.php?q=jack` returns `200` JSON
  - production smoke checks passed
  - live onboarding skip and generate-key flows passed in browser automation

### Staging

- branch: `Develop2`
- live SHA: `069747d1580f42adcdd150ed292e44c1076f56a8`
- deploy run: `23133608775`
- verification:
  - `https://staging.fundstr.me/deploy.txt` returns the SHA above
  - `https://staging.fundstr.me/find_profiles.php?q=jack` returns `200` JSON
  - staging smoke checks passed

## What was fixed in the March 16 release

- onboarding no longer hangs on the Nostr identity step the way it did before
- heavy startup work was moved out of the critical first paint path
- the same-origin phonebook endpoint `/find_profiles.php` now exists and is guarded in deploy/smoke workflows
- staging deploy diagnostics were hardened so they no longer fail on invalid artifact filenames
- production promotion now follows a cleaner, tested staging-first path

## Current canonical local setup

### Active development worktree

- path: `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-backend-sprint-20260316`
- branch: `ai/develop2-backend-phonebook-sprint-20260316`

### Branch truth

- staging source of truth: `origin/Develop2`
- production source of truth: `origin/main`

### Do not use as release sources

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr`
- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-main-livefix`
- old detached-head or one-off `Fundstr*` sandboxes

## Current remaining problems

The app is now deployed correctly, but backend discovery quality is still not where it should be.

### Remaining issue 1: phonebook results are correct but degraded

- `/find_profiles.php` now returns JSON reliably
- but it can still return degraded empty results when upstream discovery is slow or unavailable
- this is correct behavior for stability, but not good enough for creator discovery UX

### Remaining issue 2: upstream discovery is too slow

- `api.fundstr.me/discover/creators` has already shown multi-second to double-digit-second response times
- that makes it a poor dependency for search paths that should feel instant

### Remaining issue 3: local worktree sprawl still exists

- the release path is now clean, but the machine still contains many old Fundstr worktrees
- those need controlled cleanup so the same confusion does not return

## Next sprint goal

The next focused sprint is **backend discovery and phonebook performance**, not deploy plumbing.

### Sprint objective

Make creator search fast and local-first.

### Immediate implementation direction

1. keep `/find_profiles.php` as the stable public contract
2. add a fast local DB-backed lookup path using Hostinger MySQL when configured
3. cache phonebook results so repeated lookups avoid slow upstream fanout
4. keep upstream discovery only as a fallback, not the primary fast path

### Runtime configuration direction

The PHP phonebook endpoint should support runtime settings such as:

- `FUNDSTR_PHONEBOOK_DSN`
- `FUNDSTR_PHONEBOOK_DB_HOST`
- `FUNDSTR_PHONEBOOK_DB_PORT`
- `FUNDSTR_PHONEBOOK_DB_NAME`
- `FUNDSTR_PHONEBOOK_DB_USER`
- `FUNDSTR_PHONEBOOK_DB_PASS`
- `FUNDSTR_PHONEBOOK_DB_TABLES`
- `FUNDSTR_PHONEBOOK_DB_AUTHORITATIVE`

These should be configured on Hostinger, not committed to git.

Recommended first rollout:

- set `FUNDSTR_PHONEBOOK_DB_AUTHORITATIVE=false`

That keeps the DB in a "prefer when present" mode instead of making empty local DB
results override upstream discovery.

If Hostinger env vars are awkward to manage, the endpoint can now also load a
non-versioned PHP config file from one of these paths:

- `/home/u444965226/domains/fundstr.me/public_html/_fundstr-phonebook.php`
- `/home/u444965226/domains/fundstr.me/public_html/.fundstr-phonebook.php`
- `/home/u444965226/domains/fundstr.me/.fundstr-phonebook.php`
- `/home/u444965226/domains/fundstr.me/config/fundstr-phonebook.php`
- `~/.config/fundstr-phonebook.php`

## Safe workflow from here

1. create all new sprint branches from `origin/Develop2`
2. validate on staging first
3. only promote exact tested content to `main`
4. keep `docs/canonical-repo-recovery-2026-03-16.md` as the process guardrail
5. remove temporary merged worktrees after each completed promotion sequence

## Quick verification commands

### Staging

```bash
curl -fsSL https://staging.fundstr.me/deploy.txt
curl -i 'https://staging.fundstr.me/find_profiles.php?q=jack'
BASE_URL=https://staging.fundstr.me SMOKE_EXPECT_ENV=staging ./scripts/smoke-tests.sh
```

### Production

```bash
curl -fsSL https://fundstr.me/deploy.txt
curl -i 'https://fundstr.me/find_profiles.php?q=jack'
BASE_URL=https://fundstr.me SMOKE_EXPECT_ENV=production ./scripts/smoke-tests.sh
```

## Handoff instruction for future AI

If another AI is asked to continue this project, tell it:

- production is already live on `1bcc9cbdff1482f92b655cd6bb9be142260dfa94`
- staging is already live on `069747d1580f42adcdd150ed292e44c1076f56a8`
- the immediate priority is backend discovery and phonebook performance
- the canonical active worktree is `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-backend-sprint-20260316`
- do not revive `Fundstr-main-livefix` or other stale sandboxes for release work
