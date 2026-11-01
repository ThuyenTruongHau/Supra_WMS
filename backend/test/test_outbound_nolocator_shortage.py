import os
import unittest
from io import BytesIO

os.environ.update(
    DEBUG="false",
    DATABASE_URL="postgresql://unused@127.0.0.1:1/never_connect_in_tests",
    REDIS_URL="redis://127.0.0.1:1/0",
    CELERY_BROKER_URL="memory://",
    CELERY_BROKER_RESULT_URL="cache+memory://",
    APP_NAME="outbound-shortage-test",
)

from app.main import app  # noqa: F401,E402
from app.core.config import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.modules.masan.masan_outbound_excel import DATA_START_ROW, HEADER_ROW
from app.modules.masan.masan_outbound_service import (
    format_stock_shortage_message,
    parse_masan_outbound_preview,
    summarize_nolocator_stock_shortages,
)
from app.modules.warehouse.item.item_model import Item
from openpyxl import Workbook
from sqlalchemy import text


class NolocatorStockShortageTests(unittest.TestCase):
    def test_enough_on_hand_does_not_block(self):
        rows = [
            {"sku": "SKU-A", "item_name": "A", "quantity": 5, "locator": None},
            {"sku": "SKU-A", "item_name": "A", "quantity": 5, "locator": ""},
        ]
        shortages = summarize_nolocator_stock_shortages(rows, {"SKU-A": 10})
        self.assertEqual(shortages, [])

    def test_one_sku_short_reports_gap(self):
        rows = [
            {"sku": "SKU-A", "item_name": "Pho", "quantity": 12, "locator": None},
        ]
        shortages = summarize_nolocator_stock_shortages(rows, {"SKU-A": 7})
        self.assertEqual(len(shortages), 1)
        self.assertEqual(shortages[0].shortage, 5)
        self.assertIn("thiếu 5", format_stock_shortage_message(shortages[0]))

    def test_same_sku_rows_are_summed(self):
        rows = [
            {"sku": "SKU-A", "item_name": "Pho", "quantity": 8, "locator": None},
            {"sku": "SKU-A", "item_name": "Pho", "quantity": 6, "locator": "  "},
            {"sku": "SKU-B", "item_name": "Bun", "quantity": 3, "locator": None},
        ]
        shortages = summarize_nolocator_stock_shortages(
            rows,
            {"SKU-A": 10, "SKU-B": 3},
        )
        self.assertEqual([row.sku for row in shortages], ["SKU-A"])
        self.assertEqual(shortages[0].demanded, 14)
        self.assertEqual(shortages[0].shortage, 4)

    def test_locator_rows_are_excluded_from_the_sum(self):
        rows = [
            {"sku": "SKU-A", "item_name": "Pho", "quantity": 40, "locator": "G101"},
            {"sku": "SKU-A", "item_name": "Pho", "quantity": 4, "locator": None},
        ]
        shortages = summarize_nolocator_stock_shortages(rows, {"SKU-A": 10})
        self.assertEqual(shortages, [])


def _build_nolocator_workbook(rows: list[tuple[str, int]]) -> bytes:
    headers = (
        "Số xe",
        "Tên khách hàng",
        "Trip",
        "NVT",
        "Mã Item",
        "Tên Item",
        "LOT",
        "Lot status",
        "Số lượng",
        "Số pallet",
        "Locator",
    )
    wb = Workbook()
    ws = wb.active
    for col, title in enumerate(headers, start=1):
        ws.cell(HEADER_ROW, col, value=title)
    row_idx = DATA_START_ROW
    for sku, qty in rows:
        ws.cell(row_idx, 5, value=sku)
        ws.cell(row_idx, 9, value=qty)
        row_idx += 1
    bio = BytesIO()
    wb.save(bio)
    return bio.getvalue()


class ParsePreviewShortageIntegrationTests(unittest.TestCase):
    def test_parse_preview_blocks_when_demand_exceeds_on_hand(self):
        engine = create_engine(settings.database_url)
        try:
            with engine.connect() as conn:
                conn.execute(text("select 1"))
        except Exception:
            self.skipTest("Database unavailable for integration test")
        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            item_row = (
                db.query(Item)
                .filter(Item.warehouse_id == 1, Item.is_active.is_(True))
                .first()
            )
            if not item_row:
                self.skipTest("No active item in warehouse 1")
            on_hand_int = int(item_row.quantity or 0)
            content = _build_nolocator_workbook(
                [(item_row.sku, on_hand_int + 100)],
            )
            result = parse_masan_outbound_preview(
                db,
                warehouse_id=1,
                content=content,
                outbound_type="auto",
            )
            self.assertFalse(result.can_import)
            self.assertTrue(result.import_errors)
            self.assertTrue(result.stock_shortages)
            self.assertEqual(result.line_items, [])
        finally:
            db.close()
