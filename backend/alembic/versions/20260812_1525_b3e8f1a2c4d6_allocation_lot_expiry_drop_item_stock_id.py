"""allocation lot/expiry columns and drop item_stock_id

Revision ID: b3e8f1a2c4d6
Revises: a7c31d9be420
Create Date: 2026-08-12 15:25:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3e8f1a2c4d6"
down_revision: Union[str, None] = "a7c31d9be420"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "inbound_order_allocation",
        sa.Column("lot_number", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "inbound_order_allocation",
        sa.Column("expiry_date", sa.String(length=50), nullable=True),
    )
    op.create_index(
        op.f("ix_inbound_order_allocation_lot_number"),
        "inbound_order_allocation",
        ["lot_number"],
        unique=False,
    )
    op.create_index(
        op.f("ix_inbound_order_allocation_expiry_date"),
        "inbound_order_allocation",
        ["expiry_date"],
        unique=False,
    )

    op.execute(
        """
        UPDATE inbound_order_allocation AS a
        SET lot_number = s.lot_number,
            expiry_date = s.expiry_date
        FROM item_stock AS s
        WHERE a.item_stock_id = s.id
        """
    )

    op.drop_index(
        op.f("ix_inbound_order_allocation_item_stock_id"),
        table_name="inbound_order_allocation",
    )
    op.drop_constraint(
        "inbound_order_allocation_item_stock_id_fkey",
        "inbound_order_allocation",
        type_="foreignkey",
    )
    op.drop_column("inbound_order_allocation", "item_stock_id")


def downgrade() -> None:
    op.add_column(
        "inbound_order_allocation",
        sa.Column("item_stock_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        op.f("ix_inbound_order_allocation_item_stock_id"),
        "inbound_order_allocation",
        ["item_stock_id"],
        unique=False,
    )
    op.create_foreign_key(
        "inbound_order_allocation_item_stock_id_fkey",
        "inbound_order_allocation",
        "item_stock",
        ["item_stock_id"],
        ["id"],
    )

    op.execute(
        """
        UPDATE inbound_order_allocation AS a
        SET item_stock_id = s.id
        FROM item_stock AS s
        WHERE s.inbound_order_detail_id = a.inbound_order_detail_id
          AND s.item_id = a.item_id
          AND COALESCE(s.lot_number, '') = COALESCE(a.lot_number, '')
        """
    )
    op.execute("DELETE FROM inbound_order_allocation WHERE item_stock_id IS NULL")
    op.alter_column("inbound_order_allocation", "item_stock_id", nullable=False)

    op.drop_index(
        op.f("ix_inbound_order_allocation_expiry_date"),
        table_name="inbound_order_allocation",
    )
    op.drop_index(
        op.f("ix_inbound_order_allocation_lot_number"),
        table_name="inbound_order_allocation",
    )
    op.drop_column("inbound_order_allocation", "expiry_date")
    op.drop_column("inbound_order_allocation", "lot_number")
