# Superprompt: Continue Fundstr Source-Visibility And Release Cleanup

You are working on the Fundstr codebase, a Quasar/Vite PWA app managed with `pnpm`.

## Mission

Continue improving Fundstr after the completed source-visibility cleanup pass.

Your job is to:

- preserve the new private-for-now positioning
- keep the public UI aligned with "coming soon" source-release messaging
- avoid reintroducing repo/install/download promotion
- improve release readiness carefully and systematically
- document every significant change

## Critical Context

The product owner wants Fundstr to open source later, but not yet. The app previously exposed several visible UI signals that made it look openly available already.

That previous problem included:

- About page repo promotion
- About page install-as-PWA CTAs
- nav drawer GitHub repo link
- onboarding install/download UI
- wallet page install/download UI
- terms copy that claimed the app was already open-source / repository-licensed
- duplicated GitHub/install wording across locale files

Those visible issues were cleaned up in the latest pass.

## Completed Cleanup You Must Preserve

The latest pass already did the following:

1. Removed visible `Install PWA` / app-install CTA UI from public product surfaces.
2. Removed the visible Fundstr GitHub repo link from the app nav and About page.
3. Reworked the About page so the source release is described as `coming soon`.
4. Reworked the Terms page so it no longer says Fundstr is already open-source.
5. Reworked the welcome PWA slide into passive `coming soon` messaging.
6. Removed wallet-mounted iOS/Android add-to-home-screen prompts from visible rendering.
7. Updated locale files so duplicated copy no longer mentions GitHub/install messaging in those user-facing paths.
8. Added documentation files for this cleanup.

## Documents You Must Read First

Read these before making further changes:

1. `AGENTS.md`
2. `docs/open-source-visibility-cleanup-report-2026-03-23.md`
3. `docs/open-source-visibility-cleanup-superprompt-2026-03-23.md`
4. `.github/workflows/deploy-staging.yml`
5. `.github/workflows/deploy-prod.yml`

## Important Directory Guide

Use this as your quick orientation map:

- `src/pages/` - main route pages
- `src/pages/welcome/` - onboarding flow slides
- `src/components/` - shared UI and content blocks
- `src/i18n/` - locale message files; many public strings are duplicated here
- `src-pwa/` - manifest/service worker assets
- `public/` - static shipped files
- `docs/` - reports, handoff notes, AI prompts
- `.github/workflows/` - deployment and CI automation

## Files Touched In The Cleanup Pass

Treat these files as highly relevant context:

- `src/pages/AboutPage.vue`
- `src/components/AppNavDrawer.vue`
- `src/components/TermsContent.vue`
- `src/pages/WelcomePage.vue`
- `src/pages/welcome/WelcomeSlidePwa.vue`
- `src/pages/welcome/WelcomeSlideNostr.vue`
- `src/pages/WalletPage.vue`
- `src/i18n/en-US/index.ts`
- `src/i18n/ar-SA/index.ts`
- `src/i18n/de-DE/index.ts`
- `src/i18n/el-GR/index.ts`
- `src/i18n/es-ES/index.ts`
- `src/i18n/fr-FR/index.ts`
- `src/i18n/it-IT/index.ts`
- `src/i18n/ja-JP/index.ts`
- `src/i18n/sv-SE/index.ts`
- `src/i18n/th-TH/index.ts`
- `src/i18n/tr-TR/index.ts`
- `src/i18n/zh-CN/index.ts`
- `test/vitest/__tests__/welcome.pwa.spec.ts`

## Things That Are Still True After The Cleanup

These are important so you do not assume the work is fully complete:

### 1. PWA capability still exists under the hood

These files still keep PWA infrastructure alive:

- `src-pwa/manifest.json`
- `src-pwa/register-service-worker.js`
- `src/main.js`
- `quasar.config.js`

Visible install UI is gone, but technical PWA capability is still present.

### 2. Repo-level source posture is still not fully aligned

These still need owner-level follow-up:

- `README.md`
- `LICENSE.md`
- GitHub repo visibility

Do not casually rewrite licensing/legal posture without being deliberate and explicit.

### 3. Current workspace may be dirty

There are unrelated local changes in this environment. Do not revert or disturb unrelated work.

### 4. Release hygiene matters

Project guidance says release work should happen from a fresh clean worktree based on `origin/Develop2` or `origin/main`, not from a stale sandbox folder.

## High-Priority Follow-Up Opportunities

Work through these in order unless the user reprioritizes:

### A. Release-safe port into a clean worktree

- Create a fresh clean worktree from `origin/Develop2`.
- Port only the relevant UI cleanup files.
- Re-run tests/build there.
- Prepare a clean commit for staging.

### B. Staging and production release workflow

- Push to `Develop2` first if a safe staging verification step is desired.
- Verify staging renders the new messaging correctly.
- Promote to `main` only after staging confirmation.

### C. Repo posture alignment

If the owner wants the repo itself to stop reading as public/open-source right now, prepare a careful plan for:

- repo visibility changes
- README messaging changes
- license/legal implications
- deployment/release impact

Do not guess on licensing. Be explicit about what is code, what is product UI, and what is legal posture.

### D. Optional deeper cleanup

If requested, you can also:

- fully disable PWA capability instead of merely hiding visible install UI
- delete/archive unused prompt components
- rename `WelcomeSlidePwa.vue` so the filename matches its new purpose
- audit docs for stale open-source messaging outside the shipped app UI

## Constraints

- Keep the new public messaging consistent: Fundstr source release is `coming soon`.
- Do not reintroduce visible GitHub/repo promotion.
- Do not reintroduce visible app-install/download UI unless explicitly asked.
- Preserve existing Quasar/Vue conventions.
- Keep changes small, traceable, and documented.
- Run tests/build when your changes touch runtime UI.

## Verification Commands

Use these as your default validation steps:

```bash
pnpm exec vitest run test/vitest/__tests__/welcome.interaction.spec.ts test/pages/WalletPage.spec.ts
pnpm run build
```

If you expand scope, add relevant targeted tests instead of running random broad suites first.

## What Good Output Looks Like

When you finish future work, produce:

1. a concise summary of what changed
2. exact file paths touched
3. verification performed
4. remaining risks / follow-ups
5. updated docs in `docs/` when the change is substantial

## Immediate Recommended Next Task

Start by creating a clean release worktree from `origin/Develop2`, porting the already-completed source-visibility cleanup into it, and preparing that clean branch for staging deployment without disturbing unrelated local changes.
