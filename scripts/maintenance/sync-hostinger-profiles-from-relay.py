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
    parser = argparse.ArgumentParser(description="Sync Fundstr Hostinger profiles directly from local relay kind:0 events")
    parser.add_argument("--host", default="193.203.166.19")
    parser.add_argument("--port", default="3306")
    parser.add_argument("--db-name", default="u444965226_fundstr_cache")
    parser.add_argument("--db-user", default="u444965226_fundstr_user")
    parser.add_argument("--mysql-bin", default="mysql")
    parser.add_argument("--strfry-binary", default="/usr/local/bin/strfry")
    parser.add_argument("--strfry-config", default="/var/lib/nostr/strfry.conf")
    parser.add_argument("--run-as-user", default="nostr")
    parser.add_argument("--primary-relay", default="wss://relay.fundstr.me")
    parser.add_argument("--lookback-days", type=int, default=90)
    parser.add_argument("--batch-size", type=int, default=200)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def now_sec() -> int:
    return int(time.time())


def to_nullable_string(value):
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def normalize_profile_event(event: dict, primary_relay: str):
    if not isinstance(event, dict):
        return None
    if int(event.get("kind", -1)) != 0:
        return None
    pubkey = str(event.get("pubkey", "")).strip().lower()
    content = event.get("content")
    if len(pubkey) != 64 or not isinstance(content, str):
        return None

    try:
        payload = json.loads(content)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None

    record = {
        "pubkey": pubkey,
        "name": to_nullable_string(payload.get("name")),
        "display_name": to_nullable_string(payload.get("display_name")),
        "about": to_nullable_string(payload.get("about")),
        "picture": to_nullable_string(payload.get("picture")),
        "nip05": to_nullable_string(payload.get("nip05")),
        "primary_relay": primary_relay,
        "profile_updated_at": int(event.get("created_at") or now_sec()),
        "last_seen_at": now_sec(),
        "profile_event_json": json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
    }

    if not any(record[key] for key in ["name", "display_name", "about", "picture", "nip05"]):
        return None

    return record


def fetch_profiles(args: argparse.Namespace) -> List[dict]:
    since = now_sec() - max(1, args.lookback_days) * 24 * 60 * 60
    latest_by_pubkey: Dict[str, dict] = {}
    for event in scan_strfry_events(
        {"kinds": [0], "since": since},
        args.strfry_binary,
        args.strfry_config,
        args.run_as_user,
    ):
        record = normalize_profile_event(event, args.primary_relay)
        if record is None:
            continue
        pubkey = record["pubkey"]
        existing = latest_by_pubkey.get(pubkey)
        if existing is None or record["profile_updated_at"] > existing["profile_updated_at"]:
            latest_by_pubkey[pubkey] = record

    rows = sorted(
        latest_by_pubkey.values(),
        key=lambda row: row["profile_updated_at"],
        reverse=True,
    )
    if args.limit > 0:
        rows = rows[: args.limit]
    return rows


def print_preview(rows: List[dict]):
    print(f"Rows selected for this run: {len(rows)}")
    for row in rows[:10]:
        print(
            f"- {row['pubkey']} name={row['name']!r} display_name={row['display_name']!r} "
            f"updated={row['profile_updated_at']} relay={row['primary_relay']!r}"
        )


def build_insert_sql(batch: List[dict]) -> str:
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
                    sql_text(int(row["profile_updated_at"])),
                    sql_text(int(row["last_seen_at"])),
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


def main():
    args = parse_args()
    rows = fetch_profiles(args)
    print_preview(rows)

    if args.dry_run:
        print("Dry run only. No MySQL writes executed.")
        return

    if not rows:
        print("No rows selected. Nothing to sync.")
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

    print(f"Profile sync complete. Rows processed: {applied}")


if __name__ == "__main__":
    main()
