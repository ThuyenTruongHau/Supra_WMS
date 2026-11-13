"""Read-only export of the Windows PostgreSQL DB and Redis DB 0.

Use backend/.venv; credentials are passed to pg_dump through its environment.
No application modules are imported and no Celery tasks are started.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
from datetime import datetime, timezone

from dotenv import dotenv_values
import psycopg2
from psycopg2 import sql
import redis

ROOT = Path(__file__).resolve().parents[2]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pg-bin", type=Path, required=True)
    parser.add_argument("--writers-stopped", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    config = dotenv_values(ROOT / "backend/.env")
    manifest = {
        "format": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "writers_stopped": args.writers_stopped,
        "redis_scope": "db0 only; broker db1 and results db2 are deliberately excluded",
    }
    with psycopg2.connect(config["DATABASE_URL"], connect_timeout=10) as connection:
        connection.set_session(isolation_level="REPEATABLE READ", readonly=True)
        params = connection.get_dsn_parameters()
        with connection.cursor() as cursor:
            cursor.execute("SELECT current_setting('server_version'), pg_export_snapshot()")
            version, snapshot = cursor.fetchone()
            manifest["postgres_version"] = version
            if int(version.split(".")[0]) != 18:
                raise RuntimeError("This deployment targets PostgreSQL 18; review the source version first.")
            cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
            counts = {}
            for (table,) in cursor.fetchall():
                cursor.execute(sql.SQL("SELECT count(*) FROM public.{}").format(sql.Identifier(table)))
                counts[table] = cursor.fetchone()[0]
            manifest["table_rows"] = counts
            environment = os.environ.copy()
            for key in ("host", "port", "user", "password", "dbname", "sslmode"):
                if params.get(key):
                    environment["PGDATABASE" if key == "dbname" else "PG" + key.upper()] = params[key]
            # get_dsn_parameters deliberately omits passwords.
            password = psycopg2.extensions.parse_dsn(config["DATABASE_URL"]).get("password")
            if password:
                environment["PGPASSWORD"] = password
            subprocess.run(
                [str(args.pg_bin / "pg_dump.exe"), "--format=custom", "--no-owner", "--no-acl",
                 "--snapshot=" + snapshot, "--file=" + str(output / "postgres.dump")],
                env=environment, check=True,
            )

    client = redis.Redis.from_url(config["REDIS_URL"], socket_timeout=15)
    if client.connection_pool.connection_kwargs.get("db", 0) != 0:
        raise RuntimeError("Expected the legacy cache in Redis DB 0.")
    entries = []
    for key in client.scan_iter(count=200):
        value = client.eval(
            "local v=redis.call('DUMP',KEYS[1]); if not v then return {} end; "
            "return {v, redis.call('PTTL',KEYS[1])}", 1, key,
        )
        if not value or value[1] == -2:
            continue
        entries.append({
            "key": base64.b64encode(key).decode("ascii"),
            "dump": base64.b64encode(value[0]).decode("ascii"),
            "expires_at_ms": None if value[1] == -1 else int(time.time() * 1000) + value[1],
        })
    (output / "redis-db0.json").write_text(json.dumps(entries), encoding="utf-8")
    manifest["redis_db0_keys"] = len(entries)
    # Final migration must drain the broker before stopping legacy workers.
    broker = redis.Redis.from_url(config["CELERY_BROKER_URL"], socket_timeout=15)
    pending = sum(broker.llen(key) for key in broker.scan_iter(_type="list"))
    manifest["broker_queued_messages"] = pending
    manifest["broker_unacked_messages"] = broker.hlen("unacked")
    if args.writers_stopped and (pending or manifest["broker_unacked_messages"]):
        raise RuntimeError("Legacy Celery has queued/unacknowledged tasks. Drain them before the final backup.")

    for relative in ("app/static/file_import_item", "app/static/warehouse_maps", "storage"):
        source = ROOT / "backend" / relative
        if source.exists():
            shutil.copytree(source, output / "backend" / relative)
    manifest["sha256"] = {
        str(path.relative_to(output)).replace("\\", "/"): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(output.rglob("*")) if path.is_file()
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Backup: {output}")
    print(f"PostgreSQL {version}: {len(counts)} tables; Redis DB 0: {len(entries)} keys")
    print("Final cutover backup" if args.writers_stopped else "Live rehearsal backup; take another after stopping all writers at cutover")


if __name__ == "__main__":
    main()
