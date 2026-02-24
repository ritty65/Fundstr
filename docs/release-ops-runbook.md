# Release Ops Runbook

Last updated: 2026-02-24
Scope: Branch protection and required checks policy for production safety.

## Policy

- Protect `main` and `develop` from direct unreviewed changes.
- Keep `Develop2` protected while it remains a staging compatibility branch.
- Require passing CI checks before merge.
- Disallow force pushes and branch deletion on protected branches.
- Require at least one approving review for protected branches.

## Required status checks

At minimum, require these checks to pass before merge:

- `Test` (from `.github/workflows/test.yaml`)
- `build` (from `.github/workflows/build.yml`)

## Branch rules to apply in GitHub settings

Apply equivalent rules for:

- `main`
- `develop`
- `Develop2` (temporary compatibility branch)

Recommended settings:

- Require a pull request before merging.
- Require approvals: 1 or more.
- Dismiss stale approvals when new commits are pushed.
- Require status checks: `Test`, `build`.
- Require branches to be up to date before merging.
- Do not allow force pushes.
- Do not allow deletions.

## Deploy workflow policy

- Staging deploy runs from `develop` and `Develop2`.
- Production deploy runs from `main`.
- Production deploy must use `SSH_TARGET_PRODUCTION` secret.
- Staging deploy must use `SSH_TARGET_STAGING` secret.

## Validation checklist after policy changes

- Open a test PR to `develop` and verify merge is blocked when checks fail.
- Verify merge is allowed only when `Test` and `build` pass.
- Verify direct push to protected branches is blocked.
- Verify production workflow fails fast if `SSH_TARGET_PRODUCTION` is missing.
