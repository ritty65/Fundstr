# Direct Hostinger Sync Runbook - 2026-03-16

## Purpose

Replace the stale VPS -> public PHP write path with direct VPS -> Hostinger MySQL
upserts while keeping the relay and live app stable.

## Why this exists

The old freshness pipeline still writes to dead endpoints:

- `https://fundstr.me/sync_profiles.php`
- `https://fundstr.me/sync_cache.php`

The app itself now reads from Hostinger MySQL successfully, but those tables have
stale timestamps because the writer broke.

## New manual-first tools

- `scripts/maintenance/sync-hostinger-profiles-from-sqlite.py`
- `scripts/maintenance/sync-hostinger-creators-from-sqlite.py`

These tools:

- read source data from VPS SQLite
- write directly into Hostinger MySQL over IPv4 TCP
- do not touch the relay
- do not use public HTTP write endpoints
- support `--dry-run`

## Environment required on the VPS

```bash
export HOSTINGER_DB_HOST=193.203.166.19
export HOSTINGER_DB_PORT=3306
export HOSTINGER_DB_NAME=u444965226_fundstr_cache
export HOSTINGER_DB_USER=u444965226_fundstr_user
export MYSQL_PWD='REAL_PASSWORD_HERE'
```

## Step 1 - dry-run profiles sync

```bash
python3 scripts/maintenance/sync-hostinger-profiles-from-sqlite.py --dry-run --limit 20
```

Expected:

- no errors
- preview of selected rows

## Step 2 - dry-run creators sync

```bash
python3 scripts/maintenance/sync-hostinger-creators-from-sqlite.py --dry-run --limit 20
```

Expected:

- no errors
- preview of selected rows

## Step 3 - manual small-batch write test

Profiles first:

```bash
python3 scripts/maintenance/sync-hostinger-profiles-from-sqlite.py --limit 100 --batch-size 50
```

Then creators:

```bash
python3 scripts/maintenance/sync-hostinger-creators-from-sqlite.py --limit 20 --batch-size 20
```

## Step 4 - validate Hostinger freshness

Run in phpMyAdmin or MySQL client:

```sql
SELECT FROM_UNIXTIME(MAX(profile_updated_at)) AS newest_profile_updated FROM profiles;
SELECT MAX(last_updated) AS newest_creator_row FROM creators;
```

And externally verify:

```bash
curl -i 'https://fundstr.me/find_profiles.php?q=jack'
curl -i 'https://fundstr.me/find_profiles.php?q=odell'
curl -i 'https://fundstr.me/find_profiles.php?q=walker'
```

## Step 5 - only after repeated success

- replace the old timers/services with direct-sync wrappers
- retire the dead `sync_profiles.php` / `sync_cache.php` transport scripts

## Safety rules

- do not edit relay services during freshness work
- do not enable timers until manual sync succeeds repeatedly
- do not drop or truncate Hostinger tables first
- do not remove old scripts until direct sync is stable
