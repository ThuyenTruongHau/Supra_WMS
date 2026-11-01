"""Repair proven seven-hour event-time offsets; read-only unless --apply is supplied."""
from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.time import VN_TZ

SHIFT = timedelta(hours=7)
TIME_FIELDS = ("start_time", "end_time", "start_sorting_time", "end_sorting_time")
AUDIT_END = datetime(2026, 11, 1, tzinfo=VN_TZ)


def shifted_matches(value, reference, tolerance):
    return (value is not None and reference is not None
            and abs((reference - (value + SHIFT)).total_seconds()) <= tolerance)


def plan_repairs(rows, confirmations):
    plans = []
    for row in rows:
        before = {field: row[field] for field in TIME_FIELDS}
        after = dict(before)
        evidence = {}
        for field, source in (("start_time", "callback_start"), ("end_time", "callback_end")):
            if shifted_matches(before[field], row[source], 60):
                after[field] = before[field] + SHIFT
                evidence[field] = {"source": source, "created_at": row[source]}
        confirmation = confirmations.get(row["id"])
        if confirmation and shifted_matches(before["end_sorting_time"], confirmation["created_at"], 10):
            after["end_sorting_time"] = before["end_sorting_time"] + SHIFT
            evidence["end_sorting_time"] = dict(confirmation)
            start, arrival, end = before["start_sorting_time"], after["end_time"], after["end_sorting_time"]
            # Repair a start only with a corroborated end and a plausible arrival/start/end order.
            # Starts that were already correct (including three cutover rows) are kept.
            if start is not None and arrival is not None and start < arrival <= start + SHIFT <= end:
                after["start_sorting_time"] = start + SHIFT
                evidence["start_sorting_time"] = {"robot_arrival": arrival, "confirmed_end": end}
        if after == before:
            continue
        if "start_time" in evidence or "end_time" in evidence:
            if after["start_time"] and after["end_time"] and after["start_time"] > after["end_time"]:
                raise ValueError(f"Robot start/end ordering is ambiguous for allocation {row['id']}")
        if "end_sorting_time" in evidence and after["start_sorting_time"]:
            if after["start_sorting_time"] > after["end_sorting_time"]:
                raise ValueError(f"Sorting start/end ordering is ambiguous for allocation {row['id']}")
        plans.append({"id": row["id"], "before": before, "after": after, "evidence": evidence})
    return plans


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-rows", type=int)
    args = parser.parse_args()
    if args.apply and args.expected_rows is None:
        parser.error("--apply requires --expected-rows from the reviewed dry run")
    os.environ["DEBUG"] = "false"
    from sqlalchemy import text
    from app.core.database import engine

    with engine.connect() as connection:
        transaction = connection.begin()
        if args.apply:
            connection.execute(text("SET LOCAL lock_timeout = '5s'"))
        else:
            connection.execute(text("SET TRANSACTION READ ONLY"))
        rows = connection.execute(text("""
            SELECT a.id, a.start_time, a.end_time, a.start_sorting_time, a.end_sorting_time,
                   first_start.created_at AS callback_start, first_end.created_at AS callback_end
            FROM outbound_order_allocation a
            LEFT JOIN robot_task r ON r.id=a.robot_task_id
            LEFT JOIN LATERAL (
                SELECT created_at FROM task_status
                WHERE order_id=r.order_id AND sub_task_status='2' AND status='6'
                  AND qr_code=split_part(r.task_order_detail::jsonb->0->>'taskPath', ',', 2)
                ORDER BY id LIMIT 1
            ) first_start ON true
            LEFT JOIN LATERAL (
                SELECT created_at FROM task_status WHERE order_id=r.order_id AND status='8'
                ORDER BY id LIMIT 1
            ) first_end ON true
            WHERE a.updated_at < :audit_end
            ORDER BY a.id
        """), {"audit_end": AUDIT_END}).mappings().all()
        confirmations = connection.execute(text("""
            WITH recorded AS (
                SELECT h.id AS history_id, h.created_at, (v->>'allocation_id')::int AS allocation_id
                FROM history h CROSS JOIN LATERAL jsonb_array_elements(
                    CASE WHEN jsonb_typeof(h.details->'allocations')='array'
                    THEN h.details->'allocations' ELSE '[]'::jsonb END) v
                WHERE h.new_status='completed' AND h.created_at < :audit_end
            )
            SELECT DISTINCT ON (a.id) a.id, h.history_id, h.created_at
            FROM recorded h JOIN outbound_order_allocation a ON a.id=h.allocation_id
            WHERE abs(extract(epoch FROM(h.created_at-(a.end_sorting_time+interval '7 hours')))) <= 10
            ORDER BY a.id, abs(extract(epoch FROM(h.created_at-(a.end_sorting_time+interval '7 hours'))))
        """), {"audit_end": AUDIT_END}).mappings().all()
        plans = plan_repairs(rows, {row["id"]: row for row in confirmations})
        counts = Counter(field for plan in plans for field in plan["evidence"])
        summary = {"mode": "apply" if args.apply else "read-only", "rows": len(plans),
                   "fields": dict(counts), "timezone": "Asia/Ho_Chi_Minh"}
        print(json.dumps(summary))
        if not args.apply:
            transaction.rollback()
            return
        if len(plans) != args.expected_rows:
            raise RuntimeError("Repair scope changed since dry run; transaction aborted")

        snapshots = connection.execute(text("""
            SELECT to_jsonb(a) AS snapshot FROM outbound_order_allocation a
            WHERE id=ANY(:ids) ORDER BY id FOR UPDATE OF a
        """), {"ids": [plan["id"] for plan in plans]}).scalars().all()
        by_id = {row["id"]: row for row in snapshots}
        for plan in plans:
            for field in TIME_FIELDS:
                value = by_id[plan["id"]][field]
                recorded = datetime.fromisoformat(value) if value is not None else None
                if recorded != plan["before"][field]:
                    raise RuntimeError(f"Allocation {plan['id']} changed before locking; transaction aborted")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = Path(__file__).resolve().parents[1] / ".recovery" / f"event_timezone_before_{stamp}.json"
        with backup.open("x", encoding="utf-8") as handle:
            json.dump({"summary": summary, "before": snapshots, "plans": plans}, handle,
                      ensure_ascii=False, indent=2, default=str)

        for plan in plans:
            # Field names come exclusively from TIME_FIELDS, never from user input.
            fields = [field for field in TIME_FIELDS if plan["after"][field] != plan["before"][field]]
            assignments = ", ".join(f"{field}=:{field}" for field in fields)
            changed = connection.execute(text(f"UPDATE outbound_order_allocation SET {assignments} WHERE id=:id"),
                                         {"id": plan["id"], **{f: plan["after"][f] for f in fields}})
            if changed.rowcount != 1:
                raise RuntimeError("Unexpected update count; transaction aborted")
        after = connection.execute(text("""
            SELECT to_jsonb(a) FROM outbound_order_allocation a WHERE id=ANY(:ids) ORDER BY id
        """), {"ids": list(by_id)}).scalars().all()
        plan_by_id = {plan["id"]: plan for plan in plans}
        for row in after:
            plan = plan_by_id[row["id"]]
            expected = dict(by_id[row["id"]])
            for field in TIME_FIELDS:
                value = row[field]
                if (datetime.fromisoformat(value) if value else None) != plan["after"][field]:
                    raise RuntimeError("Repaired time differs from the planned instant; transaction aborted")
                expected[field] = row[field]
            if row != expected:
                raise RuntimeError("Non-time business data changed; transaction aborted")
        transaction.commit()
        print(json.dumps({"committed": True, "backup": str(backup), **summary}))


if __name__ == "__main__":
    main()
