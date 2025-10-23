#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-https://staging.fundstr.me}"

# Helper to extract a header case-insensitively
get_header() {
  # usage: get_header "Header-Name" <<< "$headers"
  awk -F': *' -v key="$(echo "$1" | tr '[:upper:]' '[:lower:]')" '
    BEGIN{IGNORECASE=1}
    tolower($1)==key {print $2; exit}
  '
}

# 1) main asset must be JavaScript (and 200)
HTML=$(curl -fsSL "$BASE/")
ASSET=$(echo "$HTML" | grep -Eo '/assets/[A-Za-z0-9._-]+\.js' | head -n1)
[ -n "$ASSET" ] || { echo "No asset reference found in HTML"; exit 1; }

H_ASSET=$(curl -fsSI "$BASE$ASSET" || true)
SC_ASSET=$(echo "$H_ASSET" | awk 'NR==1{print $2}')
CT_ASSET=$(echo "$H_ASSET" | get_header "Content-Type" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
CT_ASSET_BASE=$(echo "$CT_ASSET" | cut -d';' -f1 | tr -d ' ')

echo "Asset: $ASSET"
echo "Status: $SC_ASSET"
echo "Content-Type: $CT_ASSET"

[ "$SC_ASSET" = "200" ] || { echo "FAIL: $ASSET status $SC_ASSET"; exit 1; }
if [ "$CT_ASSET_BASE" != "application/javascript" ]; then
  echo "FAIL: asset Content-Type '$CT_ASSET' is not application/javascript"
  exit 1
fi

# 2) sw.js must be NO-CACHE — hit with version to bypass CDN edge
H_SW=$(curl -fsSI "$BASE/sw.js?v=$(date +%s)" || true)
CC_SW=$(echo "$H_SW" | get_header "Cache-Control" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
VARY_SW=$(echo "$H_SW" | get_header "Vary" | tr -d '\r')

echo "sw.js Cache-Control: $CC_SW"
echo "sw.js Vary: $VARY_SW"

echo "$CC_SW" | grep -Eq 'no-cache|no-store|must-revalidate' || { echo "FAIL: sw.js not no-cache"; exit 1; }

# 3) deep route must be HTML
H_HTML=$(curl -fsSI "$BASE/wallet" || true)
SC_HTML=$(echo "$H_HTML" | awk 'NR==1{print $2}')
CT_HTML=$(echo "$H_HTML" | get_header "Content-Type" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
VARY_HTML=$(echo "$H_HTML" | get_header "Vary" | tr -d '\r')

CREATOR_ROUTE="${CREATOR_ROUTE:-/creator/example/profile}"
H_CREATOR=$(curl -fsSI "$BASE$CREATOR_ROUTE" || true)
SC_CREATOR=$(echo "$H_CREATOR" | awk 'NR==1{print $2}')
CT_CREATOR=$(echo "$H_CREATOR" | get_header "Content-Type" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
VARY_CREATOR=$(echo "$H_CREATOR" | get_header "Vary" | tr -d '\r')

echo "Route status: $SC_HTML"
echo "Route Content-Type: $CT_HTML"
echo "Route Vary: $VARY_HTML"

echo "Creator route: $CREATOR_ROUTE"
echo "Creator status: $SC_CREATOR"
echo "Creator Content-Type: $CT_CREATOR"
echo "Creator Vary: $VARY_CREATOR"

[ "$SC_HTML" = "200" ] || { echo "FAIL: route status $SC_HTML"; exit 1; }
echo "$CT_HTML" | grep -q 'text/html' || { echo "FAIL: route not HTML"; exit 1; }

if [ "$SC_CREATOR" != "200" ]; then
  echo "FAIL: $CREATOR_ROUTE status $SC_CREATOR"
  exit 1
fi
echo "$CT_CREATOR" | grep -q 'text/html' || { echo "FAIL: creator route not HTML"; exit 1; }

echo "Smoke tests OK"
