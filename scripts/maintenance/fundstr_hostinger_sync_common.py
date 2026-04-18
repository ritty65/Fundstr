#!/usr/bin/env python3
import json
import os
import subprocess
import sys
from typing import Iterable, List


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


def chunked(items: List, size: int) -> Iterable[List]:
    for index in range(0, len(items), size):
        yield items[index:index + size]


def scan_strfry_events(
    filter_obj: dict,
    strfry_binary: str,
    strfry_config: str,
    run_as_user: str = "",
):
    filter_json = json.dumps(filter_obj, separators=(",", ":"))
    command = []
    if run_as_user:
        command.extend(["sudo", "-u", run_as_user])
    command.extend([
        "env",
        f"STRFRY_CONFIG={strfry_config}",
        strfry_binary,
        "scan",
        filter_json,
    ])

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    assert process.stdout is not None
    for line in process.stdout:
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            yield parsed

    stderr_output = ""
    if process.stderr is not None:
        stderr_output = process.stderr.read()
    return_code = process.wait()
    if return_code != 0:
        raise RuntimeError(
            f"strfry scan exited with code {return_code}: {stderr_output.strip() or 'no stderr'}"
        )
