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


def pad_missing_leading_zero_compact(value: str) -> str | None:
    """
    Một số nhập thiếu số 0 ở ngày: DMMYY (5 chữ số) → DDMMYY (6 chữ số).
    Ví dụ: 71026 → 071026 (07/10/26).
    """
    s = value.strip()
    if len(s) != 5 or not s.isdigit():
        return None
    candidate = f"0{s}"
    day = int(candidate[0:2])
    month = int(candidate[2:4])
    if not (1 <= day <= 31 and 1 <= month <= 12):
        return None
    try:
        datetime.strptime(candidate, "%d%m%y")
    except ValueError:
        return None
    return candidate


def _normalize_one_storage_part(value: str) -> str | None:
    s = normalize_lot_number(value)
    if not s:
        return None
    if re.fullmatch(rf"^{_COMPACT6}$", s):
        try:
            datetime.strptime(s, "%d%m%y")
            return s
        except ValueError:
            return s
    padded = pad_missing_leading_zero_compact(s)
    if padded:
        return padded
    try:
        from_val, to_val = parse_legacy_lot_number(s)
        return from_val if from_val == to_val else s
    except ValueError:
        return s


def normalize_stored_lot_part(value: str | None) -> str | None:
    """Chuẩn hóa một phần lô đã lưu (from/to) về compact DDMMYY khi parse được."""
    if value is None:
        return None
    return _normalize_one_storage_part(str(value))


def normalize_storage_lot_pair(
    lot_number_from: str | None,
    lot_number_to: str | None,
) -> tuple[str | None, str | None]:
    """Chuẩn hóa cặp from/to trên item_stock (gồm cả lô khoảng trong một chuỗi)."""
    from_raw = normalize_lot_number(lot_number_from)
    to_raw = normalize_lot_number(lot_number_to)
    if not from_raw and not to_raw:
        return None, None
    if from_raw and to_raw and from_raw == to_raw:
        try:
            return parse_legacy_lot_number(from_raw)
        except ValueError:
            single = _normalize_one_storage_part(from_raw)
            return single, single
    from_norm = _normalize_one_storage_part(from_raw) if from_raw else None
    to_norm = _normalize_one_storage_part(to_raw) if to_raw else None
    return from_norm, to_norm


def normalize_masan_lot_cell(raw: str | None) -> str | None:
    """Một ô LOT Masan (Excel/API) → đúng một mốc DDMMYY 6 chữ số."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if re.fullmatch(r"^\d+\.0+$", text):
        text = text.split(".", 1)[0]
    try:
        from_val, to_val = parse_legacy_lot_number(text)
    except ValueError:
        return None
    if from_val != to_val:
        return None
    return from_val


def coerce_masan_lot_cell(raw: str | None) -> str | None:
    """Chuẩn hóa ô LOT Masan khi có thể; giữ chuỗi gốc nếu là khoảng lô / không parse được."""
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    single = normalize_masan_lot_cell(text)
    return single if single else text


def normalize_lot_parse_input(value: str) -> str:
    """Strip Excel/ISO datetime suffix so ``2026-03-10T00:00:00`` parses as a date."""
    s = value.strip()
    if not s:
        return s
    m = re.match(r"^(\d{4}-\d{2}-\d{2})(?:[T\s].*)?$", s)
    if m:
        return m.group(1)
    return s


def parse_legacy_lot_number(value: str) -> tuple[str, str]:
    s = normalize_lot_parse_input(value.strip())
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
    # 6b) 22/09/2026 (năm 4 chữ số)
    m = re.fullmatch(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        dd, mm, yyyy = m.group(1), m.group(2), m.group(3)
        yy = yyyy[-2:]
        a = to_compact(dd, mm, yy)
        return a, a
    # 6c) 2026-03-10 (ISO)
    m = re.fullmatch(r"^(\d{4})-(\d{2})-(\d{2})$", s)
    if m:
        yyyy, mm, dd = m.group(1), m.group(2), m.group(3)
        yy = yyyy[-2:]
        a = to_compact(dd, mm, yy)
        return a, a
    # 7) 71026 (DMMYY thiếu số 0 đầu ngày)
    m = re.fullmatch(r"^(\d{5})$", s)
    if m:
        padded = pad_missing_leading_zero_compact(m.group(1))
        if padded:
            return padded, padded
    # 8) 71026-72026
    m = re.fullmatch(r"^(\d{5})-(\d{5})$", s)
    if m:
        a = pad_missing_leading_zero_compact(m.group(1))
        b = pad_missing_leading_zero_compact(m.group(2))
        if a and b:
            return a, b
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
    padded = pad_missing_leading_zero_compact(s)
    if padded:
        return padded, padded
    try:
        return parse_legacy_lot_number(s)
    except ValueError:
        single = normalize_masan_lot_cell(s)
        if single:
            return single, single
        return s, s  # lot_from = lot_to = raw user input

def _compact_to_slash_display(compact: str) -> str:
    return datetime.strptime(compact, "%d%m%y").strftime("%d/%m/%y")


def format_lot_part_for_display(value: str | None) -> str | None:
    """Compact DDMMYY (hoặc chuỗi parse được) → DD/MM/YY cho API/UI."""
    if value is None:
        return None
    s = value.strip()
    if not s:
        return None
    if "/" in s:
        return s
    if len(s) == 6 and s.isdigit():
        try:
            return _compact_to_slash_display(s)
        except ValueError:
            return s
    try:
        from_val, to_val = parse_legacy_lot_number(s)
        if from_val == to_val:
            return _compact_to_slash_display(from_val)
    except ValueError:
        pass
    return s


def format_lot_compact_ddmmyy(value: str | None) -> str | None:
    """Compact DDMMYY (6 chữ số), không dấu `/`. Ví dụ 02/11/03 → 021103."""
    if value is None:
        return None
    s = normalize_lot_parse_input(str(value).strip())
    if not s:
        return None
    candidates: list[str] = []
    for candidate in (s, format_lot_value_for_display(s)):
        if candidate and candidate.strip() and candidate not in candidates:
            candidates.append(candidate.strip())
    for candidate in candidates:
        try:
            from_val, to_val = parse_legacy_lot_number(candidate)
            if from_val == to_val:
                return from_val
            return f"{from_val}-{to_val}"
        except ValueError:
            continue
    stripped = s.replace("/", "").replace("-", "")
    if re.fullmatch(rf"^{_COMPACT6}$", stripped):
        try:
            datetime.strptime(stripped, "%d%m%y")
            return stripped
        except ValueError:
            pass
    padded = pad_missing_leading_zero_compact(s)
    if padded:
        return padded
    return format_lot_value_for_display(s)


def format_lot_value_for_display(value: str | None) -> str | None:
    """Format a single lot string, including compact ranges like 070826-080826."""
    if value is None:
        return None
    s = value.strip()
    if not s:
        return None
    try:
        from_val, to_val = parse_legacy_lot_number(s)
        if from_val == to_val:
            return format_lot_part_for_display(from_val)
        left_disp = format_lot_part_for_display(from_val)
        right_disp = format_lot_part_for_display(to_val)
        if left_disp and right_disp:
            return f"{left_disp}-{right_disp}"
    except ValueError:
        pass
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


def format_lot_for_masan_excel(
    *,
    lot_number_from: str | None = None,
    lot_number_to: str | None = None,
    lot_number: str | None = None,
) -> str:
    """
    Masan BM.06 cột LOT: compact DDMMYY (6 chữ số), không dùng DD/MM/YY.
    Khoảng lô: ``040526-050526`` (hai mốc compact, nối bằng dấu ``-``).
    """
    if not any(
        normalize_lot_number(v)
        for v in (lot_number_from, lot_number_to, lot_number)
    ):
        return ""
    try:
        from_val, to_val = resolve_lot_number_fields(
            lot_number_from=lot_number_from,
            lot_number_to=lot_number_to,
            lot_number=lot_number,
        )
    except ValueError:
        return (
            normalize_lot_number(lot_number)
            or normalize_lot_number(lot_number_from)
            or ""
        )
    if from_val == to_val:
        return from_val
    return f"{from_val}-{to_val}"


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
