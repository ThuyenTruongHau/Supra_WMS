from __future__ import annotations

import re
from datetime import date, datetime


_LOT_ERROR = (
    "lot_number không hợp lệ. "
    "Chấp nhận: DDMMYY, DDMMYY-DDMMYY, DD-DDMMYY, "
    "DD/MM/YY, DD/MM/YY-DD/MM/YY, hoặc DD-DD/MM/YY "
    "(vd: 040526, 040526-050526, 04-050826, 19/08/26, 30/07/26-01/08/26, 09-10/04/26)"
)
_COMPACT6 = r"\d{6}"
_SLASH_DATE = r"\d{2}/\d{2}/\d{2}"


def lot_string_to_date(value: str) -> date:
    s = value.strip()
    if "/" in s:
        return datetime.strptime(s, "%d/%m/%y").date()
    if len(s) == 6 and s.isdigit():
        return datetime.strptime(s, "%d%m%y").date()
    raise ValueError(_LOT_ERROR)


def normalize_lot_number(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def parse_legacy_lot_number(value: str) -> tuple[str, str]:
    s = value.strip()
    if not s:
        raise ValueError(_LOT_ERROR)
    def validate_ddmmyy(compact: str) -> None:
        day = int(compact[0:2])
        month = int(compact[2:4])
        if not (1 <= day <= 31 and 1 <= month <= 12):
            raise ValueError(_LOT_ERROR)
    def to_compact(dd: str, mm: str, yy: str) -> str:
        compact = f"{int(dd):02d}{mm}{yy}"
        validate_ddmmyy(compact)
        return compact
    def slash_to_compact(slash: str) -> str:
        dd, mm, yy = slash.split("/")
        return to_compact(dd, mm, yy)
    # 1) 040526-050526
    m = re.fullmatch(rf"({_COMPACT6})-({_COMPACT6})", s)
    if m:
        a, b = m.group(1), m.group(2)
        validate_ddmmyy(a)
        validate_ddmmyy(b)
        return a, b
    # 2) 04-050826  (tương đương 04-05/08/26)
    m = re.fullmatch(r"^(\d{1,2})-(\d{1,2})(\d{4})$", s)
    if m:
        d1, d2, mmyy = m.group(1), m.group(2), m.group(3)
        mm, yy = mmyy[0:2], mmyy[2:4]
        return to_compact(d1, mm, yy), to_compact(d2, mm, yy)
    # 3) 040526
    m = re.fullmatch(rf"^({_COMPACT6})$", s)
    if m:
        a = m.group(1)
        validate_ddmmyy(a)
        return a, a
    # 4) 30/07/26-01/08/26
    m = re.fullmatch(rf"({_SLASH_DATE})-({_SLASH_DATE})", s)
    if m:
        return slash_to_compact(m.group(1)), slash_to_compact(m.group(2))
    # 5) 09-10/04/26
    m = re.fullmatch(r"^(\d{1,2})-(\d{1,2})/(\d{2})/(\d{2})$", s)
    if m:
        d1, d2, mm, yy = m.group(1), m.group(2), m.group(3), m.group(4)
        return to_compact(d1, mm, yy), to_compact(d2, mm, yy)
    # 6) 19/08/26
    m = re.fullmatch(rf"^({_SLASH_DATE})$", s)
    if m:
        a = slash_to_compact(m.group(1))
        return a, a
    raise ValueError(_LOT_ERROR)


def resolve_lot_number_fields(
    *,
    lot_number_from: str | None,
    lot_number_to: str | None,
    lot_number: str | None,
) -> tuple[str, str]:
    from_val = normalize_lot_number(lot_number_from)
    to_val = normalize_lot_number(lot_number_to)
    legacy = normalize_lot_number(lot_number)

    if from_val and to_val:
        f, _ = resolve_lot_number_input(from_val)
        _, t = resolve_lot_number_input(to_val)
        return f, t
    if from_val:
        return resolve_lot_number_input(from_val)
    if to_val:
        return resolve_lot_number_input(to_val)
    if legacy:
        return resolve_lot_number_input(legacy)
    raise ValueError("lot_number_from and lot_number_to are required")

def resolve_lot_number_input(value: str) -> tuple[str, str]:
    s = normalize_lot_number(value)
    if not s:
        raise ValueError("lot_number is required")
    if len(s) > 50:
        raise ValueError("lot_number must be at most 50 characters")
    try:
        return parse_legacy_lot_number(s)
    except ValueError:
        return s, s  # lot_from = lot_to = raw user input

def format_lot_part_for_display(value: str | None) -> str | None:
    """Compact DDMMYY in DB → DD/MM/YY for API/UI. Does not parse or validate input."""
    if value is None:
        return None
    s = value.strip()
    if not s:
        return None
    if "/" in s:
        return s
    if len(s) == 6 and s.isdigit():
        try:
            return datetime.strptime(s, "%d%m%y").strftime("%d/%m/%y")
        except ValueError:
            return s
    return s


def format_lot_value_for_display(value: str | None) -> str | None:
    """Format a single lot string, including compact ranges like 070826-080826."""
    if value is None:
        return None
    s = value.strip()
    if not s:
        return None
    if "-" in s:
        left, _, right = s.partition("-")
        left_disp = format_lot_part_for_display(left)
        right_disp = format_lot_part_for_display(right)
        if left_disp and right_disp and left_disp != right_disp:
            return f"{left_disp}-{right_disp}"
        return left_disp or right_disp
    return format_lot_part_for_display(s)


def format_lot_number_display(
    lot_number_from: str | None,
    lot_number_to: str | None,
) -> str | None:
    from_disp = format_lot_part_for_display(lot_number_from)
    to_disp = format_lot_part_for_display(lot_number_to)
    if not from_disp and not to_disp:
        return None
    if from_disp and to_disp and from_disp != to_disp:
        return f"{from_disp}-{to_disp}"
    return from_disp or to_disp


def apply_lot_display_fields(
    *,
    lot_number_from: str | None,
    lot_number_to: str | None,
    lot_number: str | None = None,
) -> tuple[str | None, str | None, str | None]:
    """Return (from, to, combined) formatted for API responses."""
    disp_from = format_lot_part_for_display(lot_number_from)
    disp_to = format_lot_part_for_display(lot_number_to)
    if lot_number is not None and str(lot_number).strip():
        disp_lot = format_lot_value_for_display(lot_number)
    else:
        disp_lot = format_lot_number_display(lot_number_from, lot_number_to)
    return disp_from, disp_to, disp_lot
