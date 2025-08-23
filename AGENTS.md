# AGENTS.md

## Project
Fundstr — Quasar/Vite SPA (pnpm). Staging auto-deploys on every push to `develop`.

## Setup & daily commands
- Install deps: `pnpm install`
- Dev server: `pnpm dev`
- Build (SPA): `pnpm dlx @quasar/cli build -m spa`
- Tests: `pnpm test`        # (wire up Vitest if needed)
- Lint: `pnpm lint`         # if ESLint configured

## CI/CD
- **Staging**: push to `develop` → GitHub Action builds & rsyncs to Hostinger → https://staging.fundstr.me/
- **Prod**: via manual workflow from `main` (see `.github/workflows`).

## Constraints & code style
- Keep pnpm at **8.15.7** (locked in `packageManager`).
- Don’t commit `.env` secrets; only `.env.staging`/`.env.production` placeholders.
- Preserve SPA `.htaccess` under `public/`.

## Guardrails
- Prefer small PRs/commits with clear messages.
- Don’t modify deploy secrets or server paths in workflows.
- If changing Quasar config, ensure staging still builds and routes correctly.

## Definition of Done
- Local build passes.
- `pnpm test` (if tests exist) passes.
- After push to `develop`, staging loads without console errors; `deploy.txt` updated.
