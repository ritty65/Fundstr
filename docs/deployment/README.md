# Deployment Runbook

## Module bundle availability check

Both GitHub Actions deploy workflows (`deploy-staging.yml` and `deploy-prod.yml`) now run an explicit check to ensure the main JavaScript bundle remains accessible after rsync completes.

1. The workflow fetches the deployed `index.html` and extracts the first `<script type="module">` entry.
2. It resolves the script URL (respecting absolute, protocol-relative, or relative paths) against the environment domain.
3. A `curl -I` request confirms the script responds with HTTP 200 and that the `Content-Type` header includes `javascript`.

If any of those validations fail, the job stops before marking the deployment successful. This prevents scenarios where the HTML is uploaded but the referenced bundle is missing or mis-served (wrong MIME type), which previously caused blank screens in the app.

Keep the check up to date whenever the build output structure changes or additional entrypoints are introduced. If you intentionally change the main module tag, adjust the parsing pattern accordingly so the guard continues to validate the correct asset.
