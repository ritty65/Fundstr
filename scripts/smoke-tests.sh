#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://staging.fundstr.me/creator-hub}"

html=$(curl -fsSL "$BASE_URL/")

asset=$(echo "$html" | grep -Eo '/creator-hub/assets/[a-zA-Z0-9._-]+\.js' | head -n1)

if [[ -z "$asset" ]]; then
  echo "Failed to detect built asset reference in HTML" >&2
  exit 1
fi

ctype=$(curl -sI "$BASE_URL$asset" | awk -F': ' '/^Content-Type/ {print tolower($2)}' | tr -d '\r')

echo "Asset Content-Type: $ctype"

if ! echo "$ctype" | grep -q 'javascript'; then
  echo "Expected JavaScript MIME type for $asset" >&2
  exit 1
fi

deep_path="/creator/test"
ctype_html=$(curl -sI "$BASE_URL$deep_path" | awk -F': ' '/^Content-Type/ {print tolower($2)}' | tr -d '\r')

if ! echo "$ctype_html" | grep -q 'text/html'; then
  echo "Expected HTML MIME type for deep route $deep_path" >&2
  exit 1
fi

if curl -fsI "$BASE_URL/manifest.json" >/dev/null; then
  echo "Manifest available"
else
  echo "PWA manifest missing" >&2
  exit 1
fi

echo "Smoke tests OK"
