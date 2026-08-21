from __future__ import annotations

import re


def normalize_lot_number(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


_DATE = r"\d{2}/\d{2}/\d{2}"


def parse_legacy_lot_number(value: str) -> tuple[str, str]:
    s = value.strip()

    # 30/07/26-01/08/26
    m = re.fullmatch(rf"({_DATE})-({_DATE})", s)
    if m:
        return m.group(1), m.group(2)

    # 09-10/04/26  →  09/04/26 .. 10/04/26
    m = re.fullmatch(r"^(\d{1,2})-(\d{1,2})/(\d{2})/(\d{2})$", s)
    if m:
        d1, d2, mm, yy = m.group(1), m.group(2), m.group(3), m.group(4)
        return (
            f"{int(d1):02d}/{mm}/{yy}",
            f"{int(d2):02d}/{mm}/{yy}",
        )

    # 19/08/26
    m = re.fullmatch(rf"^({_DATE})$", s)
    if m:
        return s, s

    raise ValueError(
        "lot_number không hợp lệ. "
        "Chấp nhận: DD/MM/YY, DD/MM/YY-DD/MM/YY, hoặc DD-DD/MM/YY "
        "(vd: 19/08/26, 30/07/26-01/08/26, 09-10/04/26)"
    )


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
        return from_val, to_val
    if from_val:
        return from_val, from_val
    if to_val:
        return to_val, to_val
    if legacy:
        return parse_legacy_lot_number(legacy)
    raise ValueError("lot_number_from and lot_number_to are required")


def format_lot_number_display(
    lot_number_from: str | None,
    lot_number_to: str | None,
) -> str | None:
    if not lot_number_from and not lot_number_to:
        return None
    if lot_number_from and lot_number_to and lot_number_from != lot_number_to:
        return f"{lot_number_from}-{lot_number_to}"
    return lot_number_from or lot_number_to
