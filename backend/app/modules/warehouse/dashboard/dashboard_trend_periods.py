"""Calendar periods for warehouse trends, without database dependencies."""

from calendar import monthrange
from datetime import date, timedelta
from typing import Literal

TrendGranularity = Literal["week", "month", "quarter", "year"]


def build_trend_periods(
    today: date, granularity: TrendGranularity
) -> list[tuple[date, date, str]]:
    """Return the current calendar period through today, oldest point first.

    Week/month views have daily points. Quarter/year views have monthly points;
    the current month stops at today so no future activity is represented.
    """
    if granularity in ("week", "month"):
        start = (
            today - timedelta(days=today.weekday())
            if granularity == "week"
            else today.replace(day=1)
        )
        periods = []
        for offset in range((today - start).days + 1):
            day = start + timedelta(days=offset)
            periods.append((day, day, day.strftime("%d/%m")))
        return periods

    if granularity == "quarter":
        first_month = ((today.month - 1) // 3) * 3 + 1
    elif granularity == "year":
        first_month = 1
    else:
        raise ValueError(f"Unsupported trend granularity: {granularity}")

    periods: list[tuple[date, date, str]] = []
    for month in range(first_month, today.month + 1):
        start = date(today.year, month, 1)
        end = min(date(today.year, month, monthrange(today.year, month)[1]), today)
        periods.append((start, end, f"Tháng {month:02d}/{today.year}"))
    return periods
