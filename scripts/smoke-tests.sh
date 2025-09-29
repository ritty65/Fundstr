#!/usr/bin/env bash
set -euo pipefail
BASE="${BASE_URL:-https://staging.fundstr.me}"
html=$(curl -fsSL "$BASE/")
asset=$(echo "$html" | grep -Eo '/assets/[A-Za-z0-9._-]+\.js' | head -n1)
[ -n "$asset" ] || { echo "No asset reference found in home HTML"; exit 1; }
echo "Testing $asset"
ctype=$(curl -sI "$BASE$asset" | awk -F': ' '/Content-Type/ {print tolower($2)}' | tr -d '\r')
echo "Content-Type: $ctype"
echo "$ctype" | grep -q javascript || { echo "Asset is NOT JavaScript"; exit 1; }
echo "Smoke tests OK"
