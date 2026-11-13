"""Apply the user's G001-G420 counts to existing visible stock only.

Run with backend/.venv/Scripts/python.exe. The default only saves a preview.
--apply checks that the database still matches that preview before updating.
No item, lot, unit, location, or stock row is created or reassigned.
"""

import argparse
import csv
import hashlib
import json
import os
import sys
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parent.parent
HERE = Path(__file__).resolve().parent
INPUT = HERE / "gxxx_actual_20261109.csv"
PREVIEW = HERE / "gxxx_actual_20261109_preview.json"
BACKUP = HERE / "gxxx_actual_20261109_before.json"
RESULT = HERE / "gxxx_actual_20261109_result.json"
MANUAL = HERE / "gxxx_actual_20261109_manual.csv"

LOCATION_SQL = """
SELECT * FROM location
WHERE warehouse_id = 1 AND location_name ~ '^G[0-9]{3}$'
ORDER BY location_name
"""
STOCK_SQL = """
SELECT s.* FROM item_stock s JOIN location l ON l.id = s.location_id
WHERE l.warehouse_id = 1 AND l.location_name ~ '^G[0-9]{3}$'
ORDER BY s.id
"""


def save_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str) + "\n",
                    encoding="utf-8")


def load_counts():
    with INPUT.open(encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    names = [row["location_name"] for row in rows]
    expected = [f"G{i:03}" for i in range(1, 421)]
    if names != expected:
        raise RuntimeError("Input must contain G001-G420 exactly once, in order")
    counts = {row["location_name"]: int(row["actual_quantity"]) for row in rows}
    if any(value < 0 for value in counts.values()):
        raise RuntimeError("Negative quantity")
    return counts


def snapshot(conn):
    return {
        "locations": [dict(row) for row in conn.execute(text(LOCATION_SQL)).mappings()],
        "stocks": [dict(row) for row in conn.execute(text(STOCK_SQL)).mappings()],
    }


def fingerprint(value):
    payload = json.dumps(value, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def visible(row):
    return (row["is_active"] and row["quantity"] > 0
            and (row["stock_level"] is None or row["stock_level"] <= 1))


def build_plan(before, counts):
    locations = {row["location_name"]: row for row in before["locations"]}
    if set(locations) != set(counts) or len(before["locations"]) != 420:
        raise RuntimeError("Database must contain exactly 420 unique G locations in warehouse 1")
    stocks_by_location = {}
    for row in before["stocks"]:
        if visible(row):
            stocks_by_location.setdefault(row["location_id"], []).append(row)
    plan = []
    for name, target in counts.items():
        location = locations[name]
        stocks = stocks_by_location.get(location["id"], [])
        current = sum((row["quantity"] for row in stocks), Decimal(0))
        entry = {"location_name": name, "location_id": location["id"],
                 "before_quantity": current, "actual_quantity": target,
                 "stock_ids": [row["id"] for row in stocks]}
        if current == target:
            entry["action"] = "unchanged"
        elif target > 0 and not stocks:
            entry.update(action="manual", reason="no_existing_stock")
        elif target > 0 and not location["is_active"]:
            entry.update(action="manual", reason="inactive_location")
        elif target > 0 and len(stocks) != 1:
            entry.update(action="manual", reason="multiple_stock_rows")
        else:
            entry["action"] = "clear" if target == 0 else "update"
        plan.append(entry)
    return plan


def summary(plan):
    return {"locations": len(plan), "input_total": sum(row["actual_quantity"] for row in plan),
            "actions": dict(Counter(row["action"] for row in plan)),
            "manual_locations": [row["location_name"] for row in plan if row["action"] == "manual"]}


def verify(after, plan):
    totals = {}
    for row in after["stocks"]:
        if visible(row):
            totals[row["location_id"]] = totals.get(row["location_id"], Decimal(0)) + row["quantity"]
    mismatches = []
    for row in plan:
        expected = row["before_quantity"] if row["action"] == "manual" else row["actual_quantity"]
        actual = totals.get(row["location_id"], Decimal(0))
        if actual != Decimal(str(expected)):
            mismatches.append({"location_name": row["location_name"], "expected": expected, "actual": actual})
    if mismatches:
        raise RuntimeError("Verification failed: " + json.dumps(mismatches, default=str))
    return {"verified_locations": len(plan), "remaining_unexpected_mismatches": 0,
            "visible_total": sum(totals.values(), Decimal(0))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    counts = load_counts()
    os.chdir(ROOT / "backend")
    sys.path.insert(0, str(ROOT / "backend"))
    os.environ["DEBUG"] = "false"  # Host sets DEBUG=release; process-local override only.
    from app.core.config import settings

    engine = create_engine(settings.database_url, hide_parameters=True,
                           connect_args={"connect_timeout": 8})
    with engine.begin() as conn:
        conn.execute(text("SET LOCAL lock_timeout = '8s'"))
        conn.execute(text("SET LOCAL statement_timeout = '30s'"))
        if args.apply:
            if RESULT.exists() or BACKUP.exists():
                raise RuntimeError("Existing apply artifacts found; refusing to overwrite")
            # Lock target locations and stock rows while applying and verifying.
            conn.execute(text(LOCATION_SQL + " FOR UPDATE"))
            conn.execute(text(STOCK_SQL + " FOR UPDATE OF s"))
        else:
            conn.execute(text("SET TRANSACTION READ ONLY"))
        before = snapshot(conn)
        plan = build_plan(before, counts)
        report = {"warehouse_id": 1, "input_sha256": hashlib.sha256(INPUT.read_bytes()).hexdigest(),
                  "snapshot_sha256": fingerprint(before), "summary": summary(plan), "plan": plan}
        if not args.apply:
            save_json(PREVIEW, report)
            print(json.dumps(report["summary"], ensure_ascii=True))
            return
        preview = json.loads(PREVIEW.read_text(encoding="utf-8"))
        if (report["input_sha256"] != preview["input_sha256"]
                or report["snapshot_sha256"] != preview["snapshot_sha256"]):
            raise RuntimeError("Input or database changed since preview; generate a new preview")
        # A zero count follows stocktake confirmation: quantity=0 and is_active=false.
        updates = []
        for row in plan:
            if row["action"] not in ("update", "clear"):
                continue
            for stock_id in row["stock_ids"]:
                updates.append({"stock_id": stock_id, "quantity": row["actual_quantity"],
                                "is_active": row["actual_quantity"] > 0})
        save_json(BACKUP, {"created_at": datetime.now(timezone.utc), **report, "before": before})
        if updates:
            result = conn.execute(text("""
                UPDATE item_stock SET quantity=:quantity, is_active=:is_active, updated_at=now()
                WHERE id=:stock_id AND is_active AND (stock_level IS NULL OR stock_level<=1)
            """), updates)
            if result.rowcount != len(updates):
                raise RuntimeError("Unexpected update row count")
        after = snapshot(conn)
        verification = verify(after, plan)
        changed_ids = {row["stock_id"] for row in updates}
        after_by_id = {row["id"]: row for row in after["stocks"]}
        if set(after_by_id) != {row["id"] for row in before["stocks"]}:
            raise RuntimeError("Stock rows were created or deleted unexpectedly")
        for old in before["stocks"]:
            new = after_by_id[old["id"]]
            allowed = {"quantity", "is_active", "updated_at"} if old["id"] in changed_ids else set()
            if any(old[key] != new[key] for key in old if key not in allowed):
                raise RuntimeError(f"Unexpected metadata change for stock {old['id']}")
        if before["locations"] != after["locations"]:
            raise RuntimeError("Location metadata changed unexpectedly")
        report.update(updated_stock_rows=len(updates), verification=verification, after=after,
                      applied_at=datetime.now(timezone.utc).isoformat())
    # Re-read in a new transaction to confirm the commit is visible.
    with engine.connect() as conn:
        conn.execute(text("SET TRANSACTION READ ONLY"))
        report["post_commit_verification"] = verify(snapshot(conn), plan)
    save_json(RESULT, report)
    with MANUAL.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["location_name", "actual_quantity", "reason"])
        writer.writeheader()
        writer.writerows({key: row[key] for key in writer.fieldnames}
                         for row in plan if row["action"] == "manual")
    print(json.dumps({**report["summary"], "updated_stock_rows": len(updates),
                      "verification": report["post_commit_verification"]}, default=str, ensure_ascii=True))


if __name__ == "__main__":
    main()
