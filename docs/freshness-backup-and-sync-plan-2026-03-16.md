# Fundstr Freshness Backup And Sync Plan - 2026-03-16

## Goal

Preserve all valuable search/cache data before replacing the stale Hostinger
write pipeline with a safer direct MySQL sync from the VPS.

## What must be preserved

### Hostinger MySQL

- database: `u444965226_fundstr_cache`
- tables:
  - `profiles`
  - `creators`

### VPS local data

- `/opt/fundstr-cache-export/phonebook_seed.sqlite`
- `/opt/fundstr-discovery/data/nutzap.sqlite`

### VPS refresh scripts and units

- `/opt/fundstr-cache-export/sync-phonebook-to-hostinger.mjs`
- `/opt/fundstr-cache-export/harvest-phonebook-relays.mjs`
- `/opt/fundstr-cache-export/export-creators.mjs`
- `/opt/fundstr-cache-export/seed-profiles-from-relay.mjs`
- `/opt/fundstr-cache-export/seed-profiles-from-creators.mjs`
- `/root/sync_nutzap.py`
- `/etc/systemd/system/fundstr-*.service`
- `/etc/systemd/system/fundstr-*.timer`

## Why these backups matter

- Hostinger currently powers the fast DB-backed search path.
- The data is valuable even if stale.
- The VPS contains the only remaining refresh logic and local source data.
- We should never repair the freshness pipeline without rollback material.

## Backup strategy

### Layer 1 - logical database export

Run `scripts/maintenance/backup-hostinger-fundstr-db.sh` from a trusted machine with
Hostinger DB credentials.

This produces:

- a compressed SQL dump of `profiles` and `creators`
- row counts and newest-timestamp snapshots
- a checksum file

### Layer 2 - VPS source-data archive

Run `scripts/maintenance/backup-vps-fundstr-freshness.sh` on the VPS.

This produces:

- SQLite copies
- script copies
- systemd unit copies
- a tarball and manifest

### Layer 3 - off-host copy

Keep one backup copy on the VPS and one copy on your local machine.

Recommended:

- store the Hostinger SQL dump locally
- store the VPS tarball both on the VPS and downloaded locally via `scp`

## Safe execution order

1. create Hostinger MySQL backup
2. create VPS freshness backup
3. verify row counts and checksums exist
4. copy both backup artifacts off-host
5. only then implement direct MySQL sync

## Chosen implementation direction

The stale data issue is caused by dead public write endpoints, not by the read
path. The replacement path should therefore:

- read fresh events directly from the VPS relay database via `strfry scan`
- write directly into Hostinger MySQL over IPv4 TCP
- avoid reviving `sync_profiles.php` or `sync_cache.php`
- avoid touching relay/discovery services until manual sync is proven safe

## Suggested commands

### On the VPS

```bash
cd /home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-freshness-backups-20260316
bash scripts/maintenance/backup-vps-fundstr-freshness.sh
```

### On the VPS for Hostinger MySQL export

If `mysqldump` is not installed:

```bash
apt install mysql-client
```

Then:

```bash
cd /home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-freshness-backups-20260316
export HOSTINGER_DB_HOST=193.203.166.19
export HOSTINGER_DB_PORT=3306
export HOSTINGER_DB_NAME=u444965226_fundstr_cache
export HOSTINGER_DB_USER=u444965226_fundstr_user
bash scripts/maintenance/backup-hostinger-fundstr-db.sh
```

The script prompts for the password if `MYSQL_PWD` is not already set.

### Copy VPS backup to your local machine

```bash
scp root@72.60.119.127:/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-freshness-backups-20260316/artifacts/db-backups/<timestamp>/vps-freshness-backup.tar.gz .
scp root@72.60.119.127:/home/ai_dev/Desktop/AI-Apps/Websites/Fundstr-Develop2-freshness-backups-20260316/artifacts/db-backups/<timestamp>/hostinger-fundstr-cache.sql.gz .
```

## Rollback posture

Until the new direct-sync path is validated:

- do not delete stale Hostinger rows
- do not drop old tables
- do not disable the relay or discovery services
- do not remove old scripts until replacements are proven

The next implementation sprint should write into controlled paths and validate
counts/timestamps before replacing any existing data flow.
