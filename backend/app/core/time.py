"""Timezone rules for warehouse event timestamps and Vietnamese business dates."""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

VN_TIMEZONE = "Asia/Ho_Chi_Minh"
VN_TZ = ZoneInfo(VN_TIMEZONE)


def vn_now() -> datetime:
    return datetime.now(VN_TZ)


def vn_today() -> date:
    return vn_now().date()


def as_vietnam(value: datetime) -> datetime:
    # Legacy wall-clock values and SQLite date columns have no offset.
    if value.tzinfo is None:
        return value.replace(tzinfo=VN_TZ)
    return value.astimezone(VN_TZ)


def as_utc(value: datetime) -> datetime:
    # Durable scheduler timestamps are written as UTC; SQLite drops that offset.
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def format_vietnam(value: datetime | None, pattern: str) -> str:
    return as_vietnam(value).strftime(pattern) if value is not None else ""
