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
