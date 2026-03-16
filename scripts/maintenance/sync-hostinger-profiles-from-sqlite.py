#!/usr/bin/env python3
import argparse
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


CLEAN_FILTER_SQL = """
  synced_to_hostinger = 0
  AND (
    (name IS NOT NULL AND length(trim(name)) >= 3)
    OR (display_name IS NOT NULL AND length(trim(display_name)) >= 3)
    OR (nip05 IS NOT NULL AND nip05 <> '')
  )
  AND (
    (about IS NOT NULL AND length(trim(about)) >= 10)
    OR (picture IS NOT NULL AND picture <> '')
  )
  AND lower(coalesce(name, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(about, '')) NOT LIKE '%bot%'
  AND lower(coalesce(name, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(about, '')) NOT LIKE '%porn%'
  AND lower(coalesce(name, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(about, '')) NOT LIKE '%onlyfans%'
  AND lower(coalesce(name, '') || ' ' || coalesce(display_name, '') || ' ' || coalesce(about, '')) NOT LIKE '%sex%'
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Fundstr Hostinger profiles from phonebook_seed.sqlite")
    parser.add_argument("--source-db", default="/opt/fundstr-cache-export/phonebook_seed.sqlite")
    parser.add_argument("--host", default=os.getenv("HOSTINGER_DB_HOST", "193.203.166.19"))
    parser.add_argument("--port", default=os.getenv("HOSTINGER_DB_PORT", "3306"))
    parser.add_argument("--db-name", default=os.getenv("HOSTINGER_DB_NAME", "u444965226_fundstr_cache"))
    parser.add_argument("--db-user", default=os.getenv("HOSTINGER_DB_USER", "u444965226_fundstr_user"))
    parser.add_argument("--mysql-bin", default=os.getenv("HOSTINGER_MYSQL_BIN", "mysql"))
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--limit", type=int, default=0, help="Optional max rows to sync")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--allow-synced", action="store_true", help="Ignore synced_to_hostinger flag and resync all clean rows")
    return parser.parse_args()


def sql_text(value):
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, int):
        return str(value)
    data = str(value).encode("utf-8")
    return f"CONVERT(0x{data.hex()} USING utf8mb4)"


def require_password() -> str:
    password = os.getenv("MYSQL_PWD", "")
    if password:
        return password
    print("Set MYSQL_PWD before running this script.", file=sys.stderr)
    sys.exit(1)


def fetch_rows(args: argparse.Namespace):
    if not Path(args.source_db).exists():
        raise FileNotFoundError(f"Source SQLite not found: {args.source_db}")

    conn = sqlite3.connect(args.source_db)
    conn.row_factory = sqlite3.Row
    where_sql = CLEAN_FILTER_SQL
    if args.allow_synced:
        where_sql = where_sql.replace("synced_to_hostinger = 0\n  AND ", "")

    count_sql = f"SELECT COUNT(*) AS c FROM collected_profiles WHERE {where_sql}"
    total = int(conn.execute(count_sql).fetchone()["c"])

    select_sql = f"""
      SELECT pubkey, name, display_name, about, picture, nip05, primary_relay,
             profile_updated_at, profile_event_json, last_seen_at
      FROM collected_profiles
      WHERE {where_sql}
      ORDER BY profile_updated_at DESC
    """
    params = []
    if args.limit > 0:
        select_sql += " LIMIT ?"
        params.append(args.limit)

    rows = conn.execute(select_sql, params).fetchall()
    conn.close()
    return total, rows


def print_preview(rows, total):
    print(f"Eligible rows in source SQLite: {total}")
    print(f"Rows selected for this run: {len(rows)}")
    for row in rows[:10]:
        print(
            f"- {row['pubkey']} name={row['name']!r} display_name={row['display_name']!r} "
            f"updated={row['profile_updated_at']} relay={row['primary_relay']!r}"
        )


def build_insert_sql(batch):
    values = []
    for row in batch:
        values.append(
            "(" + ", ".join(
                [
                    sql_text(row["pubkey"]),
                    sql_text(row["name"]),
                    sql_text(row["display_name"]),
                    sql_text(row["about"]),
                    sql_text(row["picture"]),
                    sql_text(row["nip05"]),
                    sql_text(row["primary_relay"]),
                    sql_text(int(row["profile_updated_at"] or 0)),
                    sql_text(row["last_seen_at"] if row["last_seen_at"] is not None else 0),
                    sql_text(row["profile_event_json"]),
                ]
            ) + ")"
        )

    return f"""
SET NAMES utf8mb4;
START TRANSACTION;
INSERT INTO profiles (
  pubkey, name, display_name, about, picture, nip05,
  primary_relay, profile_updated_at, last_seen_at, profile_event_json
)
VALUES
{',\n'.join(values)}
ON DUPLICATE KEY UPDATE
  name = CASE WHEN VALUES(profile_updated_at) >= COALESCE(profile_updated_at, 0) THEN VALUES(name) ELSE name END,
  display_name = CASE WHEN VALUES(profile_updated_at) >= COALESCE(profile_updated_at, 0) THEN VALUES(display_name) ELSE display_name END,
  about = CASE WHEN VALUES(profile_updated_at) >= COALESCE(profile_updated_at, 0) THEN VALUES(about) ELSE about END,
  picture = CASE WHEN VALUES(profile_updated_at) >= COALESCE(profile_updated_at, 0) THEN VALUES(picture) ELSE picture END,
  nip05 = CASE WHEN VALUES(profile_updated_at) >= COALESCE(profile_updated_at, 0) THEN VALUES(nip05) ELSE nip05 END,
  primary_relay = CASE WHEN VALUES(profile_updated_at) >= COALESCE(profile_updated_at, 0) THEN VALUES(primary_relay) ELSE primary_relay END,
  profile_event_json = CASE WHEN VALUES(profile_updated_at) >= COALESCE(profile_updated_at, 0) THEN VALUES(profile_event_json) ELSE profile_event_json END,
  profile_updated_at = GREATEST(COALESCE(profile_updated_at, 0), VALUES(profile_updated_at)),
  last_seen_at = GREATEST(COALESCE(last_seen_at, 0), VALUES(last_seen_at));
COMMIT;
"""


def run_mysql(mysql_bin: str, host: str, port: str, db_name: str, db_user: str, sql: str):
    env = os.environ.copy()
    require_password()
    cmd = [
        mysql_bin,
        "--protocol=TCP",
        "-h",
        host,
        "-P",
        str(port),
        "-u",
        db_user,
        db_name,
        "--default-character-set=utf8mb4",
        "--batch",
        "--raw",
    ]
    return subprocess.run(cmd, input=sql, text=True, env=env, capture_output=True, check=False)


def main():
    args = parse_args()
    total, rows = fetch_rows(args)
    print_preview(rows, total)

    if args.dry_run:
        print("Dry run only. No MySQL writes executed.")
        return

    if not rows:
        print("No rows selected. Nothing to sync.")
        return

    applied = 0
    for index in range(0, len(rows), args.batch_size):
        batch = rows[index:index + args.batch_size]
        sql = build_insert_sql(batch)
        result = run_mysql(args.mysql_bin, args.host, args.port, args.db_name, args.db_user, sql)
        if result.returncode != 0:
            print(result.stderr.strip() or result.stdout.strip(), file=sys.stderr)
            raise SystemExit(result.returncode)
        applied += len(batch)
        print(f"Applied batch {index // args.batch_size + 1}: {len(batch)} rows (total {applied})")

    print(f"Profile sync complete. Rows processed: {applied}")


if __name__ == "__main__":
    main()
