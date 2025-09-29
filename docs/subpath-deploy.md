# Deploying Fundstr to `/creator-hub`

This application is hosted under a subpath rather than the domain root. The items below are the source of truth for reliable deployments.

## Build configuration

- `PUBLIC_PATH` defaults to `/creator-hub/`; override it per environment if necessary.
- Vite references the base path through `import.meta.env.BASE_URL`. Do not hardcode `/` in router history, service-worker registration, or asset URLs.
- The build target is `es2019` and `@vitejs/plugin-legacy` generates an additional bundle for older Safari/Android.
- When building: `PUBLIC_PATH=/creator-hub/ pnpm run build`.

## Service worker scope & cache

- The Workbox scope is pinned to `/creator-hub/` via `quasar.config.js`.
- `sw.js` is registered with `{ scope: import.meta.env.BASE_URL }`, so it never controls other parts of the site.
- Runtime navigation fallbacks explicitly **exclude** `/creator-hub/assets/**` to avoid serving HTML for JavaScript files.
- Workbox is configured with `skipWaiting`, `clientsClaim`, and `cleanupOutdatedCaches` so new builds activate immediately.
- If you need to invalidate an old service worker quickly, deploy a `sw.js` that calls `self.registration.unregister()` (see rollback section).

## Server rules

- LiteSpeed/Apache: upload [`docs/deploy/creator-hub.htaccess`](deploy/creator-hub.htaccess) into `/public_html/creator-hub/`.
  - Hashed assets (`/creator-hub/assets/*`) are never rewritten and receive long-lived caching.
  - `index.html` is cache-busted conservatively (`access plus 0 seconds`).
- Nginx: apply [`docs/deploy/nginx.md`](deploy/nginx.md) in the virtual host/front proxy.
  - `try_files` prevents rewrites on hashed assets and falls back to the SPA entry point for deep links.

## Cache purging & verification

1. **Deploy** to the staging path.
2. **Purge** LiteSpeed cache for `/creator-hub/` or clear CDN caches if applicable. Only purge the SPA entry point and `sw.js`; leave hashed assets cached.
3. **Verify**:
   - `curl -I https://staging.fundstr.me/creator-hub/assets/<hash>.js` → `Content-Type: application/javascript` and `Cache-Control` contains `immutable`.
   - Hard reload in Chrome, Firefox, and Safari: the app loads, no blank screen.
   - `Application → Service Workers` in DevTools shows the new SW activated immediately.
   - Run [`scripts/smoke-tests.sh`](../scripts/smoke-tests.sh) after deployment.

## Rollback plan

1. Keep the previously working `dist` artefact as `dist.bak` (or store builds in timestamped folders).
2. To roll back: swap the `creator-hub` symlink or move the `dist.bak` back into place.
3. Deploy a temporary service worker that unregisters itself:

   ```js
   self.addEventListener('install', () => self.skipWaiting());
   self.addEventListener('activate', (event) => {
     event.waitUntil((async () => {
       await self.registration.unregister();
       const clients = await self.clients.matchAll({ type: 'window' });
       clients.forEach((client) => client.navigate(client.url));
     })());
   });
   ```

   Place it as `/creator-hub/sw.js`, wait for clients to refresh, then redeploy the known-good build.
4. Re-run the smoke tests and confirm the PWA now points to the restored version.

## Troubleshooting check-list

- If `/creator-hub/assets/*.js` returns HTML, check `.htaccess`/Nginx rules first.
- If Safari shows a blank page, confirm the legacy bundle is present and that the Content-Type header is `application/javascript`.
- Clear the service worker (DevTools → Application → Clear storage) if you suspect stale precache data.
