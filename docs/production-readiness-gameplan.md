# Fundstr Production Readiness Gameplan

Last updated: 2026-02-24
Owner: Engineering
Status: Active planning and execution tracker

## How to use this doc

- This is the single source of truth for production hardening work.
- Mark each checklist item as done (`[x]`) as work lands.
- Keep links to PRs/issues next to each completed item.
- Do not advance to the next phase until the current phase exit criteria pass.

## Goal

Ship Fundstr as a fully functional, robust, and secure production app by fixing the 5 highest-impact risks:

1. CI/CD and release-gate safety
2. Tier schema and event contract consistency
3. Relay access architecture unification
4. Discovery security hardening (iframe + external fetch paths)
5. Financial-state integrity and storage convergence

## Program-level success criteria

- All deploys are blocked on failing tests/build checks.
- All tier reads and writes use one canonical contract with safe legacy compatibility.
- All relay reads/writes use one gateway behavior for timeout/retry/fallback/ack handling.
- Discovery message boundaries are origin-checked and schema-validated.
- No subscription interval can be marked claimed unless funds were actually credited.
- Staging and production deploy targets are fully separated and validated.

## Master progress board

| Epic                                                | Priority | Status      | Target window |
| --------------------------------------------------- | -------- | ----------- | ------------- |
| EPIC-1: CI/CD and release gates                     | P0       | In progress | Week 1        |
| EPIC-2: Tier contract unification                   | P0       | Not started | Week 2-3      |
| EPIC-3: Relay gateway unification                   | P1       | Not started | Week 3-5      |
| EPIC-4: Discovery security hardening                | P0       | Not started | Week 2-4      |
| EPIC-5: Financial integrity and storage convergence | P0/P1    | Not started | Week 4-8      |

---

## EPIC-1: CI/CD and release gates

### Problem summary

The release pipeline can allow broken changes or environment mistakes through. Current indicators include non-blocking test behavior in `.github/workflows/test.yaml`, branch drift between docs and workflows, pnpm version drift, and production deploy path misconfiguration risk.

### Why this matters

Even good code is unsafe if bad builds can ship or if production points at the wrong target.

### Implementation checklist

- [x] FR-101: Make test workflow blocking (remove tolerant install/test behavior in `.github/workflows/test.yaml`).
- [ ] FR-102: Expand CI test scope to include meaningful unit/integration suites (not only narrow sanitizer tests in `package.json`).
- [x] FR-103: Align staging branch strategy between docs and workflow (`AGENTS.md` and `.github/workflows/deploy-staging.yml`).
- [x] FR-104: Pin pnpm consistently to `pnpm@8.15.7` in all workflows to match `package.json`.
- [x] FR-105: Fix production deploy destination to use production target secret/path, not staging target.
- [x] FR-106: Add required smoke verification after deploy (staging and production endpoints).
- [ ] FR-107: Add branch protection and required checks policy (documented in repo ops runbook).

FR-107 note: runbook is added at `docs/release-ops-runbook.md`; repository-level protection toggles still require manual application in GitHub settings.

### Test and verification

- [ ] CI red-path test: intentionally failing unit test blocks merge/deploy.
- [ ] CI green-path test: normal PR runs lint/test/build and passes.
- [ ] Staging deploy test: push to staging branch and verify only staging updates.
- [ ] Production deploy test: manual dispatch from main and verify only production updates.
- [ ] Version check: workflow logs show `pnpm 8.15.7` everywhere.
- [ ] Branch protection verification: protected branches enforce required checks from the runbook.

### Future-proofing

- [ ] Add a release checklist template in PR description for deploy-touching changes.
- [ ] Add CODEOWNERS coverage for `.github/workflows/*` and deploy scripts.

### Exit criteria

- Deploy is impossible when tests/build fail.
- Staging/prod branch and target separation is enforced and documented.

---

## EPIC-2: Tier contract unification

### Problem summary

Tier data currently exists in mixed kinds (`30000` and `30019`) and mixed payload shapes (array vs object), with readers that accept both. This allows drift and inconsistent behavior between pages/stores.

### Why this matters

Creators can publish tiers in one flow that another flow interprets differently. That breaks discovery, subscription accuracy, and long-term reliability.

### Target contract

- Canonical kind: `30019`
- Canonical address: `30019:<author_hex>:tiers`
- Canonical content shape: `{ "v": 1, "tiers": [...] }`
- Legacy read support: temporary support for old `30000` and array payloads
- Legacy write support: temporary dual-write only during migration window

### Implementation checklist

- [ ] FR-201: Introduce a single shared tier contract module (serialize/parse/validate/version).
- [ ] FR-202: Update all tier writers to canonical output first.
- [ ] FR-203: Make `tierAddr` resolution authoritative in reads when available.
- [ ] FR-204: Add migration adapter for legacy reads (`30000`, array content, historical fields).
- [ ] FR-205: Add temporary dual-write option behind a migration flag (short-lived).
- [ ] FR-206: Remove legacy write paths after migration stability period.
- [ ] FR-207: Clean up docs to remove contradictory kind guidance.

### Test and verification

- [ ] Contract tests: parse old/new payloads into identical normalized tier model.
- [ ] Integration tests: Creator Hub publish -> public profile load -> subscription flow.
- [ ] Regression tests: oldest supported payload fixtures still readable.
- [ ] Determinism test: same author + same data produces stable canonical output.

### Future-proofing

- [ ] Add contract-version compatibility matrix tests in CI.
- [ ] Add schema bump playbook (v2 process) before any future breaking change.

### Exit criteria

- All tier writes are canonical.
- Legacy reads remain safe.
- Cross-page tier rendering is consistent.

---

## EPIC-3: Relay gateway unification

### Problem summary

Relay logic is duplicated across multiple clients and stores/pages, leading to inconsistent behavior for timeouts, fallback, and publish acknowledgements.

### Why this matters

Users get different reliability depending on which page they use, and bugs must be fixed in many places.

### Target architecture

One relay gateway service that owns:

- key normalization
- WS-first and HTTP fallback strategy
- relay fanout strategy
- publish ack/rejection semantics
- structured retry/timeout policy
- observability counters

### Implementation checklist

- [ ] FR-301: Define gateway interface and response/error contract.
- [ ] FR-302: Implement gateway with shared policy constants.
- [ ] FR-303: Migrate Nutzap profile flows to gateway.
- [ ] FR-304: Migrate creator discovery and tier fetch flows to gateway.
- [ ] FR-305: Migrate creator publish flows to gateway.
- [ ] FR-306: Remove redundant relay clients and dead paths after cutover.
- [ ] FR-307: Add relay reliability metrics and logs (success rate, fallback rate, timeout rate).

### Test and verification

- [ ] WS success test.
- [ ] WS timeout -> HTTP fallback test.
- [ ] Fundstr empty -> fanout fallback test.
- [ ] Publish accepted/rejected/timeout coverage.
- [ ] Soak test under simulated relay degradation.

### Future-proofing

- [ ] Keep relay policy centralized in one module and one config path.
- [ ] Add synthetic relay health checks in staging.

### Exit criteria

- All major read/write relay calls route through one gateway.
- Behavior is consistent across all user-facing flows.

---

## EPIC-4: Discovery security hardening

### Problem summary

Parent page and discovery iframe communicate with broad `postMessage` patterns and weak trust boundaries. Discovery also uses high-risk public proxy/indexer fallback paths.

### Why this matters

Without strict origin + schema checks, message spoofing and UX manipulation become possible.

### Implementation checklist

- [ ] FR-401: Restrict `postMessage` target origin in parent page.
- [ ] FR-402: Validate `event.origin` and message schema in parent page listener.
- [ ] FR-403: Validate `event.origin` and message schema in iframe listener.
- [ ] FR-404: Introduce explicit allowed message types and payload validators.
- [ ] FR-405: Add iframe sandbox policy and confirm required capabilities only.
- [ ] FR-406: Remove or replace unaudited external proxy usage (`corsproxy`) with trusted backend route or disable path.
- [ ] FR-407: Add CSP/header checks in deployment verification.

### Test and verification

- [ ] Negative test: malicious origin messages are ignored.
- [ ] Negative test: malformed payloads are ignored.
- [ ] Positive test: normal search, prefill, theme sync still work.
- [ ] Security smoke: no dependency on open proxy for core discovery path.

### Future-proofing

- [ ] Add security regression tests for cross-window messaging.
- [ ] Add periodic dependency review for discovery providers.

### Exit criteria

- Only trusted origins/messages are processed.
- Discovery remains functional under hardened boundary rules.

---

## EPIC-5: Financial integrity and storage convergence

### Problem summary

Financial/subscription logic and persistence are split across localStorage and Dexie, with recovery and worker flows that can produce inconsistent states in failure conditions.

### Why this matters

Any mismatch between "claimed" and actual credited funds is a critical production incident class.

### Implementation checklist

- [ ] FR-501: Define explicit subscription/locked-token state machine and invariants.
- [ ] FR-502: Refactor redeem worker to enforce atomic transitions (only mark claimed after successful credit).
- [ ] FR-503: Add idempotent processing keys to prevent double-credit/double-claim.
- [ ] FR-504: Converge critical financial records to Dexie as source of truth.
- [ ] FR-505: Keep localStorage only for UI/session flags and migration bridges.
- [ ] FR-506: Extend backup/restore to include critical Dexie tables (not just selective keys).
- [ ] FR-507: Add reconciliation job and admin repair routine for orphaned intervals.
- [ ] FR-508: Add migration scripts and runbook for legacy data conversion.

### Test and verification

- [ ] Fault injection: crash/network failure at each redeem step.
- [ ] Restart resilience: app restart during worker execution does not corrupt state.
- [ ] Idempotency: repeated processing yields one credit.
- [ ] Reconciliation: synthetic bad states are detected and repair path works.
- [ ] Backup/restore: full roundtrip retains financial integrity.

### Future-proofing

- [ ] Add automated invariant checks at startup and on worker cycles.
- [ ] Add daily reconciliation health summary in app diagnostics.

### Exit criteria

- No path can transition to claimed/credited state incorrectly.
- Backup/restore and repair tooling are reliable and repeatable.

---

## Execution order (strict)

- [ ] Phase 1: EPIC-1 (release safety gates)
- [ ] Phase 2: EPIC-2 and EPIC-4 in parallel (data contract + security boundary)
- [ ] Phase 3: EPIC-3 (relay architecture convergence)
- [ ] Phase 4: EPIC-5 (financial consistency + storage convergence)
- [ ] Phase 5: Full staging hardening run, then production launch gate review

## Staging and production launch gates

- [ ] Build/test gates are all green and blocking.
- [ ] End-to-end path passes on staging:
  - creator publishes profile + tiers
  - supporter discovers creator and tiers
  - supporter subscribes/pays
  - creator redeem worker credits funds
  - messaging path still works
- [ ] No high-severity browser console errors in core flows.
- [ ] Security checks pass for iframe messaging and headers.
- [ ] Reconciliation checks pass for subscription and locked-token tables.

## Immediate next actions (start now)

- [x] Start FR-101, FR-104, FR-105 in one CI/CD hardening PR.
- [ ] Apply branch protection settings from `docs/release-ops-runbook.md` in GitHub repo settings.
- [ ] Open FR-201 contract module PR immediately after CI/CD hardening lands.
- [ ] Open FR-401 message-boundary hardening PR in parallel with FR-201.
