"""Layout constants shared by HTML templates and mock export scripts (A4 mm)."""

from __future__ import annotations

from dataclasses import dataclass


def mm_to_row_height(mm: float) -> float:
    return mm * 72 / 25.4


def mm_to_col_width(mm: float) -> float:
    # Approximate Excel column width (character units) for default Calibri 11.
    return mm * 0.142


@dataclass(frozen=True)
class BacvietLayout:
    page_width_mm: float = 194
    page_height_mm: float = 281
    page_margin_mm: float = 7
    sheet_padding_mm: float = 3
    sheet_gap_mm: float = 2.5
    labels_per_page: int = 9
    label_cols: int = 3
    label_rows: int = 3

    @property
    def label_width_mm(self) -> float:
        return (
            self.page_width_mm
            - 2 * self.sheet_padding_mm
            - (self.label_cols - 1) * self.sheet_gap_mm
        ) / self.label_cols

    @property
    def label_height_mm(self) -> float:
        return (
            self.page_height_mm
            - 2 * self.sheet_padding_mm
            - (self.label_rows - 1) * self.sheet_gap_mm
        ) / self.label_rows


@dataclass(frozen=True)
class LocationLayout:
    page_width_mm: float = 194
    page_height_mm: float = 281
    page_margin_mm: float = 5
    sheet_padding_mm: float = 5

    @property
    def content_width_mm(self) -> float:
        return self.page_width_mm - 2 * self.sheet_padding_mm

    @property
    def content_height_mm(self) -> float:
        return self.page_height_mm - 2 * self.sheet_padding_mm


BACVIET_LAYOUT = BacvietLayout()
LOCATION_LAYOUT = LocationLayout()
