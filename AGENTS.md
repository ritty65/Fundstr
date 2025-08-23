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

## Theme Tokens
| Token | Purpose |
|-------|---------|
| `--text-1` | Primary text color |
| `--text-2` | Muted/secondary text color |
| `--text-inverse` | Text on inverted surfaces |
| `--surface-1` | Page background |
| `--surface-2` | Card/panel background |
| `--surface-contrast-border` | Subtle surface border |
| `--accent-500` | Brand accent base |
| `--accent-600` | Active/pressed accent |
| `--accent-200` | Accent outline/hover |
| `--chip-bg` | Chip background |
| `--chip-text` | Chip text color |
| `--tab-active` | Active tab text/indicator |
| `--tab-inactive` | Inactive tab text |
| `--disabled-text` | Disabled text color |

Utility classes: `.text-1`, `.text-2`, `.text-inverse`, `.bg-surface-1`, `.bg-surface-2`.

## Welcome Gate
- Local storage key `welcome.seen:v1` and cookie `welcome_seen_v1` track if the onboarding was shown on a device.
- Bump to `welcome.seen:v2`/`welcome_seen_v2` when revising the flow to force users through the new onboarding.
