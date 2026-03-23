# Fundstr Open-Source Visibility Cleanup Report

Date: 2026-03-23

## Executive Summary

Fundstr was still presenting itself as openly available source code and as an installable PWA across several public UI surfaces. That no longer matched the product direction. The requested change was to remove visible install/download UI, remove the repo/GitHub promotion, and replace the Fundstr-specific open-source positioning with "coming soon" messaging.

This cleanup is now implemented in the shipped app UI. The visible repo link is removed, visible PWA install prompts are removed, the About page now positions the source release as coming soon, and the Terms page no longer claims the app is already open source.

Important: the underlying PWA build pipeline still exists, and the GitHub repository itself still appears to be public. Those are now documented as follow-up items rather than user-visible UI issues.

## Short Problem Summary

### What was happening

- The About page described Fundstr itself as open-source, linked directly to the repo, and pushed users to install the app as a PWA.
- The main nav drawer linked directly to the Fundstr GitHub repository.
- The welcome flow and wallet UI still showed app-install prompts and platform-specific add-to-home-screen prompts.
- Terms/legal copy still said the code was open-source and repository-licensed.
- The same messaging was duplicated in the locale files, so the issue existed across supported languages.

### Why this was a problem

- The public UI messaging no longer matched the desired product posture.
- It created a mismatch between brand intent and what users saw on the site.
- It over-promoted install/download behavior that the product owner wants hidden for now.
- It made the About page and Terms page inconsistent with the desired "coming soon" source-release message.

## Requested Outcome

- Remove visible install/download UI.
- Remove the GitHub repo link from the site.
- Replace Fundstr-specific open-source messaging with "coming soon" wording.
- Update the About page accordingly.
- Produce a full report and a reusable AI superprompt with project context.

## Scope Decision

This pass removed visible UI and copy. It intentionally did not disable the PWA build under the hood.

That means:

- visible install prompts are gone
- visible repo promotion is gone
- visible Fundstr open-source claims are rewritten
- PWA infrastructure still exists in the codebase
- repo visibility / licensing follow-up is still needed outside this UI cleanup

## Changes Implemented

### 1. About Page Cleanup

File: `src/pages/AboutPage.vue`

Changes made:

- Removed the hero `Install PWA` button.
- Removed the footer CTA `Install PWA` button.
- Removed the footer `View Code` repo link.
- Reworded the hero copy so it no longer says Fundstr is built on an open-source app stack; it now references the Cashu protocol and Nostr network without claiming Fundstr itself is already open source.
- Reworked the trust card from `Open Source & Verifiable` to `Open Source Coming Soon`.
- Replaced Fundstr-specific open-source claims with release-prep language.
- Removed GitHub/Open Source Definition links from the About page.
- Replaced GitHub-based protocol links with non-GitHub docs/resources where appropriate.
- Updated the FAQ entry from an active open-source answer to a coming-soon source release answer.
- Reworked the closing CTA to point users to in-app destinations instead of install/code actions.

Result:

- The About page now reflects the intended private-for-now positioning.
- The page still explains the product clearly, but no longer advertises the repo or app installation.

### 2. Navigation Cleanup

File: `src/components/AppNavDrawer.vue`

Changes made:

- Removed the Fundstr GitHub link from the nav drawer's external links list.

Result:

- Users no longer see the repo promoted from the main app navigation.

### 3. Terms / Legal Copy Cleanup

File: `src/components/TermsContent.vue`

Changes made:

- Replaced the opening `open-source code` banner language with `private alpha client` language.
- Reworked the source-availability section to say Fundstr is not publicly open sourced yet.
- Replaced repository/license claims with future-release wording.
- Removed self-hosted-instance wording that assumed a current public source release.
- Simplified the agreement language so it no longer references open-source licenses as currently applicable to the public app.

Result:

- The Terms page is now materially closer to the current product posture.

### 4. Welcome Flow Cleanup

Files:

- `src/pages/WelcomePage.vue`
- `src/pages/welcome/WelcomeSlidePwa.vue`
- `src/pages/welcome/WelcomeSlideNostr.vue`

Changes made:

- Removed the active PWA install logic from the welcome page wiring.
- Reworked the old PWA slide into a passive `coming soon` informational slide with no install buttons.
- Removed GitHub anchor links from the Nostr signer suggestion list; the list now shows plain extension names only.

Result:

- New users no longer get app-install UI during onboarding.
- The welcome flow still works, but it no longer pushes download/install behavior.

### 5. Wallet Cleanup

File: `src/pages/WalletPage.vue`

Changes made:

- Removed the browser-only install button.
- Removed mounted iOS/Android add-to-home-screen prompt components from the rendered wallet page.
- Removed the related in-page PWA prompt/event hook methods and data used by that visible UI.

Result:

- The wallet no longer surfaces app-install UI.

### 6. Locale / Copy Consistency Cleanup

Files:

- `src/i18n/ar-SA/index.ts`
- `src/i18n/de-DE/index.ts`
- `src/i18n/el-GR/index.ts`
- `src/i18n/en-US/index.ts`
- `src/i18n/es-ES/index.ts`
- `src/i18n/fr-FR/index.ts`
- `src/i18n/it-IT/index.ts`
- `src/i18n/ja-JP/index.ts`
- `src/i18n/sv-SE/index.ts`
- `src/i18n/th-TH/index.ts`
- `src/i18n/tr-TR/index.ts`
- `src/i18n/zh-CN/index.ts`

Changes made:

- Changed the old GitHub nav label/caption to neutral `Source Code` / `Coming soon` fallback text.
- Updated the About/welcome external-links description so it no longer mentions GitHub.
- Reworked the old `Install as App` copy under `Welcome.pwa` into `Coming soon` copy.

Result:

- The visible copy is now aligned across locales instead of only in one language path.

### 7. Test Update

File: `test/vitest/__tests__/welcome.pwa.spec.ts`

Changes made:

- Updated the test so it now asserts the slide renders passive copy and no install button.

Result:

- Test coverage remains aligned with the new UI behavior.

## Visible UX Improvements

- The site no longer sends mixed signals about source availability.
- The About page now reads like a controlled alpha product instead of a public OSS release page.
- The nav is cleaner and less distracting.
- Onboarding is less noisy and no longer pushes install actions.
- The wallet screen is simpler because the install controls are gone.
- The legal copy is less contradictory.

## What Was Intentionally Not Changed

### PWA infrastructure remains under the hood

These files still exist and still support PWA behavior in the build/runtime layer:

- `src-pwa/manifest.json`
- `src-pwa/register-service-worker.js`
- `src/main.js`
- `quasar.config.js`

This was intentional because the request was to remove visible install/download UI, not fully disable PWA support.

### Repo visibility / licensing were not changed in this pass

The repo itself still needs manual product/release follow-up:

- `README.md` still describes MIT licensing.
- `LICENSE.md` still exists.
- The GitHub repository currently appears public.

Those are not fixed by UI cleanup alone.

### PWA helper/components still exist but are not surfaced

These files still exist for possible future reuse, but they are no longer part of the visible wallet flow:

- `src/components/iOSPWAPrompt.vue`
- `src/components/AndroidPWAPrompt.vue`
- `src/composables/usePwaInstall.ts`

## Directory Map And Where Things Live

### Primary app directories

- `src/pages/` - route-level pages such as About, Wallet, Welcome, Creator Studio.
- `src/pages/welcome/` - onboarding slide components and welcome-flow UI.
- `src/components/` - shared UI building blocks such as the nav drawer, terms content, dialogs, and reusable widgets.
- `src/i18n/` - locale message packs; multiple language files duplicate some public-facing product copy.
- `src-pwa/` - PWA manifest and service worker registration assets.
- `public/` - static files that ship directly, including `find-creators.html`, icons, and PHP/search assets.
- `.github/workflows/` - CI/CD workflows for build, staging deploy, and production deploy.
- `docs/` - project reports, handoff docs, and AI prompts.

### Files added in this task

- `docs/open-source-visibility-cleanup-report-2026-03-23.md`
- `docs/open-source-visibility-cleanup-superprompt-2026-03-23.md`

### Existing deployment docs worth knowing

- `AGENTS.md`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/deploy-prod.yml`

## Documentation Output From This Task

The deliverables created for this task are stored here:

- Report: `docs/open-source-visibility-cleanup-report-2026-03-23.md`
- Future-AI superprompt: `docs/open-source-visibility-cleanup-superprompt-2026-03-23.md`

## Verification Performed

### Targeted tests

Command:

```bash
pnpm exec vitest run test/vitest/__tests__/welcome.interaction.spec.ts test/pages/WalletPage.spec.ts
```

Result:

- Passed
- `18` tests passed

### Build

Command:

```bash
pnpm run build
```

Result:

- Passed
- Quasar PWA build completed successfully

### Post-change grep audit

Confirmed the main user-facing `src` surfaces no longer contain:

- `github.com/ritty65/Fundstr`
- `View Code`
- `Install PWA`
- active About-page repo/install CTAs
- wallet-mounted PWA install UI

## Remaining Risks And Follow-Ups

### 1. Repo is still publicly exposed outside the UI

If the goal is truly "not open source yet," the following follow-up is still required:

- make the GitHub repo private or move code to a private canonical repo
- align `README.md`
- decide what to do with `LICENSE.md`

### 2. PWA is still technically buildable/installable

Because the manifest and service worker still exist, browsers may still treat the app as installable under some conditions even though the UI no longer advertises it.

### 3. Release hygiene still matters

The workspace used for this task was already dirty with unrelated changes. The repo guidance says release work should be pushed from a fresh clean worktree based on `origin/Develop2` or `origin/main`, not from a stale sandbox.

### 4. Public-facing docs still need policy alignment

The in-app UI is fixed, but repo-level docs and legal/licensing posture still need a deliberate owner decision.

## Recommended Next Steps

### Immediate

1. Port these exact changed files into a fresh clean worktree from `origin/Develop2`.
2. Push to `Develop2` and verify staging.
3. Promote to `main` only after staging confirms the new messaging is correct.

### Product / repo follow-up

1. Decide whether the GitHub repo should become private now.
2. Align `README.md` and `LICENSE.md` with the real source-availability strategy.
3. Decide whether hidden PWA capability should remain or be fully disabled in a later pass.

### Future cleanup

1. Remove or archive unused PWA prompt components if they are no longer part of the roadmap.
2. Decide whether the `WelcomeSlidePwa.vue` file should be renamed to reflect its new `coming soon` purpose.
3. Review the rest of the docs directory for messaging consistency if this product-positioning change becomes permanent.

## Final Status

The user-visible app now reflects the requested direction:

- no visible Fundstr repo link
- no visible app install/download UI
- About page updated to "coming soon" source-release messaging
- legal copy moved away from current open-source claims
- onboarding and wallet flows cleaned up
- documentation and AI handoff materials created
