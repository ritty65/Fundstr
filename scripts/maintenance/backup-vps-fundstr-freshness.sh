#!/usr/bin/env bash
set -euo pipefail

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
output_root="${1:-$repo_root/artifacts/db-backups/$timestamp}"
staging_dir="$output_root/vps-freshness-backup"
mkdir -p "$staging_dir"

copy_if_exists() {
  local source="$1"
  local target="$staging_dir/$2"
  if [[ ! -e "$source" ]]; then
    printf 'Skipping missing path: %s\n' "$source" >&2
    return
  fi
  mkdir -p "$(dirname "$target")"
  cp -a "$source" "$target"
}

copy_if_exists "/opt/fundstr-cache-export/phonebook_seed.sqlite" "sqlite/phonebook_seed.sqlite"
copy_if_exists "/opt/fundstr-discovery/data/nutzap.sqlite" "sqlite/nutzap.sqlite"
copy_if_exists "/opt/fundstr-cache-export/sync-phonebook-to-hostinger.mjs" "scripts/sync-phonebook-to-hostinger.mjs"
copy_if_exists "/opt/fundstr-cache-export/harvest-phonebook-relays.mjs" "scripts/harvest-phonebook-relays.mjs"
copy_if_exists "/opt/fundstr-cache-export/export-creators.mjs" "scripts/export-creators.mjs"
copy_if_exists "/opt/fundstr-cache-export/seed-profiles-from-relay.mjs" "scripts/seed-profiles-from-relay.mjs"
copy_if_exists "/opt/fundstr-cache-export/seed-profiles-from-creators.mjs" "scripts/seed-profiles-from-creators.mjs"
copy_if_exists "/root/sync_nutzap.py" "scripts/sync_nutzap.py"

for unit_path in /etc/systemd/system/fundstr-*.service /etc/systemd/system/fundstr-*.timer; do
  if [[ -e "$unit_path" ]]; then
    copy_if_exists "$unit_path" "systemd/$(basename "$unit_path")"
  fi
done

manifest="$output_root/vps-freshness-backup-manifest.txt"
(
  cd "$staging_dir"
  find . -type f -print | sort | while read -r file; do
    sha256sum "$file"
  done
) > "$manifest"

tarball="$output_root/vps-freshness-backup.tar.gz"
tar -C "$output_root" -czf "$tarball" "$(basename "$staging_dir")" "$(basename "$manifest")"

cat <<EOF
VPS Fundstr freshness backup complete.
Output directory: $output_root
Backup payload:   $tarball
Manifest:         $manifest
EOF
