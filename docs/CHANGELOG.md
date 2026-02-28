# Changelog

## Unreleased

- Buckets UI redesign – Phase9
- Bucket detail opens in a modal from the Buckets page.
  Direct links to `/buckets/:id` still work but are only kept
  for backward compatibility. Navigate to `/buckets` and select
  "Manage" on a bucket to open the modal.
- Bucket detail modal includes a History tab.
- Documented iframe snippet support and Nostr event link embedding for media previews. These previews also show when viewing tiers from the find creators page.
- Creator Studio: publish uses fallback relays on failure; per-relay results and connected count fixes; tier definitions included.
- Messenger DMs: introduced dual signer abstraction (NIP-07 and in-app keys), resilient WS/HTTP transport fallback with relay diagnostics, AUTH toggle, and signer/transport UI badges.
- Deploy hardening: production deploy now preserves nested staging subpaths during atomic swaps when Hostinger staging is configured under `public_html`, and a new incident/runbook doc (`docs/deploy-never-again-runbook.md`) captures release checks and emergency recovery.
- Release sync: merged `Develop2` into `main` via `#1357` (`167e0d3`) and verified green `build` (`22521072310`) + `Test` (`22521072300`) checks on `main`.
- Production deploy evidence: `Deploy production (main -> Hostinger)` run `22521072297` passed, `https://fundstr.me/deploy.txt` now reports `env=production` with `sha=167e0d3c18a3f8cff1b7e4404973b5d7a7ce59f0`.
- Post-release verification: staging remains pinned to `Develop2` (`sha=6c9e8dafa0140c575796d532839ca04da029afa2`), smoke checks pass on both environments, and synthetic staging journeys pass for both `https://fundstr.me` and `https://staging.fundstr.me`.
- Ops evidence refresh: merged `#1358` (`fe1e86f`) and verified follow-up green `build` (`22521782161`) + `Test` (`22521782164`) checks on `main`.
- Production deploy refresh: run `22521782163` passed and `https://fundstr.me/deploy.txt` now reports `env=production` with `sha=fe1e86f6344f39f5aa34f8bbafcf2b7b7e6e0a74`.
