#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-https://staging.fundstr.me}"

# 1) main asset must be JavaScript
HTML=$(curl -fsSL "$BASE/")
ASSET=$(echo "$HTML" | grep -Eo '/assets/[A-Za-z0-9._-]+\.js' | head -n1)
[ -n "$ASSET" ] || { echo "No asset reference found in HTML"; exit 1; }
CT=$(curl -sI "$BASE$ASSET" | tr -d '\r' | awk -F': ' '/^Content-Type/{print tolower($2)}')
echo "Asset: $ASSET  Content-Type: $CT"
echo "$CT" | grep -q 'javascript' || { echo "FAIL: asset not JavaScript"; exit 1; }

# 2) sw.js must be NO-CACHE — use a version to bypass CDN edge
SWH=$(curl -sI "$BASE/sw.js?v=$(date +%s)" | tr -d '\r' | awk -F': ' '/^Cache-Control/{print tolower($2)}')
echo "sw.js Cache-Control: $SWH"
echo "$SWH" | grep -Eq 'no-cache|no-store|must-revalidate' || { echo "FAIL: sw.js not no-cache"; exit 1; }

# 3) deep route must be HTML
DCT=$(curl -sI "$BASE/wallet" | tr -d '\r' | awk -F': ' '/^Content-Type/{print tolower($2)}')
echo "Deep route Content-Type: $DCT"
echo "$DCT" | grep -q 'text/html' || { echo "FAIL: deep route not HTML"; exit 1; }

echo "Smoke tests OK"
