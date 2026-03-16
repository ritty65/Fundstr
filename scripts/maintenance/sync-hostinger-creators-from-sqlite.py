#!/usr/bin/env python3
import argparse
import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Fundstr Hostinger creators from nutzap.sqlite")
    parser.add_argument("--source-db", default="/opt/fundstr-discovery/data/nutzap.sqlite")
    parser.add_argument("--host", default=os.getenv("HOSTINGER_DB_HOST", "193.203.166.19"))
    parser.add_argument("--port", default=os.getenv("HOSTINGER_DB_PORT", "3306"))
    parser.add_argument("--db-name", default=os.getenv("HOSTINGER_DB_NAME", "u444965226_fundstr_cache"))
    parser.add_argument("--db-user", default=os.getenv("HOSTINGER_DB_USER", "u444965226_fundstr_user"))
    parser.add_argument("--mysql-bin", default=os.getenv("HOSTINGER_MYSQL_BIN", "mysql"))
    parser.add_argument("--batch-size", type=int, default=100)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
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
    sql = """
      SELECT pubkey, profile_json, profile_updated, tiers_json, tiers_updated
      FROM creators
      WHERE profile_json IS NOT NULL OR tiers_json IS NOT NULL
      ORDER BY CASE WHEN profile_updated > tiers_updated THEN profile_updated ELSE tiers_updated END DESC
    """
    params = []
    if args.limit > 0:
        sql += " LIMIT ?"
        params.append(args.limit)
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return rows


def print_preview(rows):
    print(f"Rows selected for this run: {len(rows)}")
    for row in rows[:10]:
        freshness = max(int(row["profile_updated"] or 0), int(row["tiers_updated"] or 0))
        print(
            f"- {row['pubkey']} profile_updated={row['profile_updated']} "
            f"tiers_updated={row['tiers_updated']} freshness={freshness}"
        )


def build_insert_sql(batch):
    values = []
    for row in batch:
        values.append(
            "(" + ", ".join(
                [
                    sql_text(row["pubkey"]),
                    sql_text(row["profile_json"]),
                    sql_text(int(row["profile_updated"] or 0)),
                    sql_text(row["tiers_json"]),
                    sql_text(int(row["tiers_updated"] or 0)),
                ]
            ) + ")"
        )

    return f"""
SET NAMES utf8mb4;
START TRANSACTION;
INSERT INTO creators (
  pubkey, profile_json, profile_updated_at, tiers_json, tiers_updated_at
)
VALUES
{',\n'.join(values)}
ON DUPLICATE KEY UPDATE
  profile_json = CASE
    WHEN VALUES(profile_updated_at) >= COALESCE(profile_updated_at, 0) AND VALUES(profile_json) IS NOT NULL
      THEN VALUES(profile_json)
    ELSE profile_json
  END,
  profile_updated_at = GREATEST(COALESCE(profile_updated_at, 0), VALUES(profile_updated_at)),
  tiers_json = CASE
    WHEN VALUES(tiers_updated_at) >= COALESCE(tiers_updated_at, 0) AND VALUES(tiers_json) IS NOT NULL
      THEN VALUES(tiers_json)
    ELSE tiers_json
  END,
  tiers_updated_at = GREATEST(COALESCE(tiers_updated_at, 0), VALUES(tiers_updated_at)),
  last_updated = CURRENT_TIMESTAMP;
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
    rows = fetch_rows(args)
    print_preview(rows)

    if args.dry_run:
        print("Dry run only. No MySQL writes executed.")
        return

    if not rows:
        print("No creator rows selected. Nothing to sync.")
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

    print(f"Creator sync complete. Rows processed: {applied}")


if __name__ == "__main__":
    main()
