"""Shared created_at range filter for inbound/outbound order list queries."""

from datetime import date, datetime, timezone
from typing import Any

from zoneinfo import ZoneInfo

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def validate_created_date_range(
    created_from: datetime | date | None,
    created_to: datetime | date | None,
) -> None:
    if not created_from or not created_to:
        return
    start = _normalize_bound(created_from, end_of_day=False)
    end = _normalize_bound(created_to, end_of_day=True)
    if start > end:
        raise ValueError("created_from must not be after created_to")


def _normalize_bound(
    value: datetime | date,
    *,
    end_of_day: bool,
) -> datetime:
    if isinstance(value, date) and not isinstance(value, datetime):
        if end_of_day:
            return datetime(
                value.year,
                value.month,
                value.day,
                23,
                59,
                59,
                999999,
                tzinfo=VN_TZ,
            )
        return datetime(value.year, value.month, value.day, 0, 0, 0, tzinfo=VN_TZ)

    if value.tzinfo is None:
        return value.replace(tzinfo=VN_TZ)
    return value.astimezone(VN_TZ)


def apply_order_created_date_range(
    query: Any,
    model: Any,
    created_from: datetime | date | None,
    created_to: datetime | date | None,
) -> Any:
    if not created_from and not created_to:
        return query

    if created_from:
        start_utc = _normalize_bound(created_from, end_of_day=False).astimezone(
            timezone.utc
        )
        query = query.filter(model.created_at >= start_utc)
    if created_to:
        end_utc = _normalize_bound(created_to, end_of_day=True).astimezone(timezone.utc)
        query = query.filter(model.created_at <= end_utc)
    return query
