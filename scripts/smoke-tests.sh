#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-https://staging.fundstr.me}"
TRACE_FILE="${SMOKE_TRACE_FILE:-}"
SMOKE_EXPECT_ENV="${SMOKE_EXPECT_ENV:-}"
CURL_ARGS=(--retry 2 --retry-all-errors --retry-delay 1 --connect-timeout 15 --max-time 45)

log_step() {
  local message="$1"
  local ts
  ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  if [ -n "$TRACE_FILE" ]; then
    printf '[%s] %s\n' "$ts" "$message" | tee -a "$TRACE_FILE"
  else
    printf '[%s] %s\n' "$ts" "$message"
  fi
}

header_value() {
  local headers="$1"
  local key="$2"
  awk -F': ' -v key="$key" 'tolower($1) == key {print tolower($2)}' <<<"$headers" | tr -d '\r'
}

fetch_headers() {
  local url="$1"
  local headers

  if headers=$(curl "${CURL_ARGS[@]}" -fsSI "$url"); then
    printf '%s' "$headers"
    return 0
  fi

  log_step "HEAD request failed for $url; retrying with GET headers"
  curl "${CURL_ARGS[@]}" -fsSL -D - -o /dev/null "$url"
}

fetch_body() {
  local url="$1"
  curl "${CURL_ARGS[@]}" -fsSL "$url"
}

root_headers=$(fetch_headers "$BASE/")
root_csp=$(header_value "$root_headers" "content-security-policy")
[ -n "$root_csp" ] || {
  log_step "Missing Content-Security-Policy header on root document"
  exit 1
}
log_step "Root CSP: $root_csp"

discovery_headers=$(fetch_headers "$BASE/find-creators.html")
discovery_csp=$(header_value "$discovery_headers" "content-security-policy")
[ -n "$discovery_csp" ] || {
  log_step "Missing Content-Security-Policy header on discovery iframe document"
  exit 1
}
log_step "Discovery CSP: $discovery_csp"

echo "$discovery_csp" | grep -q "frame-ancestors 'none'" && {
  log_step "Discovery CSP blocks iframe embedding (frame-ancestors 'none')"
  exit 1
}

discovery_xfo=$(header_value "$discovery_headers" "x-frame-options")
[ "$discovery_xfo" != "deny" ] || {
  log_step "Discovery page blocks iframe embedding with X-Frame-Options: DENY"
  exit 1
}

discovery_html=$(fetch_body "$BASE/find-creators.html")
echo "$discovery_html" | grep -Eiq '/assets/[A-Za-z0-9._-]+\.js' && {
  log_step "Discovery page is serving SPA shell HTML; expected standalone discovery document"
  exit 1
}

echo "$discovery_html" | grep -q "vendor/nostr.bundle.1.17.0.js" || {
  log_step "Discovery page missing vendored nostr bundle reference"
  exit 1
}

echo "$discovery_html" | grep -Eiq 'unpkg\.com' && {
  log_step "Discovery page still references unpkg.com"
  exit 1
}

log_step "Discovery dependency policy checks passed"

manifest_headers=$(fetch_headers "$BASE/manifest.json")
manifest_type=$(header_value "$manifest_headers" "content-type")
echo "$manifest_type" | grep -Eiq "application/(manifest\+json|json)" || {
  log_step "manifest.json is not served as JSON (got: $manifest_type)"
  exit 1
}
log_step "Manifest Content-Type: $manifest_type"

featured_headers=$(fetch_headers "$BASE/featured-creators.json")
featured_type=$(header_value "$featured_headers" "content-type")
echo "$featured_type" | grep -Eiq "application/json" || {
  log_step "featured-creators.json is not served as JSON (got: $featured_type)"
  exit 1
}
log_step "Featured creators Content-Type: $featured_type"

deploy_marker=$(fetch_body "$BASE/deploy.txt")
echo "$deploy_marker" | grep -q "<!DOCTYPE html>" && {
  log_step "deploy.txt resolved to HTML; expected plain deploy marker"
  exit 1
}
deploy_env=$(printf '%s\n' "$deploy_marker" | awk -F'=' '$1=="env" {print $2; exit}')
[ -n "$deploy_env" ] || {
  log_step "deploy.txt is missing expected env metadata"
  exit 1
}

if [ -n "$SMOKE_EXPECT_ENV" ] && [ "$deploy_env" != "$SMOKE_EXPECT_ENV" ]; then
  log_step "deploy.txt env mismatch: expected '$SMOKE_EXPECT_ENV' but got '$deploy_env'"
  exit 1
fi

log_step "Deploy marker detected (env=$deploy_env)"

html=$(fetch_body "$BASE/")
asset=$(echo "$html" | grep -Eo '/assets/[A-Za-z0-9._-]+\.js' | head -n1)
[ -n "$asset" ] || {
  log_step "No asset reference found in home HTML"
  exit 1
}
log_step "Testing $asset"
asset_headers=$(fetch_headers "$BASE$asset")
ctype=$(header_value "$asset_headers" "content-type")
log_step "Content-Type: $ctype"
echo "$ctype" | grep -q javascript || {
  log_step "Asset is NOT JavaScript"
  exit 1
}

log_step "Running relay health smoke checks"
node scripts/relay-health-smoke.mjs

log_step "Smoke tests OK"
