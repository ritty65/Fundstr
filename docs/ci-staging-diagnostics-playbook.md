# CI and Staging Diagnostics Playbook

Use this when checks look inconsistent, staging behaves differently by region, or a merge appears healthy but users still report errors.

## 1) Verify branch and merge state

```bash
git fetch origin --prune
git log --oneline --decorate -n 8 origin/Develop2
git diff --name-status origin/Develop2~1..origin/Develop2
gh pr view <PR_NUMBER> --json number,title,state,baseRefName,headRefName,mergeCommit,mergedAt,statusCheckRollup,url
```

## 2) Inspect workflow status and failed logs

```bash
gh run list --branch Develop2 --limit 20
gh run list --workflow deploy-staging --branch Develop2 --limit 10
gh run view <RUN_ID> --json status,conclusion,name,workflowName,url,jobs
gh run view <RUN_ID> --log-failed
```

## 3) Check staging health from current network

```bash
for i in 1 2 3 4 5; do curl -sS -o /dev/null -w "home status=%{http_code} ip=%{remote_ip} type=%{content_type}\n" https://staging.fundstr.me/; done
for i in 1 2 3 4 5; do curl -sS -o /dev/null -w "deploy status=%{http_code} ip=%{remote_ip} type=%{content_type}\n" https://staging.fundstr.me/deploy.txt; done
curl -sS https://staging.fundstr.me/deploy.txt
curl -sS -D - https://staging.fundstr.me/find-creators.html -o /tmp/find-creators.html
```

## 4) Capture a full staging diagnostics bundle locally

```bash
BASE_URL=https://staging.fundstr.me STAGING_DIAG_DIR=artifacts/staging-diagnostics ./scripts/ci/staging-diagnostics.sh
```

This writes DNS snapshots, endpoint headers/bodies, and repeated edge samples to `artifacts/staging-diagnostics/`.

## 5) Validate local build/test parity

```bash
pnpm --version
pnpm install --frozen-lockfile
pnpm run test:ci
pnpm run build
node scripts/ci/verify-deploy-artifacts.mjs
```

## 6) Compare deployed marker to expected commit

```bash
EXPECTED_SHA=$(git rev-parse origin/Develop2)
ACTUAL_SHA=$(curl -sS https://staging.fundstr.me/deploy.txt | awk -F= '/^sha=/{print $2}')
printf "expected=%s\nactual=%s\n" "$EXPECTED_SHA" "$ACTUAL_SHA"
```

## 7) Download diagnostics artifacts from a deploy run

```bash
gh run download <RUN_ID> --name "staging-diagnostics-<RUN_ID>-1" --dir artifacts/from-ci
```

If artifact names differ, list run metadata first with `gh run view <RUN_ID> --json jobs`.
