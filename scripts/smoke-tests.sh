#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-https://staging.fundstr.me}"
EXPECT_SW="${EXPECT_SW:-1}"
DISCOVERY_ROUTE="${DISCOVERY_ROUTE:-/find-creators}"
CREATOR_ROUTE="${CREATOR_ROUTE:-/creator/example/profile}"
DEPLOY_MARKER_REQUIRED="${DEPLOY_MARKER_REQUIRED:-0}"

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

echo "Asset: $ASSET"
echo "Status: $SC_ASSET"
echo "Content-Type: $CT_ASSET"

[ "$SC_ASSET" = "200" ] || { echo "FAIL: $ASSET status $SC_ASSET"; exit 1; }
if ! echo "$CT_ASSET" | grep -q "javascript"; then
  echo "FAIL: asset Content-Type '$CT_ASSET' is not JavaScript"
  exit 1
fi

if [ "$EXPECT_SW" = "1" ]; then
  # 2) sw.js must be NO-CACHE — hit with version to bypass CDN edge
  H_SW=$(curl -fsSI "$BASE/sw.js?v=$(date +%s)" || true)
  CC_SW=$(echo "$H_SW" | get_header "Cache-Control" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
  VARY_SW=$(echo "$H_SW" | get_header "Vary" | tr -d '\r')

  echo "sw.js Cache-Control: $CC_SW"
  echo "sw.js Vary: $VARY_SW"

  echo "$CC_SW" | grep -Eq 'no-cache|no-store|must-revalidate' || { echo "FAIL: sw.js not no-cache"; exit 1; }
else
  echo "Skipping sw.js cache checks (EXPECT_SW=$EXPECT_SW)"
fi

# 3) deep routes must be HTML
H_HTML=$(curl -fsSI "$BASE/wallet" || true)
SC_HTML=$(echo "$H_HTML" | awk 'NR==1{print $2}')
CT_HTML=$(echo "$H_HTML" | get_header "Content-Type" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
VARY_HTML=$(echo "$H_HTML" | get_header "Vary" | tr -d '\r')

H_DISCOVERY=$(curl -fsSI "$BASE$DISCOVERY_ROUTE" || true)
SC_DISCOVERY=$(echo "$H_DISCOVERY" | awk 'NR==1{print $2}')
CT_DISCOVERY=$(echo "$H_DISCOVERY" | get_header "Content-Type" | tr -d '\r' | tr '[:upper:]' '[:lower:]')

H_CREATOR=$(curl -fsSI "$BASE$CREATOR_ROUTE" || true)
SC_CREATOR=$(echo "$H_CREATOR" | awk 'NR==1{print $2}')
CT_CREATOR=$(echo "$H_CREATOR" | get_header "Content-Type" | tr -d '\r' | tr '[:upper:]' '[:lower:]')
VARY_CREATOR=$(echo "$H_CREATOR" | get_header "Vary" | tr -d '\r')

echo "Route status: $SC_HTML"
echo "Route Content-Type: $CT_HTML"
echo "Route Vary: $VARY_HTML"

echo "Discovery route: $DISCOVERY_ROUTE"
echo "Discovery status: $SC_DISCOVERY"
echo "Discovery Content-Type: $CT_DISCOVERY"

echo "Creator route: $CREATOR_ROUTE"
echo "Creator status: $SC_CREATOR"
echo "Creator Content-Type: $CT_CREATOR"
echo "Creator Vary: $VARY_CREATOR"

[ "$SC_HTML" = "200" ] || { echo "FAIL: route status $SC_HTML"; exit 1; }
echo "$CT_HTML" | grep -q 'text/html' || { echo "FAIL: route not HTML"; exit 1; }

[ "$SC_DISCOVERY" = "200" ] || { echo "FAIL: discovery route status $SC_DISCOVERY"; exit 1; }
echo "$CT_DISCOVERY" | grep -q 'text/html' || { echo "FAIL: discovery route not HTML"; exit 1; }

if [ "$SC_CREATOR" != "200" ]; then
  echo "FAIL: $CREATOR_ROUTE status $SC_CREATOR"
  exit 1
fi
echo "$CT_CREATOR" | grep -q 'text/html' || { echo "FAIL: creator route not HTML"; exit 1; }

if [ "$DEPLOY_MARKER_REQUIRED" = "1" ]; then
  DEPLOY_MARKER=$(curl -fsSL "$BASE/deploy.txt" || true)
  echo "$DEPLOY_MARKER" | grep -q "<!DOCTYPE html>" && {
    echo "FAIL: deploy.txt resolved to HTML; expected plain deploy marker"
    exit 1
  }
  echo "$DEPLOY_MARKER" | grep -Eq "^env=" || {
    echo "FAIL: deploy.txt missing env= line"
    exit 1
  }
  echo "$DEPLOY_MARKER" | grep -Eq "^sha=" || {
    echo "FAIL: deploy.txt missing sha= line"
    exit 1
  }
  echo "Deploy marker detected"
fi

echo "Smoke tests OK"
