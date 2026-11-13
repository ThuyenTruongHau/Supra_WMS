"""Executed inside a one-off backend container, never starts the API or Celery."""
from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlparse

import psycopg2
from psycopg2 import sql
import redis

mode = sys.argv[1]
database_url = os.environ["DATABASE_URL"]
redis_url = os.environ["REDIS_URL"]
if urlparse(database_url).hostname != "db" or urlparse(redis_url).hostname != "redis":
    raise RuntimeError("Refusing to restore outside the Docker db/redis services.")

with psycopg2.connect(database_url, connect_timeout=10) as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
        tables = [row[0] for row in cursor.fetchall()]
        client = redis.Redis.from_url(redis_url)
        if mode == "check-empty":
            if tables or client.dbsize():
                raise RuntimeError("Target must be empty. Existing database/cache will not be overwritten.")
            print("Docker target is empty.")
        elif mode == "restore-state":
            backup = Path("/restore")
            manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
            counts = {}
            for table in tables:
                cursor.execute(sql.SQL("SELECT count(*) FROM public.{}").format(sql.Identifier(table)))
                counts[table] = cursor.fetchone()[0]
            if counts != manifest["table_rows"]:
                raise RuntimeError("Restored PostgreSQL table counts differ from the source snapshot.")
            if client.dbsize():
                raise RuntimeError("Target Redis DB 0 is not empty.")
            restored = 0
            for entry in json.loads((backup / "redis-db0.json").read_text(encoding="utf-8")):
                expiry = entry["expires_at_ms"]
                ttl = 0 if expiry is None else expiry - int(time.time() * 1000)
                if expiry is not None and ttl <= 0:
                    continue
                client.restore(base64.b64decode(entry["key"]), ttl, base64.b64decode(entry["dump"]))
                restored += 1
            # On this machine these directories are bind mounts. Check them;
            # never overwrite live Windows files during a rehearsal.
            import hashlib
            for relative, expected in manifest["sha256"].items():
                if relative.startswith("backend/"):
                    current = Path("/app") / relative.removeprefix("backend/")
                    if not current.is_file() or hashlib.sha256(current.read_bytes()).hexdigest() != expected:
                        raise RuntimeError(f"Missing/changed upload file: {relative}; restore uploads before starting.")
            print(f"Verified {len(counts)} PostgreSQL tables; restored {restored} Redis DB 0 keys.")
        else:
            raise RuntimeError("Unknown mode")
