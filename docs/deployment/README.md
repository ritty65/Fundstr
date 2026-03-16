# Deployment Runbook

## Module bundle availability check

Both GitHub Actions deploy workflows (`deploy-staging.yml` and `deploy-prod.yml`) now run an explicit check to ensure the main JavaScript bundle remains accessible after rsync completes.

1. The workflow fetches the deployed `index.html` and extracts the first `<script type="module">` entry.
2. It resolves the script URL (respecting absolute, protocol-relative, or relative paths) against the environment domain.
3. A `curl -I` request confirms the script responds with HTTP 200 and that the `Content-Type` header includes `javascript`.

If any of those validations fail, the job stops before marking the deployment successful. This prevents scenarios where the HTML is uploaded but the referenced bundle is missing or mis-served (wrong MIME type), which previously caused blank screens in the app.

Keep the check up to date whenever the build output structure changes or additional entrypoints are introduced. If you intentionally change the main module tag, adjust the parsing pattern accordingly so the guard continues to validate the correct asset.

## SPA MIME type & routing verification

The Apache `.htaccess` file shipped in `public/.htaccess` is the only server-side configuration we control on Hostinger. It
adds explicit MIME hints for JavaScript modules (`AddType application/javascript .js .mjs`) and rewrites every non-asset
route back to `index.html`. This ensures the compiled bundle (for example `index-Ig7EOVFe.js`) leaves the CDN with
`Content-Type: application/javascript` while `/creator/.../profile` and other deep links render the SPA shell.

Run `scripts/smoke-tests.sh` after each deployment to confirm headers on staging. The script now fails unless the main
bundle returns `application/javascript` (no generic `text/plain` fallbacks) and both `/wallet` and `/creator/example/profile`
resolve to `text/html`. For an additional sanity check, open the site in a browser, reload with DevTools → Network, and
verify each asset shows the expected `Content-Type` column before promoting to production.

## Staging/prod isolation (Hostinger safeguard)

On Hostinger, staging can be configured under a production subdirectory (for example `public_html/staging`).
That layout is now supported by a production deploy safeguard that snapshots and restores the nested staging subtree
around production atomic swap steps.

Use `docs/deploy-never-again-runbook.md` for the full release checklist, failure map, and emergency restore commands.

Quick verification after each staging/prod deploy:

```bash
curl -fsSL https://fundstr.me/deploy.txt
curl -fsSL https://staging.fundstr.me/deploy.txt
curl -i 'https://fundstr.me/find_profiles.php?q=jack'
curl -i 'https://staging.fundstr.me/find_profiles.php?q=jack'
```

The phonebook endpoint checks above must return `application/json`.
If either one returns the SPA shell HTML, the deploy is incomplete or the
server rewrite rules are still intercepting `/find_profiles.php`.

## Phonebook runtime config

`public/find_profiles.php` now supports a fast local DB-backed lookup path before
falling back to upstream discovery.

Recommended runtime variables on Hostinger:

```text
FUNDSTR_PHONEBOOK_DSN
FUNDSTR_PHONEBOOK_DB_HOST
FUNDSTR_PHONEBOOK_DB_PORT
FUNDSTR_PHONEBOOK_DB_NAME
FUNDSTR_PHONEBOOK_DB_USER
FUNDSTR_PHONEBOOK_DB_PASS
FUNDSTR_PHONEBOOK_DB_TABLES
FUNDSTR_PHONEBOOK_DB_AUTHORITATIVE
FUNDSTR_PHONEBOOK_CACHE_DIR
FUNDSTR_PHONEBOOK_CACHE_TTL_DB
FUNDSTR_PHONEBOOK_CACHE_TTL_UPSTREAM
FUNDSTR_PHONEBOOK_CACHE_TTL_DEGRADED
FUNDSTR_PHONEBOOK_TIMEOUT
```

Do not commit real values. Set them in Hostinger runtime config or server env so
the phonebook can query local cache tables without routing every search through
slow upstream discovery.

Recommended rollout default:

- leave `FUNDSTR_PHONEBOOK_DB_AUTHORITATIVE=false` at first

That means the DB is preferred when it has a hit, but upstream discovery can still
fill misses while you validate coverage. Only switch to `true` after you confirm the
database alone returns complete enough results for common searches.
