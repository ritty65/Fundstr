# Fundstr Worktree Cleanup - 2026-03-16

## Goal

Reduce the local `Fundstr*` folder sprawl without deleting anything that still has unreviewed or dirty state.

## Cleanup actions already performed

The following merged, clean release worktrees were removed with `git worktree remove`:

- `Fundstr-Develop2-cleanroom-20260316`
- `Fundstr-Develop2-phonebook-hotfix-20260316`
- `Fundstr-Develop2-staging-hardening-20260316`
- `Fundstr-main-promotion-20260316`
- `Fundstr-develop2-canary-smoke`
- `Fundstr-develop2-postprod-smoke`
- `Fundstr-develop2-preserve-nested`
- `Fundstr-develop2-restore-fix`
- `Fundstr-develop2-restore-identity-hotfix`
- `Fundstr-develop2-restored-supporter-fix`
- `Fundstr-develop2-route-conversation-http-fix`
- `Fundstr-develop2-route-prime-fix`
- `Fundstr-develop2-route-prime-since-fix`
- `Fundstr-develop2-smoke-env`
- `Fundstr-develop2-staging-guard`
- `Fundstr-develop2-strict-ci`
- `Fundstr-develop2-trigger-lock`
- `Fundstr-main-mergecheck`
- `Fundstr-main-parityfix`
- `Fundstr-main-postprod-smoke`
- `Fundstr-main-preserve-nested`
- `Fundstr-main-safe-redirect`
- `Fundstr-main-smoke-env`
- `Fundstr-main-staging-guard`

Temporary prunable worktree metadata was also cleaned with `git worktree prune`.

## Current result

- initial worktree count observed during cleanup: `53`
- count after safe removals: `28`

This removed the short-lived release plumbing worktrees while preserving current or dirty states for manual review.

## Current canonical worktree to keep

- `/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-backend-sprint-20260316`

## Remaining worktrees intentionally not auto-removed

These still need manual review because they are dirty, detached, or represent older historical states that should not be deleted automatically:

- `Fundstr`
- `Fundstr-main-livefix`
- `Fundstr-deployfix`
- `Fundstr-Develop2-integration`
- `Fundstr-develop2-clean`
- `Fundstr-develop2-financial`
- `Fundstr-develop2-prod-readiness`
- `Fundstr-develop2-prodpass`
- `Fundstr-develop2-step2b`
- `Fundstr-main-branch-protection-solo-mode`
- `Fundstr-main-canary-smoke`
- `Fundstr-main-deploy-guards-canary`
- `Fundstr-main-deploy-prod-hardening-20260302`
- `Fundstr-main-external-canary-encoding`
- `Fundstr-main-final-validation`
- `Fundstr-main-head`
- `Fundstr-main-hotfix3`
- `Fundstr-main-latestdiag`
- `Fundstr-main-latestdiag2`
- `Fundstr-main-launch-evidence`
- `Fundstr-main-postverify`
- `Fundstr-main-prodhotfix`
- `Fundstr-main-rc-20260228`
- `Fundstr-main-relay-primary-fundstr`
- `Fundstr-main-strict-test`
- `Fundstr-main-sw-navigation-denylist`
- `Fundstr-relay-consistency-20260302`

## Audit tool

Use this script from the canonical worktree to re-audit what is safe to keep or remove:

```bash
cd /home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-backend-sprint-20260316
node scripts/maintenance/fundstr-worktree-audit.mjs
```

## Safe cleanup policy going forward

1. only auto-remove worktrees that are clean and already merged into `origin/main` or `origin/Develop2`
2. never auto-remove dirty or detached worktrees
3. keep exactly one active canonical development worktree at a time
4. remove transient release worktrees immediately after staging/prod promotion completes
