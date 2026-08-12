"""restore item_stock_id on inbound allocation

Revision ID: c4d5e6f7a8b9
Revises: b3e8f1a2c4d6
Create Date: 2026-08-12 15:45:00.000000

"""
from typing import Sequence, Union
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, None] = "b3e8f1a2c4d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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

    bind = op.get_bind()
    rows = bind.execute(
        text(
            """
            SELECT
                a.id AS allocation_id,
                a.item_id,
                a.quantity,
                a.lot_number,
                a.expiry_date,
                a.inbound_order_detail_id,
                d.from_location_id
            FROM inbound_order_allocation AS a
            JOIN inbound_order_detail AS d
              ON d.id = a.inbound_order_detail_id
            WHERE a.item_stock_id IS NULL
            """
        )
    ).mappings()

    for row in rows:
        stock_id = bind.execute(
            text(
                """
                INSERT INTO item_stock (
                    stock_code,
                    item_id,
                    location_id,
                    inbound_order_detail_id,
                    quantity,
                    lot_number,
                    expiry_date,
                    status,
                    is_active
                )
                VALUES (
                    :stock_code,
                    :item_id,
                    :location_id,
                    :inbound_order_detail_id,
                    :quantity,
                    :lot_number,
                    :expiry_date,
                    'in_transit',
                    TRUE
                )
                RETURNING id
                """
            ),
            {
                "stock_code": str(uuid.uuid4()),
                "item_id": row["item_id"],
                "location_id": row["from_location_id"],
                "inbound_order_detail_id": row["inbound_order_detail_id"],
                "quantity": row["quantity"],
                "lot_number": row["lot_number"],
                "expiry_date": row["expiry_date"],
            },
        ).scalar_one()
        bind.execute(
            text(
                """
                UPDATE inbound_order_allocation
                SET item_stock_id = :item_stock_id
                WHERE id = :allocation_id
                """
            ),
            {
                "item_stock_id": stock_id,
                "allocation_id": row["allocation_id"],
            },
        )

    op.execute("DELETE FROM inbound_order_allocation WHERE item_stock_id IS NULL")
    op.alter_column("inbound_order_allocation", "item_stock_id", nullable=False)

    op.drop_constraint(
        "fk_inbound_order_allocation_item_id_item",
        "inbound_order_allocation",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_inbound_order_allocation_item_id"),
        table_name="inbound_order_allocation",
    )
    op.drop_index(
        op.f("ix_inbound_order_allocation_lot_number"),
        table_name="inbound_order_allocation",
    )
    op.drop_index(
        op.f("ix_inbound_order_allocation_expiry_date"),
        table_name="inbound_order_allocation",
    )
    op.drop_column("inbound_order_allocation", "item_id")
    op.drop_column("inbound_order_allocation", "lot_number")
    op.drop_column("inbound_order_allocation", "expiry_date")


def downgrade() -> None:
    op.add_column(
        "inbound_order_allocation",
        sa.Column("item_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "inbound_order_allocation",
        sa.Column("lot_number", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "inbound_order_allocation",
        sa.Column("expiry_date", sa.String(length=50), nullable=True),
    )

    op.execute(
        """
        UPDATE inbound_order_allocation AS a
        SET item_id = s.item_id,
            lot_number = s.lot_number,
            expiry_date = s.expiry_date
        FROM item_stock AS s
        WHERE a.item_stock_id = s.id
        """
    )
    op.execute("DELETE FROM inbound_order_allocation WHERE item_id IS NULL")
    op.alter_column("inbound_order_allocation", "item_id", nullable=False)

    op.create_index(
        op.f("ix_inbound_order_allocation_item_id"),
        "inbound_order_allocation",
        ["item_id"],
        unique=False,
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
    op.create_foreign_key(
        "fk_inbound_order_allocation_item_id_item",
        "inbound_order_allocation",
        "item",
        ["item_id"],
        ["id"],
    )

    op.drop_constraint(
        "inbound_order_allocation_item_stock_id_fkey",
        "inbound_order_allocation",
        type_="foreignkey",
    )
    op.drop_index(
        op.f("ix_inbound_order_allocation_item_stock_id"),
        table_name="inbound_order_allocation",
    )
    op.drop_column("inbound_order_allocation", "item_stock_id")
