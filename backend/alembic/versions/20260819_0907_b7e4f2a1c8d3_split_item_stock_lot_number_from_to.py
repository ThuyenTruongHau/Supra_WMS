"""split item_stock lot_number into lot_number_from and lot_number_to

Revision ID: b7e4f2a1c8d3
Revises: a3f8c2d1e4b5
Create Date: 2026-08-19 09:07:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7e4f2a1c8d3"
down_revision: Union[str, None] = "a3f8c2d1e4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "item_stock",
        sa.Column("lot_number_from", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "item_stock",
        sa.Column("lot_number_to", sa.String(length=50), nullable=True),
    )
    op.create_index(
        op.f("ix_item_stock_lot_number_from"),
        "item_stock",
        ["lot_number_from"],
        unique=False,
    )
    op.create_index(
        op.f("ix_item_stock_lot_number_to"),
        "item_stock",
        ["lot_number_to"],
        unique=False,
    )

    op.execute(
        """
        UPDATE item_stock
        SET lot_number_from = lot_number,
            lot_number_to = lot_number
        WHERE lot_number IS NOT NULL
        """
    )

    op.drop_index(op.f("ix_item_stock_lot_number"), table_name="item_stock")
    op.drop_column("item_stock", "lot_number")


def downgrade() -> None:
    op.add_column(
        "item_stock",
        sa.Column("lot_number", sa.String(length=50), nullable=True),
    )
    op.create_index(
        op.f("ix_item_stock_lot_number"),
        "item_stock",
        ["lot_number"],
        unique=False,
    )

    op.execute(
        """
        UPDATE item_stock
        SET lot_number = CASE
            WHEN lot_number_from IS NOT NULL
             AND lot_number_to IS NOT NULL
             AND lot_number_from <> lot_number_to
            THEN lot_number_from || '-' || lot_number_to
            ELSE COALESCE(lot_number_from, lot_number_to)
        END
        """
    )

    op.drop_index(op.f("ix_item_stock_lot_number_to"), table_name="item_stock")
    op.drop_index(op.f("ix_item_stock_lot_number_from"), table_name="item_stock")
    op.drop_column("item_stock", "lot_number_to")
    op.drop_column("item_stock", "lot_number_from")
