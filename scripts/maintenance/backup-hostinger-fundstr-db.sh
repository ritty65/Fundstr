#!/usr/bin/env bash
set -euo pipefail

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
output_root="${1:-$repo_root/artifacts/db-backups/$timestamp}"
mkdir -p "$output_root"

db_host="${HOSTINGER_DB_HOST:-193.203.166.19}"
db_port="${HOSTINGER_DB_PORT:-3306}"
db_name="${HOSTINGER_DB_NAME:-}"
db_user="${HOSTINGER_DB_USER:-}"
ssl_mode="${HOSTINGER_DB_SSL_MODE:-REQUIRED}"

if [[ -z "$db_name" || -z "$db_user" ]]; then
  printf 'Set HOSTINGER_DB_NAME and HOSTINGER_DB_USER before running.\n' >&2
  exit 1
fi

dump_cmd=""
if command -v mysqldump >/dev/null 2>&1; then
  dump_cmd="mysqldump"
elif command -v mariadb-dump >/dev/null 2>&1; then
  dump_cmd="mariadb-dump"
else
  printf 'Install mysqldump or mariadb-dump before running this backup script.\n' >&2
  exit 1
fi

if ! command -v mysql >/dev/null 2>&1; then
  printf 'Install the mysql client before running this backup script.\n' >&2
  exit 1
fi

if [[ -z "${MYSQL_PWD:-}" && -t 0 ]]; then
  read -r -s -p "Hostinger DB password: " MYSQL_PWD
  printf '\n'
  export MYSQL_PWD
fi

if [[ -z "${MYSQL_PWD:-}" ]]; then
  printf 'Provide MYSQL_PWD in the environment or run interactively to enter the password.\n' >&2
  exit 1
fi

base_args=(--protocol=TCP -h "$db_host" -P "$db_port" -u "$db_user")
if [[ -n "$ssl_mode" ]]; then
  base_args+=(--ssl-mode="$ssl_mode")
fi

counts_file="$output_root/hostinger-fundstr-cache-counts.txt"
dump_file="$output_root/hostinger-fundstr-cache.sql.gz"
checksum_file="$output_root/hostinger-fundstr-cache.sha256"

mysql "${base_args[@]}" "$db_name" <<'SQL' > "$counts_file"
SELECT NOW() AS connected_at;
SELECT COUNT(*) AS profiles_count FROM profiles;
SELECT COUNT(*) AS creators_count FROM creators;
SELECT FROM_UNIXTIME(MAX(profile_updated_at)) AS newest_profile_updated FROM profiles;
SELECT MAX(last_updated) AS newest_creator_row FROM creators;
SQL

"$dump_cmd" "${base_args[@]}" \
  --single-transaction \
  --skip-lock-tables \
  --column-statistics=0 \
  --no-tablespaces \
  --default-character-set=utf8mb4 \
  "$db_name" profiles creators | gzip -9 > "$dump_file"

gzip -t "$dump_file"

sha256sum "$dump_file" > "$checksum_file"

cat <<EOF
Hostinger Fundstr DB backup complete.
Output directory: $output_root
Counts summary:   $counts_file
Compressed dump:  $dump_file
Checksum file:    $checksum_file
EOF
