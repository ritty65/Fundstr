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
