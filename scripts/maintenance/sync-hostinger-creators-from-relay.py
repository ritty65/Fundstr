#!/usr/bin/env python3
import argparse
import json
import sys
import time
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fundstr_hostinger_sync_common import chunked, run_mysql, scan_strfry_events, sql_text


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync Fundstr Hostinger creators directly from local relay events")
    parser.add_argument("--host", default="193.203.166.19")
    parser.add_argument("--port", default="3306")
    parser.add_argument("--db-name", default="u444965226_fundstr_cache")
    parser.add_argument("--db-user", default="u444965226_fundstr_user")
    parser.add_argument("--mysql-bin", default="mysql")
    parser.add_argument("--strfry-binary", default="/usr/local/bin/strfry")
    parser.add_argument("--strfry-config", default="/var/lib/nostr/strfry.conf")
    parser.add_argument("--run-as-user", default="nostr")
    parser.add_argument("--lookback-days", type=int, default=3650)
    parser.add_argument("--batch-size", type=int, default=50)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def now_sec() -> int:
    return int(time.time())


def fetch_rows(args: argparse.Namespace) -> List[dict]:
    since = now_sec() - max(1, args.lookback_days) * 24 * 60 * 60
    latest_profile: Dict[str, dict] = {}
    latest_tiers: Dict[str, dict] = {}
    for event in scan_strfry_events(
        {"kinds": [10019, 30019], "since": since},
        args.strfry_binary,
        args.strfry_config,
        args.run_as_user,
    ):
        if not isinstance(event, dict):
            continue
        pubkey = str(event.get("pubkey", "")).strip().lower()
        kind = int(event.get("kind", -1))
        created_at = int(event.get("created_at") or 0)
        if len(pubkey) != 64 or kind not in (10019, 30019):
            continue
        if kind == 10019:
            existing = latest_profile.get(pubkey)
            if existing is None or created_at > int(existing.get("created_at") or 0):
                latest_profile[pubkey] = event
        elif kind == 30019:
            existing = latest_tiers.get(pubkey)
            if existing is None or created_at > int(existing.get("created_at") or 0):
                latest_tiers[pubkey] = event

    rows = []
    for pubkey in sorted(set(latest_profile) | set(latest_tiers)):
        profile_event = latest_profile.get(pubkey)
        tiers_event = latest_tiers.get(pubkey)
        rows.append(
            {
                "pubkey": pubkey,
                "profile_json": json.dumps(profile_event, ensure_ascii=False, separators=(",", ":")) if profile_event else None,
                "profile_updated_at": int(profile_event.get("created_at") or 0) if profile_event else 0,
                "tiers_json": json.dumps(tiers_event, ensure_ascii=False, separators=(",", ":")) if tiers_event else None,
                "tiers_updated_at": int(tiers_event.get("created_at") or 0) if tiers_event else 0,
            }
        )

    rows.sort(key=lambda row: max(row["profile_updated_at"], row["tiers_updated_at"]), reverse=True)
    if args.limit > 0:
        rows = rows[: args.limit]
    return rows


def print_preview(rows: List[dict]):
    print(f"Rows selected for this run: {len(rows)}")
    for row in rows[:10]:
        freshness = max(int(row["profile_updated_at"]), int(row["tiers_updated_at"]))
        print(
            f"- {row['pubkey']} profile_updated_at={row['profile_updated_at']} "
            f"tiers_updated_at={row['tiers_updated_at']} freshness={freshness}"
        )


def build_insert_sql(batch: List[dict]) -> str:
    values = []
    for row in batch:
        values.append(
            "(" + ", ".join(
                [
                    sql_text(row["pubkey"]),
                    sql_text(row["profile_json"]),
                    sql_text(int(row["profile_updated_at"] or 0)),
                    sql_text(row["tiers_json"]),
                    sql_text(int(row["tiers_updated_at"] or 0)),
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
    for index, batch in enumerate(chunked(rows, args.batch_size), start=1):
        sql = build_insert_sql(batch)
        result = run_mysql(args.mysql_bin, args.host, args.port, args.db_name, args.db_user, sql)
        if result.returncode != 0:
            print(result.stderr.strip() or result.stdout.strip(), file=sys.stderr)
            raise SystemExit(result.returncode)
        applied += len(batch)
        print(f"Applied batch {index}: {len(batch)} rows (total {applied})")

    print(f"Creator sync complete. Rows processed: {applied}")


if __name__ == "__main__":
    main()
