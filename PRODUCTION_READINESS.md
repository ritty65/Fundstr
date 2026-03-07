# Production Readiness Checklist

Before deploying this repository to production, the following areas require attention:

## 1. Reliability & Error Handling
- **Sad Path Auditing**: Similar to the fix in `fundstrDiscovery.ts`, audit other API integrations (Nostr `useNdk`, Cashu `cashu-ts` wrappers) for brittle data processing. Ensure a single malformed event or token doesn't crash the UI.
- **Telemetry**: Integrate a frontend error tracking service (e.g., Sentry) to capture handled warnings (like the "skipped creator" warning) and unhandled exceptions.

## 2. Testing
- **E2E Stability**: Address the flaky `completeOnboarding` flow in Playwright tests. Flaky tests reduce confidence in CI/CD.
- **Sad Path Coverage**: Expand test coverage to include network failures, timeout simulations, and invalid data responses for all major stores (`wallet`, `mints`, `subscriptions`).

## 3. Data Integrity & Migrations
- **Migration Verification**: rigorously test `migrationsStore` with real-world data dumps from older versions to ensure no data loss during upgrades.
- **Backup/Restore**: Verify the reliability of the backup/restore functionality (`storage-backup.spec.ts`), ensuring it handles large datasets (many history items/proofs) correctly.

## 4. Performance
- **Startup Optimization**: `WalletPage.vue` initializes multiple workers and stores concurrently. Profile this on low-end mobile devices to ensure it doesn't freeze the UI.
- **Large Lists**: Verify virtualization or pagination is used for long lists (e.g., transaction history, huge list of creators) to avoid DOM overload.

## 5. Security
- **Secret Management**: Audit `IndexedDB` usage for sensitive data (Cashu proofs, Nostr private keys). Ensure `console.log` is stripped in production builds to prevent leaking secrets.
- **Input Sanitization**: Ensure all user-generated content (from Nostr events) is properly sanitized before rendering (HTML injection prevention), specifically in `MediaPreview.vue` and markdown renderers.

## 6. Offline & PWA
- **Offline UX**: Verify the app's behavior when offline. Ensure actions that require network (sending tokens, fetching creators) provide clear user feedback instead of hanging.
- **Service Worker**: Confirm `workbox` configuration properly caches static assets and handles updates without stranding users on old versions.
- **Manual checks**: While offline, try sending/receiving (relay.nostr.band) and fetching creators (api.fundstr.me). Confirm the offline banners/toasts appear and cached data stays visible until connectivity returns.
- **Automated checks**: Keep tests that simulate offline creator lookups and relay-bound flows (send/receive) up-to-date so regressions surface in CI.
