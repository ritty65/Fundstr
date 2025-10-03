# Primal profile proxy

The `find-creators` standalone page now relies on a managed proxy in front of
Primal's public indexer instead of the third-party `corsproxy.io` service.
This proxy lives in the existing Cloudflare Worker under
`workers/fundstr-proxy/src/index.ts` and exposes a dedicated `/primal` route.

## Worker behaviour

- Only `GET` requests are accepted. A `path` query parameter is required and is
  resolved against the upstream base (`PRIMAL_API_BASE`, default
  `https://primal-cache.snort.social`). Any attempts to hit a different origin
  are rejected with `403`.
- Successful responses are cached in the worker cache for
  `PRIMAL_CACHE_TTL_SECONDS` (default 60 seconds). Errors and 5xx responses are
  never cached. All responses include permissive `Access-Control-Allow-*`
  headers so the browser can consume them directly.
- Requests are forwarded with `Accept: application/json, application/nostr+json`
  to preserve compatibility with Primal's payloads.

### Deploying

1. Update the worker secrets/config in Cloudflare (`wrangler secret put` or via
   the dashboard) if you need to override `PRIMAL_API_BASE` or change the cache
   TTL.
2. Deploy using the existing workflow for `fundstr-proxy` (e.g.
   `pnpm --filter fundstr-proxy deploy` or `wrangler deploy`). No new worker is
   required—the `/primal` endpoint ships with the same bundle as the relay
   proxy.
3. Validate the route by curling the worker:
   `curl "https://<worker-host>/primal?path=/api/v1/eose/user/profile/<pubkey>"`.

## Front-end configuration

`public/find-creators.html` now reads the proxy endpoint from
`#fundstr-primal-config` (or `window.__FUNDSTR_PRIMAL__`). Set the
`profileProxy` property to your deployed worker URL, e.g.

```html
<script type="application/json" id="fundstr-primal-config">
  {
    "profileProxy": "https://proxy.fundstr.me/primal"
  }
</script>
```

The page automatically backs off from Primal after a burst of 5xx responses.
After `max5xxBeforeBackoff` consecutive server errors (default 2) the UI skips
Primal requests for `backoffMs` (default 120s). These thresholds can be tuned in
`fundstr-primal-config` or `window.__FUNDSTR_PRIMAL__` if needed.

## Monitoring notes

- Because the worker caches successful responses, a sustained hit rate above the
  TTL (60s) should be reflected in Cloudflare cache analytics. Miss spikes and
  5xx counts should be tracked alongside our relay proxy metrics.
- When the browser observes repeated 5xx responses it will emit console warnings
  such as `"Primal indexer disabled for 120s after repeated 5xx responses."` and
  throws an error with code `PRIMAL_BACKOFF_ACTIVE`. Capture these via
  Sentry/Datadog to alert on upstream issues.
- A prolonged outage can be mitigated by pointing `profileProxy` at an alternate
  cache or disabling the block entirely (set `profileProxy` to an empty string)
  until Primal recovers.
