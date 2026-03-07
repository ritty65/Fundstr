#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://staging.fundstr.me}"
OUT_DIR="${STAGING_DIAG_DIR:-artifacts/staging-diagnostics}"
SAMPLE_COUNT="${STAGING_DIAG_SAMPLE_COUNT:-5}"
CURL_ARGS=(--retry 2 --retry-all-errors --retry-delay 1 --connect-timeout 15 --max-time 45)

mkdir -p "$OUT_DIR"

stamp="$(date -u +"%Y-%m-%dT%H-%M-%SZ")"
SUMMARY_FILE="${OUT_DIR}/summary-${stamp}.log"
SAMPLES_FILE="${OUT_DIR}/edge-samples-${stamp}.log"

log() {
  local message="$1"
  printf '[%s] %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$message" | tee -a "$SUMMARY_FILE"
}

extract_host() {
  local url="$1"
  local without_scheme="${url#http://}"
  without_scheme="${without_scheme#https://}"
  printf '%s' "${without_scheme%%/*}"
}

fetch_endpoint_snapshot() {
  local endpoint="$1"
  local slug
  local url
  local header_file
  local body_file
  local result
  local status
  local remote_ip
  local content_type
  local body_sha
  local first_line

  slug="${endpoint#/}"
  slug="${slug//\//_}"
  if [ -z "$slug" ]; then
    slug="root"
  fi

  url="${BASE_URL%/}${endpoint}"
  header_file="${OUT_DIR}/${slug}-${stamp}.headers.txt"
  body_file="${OUT_DIR}/${slug}-${stamp}.body.txt"

  if ! result=$(curl "${CURL_ARGS[@]}" -sS -L -D "$header_file" -o "$body_file" -w '%{http_code} %{remote_ip} %{content_type}' "$url" 2>>"$SUMMARY_FILE"); then
    log "request_failed endpoint=${endpoint} url=${url}"
    return 0
  fi

  status=""
  remote_ip=""
  content_type=""
  read -r status remote_ip content_type <<<"$result"
  body_sha="$(sha256sum "$body_file" | awk '{print $1}')"
  first_line="$(head -n 1 "$body_file" | tr -d '\r')"

  log "endpoint=${endpoint} status=${status} remote_ip=${remote_ip:-unknown} content_type=${content_type:-unknown} sha256=${body_sha}"
  log "endpoint=${endpoint} first_line=${first_line}"

  if grep -qi "This Page Does Not Exist" "$body_file"; then
    log "endpoint=${endpoint} detected_signature=hostinger_default_404"
  fi
}

host="$(extract_host "$BASE_URL")"
log "base_url=${BASE_URL} host=${host} sample_count=${SAMPLE_COUNT}"

if getent ahostsv4 "$host" >"${OUT_DIR}/dns-v4-${stamp}.txt"; then
  log "captured_dns_ipv4=${OUT_DIR}/dns-v4-${stamp}.txt"
else
  log "dns_lookup_ipv4_failed host=${host}"
fi

if getent ahostsv6 "$host" >"${OUT_DIR}/dns-v6-${stamp}.txt"; then
  log "captured_dns_ipv6=${OUT_DIR}/dns-v6-${stamp}.txt"
else
  log "dns_lookup_ipv6_failed host=${host}"
fi

for endpoint in / /deploy.txt /find-creators.html /manifest.json /featured-creators.json; do
  fetch_endpoint_snapshot "$endpoint"
done

: >"$SAMPLES_FILE"
for i in $(seq 1 "$SAMPLE_COUNT"); do
  for endpoint in / /deploy.txt; do
    url="${BASE_URL%/}${endpoint}"
    if sample=$(curl "${CURL_ARGS[@]}" -sS -o /dev/null -w "sample=${i} endpoint=${endpoint} status=%{http_code} remote_ip=%{remote_ip} content_type=%{content_type}" "$url" 2>>"$SUMMARY_FILE"); then
      printf '%s\n' "$sample" | tee -a "$SAMPLES_FILE"
    else
      printf 'sample=%s endpoint=%s status=request_failed\n' "$i" "$endpoint" | tee -a "$SAMPLES_FILE"
    fi
  done
  sleep 1
done

log "captured_edge_samples=${SAMPLES_FILE}"
log "staging_diagnostics_complete output_dir=${OUT_DIR}"
